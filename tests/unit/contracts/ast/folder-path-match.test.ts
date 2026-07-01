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
import {
  parseFolderFilterPath,
  emitFolderPathMatch,
  emitFolderExistsGuard,
  emitFolderNotFoundGuard,
  emitFolderNotFoundGuardsForFilter,
} from '../../../../src/contracts/ast/folder-path-match.js';
import { type FakeFolder, development, web, frontend } from './fake-folder-tree.js';

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

  // OMN-218: the `folders` query emits `/`-joined paths and the WRITE path accepts
  // `/`; the read filter must round-trip its own output. Accept BOTH separators.
  it('parses a `/`-joined path (the form the folders query emits)', () => {
    expect(parseFolderFilterPath('Personal/Other Games/Shop Titans')).toEqual([
      'personal',
      'other games',
      'shop titans',
    ]);
  });

  it('trims per segment around `/` regardless of spacing', () => {
    expect(parseFolderFilterPath('Development / Web')).toEqual(['development', 'web']);
  });

  it('accepts a mixed `:` and `/` path (both are separators)', () => {
    expect(parseFolderFilterPath('Personal : Other Games/Shop Titans')).toEqual([
      'personal',
      'other games',
      'shop titans',
    ]);
  });

  it('throws on an empty segment from a leading/trailing/doubled slash', () => {
    expect(() => parseFolderFilterPath('/Web')).toThrow();
    expect(() => parseFolderFilterPath('Development/')).toThrow();
    expect(() => parseFolderFilterPath('A//B')).toThrow();
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

  // OMN-218: the `:` and `/` forms of the SAME path must emit byte-identical code —
  // both surfaces (tasks + projects) inherit this emitter, so the round-trip of a
  // `/`-joined folders-query path must generate exactly the `:`-form's predicate.
  it('emits byte-identical code for the `:` and `/` forms of the same path', () => {
    expect(emitFolderPathMatch('LEAF', 'Development/Web')).toBe(emitFolderPathMatch('LEAF', 'Development : Web'));
  });

  // OMN-218 refactor guard: emitFolderExistsGuard reuses emitFolderPathMatch's per-folder
  // chain predicate, so extracting the shared helper must not change the row-matcher's
  // emitted string. Pin the exact output before/after the refactor (spec §5).
  it('emits the exact expected string for a two-segment path (refactor lock)', () => {
    expect(emitFolderPathMatch('LEAF', 'Development : Web')).toBe(
      `(() => { const segs = ["development","web"]; let a = (LEAF); while (a) { let f = a, ok = true; for (let i = segs.length - 1; i >= 0; i--) { if (!f || !((f.name || '').toLowerCase().includes(segs[i]))) { ok = false; break; } f = f.parent; } if (ok) return true; a = a.parent; } return false; })()`,
    );
  });
});

/**
 * emitFolderExistsGuard — OMN-218 fix (b). Emits an OmniJS boolean expression that is
 * `true` iff `flattenedFolders` contains at least one folder whose ancestor chain matches
 * `path` (i.e. the path RESOLVES to a real folder). Uses the SAME per-folder chain
 * predicate as emitFolderPathMatch, so a folder resolves iff a row under it could match.
 *
 * Instantiate the expression over a synthetic `flattenedFolders` array (the OmniJS global)
 * to validate runtime behavior, mirroring the emitFolderPathMatch harness above.
 */
function existsGuard(path: string): (folders: FakeFolder[]) => boolean {
  const expr = emitFolderExistsGuard(path);
  return new Function('flattenedFolders', `return (${expr});`) as (folders: FakeFolder[]) => boolean;
}

describe('emitFolderExistsGuard — generated existence check', () => {
  const allFolders = [development, web, frontend];

  it('is true when the path resolves to an existing folder (single segment)', () => {
    expect(existsGuard('Development')(allFolders)).toBe(true);
  });

  it('is true when a multi-segment path resolves', () => {
    expect(existsGuard('Development : Web')(allFolders)).toBe(true);
    expect(existsGuard('Development/Web')(allFolders)).toBe(true); // `/` form resolves too
  });

  it('is false when the path does not resolve to any folder', () => {
    expect(existsGuard('No Such Folder')(allFolders)).toBe(false);
    expect(existsGuard('Web : Development')(allFolders)).toBe(false); // reversed chain
  });

  it('is true for a leaf folder that exists even though it has no descendants', () => {
    // "empty ≠ unresolvable": a real folder with no matching rows still RESOLVES.
    expect(existsGuard('Frontend')(allFolders)).toBe(true);
  });

  it('is false against an empty folder set', () => {
    expect(existsGuard('Development')([])).toBe(false);
  });

  it('does not contain a backtick (JXA → OmniJS template safety)', () => {
    expect(emitFolderExistsGuard('Development : Web').includes('`')).toBe(false);
  });
});

/**
 * OMN-218 review round 2: a folder path nested in an OR branch must be guarded too —
 * `emitFolderNotFoundGuard` alone only ever saw the top-level key, so
 * `{ OR: [{ folder: "Typo" }, { flagged: true }] }` silently dropped the typo'd branch
 * instead of erroring. `emitFolderNotFoundGuardsForFilter` walks top-level + orBranches
 * (recursively) and emits one guard per distinct path found.
 */
describe('emitFolderNotFoundGuardsForFilter — collects folder paths across OR branches', () => {
  it('emits nothing when the filter has no folder path anywhere', () => {
    expect(emitFolderNotFoundGuardsForFilter({}, 'folder')).toBe('');
    expect(emitFolderNotFoundGuardsForFilter({ flagged: true } as any, 'folder')).toBe('');
  });

  it('emits nothing for folder:null (top-level-only) or folderTopLevel — non-string values', () => {
    expect(emitFolderNotFoundGuardsForFilter({ folder: null } as any, 'folder')).toBe('');
    expect(emitFolderNotFoundGuardsForFilter({ folderTopLevel: true } as any, 'folder')).toBe('');
  });

  it('emits one guard for a top-level string folder path', () => {
    const out = emitFolderNotFoundGuardsForFilter({ folder: 'Development' } as any, 'folder');
    expect(out).toContain('FOLDER_NOT_FOUND');
    expect(out).toBe(emitFolderNotFoundGuard('Development'));
  });

  it('emits a guard for a folder path nested in an OR branch even when absent at top level', () => {
    const out = emitFolderNotFoundGuardsForFilter(
      { orBranches: [{ folder: 'Typo Folder' }, { flagged: true }] } as any,
      'folder',
    );
    expect(out).toContain('FOLDER_NOT_FOUND');
    expect(out).toContain('Typo Folder');
  });

  it('emits guards for BOTH a top-level path and a distinct OR-branch path', () => {
    const out = emitFolderNotFoundGuardsForFilter({ folder: 'A', orBranches: [{ folder: 'B' }] } as any, 'folder');
    expect(out).toContain('"a"');
    expect(out).toContain('"b"');
  });

  it('dedupes when the same path appears at top level and in an OR branch', () => {
    const out = emitFolderNotFoundGuardsForFilter(
      { folder: 'Development', orBranches: [{ folder: 'Development' }] } as any,
      'folder',
    );
    expect((out.match(/FOLDER_NOT_FOUND/g) || []).length).toBe(1);
  });

  it('recurses into nested OR branches (OR within OR)', () => {
    const out = emitFolderNotFoundGuardsForFilter(
      { orBranches: [{ orBranches: [{ folder: 'Deeply Nested' }] }] } as any,
      'folder',
    );
    expect(out).toContain('Deeply Nested');
  });

  it('works with the projects folderName key', () => {
    const out = emitFolderNotFoundGuardsForFilter({ orBranches: [{ folderName: 'Typo' }] } as any, 'folderName');
    expect(out).toContain('Typo');
  });

  // OMN-218 /code-review high (PR #168): dedup must operate on the NORMALIZED path
  // (lowercased, segment-parsed), not the raw string — otherwise the same real folder
  // referenced via different separators/casing emits redundant guard closures.
  it('dedupes the same folder referenced via `:` and `/` separators (one guard, not two)', () => {
    const out = emitFolderNotFoundGuardsForFilter(
      { folder: 'Personal/Bills', orBranches: [{ folder: 'Personal : Bills' }] } as any,
      'folder',
    );
    expect((out.match(/FOLDER_NOT_FOUND/g) || []).length).toBe(1);
  });

  it('dedupes the same folder referenced via different casing/whitespace', () => {
    const out = emitFolderNotFoundGuardsForFilter(
      { folder: 'Personal / Bills', orBranches: [{ folder: 'PERSONAL/BILLS' }] } as any,
      'folder',
    );
    expect((out.match(/FOLDER_NOT_FOUND/g) || []).length).toBe(1);
  });

  it('still emits two guards for genuinely distinct folders', () => {
    const out = emitFolderNotFoundGuardsForFilter({ folder: 'A', orBranches: [{ folder: 'B' }] } as any, 'folder');
    expect((out.match(/FOLDER_NOT_FOUND/g) || []).length).toBe(2);
  });
});
