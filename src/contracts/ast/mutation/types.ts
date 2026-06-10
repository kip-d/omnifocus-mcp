// src/contracts/ast/mutation/types.ts
// Mutation AST — node set for the write-side create operations (OMN-128:
// create/project slice 1; create/task + batch-create slice 2).
// Mirrors the read-side types.ts: node union + factory functions.

export type SetPropStrategy = 'direct' | 'dateExpr' | 'enum' | 'readModifyReassign';

// --- Expressions ---
export interface RefNode {
  type: 'ref';
  name: string;
}
export interface MemberNode {
  type: 'member';
  object: Expr;
  path: string;
}
export interface NewNode {
  type: 'new';
  className: string;
  args: Expr[];
}
export interface EnumRefNode {
  type: 'enumRef';
  path: string;
}
export interface DateExprNode {
  type: 'dateExpr';
  value: Expr;
}
export interface JsonNode {
  type: 'json';
  value: unknown;
}
// Builder-internal verbatim code fragment. ONLY for builder-constructed
// envelope/condition fragments (ternaries, `.toISOString()`) that the typed
// nodes can't express. NEVER carries user data — user data always goes through
// `json`. Same trust model as GuardNode.cond (builder-internal raw string).
export interface RawNode {
  type: 'raw';
  code: string;
}
export type Expr = RefNode | MemberNode | NewNode | EnumRefNode | DateExprNode | JsonNode | RawNode;

// --- Typed fail-able folder resolution ---
export type FolderResolution = { kind: 'resolved'; var: string } | { kind: 'none' } | { kind: 'notFound' };

// --- Typed fail-able container resolution (slice 2) ---
// Mirrors FolderResolution's named-states discipline: where a created task goes
// is a closed set of typed states, never a stringly-typed value.
export type ContainerResolution =
  | { kind: 'inbox' }
  | { kind: 'project'; var: string }
  | { kind: 'parentTask'; var: string }
  | { kind: 'tempIdRef'; var: string }; // batch-only: a task created earlier in the same program

// --- Statements ---
export interface BindNode {
  type: 'bind';
  name: string;
  expr: Expr;
}
export interface ResolveFolderNode {
  type: 'resolveFolder';
  bind: string;
  ref: string;
}
export interface GuardNode {
  type: 'guard';
  cond: string;
  envelope: Envelope;
  // How the guard fails: 'return' (absent = return, the single-op behavior —
  // emit `return JSON.stringify(envelope)`) or 'throw' (batch items fail
  // per-item — the throw is caught by the item's try/capture wrapper).
  mode?: 'return' | 'throw';
}
/** Flexible: id-then-name fallback via resolveProjectFlexible — for create-time/
 *  move-destination refs; update targets use ResolveProjectByIdNode (strict). */
export interface ResolveProjectNode {
  type: 'resolveProject';
  bind: string;
  ref: string;
}
/** Resolves a task by identifier — general-purpose (create parent-task chain and
 *  update target). Strict byIdentifier-only: no name fallback. */
export interface ResolveTaskNode {
  type: 'resolveTask';
  bind: string;
  ref: string;
}
/** Resolves a project strictly by identifier only — spec §2.1 deliberate
 *  contrast with ResolveProjectNode (flexible, id-then-name fallback). Used
 *  for update targets where the caller owns the id and name fallback would be
 *  ambiguous. */
export interface ResolveProjectByIdNode {
  type: 'resolveProjectById';
  bind: string;
  ref: string;
}
export interface ConstructProjectNode {
  type: 'constructProject';
  bind: string;
  name: Expr;
  folder: FolderResolution;
}
export interface ConstructTaskNode {
  type: 'constructTask';
  bind: string;
  name: Expr;
  container: ContainerResolution;
}
export interface ConstructFolderNode {
  type: 'constructFolder';
  bind: string;
  name: Expr;
  parent: FolderResolution;
}
// Batch composition: one item's statements wrapped in try/capture. Emits
// results.push({tempId, taskId, success, warnings}) on success and
// ({tempId, taskId:null, success:false, error, warnings}) on failure.
export interface BatchItemNode {
  type: 'batchItem';
  tempId: string;
  index: number; // for per-item internal var names (_w<i>)
  taskVar: string; // the constructTask bind inside statements — read for taskId
  statements: Stmt[];
  stopOnError: boolean;
}
export interface SetPropNode {
  type: 'setProp';
  target: Expr;
  prop: string;
  // `value` is optional: the readModifyReassign strategy reads the existing typed
  // instance and mutates sub-props instead of assigning a single new value.
  value?: Expr;
  strategy: SetPropStrategy;
  // Only used by the readModifyReassign strategy: sub-property mutations applied
  // to the read-back typed instance before reassignment.
  mutations?: Array<{ prop: string; value: Expr }>;
  // When true, the emitter wraps this statement in `try { ... } catch (e) {}` so
  // a failure (e.g. status / reviewInterval) does NOT fail the surrounding
  // mutation. Preserves the original best-effort bridge semantics.
  bestEffort?: boolean;
  // Warnings attribution (OMN-137): when set, a best-effort failure is recorded
  // as `_warnings.push(label + ': ' + msg)` instead of being swallowed.
  // Consumed by the emitter's `bestEffortCatch` for OMN-137 warnings attribution.
  label?: string;
}
// OMN-128: tag resolutions stay string-shaped (tags: Json(string[])) for the create-or-find
// path that create/project uses — every tag resolves via resolveOrCreateTagByPath, so AssignTags
// can never receive a missing tag. A typed TagResolution union (mirroring FolderResolution) is
// deferred until a read-only ResolveTag node is needed (spec §5).
export interface AssignTagsNode {
  type: 'assignTags';
  target: Expr;
  tags: Expr;
  bind: string;
  // When true, the emitter wraps the tag-assignment block in
  // `try { ... } catch (e) {}` so a tag failure does NOT fail the surrounding
  // mutation. Preserves the original best-effort tag bridge semantics.
  bestEffort?: boolean;
  // Warnings attribution (OMN-137): when set, a best-effort failure is recorded
  // as `_warnings.push(label + ': ' + msg)` instead of being swallowed.
  // Consumed by the emitter's `bestEffortCatch` for OMN-137 warnings attribution.
  label?: string;
  // Tag application mode (slice 4): 'add' (absent = legacy create behavior,
  // create-or-find + addTag), 'replace' (clearTags() first, then add), 'remove'
  // (resolve WITHOUT create, removeTag, missing names silently skipped — legacy).
  mode?: 'replace' | 'add' | 'remove';
}

/** Typed task-move destination (slice 4).
 *  - inboxBeginning: task → inbox.beginning (de-project it)
 *  - projectBeginning: task → <var>.beginning (move into a project)
 *  - parentEnding: task → <var>.ending (nest under a parent task)
 *  - containerRoot: ternary — task.containingProject ? project.beginning : inbox.beginning
 *    (used to re-root a task at the top of its current container without knowing the type)
 */
export type TaskMovePosition =
  | { kind: 'inboxBeginning' }
  | { kind: 'projectBeginning'; var: string }
  | { kind: 'parentEnding'; var: string }
  | { kind: 'containerRoot'; taskVar: string };

/** Moves one task to a typed position via OmniJS `moveTasks`. */
export interface MoveTaskNode {
  type: 'moveTask';
  task: Expr;
  position: TaskMovePosition;
  bestEffort?: boolean;
  label?: string;
}

/** Typed project-move destination (slice 4).
 *  - libraryBeginning: project → library.beginning (move to root)
 *  - folderBeginning: project → <var>.beginning (move into a folder)
 */
export type ProjectMovePosition = { kind: 'libraryBeginning' } | { kind: 'folderBeginning'; var: string };

/** Moves one project to a typed position via OmniJS `moveSections`. */
export interface MoveProjectNode {
  type: 'moveProject';
  project: Expr;
  position: ProjectMovePosition;
  bestEffort?: boolean;
  label?: string;
}

/** Calls a method on a target expression with typed args (slice 4).
 *  Only methods in CALL_METHOD_ALLOWLIST are permitted — see validator.ts.
 *  Used for task status mutations: markComplete, drop.
 */
export interface CallMethodNode {
  type: 'callMethod';
  target: Expr;
  method: string;
  args: Expr[];
  bestEffort?: boolean;
  label?: string;
}

/** deleteObject(<target>) — OmniJS free function (NOT a method; callMethod
 *  cannot express it). No binding, no bestEffort: a failed delete is a hard
 *  error — there is no partial result to preserve (spec §2.4/§4.1). */
export interface DeleteObjectNode {
  type: 'deleteObject';
  target: Expr;
}

/** One id's delete attempt inside a bulk program (spec §4.2): resolve →
 *  not-found else capture-name → deleteObject → push to _deleted, with a
 *  per-item catch pushing to _errors (continue-on-error, legacy-faithful).
 *  Self-contained: consumes no external binds (its own resolve is internal),
 *  so rule 7 does not apply to it. The _deleted/_errors accumulators are
 *  DECLARED by emitProgram when any bulkDeleteItem is present — the _aborted
 *  ownership pattern, not a builder bind. */
export interface BulkDeleteItemNode {
  type: 'bulkDeleteItem';
  id: string;
  index: number;
}

export interface ReturnNode {
  type: 'return';
  envelope: Envelope;
}
export type Stmt =
  | BindNode
  | ResolveFolderNode
  | ResolveProjectNode
  | ResolveTaskNode
  | ResolveProjectByIdNode
  | GuardNode
  | ConstructProjectNode
  | ConstructTaskNode
  | ConstructFolderNode
  | BatchItemNode
  | SetPropNode
  | AssignTagsNode
  | MoveTaskNode
  | MoveProjectNode
  | CallMethodNode
  | DeleteObjectNode
  | BulkDeleteItemNode
  | ReturnNode;

export type Envelope = Record<string, Expr>;

export interface Program {
  statements: Stmt[];
  context: string;
  snippetDeps: string[];
}

// --- Factories ---
export const ref = (name: string): RefNode => ({ type: 'ref', name });
export const member = (object: Expr, path: string): MemberNode => ({ type: 'member', object, path });
export const newExpr = (className: string, args: Expr[]): NewNode => ({ type: 'new', className, args });
export const enumRef = (path: string): EnumRefNode => ({ type: 'enumRef', path });
export const dateExpr = (value: Expr): DateExprNode => ({ type: 'dateExpr', value });
export const json = (value: unknown): JsonNode => ({ type: 'json', value });
export const raw = (code: string): RawNode => ({ type: 'raw', code });

export const bind = (name: string, expr: Expr): BindNode => ({ type: 'bind', name, expr });
export const resolveFolder = (bindVar: string, refStr: string): ResolveFolderNode => ({
  type: 'resolveFolder',
  bind: bindVar,
  ref: refStr,
});
export const resolveProject = (bindVar: string, refStr: string): ResolveProjectNode => ({
  type: 'resolveProject',
  bind: bindVar,
  ref: refStr,
});
export const resolveTask = (bindVar: string, refStr: string): ResolveTaskNode => ({
  type: 'resolveTask',
  bind: bindVar,
  ref: refStr,
});
/** Alias retained for the slice-2 create lowerings' readability (same node). */
export const resolveParentTask = resolveTask;
export const resolveProjectById = (bindVar: string, refStr: string): ResolveProjectByIdNode => ({
  type: 'resolveProjectById',
  bind: bindVar,
  ref: refStr,
});
export const guard = (cond: string, envelope: Envelope, mode?: 'return' | 'throw'): GuardNode => ({
  type: 'guard',
  cond,
  envelope,
  ...(mode ? { mode } : {}),
});
export const constructProject = (bindVar: string, name: Expr, folder: FolderResolution): ConstructProjectNode => ({
  type: 'constructProject',
  bind: bindVar,
  name,
  folder,
});
export const constructTask = (bindVar: string, name: Expr, container: ContainerResolution): ConstructTaskNode => ({
  type: 'constructTask',
  bind: bindVar,
  name,
  container,
});
export const constructFolder = (bindVar: string, name: Expr, parent: FolderResolution): ConstructFolderNode => ({
  type: 'constructFolder',
  bind: bindVar,
  name,
  parent,
});
export const batchItem = (
  tempId: string,
  index: number,
  taskVar: string,
  statements: Stmt[],
  stopOnError: boolean,
): BatchItemNode => ({ type: 'batchItem', tempId, index, taskVar, statements, stopOnError });
export const setProp = (
  target: Expr,
  prop: string,
  value: Expr,
  strategy: SetPropStrategy = 'direct',
  bestEffort = false,
  label?: string,
): SetPropNode => ({
  type: 'setProp',
  target,
  prop,
  value,
  strategy,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
export const readModifyReassign = (
  target: Expr,
  prop: string,
  mutations: { prop: string; value: Expr }[],
  bestEffort = false,
  label?: string,
): SetPropNode => ({
  type: 'setProp',
  target,
  prop,
  strategy: 'readModifyReassign',
  mutations,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
export const assignTags = (
  target: Expr,
  tags: Expr,
  bindVar: string,
  bestEffort = false,
  label?: string,
  mode?: 'replace' | 'add' | 'remove',
): AssignTagsNode => ({
  type: 'assignTags',
  target,
  tags,
  bind: bindVar,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
  ...(mode ? { mode } : {}),
});
export const return_ = (envelope: Envelope): ReturnNode => ({ type: 'return', envelope });
export const moveTask = (task: Expr, position: TaskMovePosition, bestEffort = false, label?: string): MoveTaskNode => ({
  type: 'moveTask',
  task,
  position,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
export const moveProject = (
  project: Expr,
  position: ProjectMovePosition,
  bestEffort = false,
  label?: string,
): MoveProjectNode => ({
  type: 'moveProject',
  project,
  position,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
export const callMethod = (
  target: Expr,
  method: string,
  args: Expr[],
  bestEffort = false,
  label?: string,
): CallMethodNode => ({
  type: 'callMethod',
  target,
  method,
  args,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
export const deleteObject = (target: Expr): DeleteObjectNode => ({ type: 'deleteObject', target });
export const bulkDeleteItem = (id: string, index: number): BulkDeleteItemNode => ({
  type: 'bulkDeleteItem',
  id,
  index,
});
