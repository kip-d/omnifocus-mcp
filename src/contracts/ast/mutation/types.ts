// src/contracts/ast/mutation/types.ts
// Mutation AST — node set for the create/project vertical slice (OMN-128).
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
export interface ResolveProjectNode {
  type: 'resolveProject';
  bind: string;
  ref: string;
}
export interface ResolveParentTaskNode {
  type: 'resolveParentTask';
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
  // Consumed by the emitter in a later task.
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
  // Consumed by the emitter in a later task.
  label?: string;
}
export interface ReturnNode {
  type: 'return';
  envelope: Envelope;
}
export type Stmt =
  | BindNode
  | ResolveFolderNode
  | ResolveProjectNode
  | ResolveParentTaskNode
  | GuardNode
  | ConstructProjectNode
  | ConstructTaskNode
  | BatchItemNode
  | SetPropNode
  | AssignTagsNode
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
export const resolveParentTask = (bindVar: string, refStr: string): ResolveParentTaskNode => ({
  type: 'resolveParentTask',
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
): AssignTagsNode => ({
  type: 'assignTags',
  target,
  tags,
  bind: bindVar,
  ...(bestEffort ? { bestEffort } : {}),
  ...(label ? { label } : {}),
});
export const return_ = (envelope: Envelope): ReturnNode => ({ type: 'return', envelope });
