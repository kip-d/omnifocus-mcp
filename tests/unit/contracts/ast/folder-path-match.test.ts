/**
 * OMN-167 — shared folder-path matcher (`src/contracts/ast/folder-path-match.ts`).
 *
 * Single source of truth for `Parent : Child` path / subtree folder matching across
 * BOTH codegen layers (tasks-side synthetic emitter + projects-side string emitter).
 *
 * Two surfaces under test:
 *   1. `parseFolderFilterPath` — path string → lowercased, trimmed segments (leaf last);
 *      throws on an empty segment.
 *   2. `emitFolderPathMatch` — emits an OmniJS boolean expression (subtree semantics).
 *      We validate not just its shape but its RUNTIME behavior by instantiating the
 *      emitted expression via `new Function` and running it over a synthetic folder
 *      tree (mirrors the OMN-87 predicate-parity harness — the generated JS is the
 *      production seam; a unit test that only string-matches it would miss logic bugs).
 */

import { describe, it, expect } from 'vitest';
import { parseFolderFilterPath, emitFolderPathMatch } from '../../../../src/contracts/ast/folder-path-match.js';

// ---- Synthetic folder tree (plain objects mirroring OmniJS Folder { name, parent }) ----
type FakeFolder = { name: string; parent: FakeFolder | null };
const development: FakeFolder = { name: 'Development', parent: null };
const web: FakeFolder = { name: 'Web', parent: development };
const frontend: FakeFolder = { name: 'Frontend', parent: web };

/** Instantiate the emitted expression as a real predicate over a leaf folder. */
function predicate(path: string): (leaf: FakeFolder | null) => boolean {
  const expr = emitFolderPathMatch('LEAF', path);

  return new Function('LEAF', `return (${expr});`) as (leaf: FakeFolder | null) => boolean;
}

describe('parseFolderFilterPath', () => {
  it('parses a single bare name to one lowercased, trimmed segment', () => {
    expect(parseFolderFilterPath('Development')).toEqual(['development']);
  });

  it('parses a Parent : Child path to ordered segments (leaf last)', () => {
    expect(parseFolderFilterPath('Development : Web')).toEqual(['development', 'web']);
  });

  it('trims surrounding whitespace per segment regardless of spacing around the separator', () => {
    expect(parseFolderFilterPath('Development:Web')).toEqual(['development', 'web']);
    expect(parseFolderFilterPath('  Development :Web  ')).toEqual(['development', 'web']);
  });

  it('throws on an empty segment (leading separator)', () => {
    expect(() => parseFolderFilterPath(' : Web')).toThrow();
  });

  it('throws on an empty segment (trailing separator)', () => {
    expect(() => parseFolderFilterPath('Development : ')).toThrow();
  });

  it('throws on an empty interior segment', () => {
    expect(() => parseFolderFilterPath('A : : B')).toThrow();
  });
});

describe('emitFolderPathMatch — generated predicate behavior (subtree)', () => {
  it('single-segment matches when the segment is any ancestor folder name (substring)', () => {
    const p = predicate('Development');
    expect(p(frontend)).toBe(true); // Development is a (grand)ancestor of Frontend
    expect(p(web)).toBe(true);
    expect(p(development)).toBe(true);
  });

  it('single-segment matches case-insensitively and on substrings', () => {
    expect(predicate('dev')(frontend)).toBe(true); // substring of "Development"
    expect(predicate('FRONT')(frontend)).toBe(true);
  });

  it('single-segment does NOT match a name absent from the ancestry', () => {
    expect(predicate('Personal')(frontend)).toBe(false);
  });

  it('multi-segment matches only when the full Parent:Child chain is present in order', () => {
    expect(predicate('Development : Web')(frontend)).toBe(true); // Web inside Development, above Frontend
    expect(predicate('Development : Web')(web)).toBe(true);
  });

  it('multi-segment rejects a reversed / non-existent chain', () => {
    expect(predicate('Web : Development')(frontend)).toBe(false); // "Development inside Web" — does not exist
  });

  it('excludes a null leaf (inbox task / top-level project — no parent folder)', () => {
    expect(predicate('Development')(null)).toBe(false);
  });
});

describe('emitFolderPathMatch — generated source hygiene', () => {
  it('embeds segments as JSON data, not as interpolated identifiers (injection-safe)', () => {
    // A folder path containing a quote/backslash must round-trip through JSON.stringify,
    // not break out of the literal. (nested_template_backtick_hazard discipline.)
    const expr = emitFolderPathMatch('LEAF', 'a"b');
    expect(expr).toContain(JSON.stringify('a"b'.toLowerCase()));
    // And it must still be valid, evaluable JS.
    expect(() => new Function('LEAF', `return (${expr});`)).not.toThrow();
  });

  it('does not contain a backtick (would break JXA → OmniJS template interpolation)', () => {
    expect(emitFolderPathMatch('LEAF', 'Development : Web').includes('`')).toBe(false);
  });
});
