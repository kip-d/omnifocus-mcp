/**
 * SANDBOX MANAGER
 *
 * Manages the test sandbox folder for integration tests.
 * All test data is isolated in __MCP_TEST_SANDBOX__ folder.
 *
 * IMPORTANT: Importing this module enables the sandbox guard
 * (SANDBOX_GUARD_ENABLED=true) which prevents writes outside
 * the sandbox during test mode.
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Enable sandbox guard when this module is imported
// This ensures integration tests that use the sandbox are protected
process.env.SANDBOX_GUARD_ENABLED = 'true';

// =============================================================================
// CONSTANTS
// =============================================================================

export const SANDBOX_FOLDER_NAME = '__MCP_TEST_SANDBOX__';
export const TEST_TAG_PREFIX = '__test-';
export const TEST_INBOX_PREFIX = '__TEST__';

// =============================================================================
// TYPES
// =============================================================================

export interface CleanupReport {
  inboxTasksDeleted: number;
  orphanedTasksDeleted: number;
  orphanedProjectsDeleted: number;
  projectsDeleted: number;
  foldersDeleted: number;
  tagsDeleted: number;
  errors: string[];
  durationMs: number;
}

/**
 * OMN-46: read-only inventory of what `fullCleanup()` WOULD delete.
 *
 * Used by:
 *  - `scripts/test-cleanup.ts` `--dry-run` mode (the new default).
 *  - `tests/support/setup-integration.ts` post-cleanup assertion (fail loud
 *    if anything remains after teardown).
 *
 * Each entry has just enough metadata (`id`, `name`, optional `location`) for
 * human eyeballing before purge. No deletes, no mutation. Safe to run against
 * the live OmniFocus database.
 */
export interface FixtureScanItem {
  id: string;
  name: string;
  location?: string;
}

export interface FixtureScanReport {
  inboxTasks: FixtureScanItem[];
  orphanTasks: FixtureScanItem[];
  sandboxProjects: FixtureScanItem[];
  orphanProjects: FixtureScanItem[];
  sandboxFolders: FixtureScanItem[];
  testTags: FixtureScanItem[];
  total: number;
  errors: string[];
  durationMs: number;
}

export interface SandboxInfo {
  folderId: string | null;
  folderName: string;
  exists: boolean;
}

// =============================================================================
// JXA SCRIPT EXECUTION
// =============================================================================

/**
 * Execute a JXA script and return the result
 */
async function executeJXA<T>(script: string): Promise<T> {
  const wrappedScript = `
    (() => {
      const app = Application('OmniFocus');
      app.includeStandardAdditions = true;
      const doc = app.defaultDocument();
      ${script}
    })()
  `;

  try {
    const { stdout } = await execAsync(`osascript -l JavaScript -e '${wrappedScript.replace(/'/g, "'\"'\"'")}'`);
    return JSON.parse(stdout.trim()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JXA execution failed: ${message}`);
  }
}

// =============================================================================
// SANDBOX FOLDER OPERATIONS
// =============================================================================

/**
 * Get sandbox folder info (cached on first call in SandboxManager)
 */
export async function getSandboxInfo(): Promise<SandboxInfo> {
  const script = `
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          return JSON.stringify({
            folderId: folders[i].id(),
            folderName: '${SANDBOX_FOLDER_NAME}',
            exists: true
          });
        }
      } catch (e) {}
    }
    return JSON.stringify({
      folderId: null,
      folderName: '${SANDBOX_FOLDER_NAME}',
      exists: false
    });
  `;
  return executeJXA<SandboxInfo>(script);
}

/**
 * Create the sandbox folder if it doesn't exist
 */
export async function ensureSandboxFolder(): Promise<string> {
  const info = await getSandboxInfo();
  if (info.exists && info.folderId) {
    return info.folderId;
  }

  const script = `
    const folder = app.Folder({ name: '${SANDBOX_FOLDER_NAME}' });
    doc.folders.push(folder);
    return JSON.stringify({ folderId: folder.id() });
  `;
  const result = await executeJXA<{ folderId: string }>(script);
  return result.folderId;
}

/**
 * Check if a project is inside the sandbox folder
 */
export async function isProjectInSandbox(projectId: string): Promise<boolean> {
  const script = `
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try {
        if (projects[i].id() === '${projectId}') {
          const folder = projects[i].folder();
          if (folder && folder.name() === '${SANDBOX_FOLDER_NAME}') {
            return JSON.stringify({ inSandbox: true });
          }
          return JSON.stringify({ inSandbox: false });
        }
      } catch (e) {}
    }
    return JSON.stringify({ inSandbox: false });
  `;
  const result = await executeJXA<{ inSandbox: boolean }>(script);
  return result.inSandbox;
}

// OMN-89: a duplicate `isTaskInSandbox` once lived here as an O(n)
// flattenedTasks-iterating JXA helper. It had zero external callers — the
// only production caller lives at `src/contracts/ast/mutation-script-builder.ts`
// and uses an O(1) `Task.byIdentifier` lookup via the OmniJS bridge. Removed
// rather than refactored to use OMNIJS_FIXTURE_PREDICATES_SOURCE since dead
// code is the wrong thing to polish.

// =============================================================================
// CLEANUP OPERATIONS
// =============================================================================

/**
 * Delete inbox tasks that match the OMN-83 fixture contract
 * (name starts with `__TEST__` OR carries a tag whose name starts
 * with `__test-`). Uses pure OmniJS for 50x+ faster performance than
 * JXA iteration (JXA iteration: ~48s, OmniJS: <1s for 2000+ task
 * database).
 *
 * Scope: this sweep only touches the inbox; tasks that drifted out of
 * the inbox into projects are handled by `deleteTestTasksEverywhere`.
 * OMN-89: predicate now goes through `OMNIJS_FIXTURE_PREDICATES_SOURCE`
 * so it matches the broader sweep's contract exactly — strict superset
 * of the pre-OMN-89 name-prefix-only behavior.
 */
/**
 * OmniJS inbox-fixture deletion script.
 *
 * Exported for the parse-safety guard in
 * `tests/unit/integration-helpers/sandbox-manager-script-parse.test.ts`.
 *
 * OMN-111: comments inside the `app.evaluateJavascript(\`...\`)` template MUST
 * NOT contain backticks. A stray backtick (e.g. markdown-style `` `inbox` ``)
 * terminates the inner template literal early — the JS engine then parses the
 * following identifier as a bare token in the argument list and the entire
 * sweep dies with "Unexpected identifier … Expected ')'", silently leaking
 * every fixture the sweep should have deleted.
 */
export function buildDeleteTestInboxFixturesScript(): string {
  return `
    const result = app.evaluateJavascript(\`
      (() => {
        ${OMNIJS_FIXTURE_PREDICATES_SOURCE}

        let deleted = 0;
        const errors = [];
        const namePrefix = '${TEST_INBOX_PREFIX}';
        const tagPrefix = '${TEST_TAG_PREFIX}';

        // OMN-89: classify via the shared isFixtureTask predicate (the
        // single source covered by sandbox-manager-omnijs-predicate-parity).
        // Iterating the inbox global directly keeps this O(inbox.length),
        // not O(flattenedTasks) — inbox tasks rarely carry tags but checking
        // both legs of the contract costs nothing.
        for (const task of inbox) {
          try {
            const name = task.name;
            const tags = task.tags || [];
            const tagNames = [];
            for (let i = 0; i < tags.length; i++) {
              tagNames.push(tags[i] ? tags[i].name : null);
            }
            if (!isFixtureTask(name, tagNames, namePrefix, tagPrefix)) continue;
            deleteObject(task);
            deleted++;
          } catch (e) {
            errors.push('Task: ' + e.message);
          }
        }

        return JSON.stringify({ deleted, errors });
      })()
    \`);
    return result;
  `;
}

async function deleteTestInboxTasks(): Promise<{ deleted: number; errors: string[] }> {
  // Use pure OmniJS to iterate inbox directly - very fast even with large databases
  return executeJXA<{ deleted: number; errors: string[] }>(buildDeleteTestInboxFixturesScript());
}

/**
 * OMN-83: orphan-fixture identity is now the `__TEST__` name prefix OR
 * membership of a `__test-` tag — full stop. The previous
 * ORPHAN_TASK_PATTERNS / ORPHAN_PROJECT_PATTERNS lists were grandfathered-in
 * substring/prefix matchers that risked nuking real user data (a task named
 * "Test fire alarm" would have matched "Test " family prefixes). All
 * integration-test fixtures must carry the `__TEST__` name prefix
 * (see TEST_INBOX_PREFIX) or a `__test-` tag (see TEST_TAG_PREFIX). This
 * contract is enforced by `MCPTestClient.createTestTask()` / `createTestProject()`
 * and individual tests that bypass those helpers (e.g. batch-operations).
 *
 * The two predicates below are the single source of truth for fixture
 * identity. The JXA/OmniJS-embedded scripts duplicate the logic (they run
 * in OmniFocus's JS context, not Node's), but the predicate semantics MUST
 * match. Unit tests drive these pure functions to pin the contract and
 * regression-prove that real-user-shaped task names are NOT classified as
 * fixtures.
 */

/**
 * True iff a task is an integration-test fixture by the OMN-83 contract:
 * name starts with `__TEST__` OR carries a tag whose name starts with
 * `__test-`.
 *
 * @param taskName    task name as it appears in OmniFocus
 * @param tagNames    full names of all tags currently on the task
 */
export function isFixtureTaskByName(taskName: string, tagNames: readonly string[] = []): boolean {
  if (taskName.startsWith(TEST_INBOX_PREFIX)) return true;
  for (const tag of tagNames) {
    if (tag.startsWith(TEST_TAG_PREFIX)) return true;
  }
  return false;
}

/**
 * True iff a project is an integration-test fixture by the OMN-83 contract:
 * name starts with `__TEST__` OR the project lives inside the sandbox folder.
 *
 * @param projectName       project name as it appears in OmniFocus
 * @param parentFolderName  name of the project's parent folder, or `null` if
 *                          the project sits at the root of the document
 */
export function isFixtureProjectByName(projectName: string, parentFolderName: string | null): boolean {
  if (projectName.startsWith(TEST_INBOX_PREFIX)) return true;
  if (parentFolderName === SANDBOX_FOLDER_NAME) return true;
  return false;
}

/**
 * OMN-87: shared OmniJS-side predicate source.
 *
 * The deletion / scan sweeps run inside OmniFocus's OmniJS context — they
 * can't import the TypeScript predicates above. Pre-OMN-87 each sweep
 * inlined the predicate logic, creating three independently-maintained
 * copies of the OMN-83 contract. A future edit to one copy (e.g. someone
 * "I'll just be permissive here" reintroducing substring matching) would
 * silently diverge — the 23 TS-predicate regression tests would stay
 * green, the sweep would behave differently. Same drift-risk shape as
 * OMN-46 / OMN-47.
 *
 * This constant is the SINGLE source for the OmniJS-side predicate
 * functions. Each sweep interpolates it as a preamble and calls
 * `isFixtureTask` / `isFixtureProject` instead of inlining. The
 * characterization test at
 * `tests/unit/integration-helpers/sandbox-manager-omnijs-predicate-parity.test.ts`
 * evaluates this string via `new Function` and verifies it produces the
 * same results as the TypeScript predicates on the OMN-83 fixture
 * corpus — closing the drift gap.
 *
 * The functions take their prefix/sandbox constants as arguments rather
 * than closing over module-level values: this keeps the source pure
 * (`new Function`-able) and decouples it from how the constants are
 * interpolated into each call site (which still happens via the
 * `${TEST_INBOX_PREFIX}` template-literal interpolation in each script).
 *
 * Do NOT add backticks, template-literal interpolation, or top-level
 * mutable state to this string — it must remain interpolatable into a
 * JXA → OmniJS double-backtick context AND evaluatable in Node via
 * `new Function`.
 */
export const OMNIJS_FIXTURE_PREDICATES_SOURCE = `
function isFixtureTask(name, tagNames, namePrefix, tagPrefix) {
  if (!name) return false;
  if (name.startsWith(namePrefix)) return true;
  if (tagNames) {
    for (var i = 0; i < tagNames.length; i++) {
      if (tagNames[i] && tagNames[i].startsWith(tagPrefix)) return true;
    }
  }
  return false;
}
function isFixtureProject(name, parentFolderName, namePrefix, sandboxName) {
  if (!name) return false;
  if (name.startsWith(namePrefix)) return true;
  if (parentFolderName === sandboxName) return true;
  return false;
}
`;

/**
 * Delete orphaned test projects that escaped the sandbox folder.
 * Uses OmniJS deleteObject() — the correct API for project deletion.
 *
 * OMN-83: deletion contract is `__TEST__` name prefix (TEST_INBOX_PREFIX)
 * for projects NOT inside the sandbox folder. Projects inside the sandbox
 * are handled by deleteSandboxProjects. No substring/loose matching: the
 * prefix is the contract.
 */
async function deleteOrphanedProjects(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = app.evaluateJavascript(\`
      (() => {
        ${OMNIJS_FIXTURE_PREDICATES_SOURCE}

        let deleted = 0;
        const errors = [];
        const namePrefix = '${TEST_INBOX_PREFIX}';
        const sandboxName = '${SANDBOX_FOLDER_NAME}';

        // Collect orphaned projects (__TEST__ prefix, NOT in sandbox).
        // OMN-87: isFixtureProject covers prefix OR sandbox; filter sandbox
        // here so deleteSandboxProjects handles those.
        const toDelete = [];
        for (const project of flattenedProjects) {
          try {
            const name = project.name;
            const folder = project.parentFolder;
            const folderName = folder ? folder.name : null;
            if (!isFixtureProject(name, folderName, namePrefix, sandboxName)) continue;
            if (folderName === sandboxName) continue;
            toDelete.push(project);
          } catch (e) {}
        }

        // Delete collected projects
        for (const project of toDelete) {
          try {
            deleteObject(project);
            deleted++;
          } catch (e) {
            errors.push('Orphan project: ' + e.message);
          }
        }

        return JSON.stringify({ deleted, errors });
      })()
    \`);
    return result;
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete all test-fixture tasks ANYWHERE in OmniFocus.
 *
 * OMN-83: orphan task identity is `__TEST__` name prefix (TEST_INBOX_PREFIX)
 * OR membership of any `__test-` tag (TEST_TAG_PREFIX). The previous
 * loose-prefix pattern list (ORPHAN_TASK_PATTERNS) is gone — a task named
 * "Test fire alarm" must NEVER be classified as a fixture. The prefix /
 * tag-prefix is the contract; every integration-test fixture must carry one
 * of them.
 *
 * This is slower than deleteTestInboxTasks since it scans all tasks, but
 * it's the safety net for tasks that escaped the sandbox (e.g. inbox tasks
 * that drifted to "Miscellaneous", projectless tasks under a deleted project).
 */
async function deleteTestTasksEverywhere(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = app.evaluateJavascript(\`
      (() => {
        ${OMNIJS_FIXTURE_PREDICATES_SOURCE}

        let deleted = 0;
        const errors = [];
        const namePrefix = '${TEST_INBOX_PREFIX}';
        const tagPrefix = '${TEST_TAG_PREFIX}';

        // OMN-87: collect tasks to delete via the shared OmniJS predicate.
        // isFixtureTask encodes the OMN-83 contract (__TEST__ name prefix OR
        // any tag with __test- prefix). Sweep collects first, deletes second
        // to avoid modifying the collection while iterating.
        const toDelete = [];
        for (const task of flattenedTasks) {
          try {
            const name = task.name;
            const tags = task.tags || [];
            const tagNames = [];
            for (let i = 0; i < tags.length; i++) {
              tagNames.push(tags[i] ? tags[i].name : null);
            }
            if (isFixtureTask(name, tagNames, namePrefix, tagPrefix)) {
              toDelete.push(task);
            }
          } catch (e) {
            // Skip invalid/dropped tasks
          }
        }

        // Delete collected tasks
        for (const task of toDelete) {
          try {
            deleteObject(task);
            deleted++;
          } catch (e) {
            errors.push('Task (everywhere): ' + e.message);
          }
        }

        return JSON.stringify({ deleted, errors });
      })()
    \`);
    return result;
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete all projects inside the sandbox folder
 * Uses pure OmniJS for faster performance than JXA iteration
 */
async function deleteSandboxProjects(): Promise<{ deleted: number; errors: string[] }> {
  // Use pure OmniJS - faster than JXA iteration through flattenedFolders/flattenedProjects
  const script = `
    const result = app.evaluateJavascript(\`
      (() => {
        let deleted = 0;
        const errors = [];
        const sandboxName = '${SANDBOX_FOLDER_NAME}';

        // Find sandbox folder using OmniJS
        let sandboxFolder = null;
        for (const folder of flattenedFolders) {
          if (folder.name === sandboxName) {
            sandboxFolder = folder;
            break;
          }
        }

        if (!sandboxFolder) {
          return JSON.stringify({ deleted: 0, errors: [] });
        }

        // Find and delete projects in sandbox folder
        for (const project of flattenedProjects) {
          if (project.parentFolder === sandboxFolder) {
            try {
              deleteObject(project);
              deleted++;
            } catch (e) {
              errors.push('Project: ' + e.message);
            }
          }
        }

        return JSON.stringify({ deleted, errors });
      })()
    \`);
    return result;
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete sub-folders inside sandbox (bottom-up, deepest first)
 * Uses JXA app.delete() for folder deletion
 */
async function deleteSandboxSubfolders(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = { deleted: 0, errors: [] };

    // Find sandbox folder
    let sandboxFolder = null;
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          sandboxFolder = folders[i];
          break;
        }
      } catch (e) {}
    }

    if (!sandboxFolder) {
      return JSON.stringify(result);
    }

    // Find all subfolders of sandbox with their references
    const subfolders = [];

    function collectSubfolders(parent, depth) {
      try {
        const children = parent.folders();
        for (let i = 0; i < children.length; i++) {
          subfolders.push({ folder: children[i], depth: depth });
          collectSubfolders(children[i], depth + 1);
        }
      } catch (e) {}
    }

    collectSubfolders(sandboxFolder, 0);

    // Sort by depth descending (deepest first)
    subfolders.sort((a, b) => b.depth - a.depth);

    // Delete each subfolder using JXA app.delete()
    for (const sf of subfolders) {
      try {
        app.delete(sf.folder);
        result.deleted++;
      } catch (e) {
        result.errors.push('Folder: ' + (e.message || e));
      }
    }

    return JSON.stringify(result);
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

/**
 * Delete the sandbox folder itself (must be empty first)
 * Uses JXA app.delete() for folder deletion
 */
async function deleteSandboxFolder(): Promise<{ deleted: boolean; error?: string }> {
  const script = `
    const folders = doc.flattenedFolders();
    let sandboxFolder = null;
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          sandboxFolder = folders[i];
          break;
        }
      } catch (e) {}
    }

    if (!sandboxFolder) {
      return JSON.stringify({ deleted: false, error: 'Sandbox folder not found' });
    }

    try {
      app.delete(sandboxFolder);
      return JSON.stringify({ deleted: true });
    } catch (e) {
      return JSON.stringify({ deleted: false, error: e.message || String(e) });
    }
  `;
  return executeJXA<{ deleted: boolean; error?: string }>(script);
}

/**
 * Delete all tags starting with __test- prefix
 * Uses JXA app.delete() for tag deletion
 * Note: Tags with tasks still using them may fail to delete - this is expected
 */
async function deleteTestTags(): Promise<{ deleted: number; errors: string[] }> {
  const script = `
    const result = { deleted: 0, errors: [] };

    // Find tags with __test- prefix
    const tags = doc.flattenedTags();
    const toDelete = [];
    for (let i = 0; i < tags.length; i++) {
      try {
        const name = tags[i].name();
        if (name && name.startsWith('${TEST_TAG_PREFIX}')) {
          toDelete.push(tags[i]);
        }
      } catch (e) {}
    }

    // Delete using JXA app.delete()
    for (let i = toDelete.length - 1; i >= 0; i--) {
      try {
        app.delete(toDelete[i]);
        result.deleted++;
      } catch (e) {
        // Tags with remaining tasks will fail - that's expected
        result.errors.push('Tag: ' + (e.message || e));
      }
    }

    return JSON.stringify(result);
  `;
  return executeJXA<{ deleted: number; errors: string[] }>(script);
}

// =============================================================================
// MAIN CLEANUP FUNCTION
// =============================================================================

/**
 * Full cleanup of all test data in the correct order.
 * Order matters due to OmniFocus constraints:
 * 1. Delete __TEST__ inbox tasks first
 * 2. Delete projects in sandbox (cascades to their tasks)
 * 3. Delete sub-folders (bottom-up)
 * 4. Delete sandbox folder itself
 * 5. Delete orphaned __TEST__ tasks anywhere (catches tasks that escaped sandbox)
 * 6. Delete orphaned test projects (catches projects that escaped sandbox)
 * 7. Delete __test- tags (must be after tasks/projects so tags aren't referenced)
 */
export async function fullCleanup(): Promise<CleanupReport> {
  const startTime = Date.now();
  const report: CleanupReport = {
    inboxTasksDeleted: 0,
    orphanedTasksDeleted: 0,
    orphanedProjectsDeleted: 0,
    projectsDeleted: 0,
    foldersDeleted: 0,
    tagsDeleted: 0,
    errors: [],
    durationMs: 0,
  };

  // Step 1: Delete inbox tasks with __TEST__ prefix
  try {
    const inboxResult = await deleteTestInboxTasks();
    report.inboxTasksDeleted = inboxResult.deleted;
    report.errors.push(...inboxResult.errors);
  } catch (error) {
    report.errors.push(`Inbox tasks: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 2: Delete projects inside sandbox
  try {
    const projectsResult = await deleteSandboxProjects();
    report.projectsDeleted = projectsResult.deleted;
    report.errors.push(...projectsResult.errors);
  } catch (error) {
    report.errors.push(`Projects: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 3: Delete sub-folders (bottom-up)
  try {
    const subfoldersResult = await deleteSandboxSubfolders();
    report.foldersDeleted = subfoldersResult.deleted;
    report.errors.push(...subfoldersResult.errors);
  } catch (error) {
    report.errors.push(`Subfolders: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 4: Delete sandbox folder itself
  try {
    const folderResult = await deleteSandboxFolder();
    if (folderResult.deleted) {
      report.foldersDeleted++;
    } else if (folderResult.error && !folderResult.error.includes('not found')) {
      report.errors.push(`Sandbox folder: ${folderResult.error}`);
    }
  } catch (error) {
    report.errors.push(`Sandbox folder: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 5: Delete orphaned __TEST__ tasks anywhere in OmniFocus
  // This catches tasks that ended up in projects like "Miscellaneous" instead of sandbox
  try {
    const orphanedResult = await deleteTestTasksEverywhere();
    report.orphanedTasksDeleted = orphanedResult.deleted;
    report.errors.push(...orphanedResult.errors);
  } catch (error) {
    report.errors.push(`Orphaned tasks: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 6: Delete orphaned test projects that escaped the sandbox folder
  // Safety net for interrupted test runs or folder assignment failures
  try {
    const orphanedProjectsResult = await deleteOrphanedProjects();
    report.orphanedProjectsDeleted = orphanedProjectsResult.deleted;
    report.errors.push(...orphanedProjectsResult.errors);
  } catch (error) {
    report.errors.push(`Orphaned projects: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 7: Delete test tags (must be after all task/project deletions)
  try {
    const tagsResult = await deleteTestTags();
    report.tagsDeleted = tagsResult.deleted;
    report.errors.push(...tagsResult.errors);
  } catch (error) {
    report.errors.push(`Tags: ${error instanceof Error ? error.message : String(error)}`);
  }

  report.durationMs = Date.now() - startTime;
  return report;
}

/**
 * OMN-46/OMN-83: read-only inventory of test fixtures currently present in
 * the live OmniFocus DB. Mirrors fullCleanup's categories without mutating
 * anything.
 *
 * Fixture identity (OMN-83):
 *   - Task: name starts with `__TEST__` (TEST_INBOX_PREFIX) OR has a tag with
 *     `__test-` prefix (TEST_TAG_PREFIX).
 *   - Project: name starts with `__TEST__` OR is inside the sandbox folder.
 *   - Folder: is the sandbox folder, or a descendant of it.
 *   - Tag: name starts with `__test-`.
 *
 * No substring matching, no pattern lists. The prefix is the contract.
 *
 * Returns an empty report (`total: 0`) when the DB is clean — that's the
 * post-cleanup assertion's success signal.
 */
export async function scanForFixtures(): Promise<FixtureScanReport> {
  const startTime = Date.now();
  const report: FixtureScanReport = {
    inboxTasks: [],
    orphanTasks: [],
    sandboxProjects: [],
    orphanProjects: [],
    sandboxFolders: [],
    testTags: [],
    total: 0,
    errors: [],
    durationMs: 0,
  };

  const script = `
    const result = app.evaluateJavascript(\`
      (() => {
        ${OMNIJS_FIXTURE_PREDICATES_SOURCE}

        const inboxPrefix = '${TEST_INBOX_PREFIX}';
        const tagPrefix = '${TEST_TAG_PREFIX}';
        const sandboxName = '${SANDBOX_FOLDER_NAME}';

        const out = {
          inboxTasks: [],
          orphanTasks: [],
          sandboxProjects: [],
          orphanProjects: [],
          sandboxFolders: [],
          testTags: [],
        };

        // OMN-87: classify tasks via the shared isFixtureTask predicate;
        // bucket by containing-project name (Inbox vs other).
        for (const task of flattenedTasks) {
          try {
            const name = task.name;
            const tags = task.tags || [];
            const tagNames = [];
            for (let i = 0; i < tags.length; i++) {
              tagNames.push(tags[i] ? tags[i].name : null);
            }
            if (!isFixtureTask(name, tagNames, inboxPrefix, tagPrefix)) continue;

            const proj = task.containingProject;
            const where = proj ? proj.name : 'Inbox';
            if (where === 'Inbox') {
              out.inboxTasks.push({ id: task.id.primaryKey, name, location: where });
            } else {
              out.orphanTasks.push({ id: task.id.primaryKey, name, location: where });
            }
          } catch (e) {}
        }

        // OMN-87: classify projects via the shared isFixtureProject
        // predicate; bucket by sandbox vs orphan based on parent folder.
        // Predicate covers prefix-or-sandbox; the bucketing decides which
        // cleanup function will handle each.
        for (const project of flattenedProjects) {
          try {
            const name = project.name;
            const folder = project.parentFolder;
            const folderName = folder ? folder.name : null;
            if (!isFixtureProject(name, folderName, inboxPrefix, sandboxName)) continue;
            if (folderName === sandboxName) {
              out.sandboxProjects.push({ id: project.id.primaryKey, name, location: sandboxName });
            } else {
              out.orphanProjects.push({ id: project.id.primaryKey, name, location: folderName || '(no folder)' });
            }
          } catch (e) {}
        }

        // Folders: sandbox folder itself + any subfolders of it
        for (const folder of flattenedFolders) {
          try {
            const name = folder.name;
            if (!name) continue;
            if (name === sandboxName) {
              out.sandboxFolders.push({ id: folder.id.primaryKey, name, location: '(root)' });
            } else {
              const parent = folder.parent;
              if (parent && parent.name === sandboxName) {
                out.sandboxFolders.push({ id: folder.id.primaryKey, name, location: sandboxName });
              }
            }
          } catch (e) {}
        }

        // Tags: __test- prefix
        for (const tag of flattenedTags) {
          try {
            const name = tag.name;
            if (name && name.startsWith(tagPrefix)) {
              out.testTags.push({ id: tag.id.primaryKey, name });
            }
          } catch (e) {}
        }

        return JSON.stringify(out);
      })()
    \`);
    return result;
  `;

  try {
    const scanResult = await executeJXA<{
      inboxTasks: FixtureScanItem[];
      orphanTasks: FixtureScanItem[];
      sandboxProjects: FixtureScanItem[];
      orphanProjects: FixtureScanItem[];
      sandboxFolders: FixtureScanItem[];
      testTags: FixtureScanItem[];
    }>(script);
    report.inboxTasks = scanResult.inboxTasks ?? [];
    report.orphanTasks = scanResult.orphanTasks ?? [];
    report.sandboxProjects = scanResult.sandboxProjects ?? [];
    report.orphanProjects = scanResult.orphanProjects ?? [];
    report.sandboxFolders = scanResult.sandboxFolders ?? [];
    report.testTags = scanResult.testTags ?? [];
    report.total =
      report.inboxTasks.length +
      report.orphanTasks.length +
      report.sandboxProjects.length +
      report.orphanProjects.length +
      report.sandboxFolders.length +
      report.testTags.length;
  } catch (error) {
    report.errors.push(`scanForFixtures: ${error instanceof Error ? error.message : String(error)}`);
  }

  report.durationMs = Date.now() - startTime;
  return report;
}
