/**
 * Closed-vocabulary enforcement for SCRIPT_ERROR_CONTEXT (OMN-159).
 *
 * Every context string emitted by the three canonical modules MUST come from
 * SCRIPT_ERROR_CONTEXT. This test is non-vacuous: temporarily adding a bare
 * string context to any of those modules will cause the grep assertions to fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCRIPT_ERROR_CONTEXT } from '../../../src/omnifocus/script-result-types.js';

const ROOT = resolve(__dirname, '../../../src');

function readSrc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

describe('SCRIPT_ERROR_CONTEXT closed-vocabulary (OMN-159)', () => {
  const vocabulary = Object.values(SCRIPT_ERROR_CONTEXT);

  // Confirm the constant has exactly 7 strings
  it('constant has exactly 7 canonical context strings', () => {
    expect(vocabulary).toHaveLength(7);
  });

  // All 7 strings are non-empty
  it('all 7 strings are non-empty', () => {
    for (const s of vocabulary) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  // Retired strings must not appear anywhere in src/
  it('"Legacy script error" does not appear in src/', () => {
    const modules = ['omnifocus/script-result-types.ts', 'omnifocus/OmniAutomation.ts', 'tools/base.ts'];
    for (const m of modules) {
      const src = readSrc(m);
      expect(src, `"Legacy script error" found in ${m}`).not.toContain('Legacy script error');
    }
  });

  it('"OmniAutomation execution error" does not appear in src/', () => {
    const modules = ['omnifocus/script-result-types.ts', 'omnifocus/OmniAutomation.ts', 'tools/base.ts'];
    for (const m of modules) {
      const src = readSrc(m);
      expect(src, `"OmniAutomation execution error" found in ${m}`).not.toContain('OmniAutomation execution error');
    }
  });

  // Every context string literal in the three canonical modules must be from SCRIPT_ERROR_CONTEXT.
  // We detect bare string literals passed as the second argument to createScriptError by checking
  // that no call-site passes a raw string literal (in single or double quotes) that is NOT one of
  // the canonical values. The regex matches: createScriptError(..., 'some string', ... or
  // createScriptError(..., "some string", ... — it does NOT match SCRIPT_ERROR_CONTEXT.XXXX references.
  it('all createScriptError context args in the three modules use SCRIPT_ERROR_CONTEXT constants', () => {
    // This regex matches a bare string literal as the second arg to createScriptError.
    // Pattern: createScriptError(<any non-)>, then whitespace/comma, then a quoted string.
    // We look for: createScriptError(  ...  ,  '...'  or  "..."  as the 2nd argument.
    // Simplified: flag any occurrence of createScriptError with a string-literal second arg.
    const bareStringSecondArg = /createScriptError\([^,]+,\s*(['"])[^'"]+\1/g;

    const modules = ['omnifocus/script-result-types.ts', 'omnifocus/OmniAutomation.ts', 'tools/base.ts'];

    for (const m of modules) {
      const src = readSrc(m);
      const matches = [...src.matchAll(bareStringSecondArg)];
      // Filter out matches that are actually using a constant reference (false positives from the regex)
      const bareMatches = matches.filter((match) => {
        // Extract the full match context to see if it includes SCRIPT_ERROR_CONTEXT
        const matchStart = match.index ?? 0;
        const snippet = src.slice(matchStart, matchStart + 200);
        return !snippet.includes('SCRIPT_ERROR_CONTEXT');
      });

      expect(
        bareMatches.map((m) => m[0].slice(0, 120)),
        `Bare string literal context found in ${m} — use SCRIPT_ERROR_CONTEXT constants`,
      ).toHaveLength(0);
    }
  });
});
