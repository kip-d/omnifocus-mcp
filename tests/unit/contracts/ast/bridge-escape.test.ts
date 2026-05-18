import { describe, it, expect } from 'vitest';
import {
  escapeTemplateString,
  escapeTemplateLiteralHazards,
  sanitizeForScriptComment,
} from '../../../../src/contracts/ast/bridge-escape.js';

describe('escapeTemplateString', () => {
  it('escapes backslash, backtick, and ${', () => {
    expect(escapeTemplateString('a\\b')).toBe('a\\\\b');
    expect(escapeTemplateString('a`b')).toBe('a\\`b');
    expect(escapeTemplateString('a${x}b')).toBe('a\\${x}b');
  });
  it('is identity on benign input', () => {
    expect(escapeTemplateString('plain text 123 _-.')).toBe('plain text 123 _-.');
  });
  it("does NOT alter newlines (that is sanitizeForScriptComment's job)", () => {
    expect(escapeTemplateString('a\nb')).toBe('a\nb');
  });
});

describe('escapeTemplateLiteralHazards', () => {
  it('escapes backtick and ${ but NOT backslash', () => {
    expect(escapeTemplateLiteralHazards('a`b')).toBe('a\\`b');
    expect(escapeTemplateLiteralHazards('a${x}b')).toBe('a\\${x}b');
    // backslash is left untouched (caller already JSON.stringify'd it)
    expect(escapeTemplateLiteralHazards('a\\b')).toBe('a\\b');
    expect(escapeTemplateLiteralHazards('a\\\\b')).toBe('a\\\\b');
  });
  it('is identity on benign input', () => {
    expect(escapeTemplateLiteralHazards('plain text 123 _-.')).toBe('plain text 123 _-.');
  });
});

describe('sanitizeForScriptComment', () => {
  it('collapses CR/LF/tab/control runs to a single space and trims', () => {
    expect(sanitizeForScriptComment('a\r\n\tb')).toBe('a b');
    expect(sanitizeForScriptComment('a b')).toBe('a b');
    expect(sanitizeForScriptComment('  x\ny  ')).toBe('x y');
  });
  it('is identity on benign single-line input', () => {
    expect(sanitizeForScriptComment('text: "abc" AND flagged')).toBe('text: "abc" AND flagged');
  });
});
