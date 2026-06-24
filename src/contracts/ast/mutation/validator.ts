// src/contracts/ast/mutation/validator.ts
// Structural validator for mutation-AST Programs. Throws on malformed programs
// BEFORE they reach the emitter, so a bad lowering surfaces as a clear error at
// the build seam rather than as broken OmniJS at runtime.
import type {
  Program,
  Stmt,
  Expr,
  ConstructProjectNode,
  ConstructFolderNode,
  ConstructTagNode,
  SetPropNode,
  ConstructTaskNode,
  GuardNode,
  BatchItemNode,
  BulkDeleteItemNode,
  MoveTaskNode,
  MoveProjectNode,
  MoveTagNode,
  CallMethodNode,
  AssignTagsNode,
} from './types.js';

const FOLDER_KINDS = new Set(['resolved', 'none', 'notFound']);
const TAG_KINDS = new Set(['resolved', 'none', 'notFound']);
const CONTAINER_KINDS = new Set(['inbox', 'project', 'parentTask', 'tempIdRef']);

/**
 * Identifiers the emitter declares for its own bookkeeping — a program bind
 * shadowing one of these would silently corrupt that bookkeeping:
 *  - `_warnings`: the OMN-137 program-scope warnings array (Task 4 review:
 *    it briefly joined the unreserved namespace — this rule closes that gap).
 *  - `_aborted`: the batch stop-on-error flag set by batchItem's catch.
 *  - `_deleted`: the bulk-delete success accumulator declared by emitProgram
 *    when any bulkDeleteItem is present (mirrors the _aborted ownership pattern).
 *  - `_errors`: the bulk-delete failure accumulator, same ownership.
 *  - `_tagPath`: the constructTagPath emission's intermediate — bound as
 *    `const _tagPath = createTagPath(...)` before the leaf tag and created-
 *    segments are destructured out. At most one constructTagPath per
 *    statement-list level (rule 9), so a fixed name is safe.
 *  - `_w<i>` (pattern, see RESERVED_ITEM_VAR_PATTERN): per-item warning
 *    watermarks declared by batchItem emission.
 *  - `_d<i>` (pattern, see RESERVED_DELETE_RESOLVE_PATTERN): per-item task
 *    resolution vars declared by bulkDeleteItem emission.
 *  - `_n<i>` (pattern, see RESERVED_DELETE_NAME_PATTERN): per-item name
 *    capture vars declared by bulkDeleteItem emission.
 *
 * `results` is deliberately NOT reserved: the batch program builder
 * legitimately binds it via a bind statement.
 *
 * Exported so the batch program builder (Task 9) can keep its generated names
 * clear of the same set.
 */
export const RESERVED_EMITTER_IDENTIFIERS: readonly string[] = [
  '_warnings',
  '_aborted',
  '_deleted',
  '_errors',
  '_tagPath',
];
const RESERVED_ITEM_VAR_PATTERN = /^_w\d+$/;
const RESERVED_DELETE_RESOLVE_PATTERN = /^_d\d+$/;
const RESERVED_DELETE_NAME_PATTERN = /^_n\d+$/;

function assertNotReserved(name: string, where: string): void {
  if (
    RESERVED_EMITTER_IDENTIFIERS.includes(name) ||
    RESERVED_ITEM_VAR_PATTERN.test(name) ||
    RESERVED_DELETE_RESOLVE_PATTERN.test(name) ||
    RESERVED_DELETE_NAME_PATTERN.test(name)
  ) {
    throw new Error(
      `Invalid ${where}: "${name}" is a reserved emitter identifier ` +
        `(reserved: ${RESERVED_EMITTER_IDENTIFIERS.join(', ')}, and the _w<digits>, _d<digits>, _n<digits> patterns).`,
    );
  }
}

/**
 * Validate a mutation Program. Throws on the first structural violation.
 *
 * Structural rules (enforced here):
 *  1. The last TOP-LEVEL statement must be a `return`. batchItem inner lists
 *     are exempt — they must NOT return (rule 8).
 *  2. Every `constructProject`'s `folder` and `constructFolder`'s `parent` must
 *     be a typed FolderResolution object (kind ∈ {resolved, none, notFound}) —
 *     never a string / missing kind.
 *  3. A `constructProject` or `constructFolder` with `folder/parent.kind === 'notFound'`
 *     is illegal: the not-found case must be handled by a preceding `guard` that returns.
 *  4. A `setProp` with strategy !== 'readModifyReassign' MUST have a `value`;
 *     a `setProp` with strategy === 'readModifyReassign' MUST have `mutations`.
 *  5. Every `constructTask`'s `container` must be a typed ContainerResolution
 *     object (kind ∈ {inbox, project, parentTask, tempIdRef}); non-inbox kinds
 *     require a non-empty string `var`.
 *  6. A guard with mode 'throw' must have `envelope.message` defined (the
 *     emitter also throws — belt and suspenders at the validation seam).
 *  7. Resolution-guard discipline: a `resolveProject`/`resolveTask`/
 *     `resolveProjectById`/`resolveFolder`/`resolveTag` bind consumed by ANY
 *     later statement (setProp/moveTask/moveProject/callMethod/assignTags
 *     targets, construct container/folder/parent/tag vars, return envelopes,
 *     binds) must have a `guard` BETWEEN them whose `cond` mentions that bind
 *     (word-boundary match, not substring). String-level check on `cond` —
 *     same trust model as GuardNode.cond generally. Applies at each
 *     statement-list level independently (resolve/guard/consumer triplets
 *     stay within one list in practice). Guards and resolve statements are
 *     not themselves consumers; `raw()` fragments are deliberately opaque
 *     (builder-internal trust, same model as GuardNode.cond). (Slice 3
 *     widened this from constructTask-only to all three constructs; slice 4
 *     widened it from constructs to ALL consumers — the update lowerings
 *     consume resolve binds in setProp targets, moves, callMethod targets,
 *     and envelopes.)
 *  8. Inside `batchItem.statements`: all per-statement rules recurse, but ANY
 *     statement whose emission contains a top-level `return` is ILLEGAL — it
 *     would return from the whole program IIFE, skipping remaining items and
 *     the results envelope (Task 5 review finding). Concretely: a `return`
 *     statement, a return-MODE guard (inner guards must be mode 'throw'), and
 *     a `moveTag` (its hard-error envelope catch emits a top-level return).
 *     Extend this rule when a new node's emission gains a top-level return.
 *  9. Across a program's batchItem nodes, `index` AND `taskVar` values must
 *     each be unique. A duplicate index would double-declare `_w<i>`
 *     (SyntaxError at runtime); and since constructTask binds emit as `var`
 *     for cross-item tempIdRef visibility (commit 88fb2e5), a duplicate
 *     taskVar would SILENTLY SHADOW an earlier item's task — the worst kind
 *     of wrong. Additionally, each batchItem's statements MUST contain a
 *     constructTask whose bind === taskVar (the item's results push reads
 *     `<taskVar>.id.primaryKey` — without it, a ReferenceError is swallowed
 *     by the item catch as a FALSE per-item failure with an opaque message),
 *     and taskVar itself must not be a reserved identifier. The same
 *     duplicate-index rule applies across a program's bulkDeleteItem nodes:
 *     a duplicate index would double-declare `const _d<i>` / `const _n<i>`
 *     (SyntaxError at runtime). Likewise, at most ONE `constructTagPath` per
 *     statement-list level: its emission declares the fixed `const _tagPath`
 *     intermediate, so a second at the same level would double-declare it
 *     (SyntaxError at runtime) — fail loud at build time instead.
 * 10. No binding statement (bind, resolveFolder, resolveProject, resolveTask,
 *     resolveProjectById, resolveTag, constructProject, constructTask,
 *     constructFolder, constructTag, constructTagPath, assignTags, mergeRetag)
 *     may use a reserved emitter identifier — see RESERVED_EMITTER_IDENTIFIERS.
 * 11. A `moveTask` node's `position` must be a typed TaskMovePosition object
 *     with kind ∈ {inboxBeginning, projectBeginning, parentEnding, containerRoot}.
 *     projectBeginning and parentEnding require a non-empty string `var`;
 *     containerRoot requires a non-empty string `taskVar`. A `moveProject` node's
 *     `position` must be a typed ProjectMovePosition with kind ∈
 *     {libraryBeginning, folderBeginning}; folderBeginning requires non-empty `var`.
 *     A `moveTag` node's `position` must be a typed TagMovePosition with kind ∈
 *     {root, underTag}; underTag requires a non-empty string `var`.
 * 12. A `callMethod` node's `method` must be in CALL_METHOD_ALLOWLIST. The
 *     allowlist is deliberately minimal (markComplete, drop) — extend per slice.
 * 13. An `assignTags` node's `mode`, when present, must be in {replace, add, remove}.
 *     An unknown mode would silently fall through to the 'add' branch at emission time
 *     (TypeScript type-safety only, not a JS runtime guarantee) — the validator enforces
 *     this closed set explicitly so a mis-typed mode surfaces as a clear error.
 *
 * NOT enforced here: snippet-dependency coverage (a statement that emits a call
 * to an OmniJS helper must declare that helper in `snippetDeps`). That check is
 * implicit in EMISSION, so it lives in `emitProgram` (emitter.ts), not here.
 */
export function validateMutationProgram(program: Program): void {
  const { statements } = program;

  // Rule 1: return-terminated (top level only — batchItem inner lists must
  // NOT return; rule 8 enforces the inverse there).
  const last = statements[statements.length - 1];
  if (!last || last.type !== 'return') {
    throw new Error('Invalid mutation program: it must end in a return statement.');
  }

  validateStatementList(statements, {
    insideBatchItem: false,
    batchIndexes: new Set<number>(),
    batchTaskVars: new Set<string>(),
    bulkDeleteIndexes: new Set<number>(),
  });
}

interface ValidationContext {
  insideBatchItem: boolean;
  // Program-wide batchItem uniqueness tracking (rule 9) — shared across levels.
  batchIndexes: Set<number>;
  batchTaskVars: Set<string>;
  // Program-wide bulkDeleteItem index uniqueness (rule 9, slice 5) — a
  // duplicate index would double-declare `const _d<i>` / `const _n<i>`.
  bulkDeleteIndexes: Set<number>;
}

// Rules 2/3/10 for constructProject.
function validateConstructProjectStmt(stmt: ConstructProjectNode): void {
  const folder = stmt.folder as unknown;
  // Rule 2: typed FolderResolution object.
  if (typeof folder !== 'object' || folder === null || !FOLDER_KINDS.has((folder as { kind?: string }).kind ?? '')) {
    throw new Error(
      'Invalid constructProject: folder must be a typed FolderResolution object ' +
        'with kind in {resolved, none, notFound}, not a string or untyped value.',
    );
  }
  // Rule 3: notFound is illegal here.
  if ((folder as { kind: string }).kind === 'notFound') {
    throw new Error(
      'Invalid constructProject: folder.kind="notFound" is illegal — ' +
        'the not-found case must be handled by a preceding guard that returns.',
    );
  }
  // Rule 10: reserved emitter identifiers.
  assertNotReserved(stmt.bind, 'constructProject bind');
}

// Rules 2/3/10 for constructFolder.
function validateConstructFolderStmt(stmt: ConstructFolderNode): void {
  const parent = stmt.parent as unknown;
  // Rules 2/3 at the folder altitude: typed FolderResolution; notFound illegal.
  if (typeof parent !== 'object' || parent === null || !FOLDER_KINDS.has((parent as { kind?: string }).kind ?? '')) {
    throw new Error(
      'Invalid constructFolder: parent must be a typed FolderResolution object ' +
        'with kind in {resolved, none, notFound}, not a string or untyped value.',
    );
  }
  if ((parent as { kind: string }).kind === 'notFound') {
    throw new Error(
      'Invalid constructFolder: parent.kind="notFound" is illegal — ' +
        'the not-found case must be handled by a preceding guard that returns.',
    );
  }
  assertNotReserved(stmt.bind, 'constructFolder bind');
}

// Rules 2/3/10 for constructTag (tag altitude, mirrors constructFolder).
function validateConstructTagStmt(stmt: ConstructTagNode): void {
  const parent = stmt.parent as unknown;
  // Rule 2: typed TagResolution object.
  if (typeof parent !== 'object' || parent === null || !TAG_KINDS.has((parent as { kind?: string }).kind ?? '')) {
    throw new Error(
      'Invalid constructTag: parent must be a typed TagResolution object ' +
        'with kind in {resolved, none, notFound}, not a string or untyped value.',
    );
  }
  // Rule 3: notFound is illegal here.
  if ((parent as { kind: string }).kind === 'notFound') {
    throw new Error(
      'Invalid constructTag: parent.kind="notFound" is illegal — ' +
        'the not-found case must be handled by a preceding guard that returns.',
    );
  }
  assertNotReserved(stmt.bind, 'constructTag bind');
}

// Rule 4: value/mutations invariants for setProp.
function validateSetPropStmt(stmt: SetPropNode): void {
  if (stmt.strategy === 'readModifyReassign') {
    if (stmt.mutations === undefined) {
      throw new Error(`Invalid setProp on "${stmt.prop}": readModifyReassign strategy requires "mutations".`);
    }
  } else if (stmt.value === undefined) {
    throw new Error(`Invalid setProp on "${stmt.prop}": strategy "${stmt.strategy}" requires a defined "value".`);
  }
}

// Rule 5 + reserved bind check for constructTask.
function validateConstructTaskStmt(stmt: ConstructTaskNode): void {
  const container = stmt.container as unknown;
  // Rule 5: typed ContainerResolution object (mirrors constructProject's rule 2).
  if (
    typeof container !== 'object' ||
    container === null ||
    !CONTAINER_KINDS.has((container as { kind?: string }).kind ?? '')
  ) {
    throw new Error(
      'Invalid constructTask: container must be a typed ContainerResolution object ' +
        'with kind in {inbox, project, parentTask, tempIdRef}, not a string or untyped value.',
    );
  }
  const typed = container as { kind: string; var?: unknown };
  if (typed.kind !== 'inbox' && (typeof typed.var !== 'string' || typed.var.length === 0)) {
    throw new Error(`Invalid constructTask: container kind "${typed.kind}" requires a non-empty string "var".`);
  }
  assertNotReserved(stmt.bind, 'constructTask bind');
}

// Rules 6/8 for guard statements.
function validateGuardStmt(stmt: GuardNode, ctx: ValidationContext): void {
  // Rule 6: throw-mode guard needs a message (it becomes the thrown Error
  // text). The emitter throws too — belt and suspenders at this seam.
  // `envelope` is `Record<string, Expr>`; without noUncheckedIndexedAccess the type says
  // `message` is always present (so `=== undefined` reads as dead), but the key can genuinely
  // be absent at runtime. Test key presence honestly instead of comparing to undefined.
  if (stmt.mode === 'throw' && !('message' in stmt.envelope)) {
    throw new Error('Invalid guard: mode "throw" requires envelope.message (it becomes the thrown Error text).');
  }
  // Rule 8: a return-mode guard inside a batchItem would return from the
  // whole program IIFE, skipping remaining items and the results envelope
  // (Task 5 review finding) — inner guards must be mode "throw".
  if (ctx.insideBatchItem && stmt.mode !== 'throw') {
    throw new Error(
      'Invalid batchItem: a return-mode guard inside batchItem.statements would return from the whole ' +
        'program IIFE, skipping remaining items and the results envelope — inner guards must be mode "throw".',
    );
  }
}

// Rule 9 + recursion for batchItem statements.
function validateBatchItemStmt(stmt: BatchItemNode, ctx: ValidationContext): void {
  // Rule 9: program-wide uniqueness. A duplicate index double-declares
  // `const _w<i>` (SyntaxError at runtime). A duplicate taskVar is worse:
  // constructTask binds emit as `var` (cross-item tempIdRef visibility,
  // commit 88fb2e5), so the later item would SILENTLY SHADOW the earlier
  // item's task — the worst kind of wrong.
  if (ctx.batchIndexes.has(stmt.index)) {
    throw new Error(`Invalid batchItem: duplicate index ${stmt.index} — per-item _w<i> vars would collide.`);
  }
  ctx.batchIndexes.add(stmt.index);
  if (ctx.batchTaskVars.has(stmt.taskVar)) {
    throw new Error(
      `Invalid batchItem: duplicate taskVar "${stmt.taskVar}" — a later item would silently shadow an earlier item's task.`,
    );
  }
  ctx.batchTaskVars.add(stmt.taskVar);
  // Rule 9 (cont.): taskVar feeds the emitted results push verbatim — it
  // must stay clear of emitter-internal names too.
  assertNotReserved(stmt.taskVar, 'batchItem taskVar');
  // Rule 9 (cont.): the item MUST construct the task its results push
  // reads. Without a constructTask binding taskVar, the emitted
  // `results.push({ taskId: <taskVar>.id.primaryKey, ... })` references an
  // undeclared variable → ReferenceError swallowed by the item's catch →
  // a FALSE per-item failure with an opaque message.
  if (!stmt.statements.some((s) => s.type === 'constructTask' && s.bind === stmt.taskVar)) {
    throw new Error(
      `Invalid batchItem "${stmt.tempId}": statements must contain a constructTask whose bind matches taskVar "${stmt.taskVar}".`,
    );
  }
  // Rule 8: recurse all per-statement rules into the item's statements.
  validateStatementList(stmt.statements, { ...ctx, insideBatchItem: true });
}

// Rule 9 (bulkDeleteItem altitude): program-wide index uniqueness. A duplicate
// index double-declares `const _d<i>` / `const _n<i>` (SyntaxError at runtime)
// — the same hazard the batchItem _w<i> check above guards against.
function validateBulkDeleteItemStmt(stmt: BulkDeleteItemNode, ctx: ValidationContext): void {
  if (ctx.bulkDeleteIndexes.has(stmt.index)) {
    throw new Error(`Invalid bulkDeleteItem: duplicate index ${stmt.index} — per-item _d<i>/_n<i> vars would collide.`);
  }
  ctx.bulkDeleteIndexes.add(stmt.index);
}

// Rule 10 catch-all: reserved emitter identifiers on the remaining binding statements.
function validateReservedBinds(stmt: Stmt): void {
  if (stmt.type === 'bind') assertNotReserved(stmt.name, 'bind statement');
  if (stmt.type === 'resolveFolder') assertNotReserved(stmt.bind, 'resolveFolder bind');
  if (stmt.type === 'resolveProject') assertNotReserved(stmt.bind, 'resolveProject bind');
  if (stmt.type === 'resolveTask') assertNotReserved(stmt.bind, 'resolveTask bind');
  if (stmt.type === 'resolveProjectById') assertNotReserved(stmt.bind, 'resolveProjectById bind');
  if (stmt.type === 'resolveTag') assertNotReserved(stmt.bind, 'resolveTag bind');
  if (stmt.type === 'assignTags') assertNotReserved(stmt.bind, 'assignTags bind');
  if (stmt.type === 'mergeRetag') assertNotReserved(stmt.bind, 'mergeRetag bind');
  if (stmt.type === 'constructTagPath') {
    assertNotReserved(stmt.bind, 'constructTagPath bind');
    assertNotReserved(stmt.createdBind, 'constructTagPath createdBind');
  }
}

const TASK_MOVE_POSITION_KINDS = new Set(['inboxBeginning', 'projectBeginning', 'parentEnding', 'containerRoot']);
const PROJECT_MOVE_POSITION_KINDS = new Set(['libraryBeginning', 'folderBeginning']);
const TAG_MOVE_POSITION_KINDS = new Set(['root', 'underTag']);

/**
 * OmniJS task methods that callMethod nodes may invoke (Rule 12).
 * Validator-enforced: any method not in this list is rejected at validation time.
 * Deliberately minimal — extend per slice as new lowerings land.
 * Exported so callers (batch program builder, tool layer) can reference it.
 */
export const CALL_METHOD_ALLOWLIST: readonly string[] = ['markComplete', 'drop'];

// Rule 11 for moveTask: typed TaskMovePosition with kind in the expected set;
// var-requiring kinds must carry a non-empty string var / taskVar.
function validateMoveTaskStmt(stmt: MoveTaskNode): void {
  const pos = stmt.position as unknown;
  if (typeof pos !== 'object' || pos === null || !TASK_MOVE_POSITION_KINDS.has((pos as { kind?: string }).kind ?? '')) {
    throw new Error(
      'Invalid moveTask: position must be a typed TaskMovePosition object ' +
        'with kind in {inboxBeginning, projectBeginning, parentEnding, containerRoot}, not a string or untyped value.',
    );
  }
  const typed = pos as { kind: string; var?: unknown; taskVar?: unknown };
  if (
    (typed.kind === 'projectBeginning' || typed.kind === 'parentEnding') &&
    (typeof typed.var !== 'string' || typed.var.length === 0)
  ) {
    throw new Error(`Invalid moveTask: position kind "${typed.kind}" requires a non-empty string "var".`);
  }
  if (typed.kind === 'containerRoot' && (typeof typed.taskVar !== 'string' || typed.taskVar.length === 0)) {
    throw new Error('Invalid moveTask: position kind "containerRoot" requires a non-empty string "taskVar".');
  }
}

// Rule 11 for moveProject: typed ProjectMovePosition; folderBeginning requires var.
function validateMoveProjectStmt(stmt: MoveProjectNode): void {
  const pos = stmt.position as unknown;
  if (
    typeof pos !== 'object' ||
    pos === null ||
    !PROJECT_MOVE_POSITION_KINDS.has((pos as { kind?: string }).kind ?? '')
  ) {
    throw new Error(
      'Invalid moveProject: position must be a typed ProjectMovePosition object ' +
        'with kind in {libraryBeginning, folderBeginning}, not a string or untyped value.',
    );
  }
  const typed = pos as { kind: string; var?: unknown };
  if (typed.kind === 'folderBeginning' && (typeof typed.var !== 'string' || typed.var.length === 0)) {
    throw new Error('Invalid moveProject: position kind "folderBeginning" requires a non-empty string "var".');
  }
}

// Rule 11 for moveTag: typed TagMovePosition with kind in {root, underTag};
// underTag requires a non-empty string var.
function validateMoveTagStmt(stmt: MoveTagNode): void {
  const pos = stmt.position as unknown;
  if (typeof pos !== 'object' || pos === null || !TAG_MOVE_POSITION_KINDS.has((pos as { kind?: string }).kind ?? '')) {
    throw new Error(
      'Invalid moveTag: position must be a typed TagMovePosition object ' +
        'with kind in {root, underTag}, not a string or untyped value.',
    );
  }
  const typed = pos as { kind: string; var?: unknown };
  if (typed.kind === 'underTag' && (typeof typed.var !== 'string' || typed.var.length === 0)) {
    throw new Error('Invalid moveTag: position kind "underTag" requires a non-empty string "var".');
  }
}

// Rule 12: method must be in CALL_METHOD_ALLOWLIST.
function validateCallMethodStmt(stmt: CallMethodNode): void {
  if (!CALL_METHOD_ALLOWLIST.includes(stmt.method)) {
    throw new Error(
      `Invalid callMethod: method "${stmt.method}" is not in the allowlist ` +
        `(${CALL_METHOD_ALLOWLIST.join(', ')}). Add it to CALL_METHOD_ALLOWLIST in validator.ts when its lowering lands.`,
    );
  }
}

const ASSIGN_TAGS_MODES = new Set(['replace', 'add', 'remove']);

// Rule 13: assignTags.mode, when present, must be in {replace, add, remove}.
function validateAssignTagsStmt(stmt: AssignTagsNode): void {
  if (stmt.mode !== undefined && !ASSIGN_TAGS_MODES.has(stmt.mode)) {
    throw new Error(
      `Invalid assignTags: mode "${stmt.mode as string}" is not in the allowed set {replace, add, remove}. ` +
        'Check the mode value — unknown modes silently fall through to "add" behavior at emission time.',
    );
  }
}

/** Collect ref names from an Expr tree. raw/json/enumRef carry none by design —
 * raw is builder-internal (same trust model as GuardNode.cond). */
function exprRefs(expr: Expr): string[] {
  switch (expr.type) {
    case 'ref':
      return [expr.name];
    case 'member':
      return exprRefs(expr.object);
    case 'new':
      return expr.args.flatMap(exprRefs);
    case 'dateExpr':
      return exprRefs(expr.value);
    default:
      return [];
  }
}

/** The bind name a TaskMovePosition consumes, if any (rule-7 helper). */
function taskMovePositionVars(position: MoveTaskNode['position']): string[] {
  if (position.kind === 'projectBeginning' || position.kind === 'parentEnding') return [position.var];
  if (position.kind === 'containerRoot') return [position.taskVar];
  return [];
}

/** Refs a statement consumes (the rule-7 generalization, slice 4).
 * Guards, resolve statements, and batchItem nodes are NOT consumers (default
 * case): a guard mentioning the bind IS the guard; batchItem inner statements
 * are validated by the per-list recursion. Guard ENVELOPE exprs are
 * deliberately not scanned either — they emit only on the failure path and
 * are builder-controlled (same trust model as raw). */
function stmtConsumedRefs(stmt: Stmt): string[] {
  switch (stmt.type) {
    case 'setProp':
      return [
        ...exprRefs(stmt.target),
        ...(stmt.value ? exprRefs(stmt.value) : []),
        ...(stmt.mutations ?? []).flatMap((m) => exprRefs(m.value)),
      ];
    case 'assignTags':
      return [...exprRefs(stmt.target), ...exprRefs(stmt.tags)];
    case 'moveTask':
      return [...exprRefs(stmt.task), ...taskMovePositionVars(stmt.position)];
    case 'moveProject':
      return [...exprRefs(stmt.project), ...(stmt.position.kind === 'folderBeginning' ? [stmt.position.var] : [])];
    case 'moveTag':
      return [...exprRefs(stmt.tag), ...(stmt.position.kind === 'underTag' ? [stmt.position.var] : [])];
    case 'callMethod':
      return [...exprRefs(stmt.target), ...stmt.args.flatMap(exprRefs)];
    case 'deleteObject':
      return exprRefs(stmt.target);
    case 'mergeRetag':
      return [stmt.sourceVar, stmt.targetVar];
    case 'constructTask':
      return stmt.container.kind !== 'inbox' ? [stmt.container.var] : [];
    case 'constructProject':
      return stmt.folder.kind === 'resolved' ? [stmt.folder.var] : [];
    case 'constructFolder':
      return stmt.parent.kind === 'resolved' ? [stmt.parent.var] : [];
    case 'constructTag':
      return stmt.parent.kind === 'resolved' ? [stmt.parent.var] : [];
    case 'return':
      return Object.values(stmt.envelope).flatMap(exprRefs);
    case 'bind':
      return exprRefs(stmt.expr);
    default:
      return [];
  }
}

function isResolveStmt(
  stmt: Stmt,
): stmt is Extract<
  Stmt,
  { type: 'resolveProject' | 'resolveTask' | 'resolveProjectById' | 'resolveFolder' | 'resolveTag' }
> {
  return (
    stmt.type === 'resolveProject' ||
    stmt.type === 'resolveTask' ||
    stmt.type === 'resolveProjectById' ||
    stmt.type === 'resolveFolder' ||
    stmt.type === 'resolveTag'
  );
}

// Rule 7: resolution-guard discipline (list-level check).
// A failed resolution (null bind) reaching any consumer — `new Task` / `new
// Project` / `new Folder`, a setProp target, moveTasks/moveSections, a
// callMethod target, an assignTags target, or a return envelope — explodes
// with an opaque runtime TypeError instead of a typed envelope, so every
// consumed resolution bind must be guarded between resolve and the consumer.
// Only statements LATER than the resolve (by index) count as consumers.
// The cond check is string-level: same trust model as GuardNode.cond
// generally. (Slice 3 widened this from constructTask-only to all three
// constructs; slice 4 widened it from constructs to ALL consumers.)
function validateResolutionGuardDiscipline(statements: Stmt[]): void {
  for (let ri = 0; ri < statements.length; ri++) {
    const resolve = statements[ri];
    if (!isResolveStmt(resolve)) continue;
    const bindName = resolve.bind;
    // Word-boundary match, not substring: a guard on `proj` must not satisfy
    // bind `p`. Regex-escaped for safety even though binds are identifiers.
    const bindPattern = new RegExp(`\\b${bindName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (let ci = ri + 1; ci < statements.length; ci++) {
      const consumer = statements[ci];
      if (!stmtConsumedRefs(consumer).includes(bindName)) continue;
      const guarded = statements.some((s, si) => si > ri && si < ci && s.type === 'guard' && bindPattern.test(s.cond));
      if (!guarded) {
        throw new Error(
          `Invalid mutation program: ${consumer.type} consumes resolution bind "${bindName}" ` +
            'without a guard between the resolve and the consumer (the guard cond must mention the bind).',
        );
      }
    }
  }
}

function validateStatementList(statements: Stmt[], ctx: ValidationContext): void {
  // Rule 9 (constructTagPath altitude): per-LIST counter — the hazard is a
  // same-block duplicate `const _tagPath`; nested lists get their own scope
  // via this function's recursion.
  let tagPathCount = 0;
  for (const stmt of statements) {
    switch (stmt.type) {
      case 'constructProject':
        validateConstructProjectStmt(stmt);
        break;
      case 'constructFolder':
        validateConstructFolderStmt(stmt);
        break;
      case 'constructTag':
        validateConstructTagStmt(stmt);
        break;
      case 'setProp':
        validateSetPropStmt(stmt);
        break;
      case 'constructTask':
        validateConstructTaskStmt(stmt);
        break;
      case 'guard':
        validateGuardStmt(stmt, ctx);
        break;
      case 'moveTask':
        validateMoveTaskStmt(stmt);
        break;
      case 'moveProject':
        validateMoveProjectStmt(stmt);
        break;
      case 'moveTag':
        // Rule 8 (moveTag inside batchItem): moveTag's emission contains a
        // top-level return (the hard-error envelope catch) — same IIFE-escape
        // hazard as a bare return / return-mode guard inside batchItem.
        if (ctx.insideBatchItem) {
          throw new Error(
            'Invalid batchItem: a moveTag statement inside batchItem.statements emits a top-level return ' +
              '(its hard-error envelope catch), which would return from the whole program IIFE, ' +
              'skipping remaining items and the results envelope.',
          );
        }
        validateMoveTagStmt(stmt);
        break;
      case 'callMethod':
        validateCallMethodStmt(stmt);
        break;
      case 'assignTags':
        validateAssignTagsStmt(stmt);
        break;
      case 'return':
        // Rule 8 (return inside batchItem): same IIFE-escape hazard as the return-mode guard above.
        if (ctx.insideBatchItem) {
          throw new Error(
            'Invalid batchItem: a return statement inside batchItem.statements would return from the whole ' +
              'program IIFE, skipping remaining items and the results envelope.',
          );
        }
        break;
      case 'batchItem':
        validateBatchItemStmt(stmt, ctx);
        break;
      case 'bulkDeleteItem':
        validateBulkDeleteItemStmt(stmt, ctx);
        break;
      case 'constructTagPath':
        // Rule 9 (constructTagPath altitude): emission declares the fixed
        // `const _tagPath` intermediate — a second at this level would
        // double-declare it (SyntaxError at runtime).
        tagPathCount++;
        if (tagPathCount > 1) {
          throw new Error(
            'Invalid mutation program: at most one constructTagPath per statement-list level — ' +
              'a second would double-declare the reserved "_tagPath" intermediate (SyntaxError at runtime).',
          );
        }
        break;
      default:
        break;
    }

    validateReservedBinds(stmt);
  }

  // Rule 7: resolution-guard discipline, at THIS list level.
  validateResolutionGuardDiscipline(statements);
}
