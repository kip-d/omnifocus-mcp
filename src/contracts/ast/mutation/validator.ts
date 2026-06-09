// src/contracts/ast/mutation/validator.ts
// Structural validator for mutation-AST Programs. Throws on malformed programs
// BEFORE they reach the emitter, so a bad lowering surfaces as a clear error at
// the build seam rather than as broken OmniJS at runtime.
import type { Program } from './types.js';

const FOLDER_KINDS = new Set(['resolved', 'none', 'notFound']);

/**
 * Validate a mutation Program. Throws on the first structural violation.
 *
 * Structural rules (enforced here):
 *  1. The last statement must be a `return`.
 *  2. Every `constructProject`'s `folder` must be a typed FolderResolution
 *     object (kind ∈ {resolved, none, notFound}) — never a string / missing kind.
 *  3. A `constructProject` with `folder.kind === 'notFound'` is illegal: the
 *     not-found case must be handled by a preceding `guard` that returns.
 *  4. A `setProp` with strategy !== 'readModifyReassign' MUST have a `value`;
 *     a `setProp` with strategy === 'readModifyReassign' MUST have `mutations`.
 *
 * NOT enforced here: snippet-dependency coverage (a statement that emits a call
 * to an OmniJS helper must declare that helper in `snippetDeps`). That check is
 * implicit in EMISSION, so it lives in `emitProgram` (emitter.ts), not here.
 */
export function validateMutationProgram(program: Program): void {
  const { statements } = program;

  // Rule 1: return-terminated.
  const last = statements[statements.length - 1];
  if (!last || last.type !== 'return') {
    throw new Error('Invalid mutation program: it must end in a return statement.');
  }

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
  }
}
