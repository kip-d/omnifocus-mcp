// src/contracts/ast/mutation/defs.ts
// Mutation lowerings: data → typed mutation-AST Program. Plus the guarded
// dispatch registry (MUTATION_DEFS) that runs the build-time sandbox guard
// BEFORE building, so a registered op can never bypass it (the OMN-119/120
// non-bypass property — batch & bulk paths previously skipped the guard).
import type { ProjectCreateData, TaskCreateData } from '../../mutations.js';
import { validateProjectCreate, validateTaskCreate } from '../mutation-script-builder.js';
import { lowerRepetitionRule } from './repetition.js';
import {
  assignTags,
  constructProject,
  constructTask,
  dateExpr,
  enumRef,
  guard,
  json,
  member,
  newExpr,
  raw,
  readModifyReassign,
  ref,
  resolveFolder,
  resolveParentTask,
  resolveProject,
  return_,
  setProp,
  type ContainerResolution,
  type Envelope,
  type Expr,
  type Program,
  type Stmt,
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
  'create/task': {
    guard: validateTaskCreate,
    build: buildCreateTaskProgram,
  } as MutationDef<TaskCreateData>,
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
