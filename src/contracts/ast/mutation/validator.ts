// src/contracts/ast/mutation/validator.ts
// Structural validator for mutation-AST Programs. Throws on malformed programs
// BEFORE they reach the emitter, so a bad lowering surfaces as a clear error at
// the build seam rather than as broken OmniJS at runtime.
import type { Program, Stmt } from './types.js';

const FOLDER_KINDS = new Set(['resolved', 'none', 'notFound']);
const CONTAINER_KINDS = new Set(['inbox', 'project', 'parentTask', 'tempIdRef']);

/**
 * Identifiers the emitter declares for its own bookkeeping — a program bind
 * shadowing one of these would silently corrupt that bookkeeping:
 *  - `_warnings`: the OMN-137 program-scope warnings array (Task 4 review:
 *    it briefly joined the unreserved namespace — this rule closes that gap).
 *  - `_aborted`: the batch stop-on-error flag set by batchItem's catch.
 *  - `_w<i>` (pattern, see RESERVED_ITEM_VAR_PATTERN): per-item warning
 *    watermarks declared by batchItem emission.
 *
 * `results` is deliberately NOT reserved: the batch program builder
 * legitimately binds it via a bind statement.
 *
 * Exported so the batch program builder (Task 9) can keep its generated names
 * clear of the same set.
 */
export const RESERVED_EMITTER_IDENTIFIERS = ['_warnings', '_aborted'];
const RESERVED_ITEM_VAR_PATTERN = /^_w\d+$/;

function assertNotReserved(name: string, where: string): void {
  if (RESERVED_EMITTER_IDENTIFIERS.includes(name) || RESERVED_ITEM_VAR_PATTERN.test(name)) {
    throw new Error(
      `Invalid ${where}: "${name}" is a reserved emitter identifier ` +
        `(reserved: ${RESERVED_EMITTER_IDENTIFIERS.join(', ')}, and the _w<digits> pattern).`,
    );
  }
}

/**
 * Validate a mutation Program. Throws on the first structural violation.
 *
 * Structural rules (enforced here):
 *  1. The last TOP-LEVEL statement must be a `return`. batchItem inner lists
 *     are exempt — they must NOT return (rule 8).
 *  2. Every `constructProject`'s `folder` must be a typed FolderResolution
 *     object (kind ∈ {resolved, none, notFound}) — never a string / missing kind.
 *  3. A `constructProject` with `folder.kind === 'notFound'` is illegal: the
 *     not-found case must be handled by a preceding `guard` that returns.
 *  4. A `setProp` with strategy !== 'readModifyReassign' MUST have a `value`;
 *     a `setProp` with strategy === 'readModifyReassign' MUST have `mutations`.
 *  5. Every `constructTask`'s `container` must be a typed ContainerResolution
 *     object (kind ∈ {inbox, project, parentTask, tempIdRef}); non-inbox kinds
 *     require a non-empty string `var`.
 *  6. A guard with mode 'throw' must have `envelope.message` defined (the
 *     emitter also throws — belt and suspenders at the validation seam).
 *  7. Resolution-guard discipline: a `resolveProject`/`resolveParentTask` bind
 *     consumed by a later `constructTask` container `var` must have a `guard`
 *     BETWEEN them whose `cond` mentions that bind. String-level check on
 *     `cond` — same trust model as GuardNode.cond generally. Applies at each
 *     statement-list level independently (resolve/guard/construct triplets
 *     stay within one list in practice).
 *  8. Inside `batchItem.statements`: all per-statement rules recurse, but a
 *     `return` statement is ILLEGAL (it would return from the whole program
 *     IIFE, skipping remaining items and the results envelope — Task 5 review
 *     finding), and for the same reason a return-MODE guard is ILLEGAL —
 *     inner guards must be mode 'throw'.
 *  9. Across a program's batchItem nodes, `index` AND `taskVar` values must
 *     each be unique. A duplicate index would double-declare `_w<i>`
 *     (SyntaxError at runtime); and since constructTask binds emit as `var`
 *     for cross-item tempIdRef visibility (commit 88fb2e5), a duplicate
 *     taskVar would SILENTLY SHADOW an earlier item's task — the worst kind
 *     of wrong.
 * 10. No binding statement (bind, resolveFolder, resolveProject,
 *     resolveParentTask, constructProject, constructTask, assignTags) may use
 *     a reserved emitter identifier — see RESERVED_EMITTER_IDENTIFIERS.
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
  });
}

interface ValidationContext {
  insideBatchItem: boolean;
  // Program-wide batchItem uniqueness tracking (rule 9) — shared across levels.
  batchIndexes: Set<number>;
  batchTaskVars: Set<string>;
}

function validateStatementList(statements: Stmt[], ctx: ValidationContext): void {
  for (const stmt of statements) {
    if (stmt.type === 'constructProject') {
      const folder = stmt.folder as unknown;
      // Rule 2: typed FolderResolution object.
      if (
        typeof folder !== 'object' ||
        folder === null ||
        !FOLDER_KINDS.has((folder as { kind?: string }).kind ?? '')
      ) {
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

    if (stmt.type === 'setProp') {
      // Rule 4: value/mutations invariants.
      if (stmt.strategy === 'readModifyReassign') {
        if (stmt.mutations === undefined) {
          throw new Error(`Invalid setProp on "${stmt.prop}": readModifyReassign strategy requires "mutations".`);
        }
      } else if (stmt.value === undefined) {
        throw new Error(`Invalid setProp on "${stmt.prop}": strategy "${stmt.strategy}" requires a defined "value".`);
      }
    }

    if (stmt.type === 'constructTask') {
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

    if (stmt.type === 'guard') {
      // Rule 6: throw-mode guard needs a message (it becomes the thrown Error
      // text). The emitter throws too — belt and suspenders at this seam.
      if (stmt.mode === 'throw' && stmt.envelope.message === undefined) {
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

    if (stmt.type === 'return' && ctx.insideBatchItem) {
      // Rule 8: same IIFE-escape hazard as the return-mode guard above.
      throw new Error(
        'Invalid batchItem: a return statement inside batchItem.statements would return from the whole ' +
          'program IIFE, skipping remaining items and the results envelope.',
      );
    }

    if (stmt.type === 'batchItem') {
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
      // Rule 8: recurse all per-statement rules into the item's statements.
      validateStatementList(stmt.statements, { ...ctx, insideBatchItem: true });
    }

    // Rule 10: reserved emitter identifiers on the remaining binding statements.
    if (stmt.type === 'bind') assertNotReserved(stmt.name, 'bind statement');
    if (stmt.type === 'resolveFolder') assertNotReserved(stmt.bind, 'resolveFolder bind');
    if (stmt.type === 'resolveProject') assertNotReserved(stmt.bind, 'resolveProject bind');
    if (stmt.type === 'resolveParentTask') assertNotReserved(stmt.bind, 'resolveParentTask bind');
    if (stmt.type === 'assignTags') assertNotReserved(stmt.bind, 'assignTags bind');
  }

  // Rule 7: resolution-guard discipline, at THIS list level. A failed
  // resolution (null bind) reaching `new Task` / moveTasks explodes with an
  // opaque runtime TypeError instead of a typed envelope — so every consumed
  // resolution bind must be guarded between resolve and construct. The cond
  // check is string-level: same trust model as GuardNode.cond generally.
  for (let ri = 0; ri < statements.length; ri++) {
    const resolve = statements[ri];
    if (resolve.type !== 'resolveProject' && resolve.type !== 'resolveParentTask') continue;
    for (let ci = 0; ci < statements.length; ci++) {
      const construct = statements[ci];
      if (construct.type !== 'constructTask') continue;
      if (construct.container.kind === 'inbox' || construct.container.var !== resolve.bind) continue;
      const guarded = statements.some(
        (s, si) => si > ri && si < ci && s.type === 'guard' && s.cond.includes(resolve.bind),
      );
      if (!guarded) {
        throw new Error(
          `Invalid mutation program: constructTask consumes resolution bind "${resolve.bind}" ` +
            'without a guard between the resolve and the construct (the guard cond must mention the bind).',
        );
      }
    }
  }
}
