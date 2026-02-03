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
  projectsDeleted: number;
  foldersDeleted: number;
  tagsDeleted: number;
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

/**
 * Check if a task is inside the sandbox (via project) or has __TEST__ prefix
 */
export async function isTaskInSandbox(taskId: string): Promise<boolean> {
  const script = `
    const tasks = doc.flattenedTasks();
    for (let i = 0; i < tasks.length; i++) {
      try {
        if (tasks[i].id() === '${taskId}') {
          const name = tasks[i].name();
          // Check if name starts with __TEST__ prefix
          if (name && name.startsWith('${TEST_INBOX_PREFIX}')) {
            return JSON.stringify({ inSandbox: true });
          }
          // Check if task's project is in sandbox
          const project = tasks[i].containingProject();
          if (project) {
            const folder = project.folder();
            if (folder && folder.name() === '${SANDBOX_FOLDER_NAME}') {
              return JSON.stringify({ inSandbox: true });
            }
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

// =============================================================================
// CLEANUP OPERATIONS
// =============================================================================

/**
 * Delete all tasks with __TEST__ name prefix (inbox tasks only)
 * Uses pure OmniJS for 50x+ faster performance than JXA iteration
 * (JXA iteration: ~48s, OmniJS: <1s for 2000+ task database)
 *
 * Note: We only check the inbox. Tasks with __TEST__ prefix should only
 * be created in inbox during tests, not in projects.
 */
async function deleteTestInboxTasks(): Promise<{ deleted: number; errors: string[] }> {
  // Use pure OmniJS to iterate inbox directly - very fast even with large databases
  const script = `
    const result = app.evaluateJavascript(\`
      (() => {
        let deleted = 0;
        const errors = [];
        const prefix = '${TEST_INBOX_PREFIX}';

        // Iterate inbox directly (OmniJS global) - fast even with large databases
        // Note: inbox is typically small, so this is O(inbox.length) not O(allTasks)
        for (const task of inbox) {
          if (task.name.startsWith(prefix)) {
            try {
              deleteObject(task);
              deleted++;
            } catch (e) {
              errors.push('Task: ' + e.message);
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
 * Common test task name patterns that indicate orphaned test data.
 * These are checked in addition to __TEST__ prefix.
 * Only tasks in "Miscellaneous" or "Inbox" with no tags are deleted.
 */
const ORPHAN_TASK_PATTERNS = [
  // Common test task naming patterns (prefix match)
  'Test Task',
  'Test update',
  'Test delete',
  'Test create',
  'Test batch',
  'Test clear',
  'Test tags',
  'Test addTags',
  'Test removeTags',
  'Test flag',
  'Test multiple',
  'Test urgent',
  'Test Project',
  'Test Op ',
  'MCP Test',
  'MCP Final Test',
  'E2E Test',
  'Smoke Test',
  'Integration Test',
  'Performance Test',
  'Lightweight Test',
  'MCP Coercion Test',
  'Quick Test',
  'v2.2.0 Test',
  // Builder API / Concurrent / Sequential test patterns
  'Builder API test',
  'Task for non-zero',
  'Concurrent Task',
  'Timing Test',
  'Debug Timing Test',
  'Sequential Test',
  'BrandedType Test',
  // Planned date test patterns (without __TEST__ prefix)
  'Task with Planned Date',
  'Task to Update Planned Date',
  'Task to Clear Planned Date',
  // Analytics test patterns
  'Completed 1',
  'Completed 2',
  'Completed 3',
  'Completed Task for Stats',
  'Another Completed',
  'Overdue Task Test',
  'Future Task Test',
  'Velocity Test Task',
  'Consistency Test',
];

/**
 * Delete all tasks with __TEST__ name prefix ANYWHERE in OmniFocus
 * This catches orphaned test tasks that ended up in projects like "Miscellaneous"
 * instead of the sandbox folder.
 *
 * Note: This is slower than deleteTestInboxTasks since it scans all tasks,
 * but necessary to clean up tasks that escaped the sandbox.
 */
async function deleteTestTasksEverywhere(): Promise<{ deleted: number; errors: string[] }> {
  const patternsJson = JSON.stringify(ORPHAN_TASK_PATTERNS);
  const script = `
    const result = app.evaluateJavascript(\`
      (() => {
        let deleted = 0;
        const errors = [];
        const prefix = '${TEST_INBOX_PREFIX}';
        const orphanPatterns = ${patternsJson};

        // Collect tasks to delete first (avoid modifying while iterating)
        const toDelete = [];
        for (const task of flattenedTasks) {
          try {
            const name = task.name;
            if (!name) continue;

            // Check 1: __TEST__ prefix (always delete)
            if (name.startsWith(prefix)) {
              toDelete.push(task);
              continue;
            }

            // Check 2: Orphan patterns (only in Miscellaneous/Inbox with no tags)
            const project = task.containingProject;
            const projName = project ? project.name : 'Inbox';
            const tagCount = task.tags.length;

            if ((projName === 'Miscellaneous' || projName === 'Inbox') && tagCount === 0) {
              for (const pattern of orphanPatterns) {
                if (name.startsWith(pattern) || name.includes(pattern)) {
                  toDelete.push(task);
                  break;
                }
              }
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
 * 6. Delete __test- tags (must be after tasks so tags aren't referenced)
 */
export async function fullCleanup(): Promise<CleanupReport> {
  const startTime = Date.now();
  const report: CleanupReport = {
    inboxTasksDeleted: 0,
    orphanedTasksDeleted: 0,
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

  // Step 6: Delete test tags (must be after all task deletions)
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
