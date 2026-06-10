/**
 * MUTATION SCRIPT BUILDER
 *
 * Generates JXA scripts for OmniFocus mutations (create, update, complete, delete, batch).
 * This is the script generation layer for the mutation contracts.
 *
 * Architecture:
 * - TaskMutation → validate → buildScript → JXA script string
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
import { dispatchMutation } from './mutation/defs.js';
import { emitProgram, wrapInLauncher } from './mutation/emitter.js';
import { validateMutationProgram } from './mutation/validator.js';

// =============================================================================
// TEST SANDBOX GUARD
// =============================================================================

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
 * Clear all sandbox caches (for testing)
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

/**
 * Options for batch operations
 */
export interface BatchOptions {
  createSequentially?: boolean;
  atomicOperation?: boolean;
  returnMapping?: boolean;
  stopOnError?: boolean;
}

/**
 * Batch operation definition
 */
export interface BatchOperation {
  operation: 'create' | 'update';
  target: MutationTarget;
  data?: TaskCreateData | ProjectCreateData;
  id?: string;
  changes?: TaskUpdateData | ProjectUpdateData;
  tempId?: string;
  parentTempId?: string;
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
 * Build a JXA script for bulk-deleting tasks by ID.
 * Emits from the mutation AST via 'bulk_delete/task' dispatch. The sandbox
 * guard pre-flights ALL ids before any delete executes (spec §2.1);
 * the emitter produces ONE unrolled OmniJS program — per-item byIdentifier
 * resolve, deleteObject, accumulated results — wrapped in a data-free JXA
 * launcher (OMN-128 slice 5).
 *
 * NOTE: The legacy buildBulkDeleteTasksScript in
 * src/omnifocus/scripts/tasks/delete-tasks-bulk.ts returned a plain string.
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

/**
 * Build a JXA script for batch operations
 */
export function buildBatchScript(
  target: MutationTarget,
  operations: BatchOperation[],
  options: BatchOptions = {},
): GeneratedMutationScript {
  const { createSequentially = false, returnMapping = false } = options;

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const operations = ${JSON.stringify(operations)};
  const sequential = ${createSequentially};
  const returnMapping = ${returnMapping};

  try {
    const results = [];
    const tempIdMapping = {};
    const errors = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      try {
        if (op.operation === 'create') {
          // Handle create
          let targetContainer = doc.inboxTasks;

          // Check for parent by tempId (JXA .id() is consistent within same script for tempId refs)
          if (op.parentTempId && tempIdMapping[op.parentTempId]) {
            const parentId = tempIdMapping[op.parentTempId];
            const allTasks = doc.flattenedTasks();
            for (let j = 0; j < allTasks.length; j++) {
              if (allTasks[j].id() === parentId) {
                targetContainer = allTasks[j].tasks;
                break;
              }
            }
          } else if (op.data.projectId) {
            // Use OmniJS bridge for O(1) project lookup (JXA .id() differs from id.primaryKey)
            const findProjectScript = '(' +
              '() => {' +
                'var target = ' + JSON.stringify(op.data.projectId) + ';' +
                'var proj = Project.byIdentifier(target);' +
                'if (!proj) proj = flattenedProjects.find(function(p) { return p.name === target; });' +
                'if (!proj) return JSON.stringify({ found: false });' +
                'return JSON.stringify({ found: true, index: flattenedProjects.indexOf(proj) });' +
              '}' +
            ')()';
            const findResult = JSON.parse(app.evaluateJavascript(findProjectScript));
            if (findResult.found && findResult.index >= 0) {
              targetContainer = doc.flattenedProjects()[findResult.index].tasks;
            }
          }

          const task = app.Task({
            name: op.data.name,
            note: op.data.note || '',
            flagged: op.data.flagged || false
          });

          targetContainer.push(task);
          const jxaId = task.id();

          // Store JXA ID for tempId mapping (needed for parent lookups within same script)
          if (op.tempId) {
            tempIdMapping[op.tempId] = jxaId;
          }

          // Bridge: unique note marker to find exact task in OmniJS (OMN-29)
          let responseId = jxaId;
          const batchNonce = '__BRIDGE_' + Date.now() + '_' + Math.floor(Math.random() * 1e8) + '__';
          try {
            const origNote = task.note() || '';
            task.note = batchNonce + origNote;
            const pkScript = '(' +
              '() => {' +
                'var marker = ' + JSON.stringify(batchNonce) + ';' +
                'var tasks = flattenedTasks;' +
                'for (var i = tasks.length - 1; i >= 0; i--) {' +
                  'try {' +
                    'if (tasks[i].note && tasks[i].note.startsWith(marker)) {' +
                      'var pk = tasks[i].id.primaryKey;' +
                      'tasks[i].note = tasks[i].note.substring(marker.length);' +
                      'return JSON.stringify({ pk: pk });' +
                    '}' +
                  '} catch(e) {}' +
                '}' +
                'return JSON.stringify({ pk: null });' +
              '}' +
            ')()';
            const pkResult = JSON.parse(app.evaluateJavascript(pkScript));
            if (pkResult.pk) responseId = pkResult.pk;
          } catch (e) {}
          // Safety: clean up marker if OmniJS bridge failed
          try {
            const curNote = task.note() || '';
            if (curNote.startsWith(batchNonce)) {
              task.note = curNote.substring(batchNonce.length);
            }
          } catch(e) {}

          results.push({
            success: true,
            operation: 'create',
            tempId: op.tempId || null,
            taskId: responseId,
            name: task.name()
          });

        } else if (op.operation === 'update') {
          // Handle update — use OmniJS bridge for O(1) task lookup (JXA .id() differs from id.primaryKey)
          const findTaskScript = '(' +
            '() => {' +
              'var target = ' + JSON.stringify(op.id) + ';' +
              'var task = Task.byIdentifier(target);' +
              'if (!task) task = flattenedTasks.find(function(t) { return t.name === target; });' +
              'if (!task) return JSON.stringify({ found: false });' +
              'return JSON.stringify({ found: true, index: flattenedTasks.indexOf(task) });' +
            '}' +
          ')()';
          const findTaskResult = JSON.parse(app.evaluateJavascript(findTaskScript));
          let task = null;
          if (findTaskResult.found && findTaskResult.index >= 0) {
            task = doc.flattenedTasks()[findTaskResult.index];
          }

          if (!task) {
            errors.push({ index: i, error: 'Task not found: ' + op.id });
            continue;
          }

          if (op.changes.name !== undefined) task.name = op.changes.name;
          if (op.changes.flagged !== undefined) task.flagged = op.changes.flagged;
          if (op.changes.note !== undefined) task.note = op.changes.note;

          results.push({
            success: true,
            operation: 'update',
            taskId: op.id,
            name: task.name()
          });
        }
      } catch (opError) {
        errors.push({ index: i, error: opError.message || String(opError) });
      }
    }

    return JSON.stringify({
      success: errors.length === 0,
      results: results,
      errors: errors,
      tempIdMapping: returnMapping ? tempIdMapping : undefined,
      totalOperations: operations.length,
      successCount: results.length,
      errorCount: errors.length
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'batch_${target}'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'batch',
    target,
    description: `Batch ${operations.length} ${target} operations`,
  };
}

/**
 * Build a JXA script for bulk deletion
 */
export async function buildBulkDeleteScript(target: MutationTarget, ids: string[]): Promise<GeneratedMutationScript> {
  // Test sandbox guard - validate all items are in sandbox
  if (isTestMode()) {
    const validationPromises = ids.map((id) =>
      target === 'task' ? validateTaskInSandbox(id, 'bulk delete') : validateProjectInSandbox(id, 'bulk delete'),
    );
    await Promise.all(validationPromises);
  }

  const isTask = target === 'task';
  const flattenedCollection = isTask ? 'flattenedTasks' : 'flattenedProjects';
  const idsJson = JSON.stringify(ids);

  const script = `
(() => {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  const targetIds = ${JSON.stringify(ids)};

  try {
    // Delete via bridge for reliable removal
    const deleteScript = '(' +
      '() => {' +
        'const ids = ${idsJson};' +
        'const results = { deleted: [], errors: [] };' +
        'ids.forEach(id => {' +
          'const item = ${flattenedCollection}.find(i => i.id.primaryKey === id);' +
          'if (item) {' +
            'const name = item.name;' +
            'deleteObject(item);' +
            'results.deleted.push({ id: id, name: name });' +
          '} else {' +
            'results.errors.push({ id: id, error: "Not found" });' +
          '}' +
        '});' +
        'return JSON.stringify(results);' +
      '}' +
    ')()';

    const result = JSON.parse(app.evaluateJavascript(deleteScript));

    return JSON.stringify({
      success: result.errors.length === 0,
      deletedCount: result.deleted.length,
      deleted: result.deleted,
      errors: result.errors,
      totalRequested: targetIds.length
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'bulk_delete_${target}'
    });
  }
})();
`;

  return {
    script: script.trim(),
    operation: 'bulk_delete',
    target,
    description: `Bulk delete ${ids.length} ${target}(s)`,
  };
}
