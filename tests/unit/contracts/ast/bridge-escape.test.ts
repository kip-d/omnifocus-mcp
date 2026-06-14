import { describe, it, expect } from 'vitest';
import { sanitizeForScriptComment } from '../../../../src/contracts/ast/bridge-escape.js';

// OMN-129 retired escapeTemplateString / escapeTemplateLiteralHazards: the read
// side now crosses the JXA→OmniJS boundary via JSON.stringify(program) (see
// bridge-injection.test.ts), so the hand-rolled template-literal escapers no longer
// exist. sanitizeForScriptComment survives — JSON.stringify guards the outer string
// literal, but a raw CR/LF inside a `// Filter:` comment still splits the inner
// OmniJS that OmniFocus compiles, so control chars must be scrubbed from comments.
describe('sanitizeForScriptComment', () => {
  it('collapses CR/LF/tab/control runs to a single space and trims', () => {
    expect(sanitizeForScriptComment('a\r\n\tb')).toBe('a b');
    expect(sanitizeForScriptComment('a b')).toBe('a b');
    expect(sanitizeForScriptComment('  x\ny  ')).toBe('x y');
  });
  it('is identity on benign single-line input', () => {
    expect(sanitizeForScriptComment('text: "abc" AND flagged')).toBe('text: "abc" AND flagged');
  });

  it('collapses U+2028/U+2029 — JS line/paragraph separators (OMN-129 fuzz)', () => {
    // These are NOT C0 control chars, so JSON.stringify leaves them literal and they
    // pass the boundary; but they ARE JS LineTerminators, so an un-scrubbed one would
    // split the `// Filter:` comment in the compiled OmniJS. Constructed via charCode
    // so no raw line terminator lands in this test's source.
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    expect(sanitizeForScriptComment(`a${LS}b`)).toBe('a b');
    expect(sanitizeForScriptComment(`a${PS}b`)).toBe('a b');
    expect(sanitizeForScriptComment(`a${LS}${PS}\nb`)).toBe('a b');
  });
});
