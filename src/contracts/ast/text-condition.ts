/**
 * Shared OmniJS text-condition emitter (OMN-213/214/215).
 *
 * Single source of truth for the case-insensitive CONTAINS / safe-RegExp MATCHES
 * strategy, shared across BOTH codegen layers so they can never silently diverge:
 *   - the direct string codegen in `filter-generator.ts` (project/folder/tag name filters)
 *   - the AST emitter in `emitters/omnijs.ts` (task name/note filters)
 *
 * This is a leaf module (it imports only the TextOperator type) so both of those
 * modules can import it without forming the `filter-generator` ↔ `emitters/omnijs`
 * import cycle that previously blocked the task emitter from delegating.
 */

import type { TextOperator } from '../filters.js';

/**
 * Emit one case-insensitive match condition against an arbitrary OmniJS string
 * accessor. CONTAINS lowercases the accessor at runtime and the term at codegen
 * time (so the term crosses as a plain lowercased literal); MATCHES compiles to a
 * case-insensitive RegExp test. The term is injected via JSON.stringify only —
 * never raw interpolation (OMN-149-safe: a `/` or backtick in the term stays inert).
 */
export function emitTextCondition(accessor: string, term: string, operator?: TextOperator): string {
  if (operator === 'MATCHES') {
    return `new RegExp(${JSON.stringify(term)}, 'i').test(${accessor})`;
  }
  return `${accessor}.toLowerCase().includes(${JSON.stringify(term.toLowerCase())})`;
}
