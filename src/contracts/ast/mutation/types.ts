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
export type Expr = RefNode | MemberNode | NewNode | EnumRefNode | DateExprNode | JsonNode;

// --- Typed fail-able folder resolution ---
export type FolderResolution = { kind: 'resolved'; var: string } | { kind: 'none' } | { kind: 'notFound' };

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
}
export interface ConstructProjectNode {
  type: 'constructProject';
  bind: string;
  name: Expr;
  folder: FolderResolution;
}
export interface SetPropNode {
  type: 'setProp';
  target: Expr;
  prop: string;
  value: Expr;
  strategy: SetPropStrategy;
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
}
export interface ReturnNode {
  type: 'return';
  envelope: Envelope;
}
export type Stmt =
  | BindNode
  | ResolveFolderNode
  | GuardNode
  | ConstructProjectNode
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

export const bind = (name: string, expr: Expr): BindNode => ({ type: 'bind', name, expr });
export const resolveFolder = (bindVar: string, refStr: string): ResolveFolderNode => ({
  type: 'resolveFolder',
  bind: bindVar,
  ref: refStr,
});
export const guard = (cond: string, envelope: Envelope): GuardNode => ({ type: 'guard', cond, envelope });
export const constructProject = (bindVar: string, name: Expr, folder: FolderResolution): ConstructProjectNode => ({
  type: 'constructProject',
  bind: bindVar,
  name,
  folder,
});
export const setProp = (
  target: Expr,
  prop: string,
  value: Expr,
  strategy: SetPropStrategy = 'direct',
): SetPropNode => ({ type: 'setProp', target, prop, value, strategy });
export const assignTags = (target: Expr, tags: Expr, bindVar: string): AssignTagsNode => ({
  type: 'assignTags',
  target,
  tags,
  bind: bindVar,
});
export const return_ = (envelope: Envelope): ReturnNode => ({ type: 'return', envelope });
