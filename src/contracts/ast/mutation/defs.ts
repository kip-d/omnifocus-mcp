// src/contracts/ast/mutation/defs.ts
// Mutation lowerings: data → typed mutation-AST Program. Plus the guarded
// dispatch registry (MUTATION_DEFS) that runs the build-time sandbox guard
// BEFORE building, so a registered op can never bypass it (the OMN-119/120
// non-bypass property — batch & bulk paths previously skipped the guard).
import type {
  FolderCreateData,
  ProjectCreateData,
  ProjectUpdateData,
  TaskCreateData,
  TaskUpdateData,
} from '../../mutations.js';
import {
  isTestMode,
  TEST_TAG_PREFIX,
  validateBatchTaskSpecs,
  validateFolderCreate,
  validateProjectCreate,
  validateProjectInSandbox,
  validateTagChanges,
  validateTaskCreate,
  validateTaskInSandbox,
  type BatchTaskSpec,
} from '../mutation-script-builder.js';
import { lowerRepetitionRule } from './repetition.js';
import {
  assignTags,
  batchItem,
  bind,
  bulkDeleteItem,
  callMethod,
  constructFolder,
  constructProject,
  constructTag,
  constructTagPath,
  constructTask,
  dateExpr,
  deleteObject,
  enumRef,
  guard,
  json,
  member,
  mergeRetag,
  moveProject,
  moveTag,
  moveTask,
  newExpr,
  raw,
  readModifyReassign,
  ref,
  resolveFolder,
  resolveParentTask,
  resolveProject,
  resolveProjectById,
  resolveTag,
  resolveTask,
  return_,
  setProp,
  type ContainerResolution,
  type Envelope,
  type Expr,
  type Program,
  type ProjectMovePosition,
  type Stmt,
  type TagResolution,
  type TaskMovePosition,
} from './types.js';

const STATUS_ENUM: Record<string, string> = {
  on_hold: 'Project.Status.OnHold',
  completed: 'Project.Status.Done',
  dropped: 'Project.Status.Dropped',
};

/**
 * Convert the schema-normalized "days between reviews" into the most natural
 * (unit, steps) pair, mirroring the original buildCreateProjectScript. Computed
 * at BUILD time so the emitted OmniJS carries plain literals.
 */
function reviewIntervalUnit(days: number): { unit: string; steps: number } {
  if (days % 365 === 0) return { unit: 'years', steps: days / 365 };
  if (days % 30 === 0) return { unit: 'months', steps: days / 30 };
  if (days % 7 === 0) return { unit: 'weeks', steps: days / 7 };
  return { unit: 'days', steps: days };
}

/**
 * Lower a project-create request into a typed mutation Program. Statement order
 * preserves the original builder's behavior (folder resolve+guard, construct,
 * scalar props, dates, status, reviewInterval, tags, return).
 */
export function buildCreateProjectProgram(data: ProjectCreateData): Program {
  // Compile-time exhaustiveness guard (ported from the deleted buildProjectDataObject):
  // forces a build error if ProjectCreateData gains a field this lowering doesn't handle,
  // so a new schema field can't be silently dropped. When this stops compiling, add the
  // field below AND emit the statement that lowers it.
  const _exhaustive: Record<keyof ProjectCreateData, true> = {
    name: true,
    note: true,
    folder: true,
    tags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    flagged: true,
    sequential: true,
    status: true,
    reviewInterval: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];

  // Folder: resolve flexibly, then guard the not-found case so the project is
  // never silently filed at the database root (OMN-127 #1).
  if (data.folder) {
    statements.push(resolveFolder('targetFolder', data.folder));
    statements.push(
      guard('targetFolder === null', {
        error: json(true),
        message: json('Folder not found: ' + data.folder),
        context: json('create_project'),
      }),
    );
    snippetDeps.push('resolveFolderFlexible');
  }

  statements.push(
    constructProject(
      'proj',
      json(data.name),
      data.folder ? { kind: 'resolved', var: 'targetFolder' } : { kind: 'none' },
    ),
  );

  statements.push(setProp(ref('proj'), 'note', json(data.note || '')));
  statements.push(setProp(ref('proj'), 'flagged', json(data.flagged || false)));
  statements.push(setProp(ref('proj'), 'sequential', json(data.sequential || false)));

  for (const field of ['dueDate', 'deferDate', 'plannedDate'] as const) {
    const value = data[field];
    if (value) {
      statements.push(setProp(ref('proj'), field, dateExpr(json(value)), 'dateExpr'));
    }
  }

  // Status: only non-active is emitted, best-effort (a status failure must NOT
  // fail project creation — original swallowed errors in a separate bridge).
  if (data.status && data.status !== 'active') {
    statements.push(setProp(ref('proj'), 'status', enumRef(STATUS_ENUM[data.status]), 'enum', true, 'status'));
  }

  // reviewInterval: read-modify-reassign the typed instance, best-effort.
  if (data.reviewInterval) {
    const { unit, steps } = reviewIntervalUnit(data.reviewInterval);
    statements.push(
      readModifyReassign(
        ref('proj'),
        'reviewInterval',
        [
          { prop: 'steps', value: json(steps) },
          { prop: 'unit', value: json(unit) },
        ],
        true,
        'reviewInterval',
      ),
    );
  }

  // Tags: create-or-find, best-effort (tag failures must NOT fail creation).
  if (data.tags && data.tags.length) {
    statements.push(assignTags(ref('proj'), json(data.tags), 'appliedTags', true, 'tags'));
    snippetDeps.push('resolveOrCreateTagByPath');
  }

  const envelope: Record<string, Expr> = {
    projectId: member(ref('proj'), 'id.primaryKey'),
    name: member(ref('proj'), 'name'),
    note: raw("proj.note || ''"),
    flagged: member(ref('proj'), 'flagged'),
    sequential: member(ref('proj'), 'sequential'),
    dueDate: raw('proj.dueDate ? proj.dueDate.toISOString() : null'),
    deferDate: raw('proj.deferDate ? proj.deferDate.toISOString() : null'),
    plannedDate: raw('proj.plannedDate ? proj.plannedDate.toISOString() : null'),
    folder: data.folder ? raw('targetFolder.name') : json(null),
    tags: data.tags && data.tags.length ? ref('appliedTags') : json([]),
    // OMN-137: best-effort failures (status/reviewInterval/tags) surface here.
    warnings: ref('_warnings'),
    created: json(true),
  };
  statements.push(return_(envelope));

  return { statements, context: 'create_project', snippetDeps };
}

// =============================================================================
// FOLDER CREATE LOWERING
// =============================================================================

/**
 * Lower a folder-create request into a typed mutation Program (OMN-128 slice 3).
 * Statement order preserves the legacy builder: parent resolve + guard (loud
 * not-found, exact legacy message — already loud since OMN-127), construct,
 * return. The legacy JXA→OmniJS id-bridge island is deleted, not migrated:
 * folderId reads id.primaryKey directly off the fresh binding. `warnings` is
 * additive (always [] today — no best-effort statements) for one-semantics
 * uniformity across migrated create envelopes.
 */
export function buildCreateFolderProgram(data: FolderCreateData): Program {
  // Compile-time exhaustiveness guard (same discipline as the other create
  // lowerings): a new FolderCreateData field cannot be silently dropped.
  const _exhaustive: Record<keyof FolderCreateData, true> = {
    name: true,
    parentFolder: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];

  if (data.parentFolder) {
    statements.push(resolveFolder('targetParent', data.parentFolder));
    statements.push(
      guard('targetParent === null', {
        error: json(true),
        message: json('Parent folder not found: ' + data.parentFolder),
        context: json('create_folder'),
      }),
    );
    snippetDeps.push('resolveFolderFlexible');
  }

  statements.push(
    constructFolder(
      'folder',
      json(data.name),
      data.parentFolder ? { kind: 'resolved', var: 'targetParent' } : { kind: 'none' },
    ),
  );

  const envelope: Envelope = {
    folderId: member(ref('folder'), 'id.primaryKey'),
    name: member(ref('folder'), 'name'),
    parentFolder: data.parentFolder ? raw('targetParent.name') : json(null),
    warnings: ref('_warnings'),
    created: json(true),
  };
  statements.push(return_(envelope));

  return { statements, context: 'create_folder', snippetDeps };
}

// =============================================================================
// TASK CREATE LOWERING (shared by single + batch programs)
// =============================================================================

/**
 * Binding names for one task-create lowering. Parameterizing the names lets the
 * SAME lowering serve the single program ('task' / 'appliedTags') and each
 * unrolled batch item ('_t<i>' / 'appliedTags_<i>') without redeclaration
 * collisions (spec §2.4 / §3).
 */
export interface TaskLoweringNames {
  taskVar: string; // 'task' (single) or '_t<i>' (batch)
  tagsVar: string; // 'appliedTags' or 'appliedTags_<i>'
  resolveVar: (base: string) => string; // names resolver binds: base => base (single) or `${base}_${i}` (batch)
  guardMode: 'return' | 'throw'; // single returns the error envelope; batch items throw (caught per-item)
}

/**
 * Lower one task-create request into statements + snippet deps. Statement order
 * mirrors the legacy builder: resolve container (+ guard) → constructTask →
 * note/flagged → dates → estimatedMinutes → tags → repetitionRule.
 *
 * Container priority (spec §3, uniform for both paths): containerOverride
 * (batch tempIdRef) → data.parentTaskId → data.project (non-null string) → inbox.
 *
 * An empty-string project is treated as no-project → inbox (the truthy check is
 * legacy-faithful); the same applies to a batch spec's empty-string projectId,
 * which toTaskCreateData maps straight onto `project`.
 */
export function lowerTaskCreate(
  data: TaskCreateData,
  names: TaskLoweringNames,
  containerOverride?: ContainerResolution, // batch tempIdRef; when set, data-derived container resolution is skipped
): { statements: Stmt[]; snippetDeps: string[] } {
  // Compile-time exhaustiveness guard (same discipline as ProjectCreateData's in
  // buildCreateProjectProgram): forces a build error if TaskCreateData gains a
  // field this lowering doesn't handle, so a new schema field can't be silently
  // dropped. When this stops compiling, add the field below AND emit the
  // statement that lowers it.
  const _exhaustive: Record<keyof TaskCreateData, true> = {
    name: true,
    note: true,
    project: true,
    parentTaskId: true,
    tags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    flagged: true,
    sequential: true,
    estimatedMinutes: true,
    repetitionRule: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];

  // Guard envelopes by mode: return-mode guards carry the slice-1 error envelope;
  // throw-mode guards carry only the message (the batch item's catch wraps it).
  const guardEnvelope = (message: string): Envelope =>
    names.guardMode === 'throw'
      ? { message: json(message) }
      : { error: json(true), message: json(message), context: json('create_task') };
  const guardMode = names.guardMode === 'throw' ? ('throw' as const) : undefined; // absent = return

  let container: ContainerResolution;
  if (containerOverride) {
    container = containerOverride;
  } else if (data.parentTaskId) {
    // parentTaskId WINS over project (legacy batch priority order, spec §3) —
    // data.project is then ignored entirely (no resolve emitted for it).
    const bindName = names.resolveVar('parentTask');
    statements.push(resolveParentTask(bindName, data.parentTaskId));
    statements.push(
      guard(`${bindName} === null`, guardEnvelope('Parent task not found: ' + data.parentTaskId), guardMode),
    );
    container = { kind: 'parentTask', var: bindName };
  } else if (data.project) {
    // DELIBERATE BEHAVIOR DELTA (spec §3.1.1): the legacy single path silently
    // fell through to the inbox when the project lookup missed (OMN-127
    // conflation in task form). The typed resolution + guard makes it LOUD.
    const bindName = names.resolveVar('targetProject');
    statements.push(resolveProject(bindName, data.project));
    statements.push(guard(`${bindName} === null`, guardEnvelope('Project not found: ' + data.project), guardMode));
    snippetDeps.push('resolveProjectFlexible');
    container = { kind: 'project', var: bindName };
  } else {
    container = { kind: 'inbox' };
  }

  statements.push(constructTask(names.taskVar, json(data.name), container));

  statements.push(setProp(ref(names.taskVar), 'note', json(data.note || '')));
  statements.push(setProp(ref(names.taskVar), 'flagged', json(data.flagged || false)));

  // OMN-198: action-group ordering. Only emitted when provided (no-op on leaf tasks
  // in OmniFocus, so a childless create with sequential:true is harmless). Matches
  // the update path (lowerUpdateScalars) and project-create's sequential setter.
  if (data.sequential !== undefined) {
    statements.push(setProp(ref(names.taskVar), 'sequential', json(data.sequential)));
  }

  for (const field of ['dueDate', 'deferDate', 'plannedDate'] as const) {
    const value = data[field];
    if (value) {
      statements.push(setProp(ref(names.taskVar), field, dateExpr(json(value)), 'dateExpr'));
    }
  }

  // estimatedMinutes: emitted ONLY when truthy — the legacy falsy check,
  // deliberately preserved (0 is dropped; whether 0 should mean "clear" is
  // schema-layer policy, out of scope for this slice).
  if (data.estimatedMinutes) {
    statements.push(setProp(ref(names.taskVar), 'estimatedMinutes', json(data.estimatedMinutes), 'direct'));
  }

  // Tags: create-or-find, best-effort (tag failures must NOT fail creation).
  if (data.tags?.length) {
    statements.push(assignTags(ref(names.taskVar), json(data.tags), names.tagsVar, true, 'tags'));
    snippetDeps.push('resolveOrCreateTagByPath');
  }

  // Repetition: lowered at BUILD time (RRULE + enum paths as literals), applied
  // best-effort so a repetition failure does not fail the creation (legacy
  // swallowed; OMN-137 surfaces it as a labeled warning).
  if (data.repetitionRule) {
    const lowered = lowerRepetitionRule(data.repetitionRule);
    statements.push(
      setProp(
        ref(names.taskVar),
        'repetitionRule',
        newExpr('Task.RepetitionRule', [
          json(lowered.rrule),
          json(null), // method is deprecated — always null; scheduleType/anchorDateKey carry the semantics
          enumRef(lowered.scheduleTypePath),
          enumRef(lowered.anchorPath),
          json(lowered.catchUp),
        ]),
        'direct',
        true,
        'repetitionRule',
      ),
    );
  }

  return { statements, snippetDeps };
}

/**
 * Lower a single task-create request into a typed mutation Program. Envelope
 * mirrors the legacy buildCreateTaskScript return shape, plus `warnings` and
 * `plannedDate`-style nullable date serialization.
 */
export function buildCreateTaskProgram(data: TaskCreateData): Program {
  const { statements, snippetDeps } = lowerTaskCreate(data, {
    taskVar: 'task',
    tagsVar: 'appliedTags',
    resolveVar: (base) => base,
    guardMode: 'return',
  });

  // The raw() fragments below hardcode `task.` — they assume taskVar === 'task'
  // (true for this single-create wrapper; the batch wrapper builds its own results).
  const envelope: Envelope = {
    taskId: member(ref('task'), 'id.primaryKey'),
    name: member(ref('task'), 'name'),
    note: raw("task.note || ''"),
    flagged: member(ref('task'), 'flagged'),
    dueDate: raw('task.dueDate ? task.dueDate.toISOString() : null'),
    deferDate: raw('task.deferDate ? task.deferDate.toISOString() : null'),
    plannedDate: raw('task.plannedDate ? task.plannedDate.toISOString() : null'),
    estimatedMinutes: raw('task.estimatedMinutes || null'),
    tags: data.tags?.length ? ref('appliedTags') : json([]),
    project: raw('task.containingProject ? task.containingProject.name : null'),
    inInbox: member(ref('task'), 'inInbox'),
    // OMN-137: best-effort failures (tags/repetitionRule) surface here.
    warnings: ref('_warnings'),
    created: json(true),
  };

  return { statements: [...statements, return_(envelope)], context: 'create_task', snippetDeps };
}

// =============================================================================
// BATCH TASK CREATE (unrolled program — the runtime byTempId map is gone)
// =============================================================================

export interface BatchCreateTasksData {
  specs: BatchTaskSpec[];
  stopOnError?: boolean;
}

/**
 * Map one BatchTaskSpec onto the shared TaskCreateData shape consumed by
 * lowerTaskCreate. projectId→project (an empty string falls through to inbox,
 * legacy-faithful — see lowerTaskCreate's JSDoc); tempId/parentTempId are
 * consumed by buildBatchCreateTasksProgram itself (result identity + the
 * tempIdRef container), so they are deliberately NOT carried here.
 */
function toTaskCreateData(spec: BatchTaskSpec): TaskCreateData {
  // Compile-time exhaustiveness guard (same discipline as TaskCreateData's in
  // lowerTaskCreate): forces a build error if BatchTaskSpec gains a field this
  // mapping doesn't handle, so a new spec field can't be silently dropped.
  // Note BatchTaskSpec has NO repetitionRule, so this guard's key set is
  // deliberately narrower than lowerTaskCreate's. When this stops compiling,
  // add the field below AND route it (here, or in the program builder for
  // batch-composition fields like tempId/parentTempId).
  const _exhaustive: Record<keyof BatchTaskSpec, true> = {
    tempId: true,
    name: true,
    note: true,
    flagged: true,
    tags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    estimatedMinutes: true,
    sequential: true,
    parentTempId: true,
    parentTaskId: true,
    projectId: true,
  };
  void _exhaustive;

  const data: TaskCreateData = { name: spec.name };
  if (spec.note !== undefined) data.note = spec.note;
  if (spec.flagged !== undefined) data.flagged = spec.flagged;
  if (spec.tags !== undefined) data.tags = spec.tags;
  if (spec.dueDate !== undefined) data.dueDate = spec.dueDate;
  if (spec.deferDate !== undefined) data.deferDate = spec.deferDate;
  if (spec.plannedDate !== undefined) data.plannedDate = spec.plannedDate;
  if (spec.estimatedMinutes !== undefined) data.estimatedMinutes = spec.estimatedMinutes;
  // OMN-206: parity with the OMN-198 single-create fix — preserve an explicit
  // false (!== undefined), so lowerTaskCreate emits the setProp.
  if (spec.sequential !== undefined) data.sequential = spec.sequential;
  if (spec.parentTaskId !== undefined) data.parentTaskId = spec.parentTaskId;
  if (spec.projectId !== undefined) data.project = spec.projectId;
  return data;
}

/**
 * Lower a batch task-create request into ONE unrolled Program: per spec i, the
 * shared lowerTaskCreate statements (names parameterized as `_t<i>` /
 * `appliedTags_<i>` / `<base>_<i>`, throw-mode guards) wrapped in a batchItem
 * try/capture that pushes into the builder-bound `results` array. Container
 * priority per item: parentTempId (a task created EARLIER in this batch,
 * resolved at build time to that item's `_t<j>` binding) → parentTaskId →
 * projectId → inbox. A forward or missing parentTempId reference is a
 * BUILD-time error (legacy made it a runtime per-item error; build time is
 * strictly earlier and loud — item order comes from createSequentially
 * handling upstream, unchanged).
 */
export function buildBatchCreateTasksProgram(data: BatchCreateTasksData): Program {
  const statements: Stmt[] = [bind('results', raw('[]'))];
  const snippetDeps = new Set<string>();
  const tempIdToVar = new Map<string, string>();

  data.specs.forEach((spec, i) => {
    // Duplicate tempIds are a build-time error (legacy silently overwrote the
    // map entry; forward/missing refs below are already loud build-time
    // errors — this is the consistent completion of that set).
    if (tempIdToVar.has(spec.tempId)) {
      throw new Error(`Duplicate tempId in batch: ${spec.tempId}`);
    }

    let containerOverride: Extract<ContainerResolution, { kind: 'tempIdRef' }> | undefined;
    if (spec.parentTempId) {
      const parentVar = tempIdToVar.get(spec.parentTempId);
      if (!parentVar) {
        throw new Error(`parentTempId "${spec.parentTempId}" not created earlier in batch (item ${i})`);
      }
      containerOverride = { kind: 'tempIdRef', var: parentVar };
    }

    const { statements: itemStmts, snippetDeps: itemDeps } = lowerTaskCreate(
      toTaskCreateData(spec),
      {
        taskVar: `_t${i}`,
        tagsVar: `appliedTags_${i}`,
        resolveVar: (base) => `${base}_${i}`,
        guardMode: 'throw',
      },
      containerOverride,
    );
    if (containerOverride) {
      // RUNTIME half of the chain contract (the build-time half — forward /
      // missing refs — threw above): a parent that CONSTRUCTED but then
      // failed (e.g. its moveTasks threw under stopOnError=false) would
      // otherwise leave its hoisted `var _t<j>` binding live, and this child
      // would silently nest under a failed parent while reporting
      // success:true — the silent-partial-failure class. batchItem's catch
      // invalidates the binding (`_t<j> = undefined;`, emitter); this
      // PRE-CONSTRUCT guard turns that into a loud per-item failure,
      // mirroring the legacy byTempId runtime check and its exact message.
      itemStmts.unshift(
        guard(
          `!${containerOverride.var}`,
          { message: json('Parent not created in batch: ' + spec.parentTempId) },
          'throw',
        ),
      );
    }
    for (const dep of itemDeps) snippetDeps.add(dep);
    statements.push(batchItem(spec.tempId, i, `_t${i}`, itemStmts, data.stopOnError === true));
    tempIdToVar.set(spec.tempId, `_t${i}`);
  });

  statements.push(return_({ results: ref('results') }));
  return { statements, context: 'batch_create_tasks', snippetDeps: [...snippetDeps] };
}

// =============================================================================
// UPDATE LOWERINGS (slice 4) — shared set-vs-clear / tag-mode / scalar helpers
// =============================================================================

export interface UpdateTaskInput {
  taskId: string;
  changes: TaskUpdateData;
}
export interface UpdateProjectInput {
  projectId: string;
  changes: ProjectUpdateData;
}

type DateChanges = Pick<
  TaskUpdateData,
  'dueDate' | 'deferDate' | 'plannedDate' | 'clearDueDate' | 'clearDeferDate' | 'clearPlannedDate'
>;

/** Set-vs-clear date lowering shared by both update targets (spec §3): clear
 * flag, explicit null, OR empty string → null assignment; non-empty string →
 * dateExpr. Clear WINS over a simultaneous value (legacy applied the clear
 * after the set). The empty-string case is legacy-faithful: the old builder's
 * falsy check lowered '' to null, and the task-path sanitizer normalizes ''
 * away before the builder — but the builder is the public contract, so it
 * must not depend on that upstream sanitization. */
function lowerDateSetClear(targetVar: string, changes: DateChanges): Stmt[] {
  const stmts: Stmt[] = [];
  // Literal property reads (not computed `changes[field]`) so the OMN-61
  // schema↔builder parity scan sees every date/clear field being consumed.
  const fields = [
    { field: 'dueDate', value: changes.dueDate, clear: changes.clearDueDate },
    { field: 'deferDate', value: changes.deferDate, clear: changes.clearDeferDate },
    { field: 'plannedDate', value: changes.plannedDate, clear: changes.clearPlannedDate },
  ] as const;
  for (const { field, value, clear } of fields) {
    if (clear === true || value === null || value === '') {
      stmts.push(setProp(ref(targetVar), field, json(null), 'direct'));
    } else if (value !== undefined) {
      stmts.push(setProp(ref(targetVar), field, dateExpr(json(value)), 'dateExpr'));
    }
  }
  return stmts;
}

type TagChanges = Pick<TaskUpdateData, 'tags' | 'addTags' | 'removeTags'>;

/** Tag lowering shared by both update targets: replace (clearTags + create-or-find),
 * add (create-or-find), remove (resolve WITHOUT create). Presence-truthy like the
 * legacy checks — `tags: []` clears all. Distinct binds per mode. */
function lowerTagChanges(targetVar: string, changes: TagChanges): { statements: Stmt[]; snippetDeps: string[] } {
  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];
  if (changes.tags) {
    statements.push(assignTags(ref(targetVar), json(changes.tags), 'replacedTags', true, 'tags', 'replace'));
    snippetDeps.push('resolveOrCreateTagByPath');
  }
  if (changes.addTags) {
    statements.push(assignTags(ref(targetVar), json(changes.addTags), 'addedTags', true, 'tags', 'add'));
    snippetDeps.push('resolveOrCreateTagByPath');
  }
  if (changes.removeTags) {
    statements.push(assignTags(ref(targetVar), json(changes.removeTags), 'removedTags', true, 'tags', 'remove'));
    snippetDeps.push('resolveTagByPath');
  }
  return { statements, snippetDeps };
}

/** Scalar lowering shared by both update targets. */
function lowerUpdateScalars(
  targetVar: string,
  changes: { name?: string; note?: string; flagged?: boolean; sequential?: boolean },
): Stmt[] {
  const stmts: Stmt[] = [];
  if (changes.name !== undefined) stmts.push(setProp(ref(targetVar), 'name', json(changes.name)));
  if (changes.note !== undefined) stmts.push(setProp(ref(targetVar), 'note', json(changes.note)));
  if (changes.flagged !== undefined) stmts.push(setProp(ref(targetVar), 'flagged', json(changes.flagged)));
  if (changes.sequential !== undefined) stmts.push(setProp(ref(targetVar), 'sequential', json(changes.sequential)));
  return stmts;
}

/**
 * Lower a task-update request into a typed mutation Program (OMN-128 slice 4).
 * Build-time conditional: the program contains ONLY statements for fields
 * actually being changed. Statement shape: target resolve + guard → destination
 * resolves + guards → applies in legacy order (scalars → dates →
 * estimatedMinutes → moves → tags → repetition → status) → read-back envelope.
 */
export function buildUpdateTaskProgram(input: UpdateTaskInput): Program {
  const { taskId, changes } = input;
  // Compile-time exhaustiveness guard (same discipline as the create lowerings):
  // a new TaskUpdateData field cannot be silently dropped. When this stops
  // compiling, add the field below AND emit the statement that lowers it.
  const _exhaustive: Record<keyof TaskUpdateData, true> = {
    name: true,
    note: true,
    project: true,
    parentTaskId: true,
    tags: true,
    addTags: true,
    removeTags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    clearDueDate: true,
    clearDeferDate: true,
    clearPlannedDate: true,
    flagged: true,
    sequential: true,
    estimatedMinutes: true,
    clearEstimatedMinutes: true,
    repetitionRule: true,
    status: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];
  const errEnv = (message: string): Envelope => ({
    error: json(true),
    message: json(message),
    context: json('update_task'),
  });

  // Resolve-first (spec §2.2): target, then every destination, each guarded —
  // a not-found reference fails LOUD with zero mutations applied.
  statements.push(resolveTask('task', taskId));
  statements.push(guard('task === null', errEnv('Task not found: ' + taskId)));

  let projectMove: TaskMovePosition | undefined;
  if (changes.project !== undefined) {
    if (changes.project === null) {
      projectMove = { kind: 'inboxBeginning' };
    } else {
      statements.push(resolveProject('targetProject', changes.project));
      statements.push(guard('targetProject === null', errEnv('Project not found: ' + changes.project)));
      snippetDeps.push('resolveProjectFlexible');
      projectMove = { kind: 'projectBeginning', var: 'targetProject' };
    }
  }

  let parentMove: TaskMovePosition | undefined;
  if (changes.parentTaskId !== undefined) {
    if (changes.parentTaskId === null || changes.parentTaskId === '') {
      parentMove = { kind: 'containerRoot', taskVar: 'task' }; // legacy: '' behaves like null
    } else {
      statements.push(resolveTask('parentTask', changes.parentTaskId));
      statements.push(guard('parentTask === null', errEnv('Parent task not found: ' + changes.parentTaskId)));
      parentMove = { kind: 'parentEnding', var: 'parentTask' };
    }
  }

  // Applies in legacy order: scalars → dates → estimatedMinutes → moves → tags → repetition → status.
  statements.push(...lowerUpdateScalars('task', changes));
  statements.push(...lowerDateSetClear('task', changes));

  if (changes.clearEstimatedMinutes) {
    statements.push(setProp(ref('task'), 'estimatedMinutes', json(null), 'direct'));
  } else if (changes.estimatedMinutes !== undefined) {
    // !== undefined, NOT truthy: update sets 0 (legacy; create drops 0 — preserved asymmetry, spec §3).
    statements.push(setProp(ref('task'), 'estimatedMinutes', json(changes.estimatedMinutes), 'direct'));
  }

  if (projectMove) statements.push(moveTask(ref('task'), projectMove, true, 'move'));
  if (parentMove) statements.push(moveTask(ref('task'), parentMove, true, 'move'));

  const tagLowering = lowerTagChanges('task', changes);
  statements.push(...tagLowering.statements);
  snippetDeps.push(...tagLowering.snippetDeps);

  if (changes.repetitionRule === null) {
    statements.push(setProp(ref('task'), 'repetitionRule', json(null), 'direct'));
  } else if (changes.repetitionRule) {
    const lowered = lowerRepetitionRule(changes.repetitionRule);
    statements.push(
      setProp(
        ref('task'),
        'repetitionRule',
        newExpr('Task.RepetitionRule', [
          json(lowered.rrule),
          json(null),
          enumRef(lowered.scheduleTypePath),
          enumRef(lowered.anchorPath),
          json(lowered.catchUp),
        ]),
        'direct',
        true,
        'repetitionRule',
      ),
    );
  }

  if (changes.status === 'completed') {
    statements.push(callMethod(ref('task'), 'markComplete', [newExpr('Date', [])], true, 'status'));
  } else if (changes.status === 'dropped') {
    statements.push(callMethod(ref('task'), 'drop', [json(true), newExpr('Date', [])], true, 'status'));
  }

  statements.push(
    return_({
      taskId: member(ref('task'), 'id.primaryKey'),
      name: member(ref('task'), 'name'),
      flagged: member(ref('task'), 'flagged'),
      updated: json(true),
      warnings: ref('_warnings'),
    }),
  );

  return { statements, context: 'update_task', snippetDeps };
}

// Update-side status map: unlike create's STATUS_ENUM (which deliberately skips
// 'active' — a fresh project already IS active), update supports setting a
// project BACK to active. Kept separate so the create lowering's "only
// non-active is emitted" invariant stays expressed in its own map.
const PROJECT_STATUS_UPDATE_ENUM: Record<string, string> = {
  active: 'Project.Status.Active',
  on_hold: 'Project.Status.OnHold',
  completed: 'Project.Status.Done',
  dropped: 'Project.Status.Dropped',
};

/** Live status read-back for the update envelope (spec §2.4) — builder-internal
 * raw (no user data), mapping Project.Status constants to the legacy lowercase
 * strings so the envelope key keeps its shape. The legacy envelope ECHOED
 * `changes.status || 'active'` while the actual set could have silently failed.
 *
 * OMN-274 adjudication — deliberately NOT the read/analytics wire vocabulary:
 * this echo speaks the write TRANSPORT enum ('active'|'on_hold'|'completed'|
 * 'dropped'), the same values the write schema accepts and the write response
 * schema pins (response-schemas/write.ts) — a client reads back the vocabulary
 * it wrote. It is a whole-vocabulary choice ('completed', not 'done'), not a
 * drifted copy of the 'onHold' map; changing only the OnHold spelling would
 * create a THIRD, mixed vocabulary. If this echo ever converges on the wire
 * form, move 'completed'→'done' and the response schema enum in the same
 * change. See Technical/specs/OMN-274-read-path-status-vocabulary.md. */
const PROJECT_STATUS_READBACK =
  "proj.status === Project.Status.Active ? 'active' : " +
  "proj.status === Project.Status.OnHold ? 'on_hold' : " +
  "proj.status === Project.Status.Done ? 'completed' : 'dropped'";

/**
 * Lower a project-update request into a typed mutation Program (OMN-128 slice 4).
 * Build-time conditional: the program contains ONLY statements for fields
 * actually being changed. Statement shape: target resolve (STRICT byIdentifier
 * — the legacy name fallback is dead, spec §2.1) + guard → folder destination
 * resolve + guard → applies in legacy order (scalars → reviewInterval → dates →
 * status → folder move → tags) → read-back envelope.
 */
export function buildUpdateProjectProgram(input: UpdateProjectInput): Program {
  const { projectId, changes } = input;
  // Compile-time exhaustiveness guard (same discipline as the create lowerings):
  // a new ProjectUpdateData field cannot be silently dropped. When this stops
  // compiling, add the field below AND emit the statement that lowers it.
  const _exhaustive: Record<keyof ProjectUpdateData, true> = {
    name: true,
    note: true,
    folder: true,
    tags: true,
    addTags: true,
    removeTags: true,
    dueDate: true,
    deferDate: true,
    plannedDate: true,
    clearDueDate: true,
    clearDeferDate: true,
    clearPlannedDate: true,
    flagged: true,
    sequential: true,
    status: true,
    reviewInterval: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [];
  const snippetDeps: string[] = [];
  const errEnv = (message: string): Envelope => ({
    error: json(true),
    message: json(message),
    context: json('update_project'),
  });

  // Resolve-first (spec §2.2): target, then the folder destination, each
  // guarded — a not-found reference fails LOUD with zero mutations applied.
  statements.push(resolveProjectById('proj', projectId));
  statements.push(guard('proj === null', errEnv('Project not found: ' + projectId)));

  let folderMove: ProjectMovePosition | undefined;
  if (changes.folder !== undefined) {
    if (changes.folder === null) {
      folderMove = { kind: 'libraryBeginning' };
    } else {
      // Destination keeps flexible resolution (path / id / leaf name, OMN-127 #2);
      // the §2.2 delta is the MESSAGE: create-family wording replaces legacy's
      // 'Failed to move project: folder_not_found:' wrapper.
      statements.push(resolveFolder('targetFolder', changes.folder));
      statements.push(guard('targetFolder === null', errEnv('Folder not found: ' + changes.folder)));
      snippetDeps.push('resolveFolderFlexible');
      folderMove = { kind: 'folderBeginning', var: 'targetFolder' };
    }
  }

  // Applies in legacy order: scalars → reviewInterval → dates → status → folder move → tags.
  statements.push(...lowerUpdateScalars('proj', changes));

  if (changes.reviewInterval !== undefined) {
    const { unit, steps } = reviewIntervalUnit(changes.reviewInterval);
    statements.push(
      readModifyReassign(
        ref('proj'),
        'reviewInterval',
        [
          { prop: 'steps', value: json(steps) },
          { prop: 'unit', value: json(unit) },
        ],
        true,
        'reviewInterval',
      ),
    );
  }

  statements.push(...lowerDateSetClear('proj', changes));

  if (changes.status) {
    statements.push(
      setProp(ref('proj'), 'status', enumRef(PROJECT_STATUS_UPDATE_ENUM[changes.status]), 'enum', true, 'status'),
    );
  }

  if (folderMove) statements.push(moveProject(ref('proj'), folderMove, true, 'folder'));

  const tagLowering = lowerTagChanges('proj', changes);
  statements.push(...tagLowering.statements);
  snippetDeps.push(...tagLowering.snippetDeps);

  statements.push(
    return_({
      projectId: member(ref('proj'), 'id.primaryKey'),
      name: member(ref('proj'), 'name'),
      flagged: member(ref('proj'), 'flagged'),
      status: raw(PROJECT_STATUS_READBACK),
      updated: json(true),
      warnings: ref('_warnings'),
    }),
  );

  return { statements, context: 'update_project', snippetDeps };
}

// =============================================================================
// LIFECYCLE LOWERINGS (slice 5) — complete + delete, single and bulk
// =============================================================================

export interface CompleteTaskInput {
  taskId: string;
  completionDate?: string | null;
}
export interface CompleteProjectInput {
  projectId: string;
  completionDate?: string | null;
}

/** Shared complete lowering (spec §4.2) — task/project differ only in the
 *  resolve node, guard message, and envelope id key. completionDate is already
 *  UTC-converted by the tool layer; absent/null/empty → bare markComplete() ("now"
 *  — the truthy check collapses all three; `new Date("")` is Invalid Date). */
function lowerComplete(kind: 'task' | 'project', id: string, completionDate?: string | null): Program {
  const isTask = kind === 'task';
  const v = isTask ? 'task' : 'proj';
  const context = isTask ? 'complete_task' : 'complete_project';
  const statements: Stmt[] = [
    isTask ? resolveTask(v, id) : resolveProjectById(v, id),
    guard(`${v} === null`, {
      error: json(true),
      message: json(`${isTask ? 'Task' : 'Project'} not found: ${id}`),
      context: json(context),
    }),
    callMethod(ref(v), 'markComplete', completionDate ? [dateExpr(json(completionDate))] : []),
    return_({
      [isTask ? 'taskId' : 'projectId']: member(ref(v), 'id.primaryKey'),
      name: member(ref(v), 'name'),
      completed: json(true),
      // Live read-back, not an echo (spec §3). Builder-internal raw — no user data.
      completionDate: raw(`${v}.completionDate ? ${v}.completionDate.toISOString() : null`),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

/** Lower a complete-task request — see lowerComplete. */
export function buildCompleteTaskProgram(input: CompleteTaskInput): Program {
  const _exhaustive: Record<keyof CompleteTaskInput, true> = { taskId: true, completionDate: true };
  void _exhaustive;
  return lowerComplete('task', input.taskId, input.completionDate);
}

/** Lower a complete-project request — see lowerComplete. */
export function buildCompleteProjectProgram(input: CompleteProjectInput): Program {
  const _exhaustive: Record<keyof CompleteProjectInput, true> = { projectId: true, completionDate: true };
  void _exhaustive;
  return lowerComplete('project', input.projectId, input.completionDate);
}

export interface DeleteTaskInput {
  taskId: string;
}
export interface DeleteProjectInput {
  projectId: string;
}
export interface BulkDeleteTasksInput {
  taskIds: string[];
}

/** Shared single-delete lowering (spec §4.2): resolve → guard → capture name →
 *  deleteObject → envelope. The id is a deliberate echo: the object no longer
 *  exists to read (spec §3); name is captured pre-delete. */
function lowerDelete(kind: 'task' | 'project', id: string): Program {
  const isTask = kind === 'task';
  const v = isTask ? 'task' : 'proj';
  const nameVar = isTask ? 'taskName' : 'projName';
  const context = isTask ? 'delete_task' : 'delete_project';
  const statements: Stmt[] = [
    isTask ? resolveTask(v, id) : resolveProjectById(v, id),
    guard(`${v} === null`, {
      error: json(true),
      message: json(`${isTask ? 'Task' : 'Project'} not found: ${id}`),
      context: json(context),
    }),
    bind(nameVar, member(ref(v), 'name')),
    deleteObject(ref(v)),
    return_({
      [isTask ? 'taskId' : 'projectId']: json(id),
      name: ref(nameVar),
      deleted: json(true),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

/** Lower a delete-task request — see lowerDelete. */
export function buildDeleteTaskProgram(input: DeleteTaskInput): Program {
  const _exhaustive: Record<keyof DeleteTaskInput, true> = { taskId: true };
  void _exhaustive;
  return lowerDelete('task', input.taskId);
}

/** Lower a delete-project request — see lowerDelete. */
export function buildDeleteProjectProgram(input: DeleteProjectInput): Program {
  const _exhaustive: Record<keyof DeleteProjectInput, true> = { projectId: true };
  void _exhaustive;
  return lowerDelete('project', input.projectId);
}

/** Bulk task delete (spec §4.2): ids 1–100 by schema (an empty array would emit a
 *  program whose envelope references undeclared accumulators); per-item
 *  continue-on-error unroll; emitProgram owns the _deleted/_errors declarations. */
export function buildBulkDeleteTasksProgram(input: BulkDeleteTasksInput): Program {
  const _exhaustive: Record<keyof BulkDeleteTasksInput, true> = { taskIds: true };
  void _exhaustive;
  const statements: Stmt[] = input.taskIds.map((id, i) => bulkDeleteItem(id, i));
  statements.push(
    return_({
      deleted: ref('_deleted'),
      errors: ref('_errors'),
      // Builder-internal raw: the only interpolation is the build-time count.
      message: raw(`"Deleted " + _deleted.length + " of " + ${input.taskIds.length} + " tasks"`),
    }),
  );
  return { statements, context: 'bulk_delete_tasks', snippetDeps: [] };
}

// =============================================================================
// TAG LOWERINGS (slice 6)
// =============================================================================

export interface TagCreateInput {
  tagName: string;
  parentTagName?: string;
}

/** Sandbox guard for tag ops (relocated from tag-mutation-script-builder.ts —
 *  spec §2.1): in test mode every touched tag name must be __test- prefixed.
 *  Sync (name-based; no DB lookup needed, unlike validateTaskInSandbox). */
function validateTagMutation(tagName: string): void {
  if (!isTestMode()) return;
  if (!tagName.startsWith(TEST_TAG_PREFIX)) {
    throw new Error(`TEST GUARD: Tag mutations must target "${TEST_TAG_PREFIX}"-prefixed tags. Got: "${tagName}"`);
  }
}

/** Build-time ' : ' path split (spec §3): null = not a path. Throws carry the
 *  legacy empty-segment message — the lowering converts to a constant error
 *  program so the runtime envelope is unchanged. */
function parseTagPathSegments(input: string): string[] | null {
  if (!input.includes(' : ')) return null;
  const segments = input.split(' : ').map((s) => s.trim());
  if (segments.some((s) => s.length === 0)) {
    throw new Error(`Invalid tag path: empty segment in "${input}"`);
  }
  return segments;
}

/** A constant `{error, message}` program (spec §3): build-time-decided input
 *  errors keep their legacy runtime-envelope shape. */
function constantErrorProgram(message: string, context: string): Program {
  return {
    statements: [return_({ error: json(true), message: json(message), context: json(context) })],
    context,
    snippetDeps: [],
  };
}

/**
 * Lower a tag-create request into a typed mutation Program (spec §4.2). Two
 * build-time-decided forms: a `' : '` path lowers to constructTagPath (find-or-
 * create walk, createdSegments envelope); a flat name lowers to dup-check →
 * optional parent resolve+guard → constructTag → live-id envelope (the OMN-27
 * JXA id bridge and its `'unknown'` sentinel are unrepresentable, spec §2.2).
 */
export function buildCreateTagProgram(data: TagCreateInput): Program {
  // Compile-time exhaustiveness guard (same discipline as the other create
  // lowerings): a new TagCreateInput field cannot be silently dropped.
  const _exhaustive: Record<keyof TagCreateInput, true> = { tagName: true, parentTagName: true };
  void _exhaustive;
  const context = 'create_tag';

  let segments: string[] | null;
  try {
    segments = parseTagPathSegments(data.tagName);
  } catch (e) {
    return constantErrorProgram((e as Error).message, context);
  }

  if (segments) {
    if (data.parentTagName) {
      return constantErrorProgram(
        "Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both.",
        context,
      );
    }
    const statements: Stmt[] = [
      bind('_pathStr', json(data.tagName)),
      constructTagPath('_tag', '_created', json(segments)),
      return_({
        action: json('created'),
        tagName: member(ref('_tag'), 'name'),
        tagId: member(ref('_tag'), 'id.primaryKey'),
        path: ref('_pathStr'),
        createdSegments: ref('_created'),
        // Builder-internal raw: user data enters via the _pathStr bind, never inline.
        message: raw(
          '_created.length === 0 ? "Tag path \'" + _pathStr + "\' already exists" : "Created " + _created.length + " tag(s) in path \'" + _pathStr + "\'"',
        ),
      }),
    ];
    return { statements, context, snippetDeps: ['createTagPath'] };
  }

  const statements: Stmt[] = [
    resolveTag('_dup', data.tagName),
    guard('_dup !== null', {
      error: json(true),
      message: json(`Tag '${data.tagName}' already exists`),
      context: json(context),
    }),
  ];
  let parentResolution: TagResolution = { kind: 'none' };
  if (data.parentTagName) {
    statements.push(
      resolveTag('_parent', data.parentTagName),
      guard('_parent === null', {
        error: json(true),
        message: json(`Parent tag not found: ${data.parentTagName}`),
        context: json(context),
      }),
    );
    parentResolution = { kind: 'resolved', var: '_parent' };
  }
  statements.push(
    constructTag('_tag', json(data.tagName), parentResolution),
    return_({
      action: json('created'),
      tagName: json(data.tagName),
      tagId: member(ref('_tag'), 'id.primaryKey'),
      parentTagName: data.parentTagName ? member(ref('_parent'), 'name') : json(null),
      parentTagId: data.parentTagName ? member(ref('_parent'), 'id.primaryKey') : json(null),
      message: json(
        data.parentTagName
          ? `Tag '${data.tagName}' created under '${data.parentTagName}'`
          : `Tag '${data.tagName}' created successfully`,
      ),
    }),
  );
  return { statements, context, snippetDeps: [] };
}

export interface TagRenameInput {
  tagName: string;
  newName: string;
}
export interface TagDeleteInput {
  tagName: string;
}
export interface TagMergeInput {
  tagName: string;
  targetTag: string;
}

/** Lower a tag-rename request (spec §4.2): resolve target → not-found guard →
 *  dup-check resolve on newName → exists guard → direct setProp. Guard order
 *  preserved from legacy: target-not-found beats duplicate. */
export function buildRenameTagProgram(data: TagRenameInput): Program {
  const _exhaustive: Record<keyof TagRenameInput, true> = { tagName: true, newName: true };
  void _exhaustive;
  const context = 'rename_tag';
  const statements: Stmt[] = [
    resolveTag('_tag', data.tagName),
    guard('_tag === null', {
      error: json(true),
      message: json(`Tag '${data.tagName}' not found`),
      context: json(context),
    }),
    resolveTag('_dup', data.newName),
    guard('_dup !== null', {
      error: json(true),
      message: json(`Tag '${data.newName}' already exists`),
      context: json(context),
    }),
    setProp(ref('_tag'), 'name', json(data.newName), 'direct'),
    return_({
      action: json('renamed'),
      oldName: json(data.tagName),
      newName: json(data.newName),
      message: json(`Tag renamed from '${data.tagName}' to '${data.newName}'`),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

/** Lower a tag-delete request (spec §4.2): resolve → not-found guard → HARD
 *  deleteObject (no bestEffort — there is no partial result to preserve,
 *  contrast merge). The legacy message's trailing period is byte-preserved. */
export function buildDeleteTagProgram(data: TagDeleteInput): Program {
  const _exhaustive: Record<keyof TagDeleteInput, true> = { tagName: true };
  void _exhaustive;
  const context = 'delete_tag';
  const statements: Stmt[] = [
    resolveTag('_tag', data.tagName),
    guard('_tag === null', {
      error: json(true),
      message: json(`Tag '${data.tagName}' not found`),
      context: json(context),
    }),
    deleteObject(ref('_tag')),
    return_({
      action: json('deleted'),
      tagName: json(data.tagName),
      message: json(`Tag '${data.tagName}' deleted successfully.`),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

/** Lower a tag-merge request (spec §4.2): resolve src/tgt with guards →
 *  mergeRetag walk → best-effort source delete (§2.5) → envelope branching on
 *  whether the delete recorded a warning. User names enter via the _srcName/
 *  _tgtName binds ONLY — the raw fragments never carry them inline. */
export function buildMergeTagsProgram(data: TagMergeInput): Program {
  const _exhaustive: Record<keyof TagMergeInput, true> = { tagName: true, targetTag: true };
  void _exhaustive;
  const context = 'merge_tags';
  const statements: Stmt[] = [
    resolveTag('_src', data.tagName),
    guard('_src === null', {
      error: json(true),
      message: json(`Source tag '${data.tagName}' not found`),
      context: json(context),
    }),
    resolveTag('_tgt', data.targetTag),
    guard('_tgt === null', {
      error: json(true),
      message: json(`Target tag '${data.targetTag}' not found`),
      context: json(context),
    }),
    bind('_srcName', json(data.tagName)),
    bind('_tgtName', json(data.targetTag)),
    mergeRetag('_src', '_tgt', '_count'),
    // bestEffort label IS the legacy warning prefix, so _warnings[0] reproduces
    // the legacy warning shape (spec §2.5). Not byte-identical: legacy appended
    // deleteError.toString() ("Error: <msg>"); bestEffortCatch appends e.message
    // ("<msg>"). Tests assert the prefix, not the tail. INVARIANT: this source
    // delete must remain the ONLY warnings-pushing statement in this program —
    // the envelope below branches on `_warnings.length` to mean "the delete
    // failed", and any other best-effort statement would corrupt that signal.
    deleteObject(ref('_src'), true, 'Tags were merged but source tag could not be deleted'),
    return_({
      action: raw('_warnings.length ? "merged_with_warning" : "merged"'),
      sourceTag: ref('_srcName'),
      targetTag: ref('_tgtName'),
      tasksMerged: ref('_count'),
      // undefined-valued keys drop out of JSON.stringify — `warning` appears only
      // on the failure path (spec §2.3 envelope listing).
      warning: raw('_warnings.length ? _warnings[0] : undefined'),
      message: raw(
        '_warnings.length ? "Merged " + _count + " tasks but could not delete source tag" : "Merged \'" + _srcName + "\' into \'" + _tgtName + "\'. " + _count + " tasks updated."',
      ),
    }),
  ];
  return { statements, context, snippetDeps: [] };
}

export interface TagNestInput {
  tagName: string;
  parentTagName?: string;
}
export interface TagUnparentInput {
  tagName: string;
}
export interface TagReparentInput {
  tagName: string;
  parentTagName?: string;
}

/** Shared tag-move lowering: resolve target (+guard) → [resolve parent (+guard)
 *  → self-check] → moveTag → envelope. nest/unparent/reparent differ only in
 *  required-parent policy, messages, and envelope keys (spec §4.2). */
function lowerTagMove(op: 'nest' | 'unparent' | 'reparent', tagName: string, parentTagName?: string): Program {
  // Local invariant (not caller-enforced): the nest envelope branch below
  // references _parent unconditionally, so a parentless nest must be
  // impossible here — buildNestTagProgram gates it with a constant error.
  if (op === 'nest' && !parentTagName) {
    throw new Error('lowerTagMove: nest requires parentTagName (buildNestTagProgram gates this)');
  }
  const context = `${op}_tag`;
  const statements: Stmt[] = [
    resolveTag('_tag', tagName),
    guard('_tag === null', {
      error: json(true),
      message: json(`Tag '${tagName}' not found`),
      context: json(context),
    }),
  ];
  if (parentTagName) {
    statements.push(
      resolveTag('_parent', parentTagName),
      guard('_parent === null', {
        error: json(true),
        message: json(`${op === 'reparent' ? 'New parent tag' : 'Parent tag'} not found: ${parentTagName}`),
        context: json(context),
      }),
      // Self-move check (legacy-faithful, spec §3): identity via primaryKey.
      guard('_tag.id.primaryKey === _parent.id.primaryKey', {
        error: json(true),
        message: json(`Cannot ${op} tag under itself`),
        context: json(context),
      }),
      moveTag(ref('_tag'), { kind: 'underTag', var: '_parent' }, `Failed to ${op} tag: `),
    );
  } else {
    statements.push(moveTag(ref('_tag'), { kind: 'root' }, `Failed to ${op} tag: `));
  }

  if (op === 'nest') {
    statements.push(
      return_({
        action: json('nested'),
        tagName: json(tagName),
        // Live reads off the resolved parent binding (spec §2.2); resolution is
        // by exact name, so the live name equals the build-time message's name.
        parentTagName: member(ref('_parent'), 'name'),
        parentTagId: member(ref('_parent'), 'id.primaryKey'),
        message: json(`Tag '${tagName}' nested under '${parentTagName}'`),
      }),
    );
  } else if (op === 'unparent') {
    statements.push(
      return_({
        action: json('unparented'),
        tagName: json(tagName),
        message: json(`Tag '${tagName}' moved to root level`),
      }),
    );
  } else if (parentTagName) {
    // reparent with a parent
    statements.push(
      return_({
        action: json('reparented'),
        tagName: json(tagName),
        newParentTagName: member(ref('_parent'), 'name'),
        newParentTagId: member(ref('_parent'), 'id.primaryKey'),
        message: json(`Tag '${tagName}' moved under '${parentTagName}'`),
      }),
    );
  } else {
    // Reparent without a parent: the legacy to-root quirk (spec §3) — action
    // stays 'reparented' and the parent keys are ABSENT (spec §2.3).
    statements.push(
      return_({
        action: json('reparented'),
        tagName: json(tagName),
        message: json(`Tag '${tagName}' moved to root level`),
      }),
    );
  }
  return { statements, context, snippetDeps: [] };
}

/** Lower a tag-nest request (spec §4.2): parent REQUIRED — its absence is a
 *  build-time-decided constant error (contrast reparent's to-root quirk). */
export function buildNestTagProgram(data: TagNestInput): Program {
  const _exhaustive: Record<keyof TagNestInput, true> = { tagName: true, parentTagName: true };
  void _exhaustive;
  if (!data.parentTagName) {
    // Verbatim legacy message — the wording predates the parentTagId erasure
    // (§2.4) and is preserved exactly (spec §3).
    return constantErrorProgram('Parent tag name or ID is required for nest action', 'nest_tag');
  }
  return lowerTagMove('nest', data.tagName, data.parentTagName);
}

/** Lower a tag-unparent request (spec §4.2): always moveTags to root. */
export function buildUnparentTagProgram(data: TagUnparentInput): Program {
  const _exhaustive: Record<keyof TagUnparentInput, true> = { tagName: true };
  void _exhaustive;
  return lowerTagMove('unparent', data.tagName);
}

/** Lower a tag-reparent request (spec §4.2): parent OPTIONAL — absent moves to
 *  root (legacy quirk, preserved; spec §3). */
export function buildReparentTagProgram(data: TagReparentInput): Program {
  const _exhaustive: Record<keyof TagReparentInput, true> = { tagName: true, parentTagName: true };
  void _exhaustive;
  return lowerTagMove('reparent', data.tagName, data.parentTagName);
}

// =============================================================================
// MARK PROJECT REVIEWED LOWERING (OMN-106)
// =============================================================================

export interface MarkProjectReviewedInput {
  /** Legacy tolerates null (script returned its not-found envelope for the literal 'null'). */
  projectId: string | null;
  reviewDate: string;
  updateNextReviewDate: boolean;
}

/**
 * Lower a mark-project-reviewed request (OMN-106 PR-1). Statement shape:
 * strict id resolve -> loud not-found guard (legacy message text, part of the
 * pinned wire contract) -> applyMarkReviewed snippet (sets lastReviewDate,
 * advances nextReviewDate from the LIVE typed reviewInterval — the arithmetic
 * must run inside OmniJS) -> legacy envelope {success, project, changes,
 * message}, live read-back, unchanged wire shape (MARK_REVIEWED_TYPED_SCHEMA
 * is the contract).
 */
export function buildMarkProjectReviewedProgram(data: MarkProjectReviewedInput): Program {
  const _exhaustive: Record<keyof MarkProjectReviewedInput, true> = {
    projectId: true,
    reviewDate: true,
    updateNextReviewDate: true,
  };
  void _exhaustive;

  // String(null) === 'null' reproduces the legacy null-id behavior exactly:
  // byIdentifier misses and the guard message names 'null'.
  const idStr = String(data.projectId);
  const statements: Stmt[] = [
    resolveProjectById('proj', idStr),
    guard('proj === null', {
      error: json(true),
      message: json(
        `Project with ID '${idStr}' not found. Use 'list_projects' or 'projects_for_review' tools to see available projects.`,
      ),
    }),
    // User data (the date string) enters via a json() bind, never via raw().
    bind('reviewDateStr', json(data.reviewDate)),
    // updateNextReviewDate is a build-time boolean — safe to inline in raw.
    bind('changes', raw(`applyMarkReviewed(proj, reviewDateStr, ${data.updateNextReviewDate ? 'true' : 'false'})`)),
    return_({
      success: json(true),
      // Builder-internal read-back expression — no user data (raw() trust model).
      project: raw(
        "{ id: proj.id.primaryKey, name: proj.name, lastReviewDate: proj.lastReviewDate ? proj.lastReviewDate.toISOString() : null, nextReviewDate: proj.nextReviewDate ? proj.nextReviewDate.toISOString() : null, reviewInterval: proj.reviewInterval ? { unit: proj.reviewInterval.unit ? proj.reviewInterval.unit.name : 'weeks', steps: proj.reviewInterval.steps || 1 } : null }",
      ),
      changes: ref('changes'),
      message: raw('"Project \'" + proj.name + "\' marked as reviewed"'),
    }),
  ];
  return { statements, context: 'mark_project_reviewed', snippetDeps: ['applyMarkReviewed'] };
}

// =============================================================================
// MARK PROJECTS REVIEWED — BATCH LOWERING (OMN-256)
// =============================================================================

export interface MarkProjectsReviewedInput {
  projectIds: string[];
  reviewDate: string;
  updateNextReviewDate: boolean;
}

/**
 * Lower a batch mark-projects-reviewed request (OMN-256). Statement shape
 * mirrors buildSetReviewScheduleProgram (OMN-106 PR-2): json binds, an
 * empty-ids guard, a build-time-unrolled for-loop calling the
 * applyMarkReviewedBatch snippet per id (continue-on-error, never abort on
 * the first failure), and the batch envelope {success, results, message}
 * (MARK_REVIEWED_BATCH_TYPED_SCHEMA is the contract). The single-id
 * `mark-reviewed/project` route and its envelope are untouched — this is an
 * ADDITIONAL route, not a replacement.
 */
export function buildMarkProjectsReviewedProgram(data: MarkProjectsReviewedInput): Program {
  const _exhaustive: Record<keyof MarkProjectsReviewedInput, true> = {
    projectIds: true,
    reviewDate: true,
    updateNextReviewDate: true,
  };
  void _exhaustive;

  const statements: Stmt[] = [
    // User data enters via json() binds, never raw interpolation.
    bind('pids', json(data.projectIds)),
    bind('reviewDateStr', json(data.reviewDate)),
    // total_requested is a build-time count (mirrors set-review-schedule).
    bind(
      'results',
      raw(
        `{ successful: [], failed: [], summary: { total_requested: ${data.projectIds.length}, successful_count: 0, failed_count: 0 } }`,
      ),
    ),
    guard('pids.length === 0', {
      success: json(false),
      error: json(true),
      message: json('No project IDs provided'),
      results: ref('results'),
    }),
    bind(
      'applied',
      raw(
        `(function () { for (var i = 0; i < pids.length; i++) { applyMarkReviewedBatch(pids[i], reviewDateStr, ${data.updateNextReviewDate ? 'true' : 'false'}, results); } ` +
          'results.summary.successful_count = results.successful.length; results.summary.failed_count = results.failed.length; return true; })()',
      ),
    ),
    return_({
      success: json(true),
      results: ref('results'),
      message: raw(
        '"Batch mark-reviewed completed: " + results.summary.successful_count + " successful, " + results.summary.failed_count + " failed"',
      ),
    }),
  ];
  return { statements, context: 'mark_projects_reviewed', snippetDeps: ['applyMarkReviewedBatch'] };
}

// =============================================================================
// SET REVIEW SCHEDULE LOWERING (OMN-106 PR-2)
// =============================================================================

export interface ReviewIntervalSpecInput {
  unit: string;
  steps: number;
}

export interface SetReviewScheduleInput {
  projectIds: string[];
  reviewInterval: ReviewIntervalSpecInput | null;
  nextReviewDate: string | null;
}

/**
 * Lower a set-review-schedule batch request (OMN-106 PR-2). The per-project
 * body (typed reviewInterval read-modify-reassign with the OMN-58 loud
 * no-instance failure, explicit vs from-now next-review date, persisted-value
 * read-back) lives in the applySetReviewSchedule snippet; the program binds
 * user data via json(), iterates in builder-internal raw code, and returns the
 * legacy batch envelope {success, results, message} unchanged
 * (SET_SCHEDULE_TYPED_SCHEMA is the contract).
 *
 * Fail-loud (Kip 2026-07-06, with OMN-136): a request with NEITHER
 * reviewInterval NOR nextReviewDate throws at build time — the legacy script
 * silently reported per-project success with empty changes (the silent no-op
 * class behind the since-removed clear_schedule operation, OMN-273).
 */
export function buildSetReviewScheduleProgram(data: SetReviewScheduleInput): Program {
  const _exhaustive: Record<keyof SetReviewScheduleInput, true> = {
    projectIds: true,
    reviewInterval: true,
    nextReviewDate: true,
  };
  void _exhaustive;

  if (!data.reviewInterval && !data.nextReviewDate) {
    throw new Error(
      'set_review_schedule requires reviewInterval or nextReviewDate — with neither there is nothing to set ' +
        '(the legacy script silently no-opped; OMN-106/OMN-136 fail-loud decision, 2026-07-06)',
    );
  }

  const statements: Stmt[] = [
    // User data enters via json() binds, never raw interpolation.
    bind('pids', json(data.projectIds)),
    bind('intervalSpec', json(data.reviewInterval)),
    bind('nextReviewDateParam', json(data.nextReviewDate)),
    // total_requested is a build-time count (legacy computed the same value in-script).
    bind(
      'results',
      raw(
        `{ successful: [], failed: [], summary: { total_requested: ${data.projectIds.length}, successful_count: 0, failed_count: 0 } }`,
      ),
    ),
    guard('pids.length === 0', {
      success: json(false),
      error: json(true),
      message: json('No project IDs provided'),
      results: ref('results'),
    }),
    bind(
      'applied',
      raw(
        '(function () { for (var i = 0; i < pids.length; i++) { applySetReviewSchedule(pids[i], intervalSpec, nextReviewDateParam, results); } ' +
          'results.summary.successful_count = results.successful.length; results.summary.failed_count = results.failed.length; return true; })()',
      ),
    ),
    return_({
      success: json(true),
      results: ref('results'),
      message: raw(
        '"Batch review schedule update completed: " + results.summary.successful_count + " successful, " + results.summary.failed_count + " failed"',
      ),
    }),
  ];
  return { statements, context: 'set_review_schedule', snippetDeps: ['applySetReviewSchedule'] };
}

// =============================================================================
// GUARDED DISPATCH (OMN-119/120 non-bypass)
// =============================================================================

interface MutationDef<T> {
  // Guards may be async (validateTaskCreate checks sandbox membership via JXA);
  // dispatchMutation awaits, so sync guards (validateProjectCreate) fit too.
  guard: (data: T) => void | Promise<void>;
  build: (data: T) => Program;
}

export const MUTATION_DEFS = {
  'create/project': {
    guard: validateProjectCreate,
    build: buildCreateProjectProgram,
  } as MutationDef<ProjectCreateData>,
  'create/folder': {
    guard: validateFolderCreate,
    build: buildCreateFolderProgram,
  } as MutationDef<FolderCreateData>,
  'create/task': {
    guard: validateTaskCreate,
    build: buildCreateTaskProgram,
  } as MutationDef<TaskCreateData>,
  'batch-create/tasks': {
    guard: (d) => validateBatchTaskSpecs(d.specs),
    build: buildBatchCreateTasksProgram,
  } as MutationDef<BatchCreateTasksData>,
  'update/task': {
    guard: async (d) => {
      await validateTaskInSandbox(d.taskId, 'update');
      validateTagChanges(d.changes);
    },
    build: buildUpdateTaskProgram,
  } as MutationDef<UpdateTaskInput>,
  'update/project': {
    guard: async (d) => {
      await validateProjectInSandbox(d.projectId, 'update');
      validateTagChanges(d.changes);
    },
    build: buildUpdateProjectProgram,
  } as MutationDef<UpdateProjectInput>,
  'complete/task': {
    guard: (d) => validateTaskInSandbox(d.taskId, 'complete'),
    build: buildCompleteTaskProgram,
  } as MutationDef<CompleteTaskInput>,
  'complete/project': {
    guard: (d) => validateProjectInSandbox(d.projectId, 'complete'),
    build: buildCompleteProjectProgram,
  } as MutationDef<CompleteProjectInput>,
  'delete/task': {
    guard: (d) => validateTaskInSandbox(d.taskId, 'delete'),
    build: buildDeleteTaskProgram,
  } as MutationDef<DeleteTaskInput>,
  'delete/project': {
    guard: (d) => validateProjectInSandbox(d.projectId, 'delete'),
    build: buildDeleteProjectProgram,
  } as MutationDef<DeleteProjectInput>,
  'bulk_delete/task': {
    // ALL ids pre-flight before any delete executes (spec §2.1); no-op outside test mode.
    guard: async (d) => {
      await Promise.all(d.taskIds.map((id) => validateTaskInSandbox(id, 'bulk delete')));
    },
    build: buildBulkDeleteTasksProgram,
  } as MutationDef<BulkDeleteTasksInput>,
  'create/tag': {
    // Spec §2.1: guard EVERY name the op touches (parent included — stricter
    // than legacy, sandbox-only).
    guard: (d) => {
      validateTagMutation(d.tagName);
      if (d.parentTagName) validateTagMutation(d.parentTagName);
    },
    build: buildCreateTagProgram,
  } as MutationDef<TagCreateInput>,
  'rename/tag': {
    // Spec §2.1: guard EVERY name the op touches — newName included.
    guard: (d) => {
      validateTagMutation(d.tagName);
      validateTagMutation(d.newName);
    },
    build: buildRenameTagProgram,
  } as MutationDef<TagRenameInput>,
  'delete/tag': {
    guard: (d) => validateTagMutation(d.tagName),
    build: buildDeleteTagProgram,
  } as MutationDef<TagDeleteInput>,
  'merge/tag': {
    // Spec §2.1: guard EVERY name the op touches — targetTag included.
    guard: (d) => {
      validateTagMutation(d.tagName);
      validateTagMutation(d.targetTag);
    },
    build: buildMergeTagsProgram,
  } as MutationDef<TagMergeInput>,
  'nest/tag': {
    // Spec §2.1: guard EVERY name the op touches — parent included when present.
    guard: (d) => {
      validateTagMutation(d.tagName);
      if (d.parentTagName) validateTagMutation(d.parentTagName);
    },
    build: buildNestTagProgram,
  } as MutationDef<TagNestInput>,
  'unparent/tag': {
    guard: (d) => validateTagMutation(d.tagName),
    build: buildUnparentTagProgram,
  } as MutationDef<TagUnparentInput>,
  'set-review-schedule/project': {
    // OMN-106 PR-2: closes the sandbox-guard bypass for this batch mutation.
    // ALL ids pre-flight before any update executes (mirrors bulk_delete).
    guard: async (d) => {
      await Promise.all(d.projectIds.map((id) => validateProjectInSandbox(id, 'set review schedule')));
    },
    build: buildSetReviewScheduleProgram,
  } as MutationDef<SetReviewScheduleInput>,
  'mark-reviewed/project': {
    // OMN-106: closes the sandbox-guard bypass — this mutation ran unguarded
    // as a legacy template. null projectId skips the guard (fails loudly
    // in-script with the legacy not-found envelope).
    guard: (d) => (d.projectId ? validateProjectInSandbox(d.projectId, 'mark reviewed') : undefined),
    build: buildMarkProjectReviewedProgram,
  } as MutationDef<MarkProjectReviewedInput>,
  'mark-reviewed/projects': {
    // OMN-256: batch sibling of mark-reviewed/project. ALL ids pre-flight
    // before any update executes (mirrors bulk_delete / set-review-schedule/project;
    // spec §2.1) — registering the route is non-negotiable, an unregistered
    // mutation route reopens the sandbox-guard-bypass class.
    guard: async (d) => {
      await Promise.all(d.projectIds.map((id) => validateProjectInSandbox(id, 'mark reviewed')));
    },
    build: buildMarkProjectsReviewedProgram,
  } as MutationDef<MarkProjectsReviewedInput>,
  'reparent/tag': {
    // Spec §2.1: guard EVERY name the op touches — parent included when present.
    guard: (d) => {
      validateTagMutation(d.tagName);
      if (d.parentTagName) validateTagMutation(d.parentTagName);
    },
    build: buildReparentTagProgram,
  } as MutationDef<TagReparentInput>,
} as const;

type MutationData<K extends keyof typeof MUTATION_DEFS> =
  (typeof MUTATION_DEFS)[K] extends MutationDef<infer T> ? T : never;

/**
 * Dispatch a registered mutation: run its build-time sandbox guard, THEN build.
 * The guard cannot be skipped for a registered op — this is the non-bypass
 * property that batch / bulk paths previously violated (OMN-119/120).
 * Per-key generic typing: `data` is exactly the registered op's data type.
 */
export async function dispatchMutation<K extends keyof typeof MUTATION_DEFS>(
  key: K,
  data: MutationData<K>,
): Promise<Program> {
  const def = MUTATION_DEFS[key] as MutationDef<MutationData<K>>;
  await def.guard(data); // build-time sandbox guard — cannot be skipped for a registered op
  return def.build(data);
}
