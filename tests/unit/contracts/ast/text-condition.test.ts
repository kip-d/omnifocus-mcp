/**
 * OMN-215 — shared text-condition emitter (`src/contracts/ast/text-condition.ts`).
 *
 * Single source of truth for the case-insensitive CONTAINS / safe-RegExp MATCHES
 * strategy across BOTH codegen layers: the direct string codegen in
 * filter-generator.ts (project/folder/tag name filters) AND the AST emitter in
 * emitters/omnijs.ts (task name/note filters). This module is the leaf both sides
 * import — extracting it broke the filter-generator ↔ omnijs import cycle that
 * blocked delegating the task emitter (OMN-213/214 unified the string-codegen
 * surfaces; OMN-215 brings the AST emitter in).
 */

import { describe, it, expect } from 'vitest';
import { emitTextCondition } from '../../../../src/contracts/ast/text-condition.js';

describe('emitTextCondition — CONTAINS (default operator)', () => {
  it('lowercases the accessor at runtime and the term at codegen', () => {
    expect(emitTextCondition("(x.name || '')", 'Home')).toBe('(x.name || \'\').toLowerCase().includes("home")');
  });

  it('treats an explicit CONTAINS operator the same as the default', () => {
    expect(emitTextCondition('acc', 'Work', 'CONTAINS')).toBe(emitTextCondition('acc', 'Work'));
  });

  it('lowercases a mixed-case term to a single codegen-time literal', () => {
    expect(emitTextCondition('acc', 'HeLLo')).toContain('includes("hello")');
  });

  it('injects the term as a JSON string literal, never raw (injection-safe)', () => {
    // A term with a quote/backslash must round-trip through JSON.stringify.
    const code = emitTextCondition('acc', 'a"b\\c');
    expect(code).toContain(JSON.stringify('a"b\\c'.toLowerCase()));
    expect(() => new Function(`return ${code};`)).not.toThrow();
  });
});

describe('emitTextCondition — MATCHES', () => {
  it('compiles to a case-insensitive RegExp test against the accessor', () => {
    expect(emitTextCondition("(x.name || '')", '^Home$', 'MATCHES')).toBe(
      'new RegExp("^Home$", \'i\').test((x.name || \'\'))',
    );
  });

  it('injects the pattern as a JSON string literal, never a raw regex literal (OMN-149)', () => {
    // A pattern containing `/` must not break out into a regex literal.
    const code = emitTextCondition('acc', 'a/b', 'MATCHES');
    expect(code).toContain(JSON.stringify('a/b'));
    expect(code).not.toContain('/a/b/');
    expect(() => new Function(`return ${code};`)).not.toThrow();
  });

  it('introduces no backtick of its own (no template literals in the generated code)', () => {
    // A backtick-free term must yield backtick-free output — the emitter never
    // wraps anything in a template literal (would break JXA → OmniJS interpolation).
    expect(emitTextCondition('acc', 'Development : Web', 'MATCHES').includes('`')).toBe(false);
    expect(emitTextCondition('acc', 'Development : Web').includes('`')).toBe(false);
  });

  it('keeps a backtick IN THE TERM inert — it rides inside the JSON string literal (OMN-129)', () => {
    // The backtick is present but harmless: it lives inside a double-quoted JSON
    // string, not a template literal, so the generated code still parses.
    const code = emitTextCondition('acc', 'a`b');
    expect(code).toContain('includes("a`b")');
    expect(() => new Function(`return ${code};`)).not.toThrow();
  });
});
