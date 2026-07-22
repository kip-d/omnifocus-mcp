/**
 * MUTATION SCRIPT BUILDER
 *
 * Generates JXA scripts for OmniFocus mutations (create, update, complete, delete, batch).
 * This is the script generation layer for the mutation contracts.
 *
 * Architecture:
 * - typed mutation data (contracts/mutations.ts) → buildScript → JXA script string
 *
 * TEST SANDBOX GUARD:
 * When NODE_ENV === 'test', all mutations are validated to ensure they only
 * affect data within the test sandbox (__MCP_TEST_SANDBOX__ folder).
 *
 * @see ../mutations.ts for contract types
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import type {
  TaskCreateData,
  ProjectCreateData,
  FolderCreateData,
  TaskUpdateData,
  ProjectUpdateData,
  MutationTarget,
} from '../mutations.js';
import {
  dispatchMutation,
  type MarkProjectReviewedInput,
  type MarkProjectsReviewedInput,
  type SetReviewScheduleInput,
} from './mutation/defs.js';
import { emitProgram, wrapInLauncher } from './mutation/emitter.js';
import { validateMutationProgram } from './mutation/validator.js';

// =============================================================================
// TEST SANDBOX GUARD
// =============================================================================
// OMN-202: this whole section is test-infrastructure — it only executes when
// isTestMode() is true (NODE_ENV==='test' && SANDBOX_GUARD_ENABLED==='true'),
// gating integration-test writes to the real OmniFocus sandbox. Mutating it
// measures test-harness coverage, not product-code defect detection, and was
// deflating this file's mutation score with noise (mutation-testing baseline
// OMN-201). Excluded from `mutate` via these
// Stryker comment directives rather than a stryker.config.json path/glob
// exclusion because the guard lives inline in this product file alongside the
// real script builders below (SCRIPT BUILDERS section) — a file-level
// exclusion would also blind mutation testing to those.
// Stryker disable all
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SANDBOX_FOLDER_NAME = '__MCP_TEST_SANDBOX__';
export const TEST_TAG_PREFIX = '__test-';
const TEST_INBOX_PREFIX = '__TEST__';

// Cache the sandbox folder ID to avoid repeated lookups
let cachedSandboxFolderId: string | null = null;

/**
 * Check if we're running in integration test mode with sandbox enforcement.
 *
 * The guard is ONLY active when:
 * - NODE_ENV === 'test' AND
 * - SANDBOX_GUARD_ENABLED === 'true' (set by integration test setup)
 *
 * This allows unit tests to run without sandbox restrictions while
 * integration tests that actually write to OmniFocus are protected.
 */
export function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.SANDBOX_GUARD_ENABLED === 'true';
}

/**
 * Execute a JXA script and return the result (for guard validation)
 */
async function executeGuardJXA<T>(script: string): Promise<T> {
  const wrappedScript = `
    (() => {
      const app = Application('OmniFocus');
      app.includeStandardAdditions = true;
      const doc = app.defaultDocument();
      ${script}
    })()
  `;

  const { stdout } = await execAsync(`osascript -l JavaScript -e '${wrappedScript.replace(/'/g, "'\"'\"'")}'`);
  return JSON.parse(stdout.trim()) as T;
}

/**
 * Get the sandbox folder ID (cached)
 */
async function getSandboxFolderId(): Promise<string | null> {
  if (cachedSandboxFolderId !== null) {
    return cachedSandboxFolderId;
  }

  const script = `
    const folders = doc.flattenedFolders();
    for (let i = 0; i < folders.length; i++) {
      try {
        if (folders[i].name() === '${SANDBOX_FOLDER_NAME}') {
          return JSON.stringify({ folderId: folders[i].id() });
        }
      } catch (e) {}
    }
    return JSON.stringify({ folderId: null });
  `;

  try {
    const result = await executeGuardJXA<{ folderId: string | null }>(script);
    cachedSandboxFolderId = result.folderId;
    return cachedSandboxFolderId;
  } catch {
    return null;
  }
}

// Cache validated project IDs to avoid repeated sandbox checks
const validatedProjectIds = new Set<string>();

/**
 * Check if a project is inside the sandbox folder
 * Uses O(1) Project.byIdentifier via OmniJS bridge instead of O(n) iteration
 */
async function isProjectInSandbox(projectId: string): Promise<boolean> {
  // Fast path: already validated this project
  if (validatedProjectIds.has(projectId)) {
    return true;
  }

  const sandboxId = await getSandboxFolderId();
  if (!sandboxId) return false;

  // Use OmniJS bridge for O(1) lookup instead of O(n) iteration
  const script = `
    const bridgeScript = \`
      (() => {
        const projectId = '${projectId}';
        const sandboxId = '${sandboxId}';

        // O(1) lookup using Project.byIdentifier
        const project = Project.byIdentifier(projectId);
        if (!project) {
          return JSON.stringify({ inSandbox: false, error: 'not_found' });
        }

        // Check if project's folder matches sandbox folder
        const folder = project.parentFolder;
        if (folder && folder.id.primaryKey === sandboxId) {
          return JSON.stringify({ inSandbox: true });
        }

        return JSON.stringify({ inSandbox: false });
      })()
    \`;

    return app.evaluateJavascript(bridgeScript);
  `;

  try {
    const result = await executeGuardJXA<{ inSandbox: boolean }>(script);
    if (result.inSandbox) {
      validatedProjectIds.add(projectId);
    }
    return result.inSandbox;
  } catch {
    return false;
  }
}

// Cache validated task IDs to avoid repeated sandbox checks
const validatedTaskIds = new Set<string>();

/**
 * Check if a task is inside the sandbox (via project) or has __TEST__ prefix
 * Uses O(1) Task.byIdentifier via OmniJS bridge instead of O(n) iteration
 */
async function isTaskInSandbox(taskId: string): Promise<boolean> {
  // Fast path: already validated this task
  if (validatedTaskIds.has(taskId)) {
    return true;
  }

  const sandboxId = await getSandboxFolderId();

  // Use OmniJS bridge for O(1) lookup instead of O(n) iteration
  const script = `
    const bridgeScript = \`
      (() => {
        const taskId = '${taskId}';
        const sandboxId = '${sandboxId || ''}';
        const testPrefix = '${TEST_INBOX_PREFIX}';

        // O(1) lookup using Task.byIdentifier
        const task = Task.byIdentifier(taskId);
        if (!task) {
          return JSON.stringify({ inSandbox: false, error: 'not_found' });
        }

        // Check if name starts with __TEST__ prefix
        if (task.name && task.name.startsWith(testPrefix)) {
          return JSON.stringify({ inSandbox: true });
        }

        // Check if task's project is in sandbox folder
        const project = task.containingProject;
        if (project) {
          const folder = project.parentFolder;
          if (folder && folder.id.primaryKey === sandboxId) {
            return JSON.stringify({ inSandbox: true });
          }
        }

        return JSON.stringify({ inSandbox: false });
      })()
    \`;

    return app.evaluateJavascript(bridgeScript);
  `;

  try {
    const result = await executeGuardJXA<{ inSandbox: boolean }>(script);
    if (result.inSandbox) {
      validatedTaskIds.add(taskId);
    }
    return result.inSandbox;
  } catch {
    return false;
  }
}

/**
 * Validate that a project creation is inside the sandbox
 */
export function validateProjectCreate(data: ProjectCreateData): void {
  if (!isTestMode()) return;

  if (data.folder !== SANDBOX_FOLDER_NAME) {
    throw new Error(
      'TEST GUARD: Projects must be created inside sandbox folder. ' +
        `Got folder: "${data.folder || '(none)'}". ` +
        `Use folder: "${SANDBOX_FOLDER_NAME}"`,
    );
  }

  // Validate tags
  if (data.tags && data.tags.length > 0) {
    const invalidTags = data.tags.filter((t) => !t.startsWith(TEST_TAG_PREFIX));
    if (invalidTags.length > 0) {
      throw new Error(`TEST GUARD: Tags must start with "${TEST_TAG_PREFIX}". ` + `Invalid: ${invalidTags.join(', ')}`);
    }
  }
}

/**
 * Validate that a folder creation is inside the sandbox
 */
export function validateFolderCreate(data: FolderCreateData): void {
  if (!isTestMode()) return;

  if (data.parentFolder !== SANDBOX_FOLDER_NAME) {
    throw new Error(
      'TEST GUARD: Folders must be created inside sandbox folder. ' +
        `Got parentFolder: "${data.parentFolder || '(none)'}". ` +
        `Use parentFolder: "${SANDBOX_FOLDER_NAME}"`,
    );
  }
}

/**
 * Validate that a task creation is in sandbox or has __TEST__ prefix for inbox
 */
export async function validateTaskCreate(data: TaskCreateData): Promise<void> {
  if (!isTestMode()) return;

  // Case 1: Subtask (has parentTaskId) - validate parent task is in sandbox
  if (data.parentTaskId) {
    const parentInSandbox = await isTaskInSandbox(data.parentTaskId);
    if (!parentInSandbox) {
      throw new Error(
        `TEST GUARD: Parent task "${data.parentTaskId}" is not inside sandbox. ` +
          'Subtasks can only be created under tasks that are in the sandbox.',
      );
    }
    // Parent task validated, subtask is allowed
    // Fall through to validate tags
  }
  // Case 2: Task in project - validate project is in sandbox
  else if (data.project) {
    const inSandbox = await isProjectInSandbox(data.project);
    if (!inSandbox) {
      throw new Error(
        `TEST GUARD: Project "${data.project}" is not inside sandbox folder. ` +
          `Tasks can only be created in projects within "${SANDBOX_FOLDER_NAME}".`,
      );
    }
    // Project validated, task is allowed
    // Fall through to validate tags
  }
  // Case 3: Inbox task (no project, no parent) - name must start with __TEST__
  else {
    if (!data.name.startsWith(TEST_INBOX_PREFIX)) {
      throw new Error(
        `TEST GUARD: Inbox tasks must have name starting with "${TEST_INBOX_PREFIX}". ` + `Got: "${data.name}"`,
      );
    }
    // Inbox task with correct prefix is allowed
    // Fall through to validate tags
  }

  // Validate tags (applies to all cases)
  validateTestTags(data.tags);
}

/**
 * Tag-prefix sandbox rule (pure extraction of validateTaskCreate's tag tail —
 * behavior identical): test-mode tags must carry the __test- prefix. Callers
 * gate on isTestMode() themselves.
 */
function validateTestTags(tags?: string[]): void {
  if (tags && tags.length > 0) {
    const invalidTags = tags.filter((t) => !t.startsWith(TEST_TAG_PREFIX));
    if (invalidTags.length > 0) {
      throw new Error(`TEST GUARD: Tags must start with "${TEST_TAG_PREFIX}". ` + `Invalid: ${invalidTags.join(', ')}`);
    }
  }
}

/**
 * Sandbox guard for the batch-create fast path ('batch-create/tasks' dispatch).
 * Per spec: a spec whose parentTempId points at another spec IN this batch is
 * container-guarded transitively (its parent chain bottoms out at a spec that
 * IS fully validated here), so only its tags need checking; every other spec
 * goes through the full validateTaskCreate (container + name + tags). No-op
 * outside test mode.
 *
 * NOTE: the transitive parentTempId skip is sound ONLY because dispatchMutation
 * runs guard-then-build and buildBatchCreateTasksProgram rejects self, forward,
 * missing, and duplicate tempId references at build time — this guard is not
 * standalone-sufficient against a malformed chain.
 */
export async function validateBatchTaskSpecs(specs: ReadonlyArray<BatchTaskSpec>): Promise<void> {
  if (!isTestMode()) return;
  const inBatch = new Set(specs.map((s) => s.tempId));
  for (const spec of specs) {
    if (spec.parentTempId && inBatch.has(spec.parentTempId)) {
      validateTestTags(spec.tags); // container guarded transitively via the in-batch parent
      continue;
    }
    await validateTaskCreate({
      name: spec.name,
      project: spec.projectId,
      parentTaskId: spec.parentTaskId,
      tags: spec.tags,
    });
  }
}

/**
 * Validate that tag changes only use __test- prefixed tags
 */
export function validateTagChanges(changes: TaskUpdateData | ProjectUpdateData): void {
  if (!isTestMode()) return;

  const allTags: string[] = [];

  if ('tags' in changes && changes.tags) {
    allTags.push(...changes.tags);
  }
  if ('addTags' in changes && changes.addTags) {
    allTags.push(...changes.addTags);
  }

  const invalidTags = allTags.filter((t) => !t.startsWith(TEST_TAG_PREFIX));
  if (invalidTags.length > 0) {
    throw new Error(`TEST GUARD: Tags must start with "${TEST_TAG_PREFIX}". ` + `Invalid: ${invalidTags.join(', ')}`);
  }
}

/**
 * Validate that a task update/delete is on a task inside the sandbox
 */
export async function validateTaskInSandbox(taskId: string, operation: string): Promise<void> {
  if (!isTestMode()) return;

  const inSandbox = await isTaskInSandbox(taskId);
  if (!inSandbox) {
    throw new Error(
      `TEST GUARD: Cannot ${operation} task "${taskId}" outside sandbox. ` +
        `Task must be in a project inside "${SANDBOX_FOLDER_NAME}" or have name starting with "${TEST_INBOX_PREFIX}".`,
    );
  }
}

/**
 * Validate that a project update/delete is on a project inside the sandbox
 */
export async function validateProjectInSandbox(projectId: string, operation: string): Promise<void> {
  if (!isTestMode()) return;

  const inSandbox = await isProjectInSandbox(projectId);
  if (!inSandbox) {
    throw new Error(
      `TEST GUARD: Cannot ${operation} project "${projectId}" outside sandbox. ` +
        `Project must be inside "${SANDBOX_FOLDER_NAME}" folder.`,
    );
  }
}

/**
 * Guard batch CREATE operations against the sandbox (test mode only). OMN-119.
 *
 * The single-create builders (buildCreateTaskScript / buildCreateProjectScript) embed the
 * sandbox guard, but batch creates run through a separate execution path
 * (routeToBatch → executeBatchCreatePhase / buildBatchCreateTasksScript) that did NOT —
 * so a `batch` envelope could create tasks/projects outside the sandbox during test runs
 * (the OMN-118 real-inbox leak: a model wrapped an unscoped create in a batch). The batch
 * orchestrator must call this up front so batch creates honor the same guard as single
 * creates, independent of the fast/slow create path.
 *
 * No-op outside test mode. Throws (message prefixed "TEST GUARD") on the first op that
 * would write outside the sandbox. Update/complete/delete sub-ops are already guarded —
 * they dispatch through the single-op handlers — so only creates need this.
 */
export async function validateBatchCreateOps(
  createOps: ReadonlyArray<{ operation?: string; target?: MutationTarget; data: TaskCreateData | ProjectCreateData }>,
): Promise<void> {
  if (!isTestMode()) return;
  for (const op of createOps) {
    if (op.target === 'project') {
      validateProjectCreate(op.data as ProjectCreateData);
    } else {
      await validateTaskCreate(op.data as TaskCreateData);
    }
  }
}

/**
 * Clear all sandbox caches (for testing).
 *
 * INTENTIONAL KEEP despite zero production callers: this is the documented
 * reset hook for the module-level sandbox caches — docs/CONCERNS-RESPONSE-2026-06.md
 * answers the mutable-module-state concern by pointing at this function for
 * test hygiene. Vitest's per-FILE module isolation resets these bindings
 * between files, but tests within one file need this hook. Exercised by
 * tests/unit/contracts/sandbox-cache-reset.test.ts; do not re-flag as orphan.
 */
export function clearSandboxCache(): void {
  cachedSandboxFolderId = null;
  validatedTaskIds.clear();
  validatedProjectIds.clear();
}

/**
 * Mark a project as validated in sandbox (for batch operations that create projects in sandbox)
 */
export function markProjectAsValidated(projectId: string): void {
  validatedProjectIds.add(projectId);
}

/**
 * Mark a task as validated in sandbox (for batch operations that create tasks in sandbox)
 */
export function markTaskAsValidated(taskId: string): void {
  validatedTaskIds.add(taskId);
}
// Stryker restore all

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result from a mutation script builder
 */
export interface GeneratedMutationScript {
  script: string;
  operation: string;
  target: MutationTarget;
  description?: string;
}

// =============================================================================
// SCRIPT BUILDERS
// =============================================================================

/**
 * Build a JXA script for creating a task
 */
export async function buildCreateTaskScript(data: TaskCreateData): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox
  // guard (validateTaskCreate) BEFORE building, so it can never be bypassed;
  // the emitter produces ONE OmniJS program (native `new Task(...)`, container
  // resolved in-program with a loud not-found guard) wrapped in a data-free JXA
  // launcher. The old template-string body — JXA app.Task construction, the
  // OMN-29 __BRIDGE_ note-nonce id dance, and per-field evaluateJavascript
  // islands for move/tags/repetition — is gone (OMN-128). Async because
  // dispatchMutation awaits its (possibly async) sandbox guard — spec §1/§5.
  const program = await dispatchMutation('create/task', data);
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  const script = wrapInLauncher(omnijs, program.context);

  return {
    script: script.trim(),
    operation: 'create',
    target: 'task',
    description: `Create task: ${data.name}`,
  };
}

/**
 * OMN-113: one task spec in a single-script batch create. Dates are already
 * UTC-normalized by the caller (localToUTC). Exactly one container hint applies,
 * checked in priority order: parentTempId (a task created earlier in THIS batch)
 * → parentTaskId (existing task id) → projectId (existing project id/name) →
 * inbox.
 */
export interface BatchTaskSpec {
  tempId: string;
  name: string;
  note?: string;
  flagged?: boolean;
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  plannedDate?: string;
  estimatedMinutes?: number;
  sequential?: boolean; // Action-group ordering: meaningful on parent tasks; no-op on leaves (OMN-206, parity with OMN-198)
  parentTempId?: string;
  parentTaskId?: string;
  projectId?: string;
}

export async function buildBatchCreateTasksScript(
  specs: BatchTaskSpec[],
  options: { stopOnError?: boolean } = {},
): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST: ONE unrolled OmniJS program (per-item
  // lowerTaskCreate statements under batchItem try/capture, parentTempId
  // chains resolved at BUILD time to earlier items' bindings — the runtime
  // byTempId map is gone, OMN-128). dispatchMutation runs the build-time
  // sandbox guard (validateBatchTaskSpecs) BEFORE building, so the batch path
  // honors the same guard as single creates (OMN-119 non-bypass); async for
  // that same guard. Launcher shape: wrapInLauncher returns the
  // app.evaluateJavascript payload RAW ({results:[...]}) — same as the legacy
  // launcher, whose comment warned that pre-wrapping would double-wrap under
  // OmniAutomation.executeJson and hide data.results from callers.
  const program = await dispatchMutation('batch-create/tasks', { specs, stopOnError: options.stopOnError === true });
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  return {
    script: wrapInLauncher(omnijs, program.context),
    operation: 'create',
    target: 'task',
    description: `Batch-create ${specs.length} task(s)`,
  };
}

/**
 * Build a JXA script for creating a project
 */
export async function buildCreateProjectScript(data: ProjectCreateData): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox guard
  // (validateProjectCreate) BEFORE building, so it can never be bypassed; the
  // emitter produces ONE OmniJS program (native `new Project(...)`, no JXA
  // app.Project / folder push) wrapped in a data-free JXA launcher. The old
  // template-string body — multiple evaluateJavascript round-trips for folder,
  // status, reviewInterval, and tags — is gone (OMN-128). Async because
  // dispatchMutation awaits its (possibly async) sandbox guard — spec §1/§5.
  const program = await dispatchMutation('create/project', data);
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  const script = wrapInLauncher(omnijs, program.context);

  return {
    script: script.trim(),
    operation: 'create',
    target: 'project',
    description: `Create project: ${data.name}`,
  };
}

/**
 * Build a JXA script for creating a folder.
 * Supports:
 * - Top-level folders (no parentFolder)
 * - Nested folders (parentFolder by name, path " : " or "/", or ID)
 */
export async function buildCreateFolderScript(data: FolderCreateData): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox
  // guard (validateFolderCreate) BEFORE building, so it can never be bypassed;
  // the emitter produces ONE OmniJS program (native `new Folder(...)`, parent
  // resolved in-program with a loud not-found guard) wrapped in a data-free JXA
  // launcher. The old template-string body — a JXA shell with two
  // evaluateJavascript islands (parent lookup + the JXA→OmniJS id bridge) — is
  // gone (OMN-128). Async because dispatchMutation awaits its (possibly async)
  // sandbox guard — spec §1/§4.
  const program = await dispatchMutation('create/folder', data);
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  const script = wrapInLauncher(omnijs, program.context);

  return {
    script: script.trim(),
    operation: 'create',
    target: 'folder',
    description: `Create folder: ${data.name}`,
  };
}

/**
 * Build a JXA script for updating a task
 */
export async function buildUpdateTaskScript(taskId: string, changes: TaskUpdateData): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox guard
  // (validateTaskInSandbox + validateTagChanges) BEFORE building; the emitter
  // produces ONE OmniJS program — resolve-first ordering, set-vs-clear lowering,
  // OMN-137 labeled warnings — wrapped in a data-free JXA launcher. The old
  // template-string body (nested-backtick island, runtime `if (changes.x)` forest,
  // silent inbox of swallowed failures) is gone (OMN-128 slice 4).
  const program = await dispatchMutation('update/task', { taskId, changes });
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  return {
    script: wrapInLauncher(omnijs, program.context).trim(),
    operation: 'update',
    target: 'task',
    description: `Update task: ${taskId}`,
  };
}

/**
 * Build a JXA script for updating a project
 */
export async function buildUpdateProjectScript(
  projectId: string,
  changes: ProjectUpdateData,
): Promise<GeneratedMutationScript> {
  // Emit from the mutation AST. dispatchMutation runs the build-time sandbox guard
  // (validateProjectInSandbox + validateTagChanges) BEFORE building; the emitter
  // produces ONE OmniJS program — STRICT byIdentifier target resolve (the legacy
  // silent name fallback is dead, spec §2.1), live status read-back, flexible
  // folder-move resolution (OMN-127 #2), OMN-137 labeled warnings — wrapped in a
  // data-free JXA launcher. The old four-island template body is gone (OMN-128
  // slice 4).
  const program = await dispatchMutation('update/project', { projectId, changes });
  validateMutationProgram(program);
  const omnijs = emitProgram(program);
  return {
    script: wrapInLauncher(omnijs, program.context).trim(),
    operation: 'update',
    target: 'project',
    description: `Update project: ${projectId}`,
  };
}

/**
 * Build a JXA script for completing a task or project.
 * Emits from the mutation AST. dispatchMutation runs the build-time sandbox
 * guard BEFORE building (covers the single-op task path, previously unguarded
 * at the tool layer — rewired to this builder in the same slice, spec §2.1);
 * the emitter produces ONE OmniJS program — strict byIdentifier resolve, live
 * completionDate read-back — wrapped in a data-free JXA launcher.
 */
export async function buildCompleteScript(
  target: MutationTarget,
  id: string,
  completionDate?: string,
): Promise<GeneratedMutationScript> {
  const program =
    target === 'task'
      ? await dispatchMutation('complete/task', { taskId: id, completionDate })
      : await dispatchMutation('complete/project', { projectId: id, completionDate });
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'complete',
    target,
    description: `Complete ${target}: ${id}`,
  };
}

/**
 * Build a JXA script for deleting a task or project.
 * Emits from the mutation AST. dispatchMutation runs the build-time sandbox
 * guard BEFORE building; the emitter produces ONE OmniJS program — strict
 * byIdentifier resolve, name captured pre-delete — wrapped in a data-free JXA
 * launcher. The old template body is gone (OMN-128 slice 5).
 */
export async function buildDeleteScript(target: MutationTarget, id: string): Promise<GeneratedMutationScript> {
  const program =
    target === 'task'
      ? await dispatchMutation('delete/task', { taskId: id })
      : await dispatchMutation('delete/project', { projectId: id });
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'delete',
    target,
    description: `Delete ${target}: ${id}`,
  };
}

/**
 * Build a JXA script for marking a project reviewed (OMN-106 PR-1).
 * Emits from the mutation AST via 'mark-reviewed/project' dispatch — the
 * legacy template ran with NO sandbox guard (the OMN-119/120 bypass class);
 * dispatchMutation closes that. Wire envelope unchanged
 * (MARK_REVIEWED_TYPED_SCHEMA is the contract).
 */
export async function buildMarkProjectReviewedScript(
  params: MarkProjectReviewedInput,
): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('mark-reviewed/project', params);
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'mark_reviewed',
    target: 'project',
    description: `Mark project reviewed: ${params.projectId}`,
  };
}

/**
 * Build a JXA script for the batch mark-projects-reviewed mutation (OMN-256).
 * Emits from the mutation AST via 'mark-reviewed/projects' dispatch — the
 * sandbox guard pre-flights ALL ids before any update executes. Wire envelope
 * is MARK_REVIEWED_BATCH_TYPED_SCHEMA; the single-id 'mark-reviewed/project'
 * route and its envelope are unaffected.
 */
export async function buildMarkProjectsReviewedScript(
  params: MarkProjectsReviewedInput,
): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('mark-reviewed/projects', params);
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'mark_reviewed_batch',
    target: 'project',
    description: `Mark projects reviewed: ${params.projectIds.join(', ')}`,
  };
}

/**
 * Build a JXA script for the set-review-schedule batch mutation (OMN-106 PR-2).
 * Emits from the mutation AST via 'set-review-schedule/project' dispatch — the
 * legacy template ran with NO sandbox guard (OMN-119/120 bypass class); the
 * guard pre-flights ALL ids before any update executes. Wire envelope
 * unchanged (SET_SCHEDULE_TYPED_SCHEMA is the contract). Throws when neither
 * reviewInterval nor nextReviewDate is provided (fail-loud, 2026-07-06).
 */
export async function buildSetReviewScheduleScript(params: SetReviewScheduleInput): Promise<GeneratedMutationScript> {
  const program = await dispatchMutation('set-review-schedule/project', params);
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'set_review_schedule',
    target: 'project',
    description: `Set review schedule: ${params.projectIds.join(', ')}`,
  };
}

/**
 * Build a JXA script for bulk-deleting tasks by ID.
 * Emits from the mutation AST via 'bulk_delete/task' dispatch. The sandbox
 * guard pre-flights ALL ids before any delete executes (spec §2.1);
 * the emitter produces ONE unrolled OmniJS program — per-item byIdentifier
 * resolve, deleteObject, accumulated results — wrapped in a data-free JXA
 * launcher (OMN-128 slice 5).
 *
 * NOTE: The legacy buildBulkDeleteTasksScript in
 * src/omnifocus/scripts/tasks/delete-tasks-bulk.ts (deleted in this slice) returned a plain string.
 * This export returns GeneratedMutationScript and replaces it (OMN-128 slice 5).
 */
export async function buildBulkDeleteTasksScript(input: { taskIds: string[] }): Promise<GeneratedMutationScript> {
  if (input.taskIds.length === 0) {
    throw new Error('bulk_delete requires at least one taskId');
  }
  const program = await dispatchMutation('bulk_delete/task', { taskIds: input.taskIds });
  validateMutationProgram(program);
  return {
    script: wrapInLauncher(emitProgram(program), program.context).trim(),
    operation: 'bulk_delete',
    target: 'task',
    description: `Bulk delete ${input.taskIds.length} task(s)`,
  };
}
