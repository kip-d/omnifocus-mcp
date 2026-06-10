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
  validateBatchTaskSpecs,
  validateFolderCreate,
  validateProjectCreate,
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
  callMethod,
  constructFolder,
  constructProject,
  constructTask,
  dateExpr,
  enumRef,
  guard,
  json,
  member,
  moveTask,
  newExpr,
  raw,
  readModifyReassign,
  ref,
  resolveFolder,
  resolveParentTask,
  resolveProject,
  resolveTask,
  return_,
  setProp,
  type ContainerResolution,
  type Envelope,
  type Expr,
  type Program,
  type Stmt,
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
 * flag or explicit null → null assignment; string → dateExpr. Clear WINS over
 * a simultaneous value (legacy applied the clear after the set). */
function lowerDateSetClear(targetVar: string, changes: DateChanges): Stmt[] {
  const stmts: Stmt[] = [];
  const fields = [
    { field: 'dueDate', clear: 'clearDueDate' },
    { field: 'deferDate', clear: 'clearDeferDate' },
    { field: 'plannedDate', clear: 'clearPlannedDate' },
  ] as const;
  for (const { field, clear } of fields) {
    if (changes[clear] === true || changes[field] === null) {
      stmts.push(setProp(ref(targetVar), field, json(null), 'direct'));
    } else if (changes[field] !== undefined) {
      stmts.push(setProp(ref(targetVar), field, dateExpr(json(changes[field])), 'dateExpr'));
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
