/**
 * Closed-vocabulary enforcement for SCRIPT_ERROR_CONTEXT (OMN-159).
 *
 * This is the ONLY mechanical defense for the wire contract, so the guard parses
 * each `createScriptError(...)` call site rather than pattern-matching on text:
 *   1. Scan for `createScriptError(` (skipping the function DEFINITION).
 *   2. Split the call's top-level argument list, respecting quoted strings and
 *      nested brackets so commas inside a string/object first-arg never confuse
 *      argument boundaries (the bug the old regex had).
 *   3. Take the context (2nd) argument and assert it is EITHER a
 *      `SCRIPT_ERROR_CONTEXT.<KEY>` reference OR — if it is a bare string literal —
 *      a member of `Object.values(SCRIPT_ERROR_CONTEXT)`. A non-literal expression
 *      (variable, function call) is allowed: those resolve at runtime and cannot be
 *      checked statically, but every literal context MUST be in the allow-list.
 * Exoneration is scoped to the matched 2nd-arg TOKEN — never a surrounding window —
 * so a bare context near an unrelated SCRIPT_ERROR_CONTEXT mention is NOT excused.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCRIPT_ERROR_CONTEXT } from '../../../src/omnifocus/script-result-types.js';

const ROOT = resolve(__dirname, '../../../src');
const MODULES = ['omnifocus/script-result-types.ts', 'omnifocus/OmniAutomation.ts', 'tools/base.ts'];

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

/**
 * Split a call's argument-list source (the text between the outermost parens, NOT
 * including them) into top-level argument strings. Respects single/double/backtick
 * quotes (with backslash escapes) and nested (), [], {} so commas inside strings or
 * nested structures do not split arguments.
 */
function splitTopLevelArgs(argSrc: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < argSrc.length; i++) {
    const ch = argSrc[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        // include the escaped char verbatim
        if (i + 1 < argSrc.length) current += argSrc[++i];
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) args.push(current.trim());
  return args;
}

/**
 * Extract the source text of every createScriptError(...) CALL in a module
 * (the function DEFINITION `export function createScriptError(` is excluded).
 * Returns each call's top-level argument list, split into args.
 */
function extractCreateScriptErrorCalls(src: string): string[][] {
  const calls: string[][] = [];
  const needle = 'createScriptError(';
  let searchFrom = 0;
  for (;;) {
    const idx = src.indexOf(needle, searchFrom);
    if (idx === -1) break;
    searchFrom = idx + needle.length;

    // Skip the function definition: `function createScriptError(` / `export function createScriptError(`.
    const before = src.slice(Math.max(0, idx - 20), idx);
    if (/function\s+$/.test(before)) continue;

    // Walk from the opening paren to its matching close, respecting quotes/nesting.
    const openParen = idx + needle.length - 1; // index of '('
    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    for (let i = openParen; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) continue; // unbalanced — skip defensively
    const argSrc = src.slice(openParen + 1, end);
    calls.push(splitTopLevelArgs(argSrc));
  }
  return calls;
}

/** True when `arg` is a bare string literal (single/double/backtick, no interpolation/concat). */
function asStringLiteral(arg: string): string | null {
  const m = /^(['"`])((?:\\.|(?!\1).)*)\1$/.exec(arg);
  if (!m) return null;
  // reject template literals with interpolation — they aren't a fixed vocabulary member
  if (m[1] === '`' && m[2].includes('${')) return null;
  // unescape \\ and \' \" for comparison against vocabulary values
  return m[2].replace(/\\(['"`\\])/g, '$1');
}

describe('SCRIPT_ERROR_CONTEXT closed-vocabulary (OMN-159)', () => {
  const vocabulary = Object.values(SCRIPT_ERROR_CONTEXT);
  const vocabularySet = new Set<string>(vocabulary);

  it('constant has exactly 7 canonical context strings', () => {
    expect(vocabulary).toHaveLength(7);
  });

  it('all 7 strings are non-empty', () => {
    for (const s of vocabulary) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('"Legacy script error" does not appear in src/', () => {
    for (const m of MODULES) {
      expect(readSrc(m), `"Legacy script error" found in ${m}`).not.toContain('Legacy script error');
    }
  });

  it('"OmniAutomation execution error" does not appear in src/', () => {
    for (const m of MODULES) {
      expect(readSrc(m), `"OmniAutomation execution error" found in ${m}`).not.toContain(
        'OmniAutomation execution error',
      );
    }
  });

  // Positive allow-list membership: every createScriptError context (2nd) arg that is a
  // STRING LITERAL must be a member of Object.values(SCRIPT_ERROR_CONTEXT); a
  // SCRIPT_ERROR_CONTEXT.<KEY> reference is always allowed; a non-literal expression
  // (variable / call) is allowed (not statically checkable).
  it('every createScriptError string-literal context arg is in the SCRIPT_ERROR_CONTEXT allow-list', () => {
    for (const m of MODULES) {
      const src = readSrc(m);
      const calls = extractCreateScriptErrorCalls(src);
      // Sanity: each module we guard actually has at least one call to check.
      expect(calls.length, `expected ≥1 createScriptError call in ${m}`).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const args of calls) {
        const contextArg = args[1];
        if (contextArg === undefined) continue; // no context arg (allowed; defaults to undefined)
        // Allowed: a reference to the canonical constant.
        if (contextArg.startsWith('SCRIPT_ERROR_CONTEXT.')) continue;
        const literal = asStringLiteral(contextArg);
        if (literal === null) continue; // non-literal expression — not statically checkable
        // It IS a bare string literal — must be a vocabulary member, scoped to THIS token only.
        if (!vocabularySet.has(literal)) violations.push(contextArg);
      }

      expect(violations, `bare non-vocabulary context literal(s) in ${m}: ${violations.join(', ')}`).toHaveLength(0);
    }
  });
});
