// Architecture test: mechanically enforce byIdentifier-first object resolution (OMN-240).
//
// Bug class: JXA `task.id()` / `project.id()` and OmniJS `task.id.primaryKey` are
// DIFFERENT accessors that can return DIFFERENT values for the same conceptual
// object — for a project, JXA's `.id()` returns the ROOT TASK's id, not the
// project-level id that OmniJS's `id.primaryKey` uses. Commit 33f0217 was a real
// silent-failure incident from this: `buildCompleteScript` looked up a project by
// comparing JXA `.id() === targetId`, which could never match, so the lookup
// always failed — but the outer script still returned a hardcoded
// `completed: true`, reporting success for a mutation that never happened.
//
// The fix pattern (resolve mutation targets via OmniJS `Task.byIdentifier` /
// `Project.byIdentifier` / `Folder.byIdentifier`, never via JXA `.id()` equality
// or bare name matching) is documented in docs/dev/JXA-VS-OMNIJS-PATTERNS.md and
// followed as convention throughout src/contracts/ast/ and
// src/omnifocus/scripts/, but nothing previously enforced it mechanically — a new
// mutation path could reintroduce the exact 33f0217 shape and nothing would catch
// it before it shipped. This test closes that gap (OMN-240).
//
// Two independent guards, each targeting one half of the bug class:
//
//   1. `.id() ===` / `==` / `!==` / `!=` — a JXA-style id() call used in an
//      equality comparison. This is the literal 33f0217 shape: JXA `.id()` used
//      to identify an object by comparison instead of an OmniJS
//      `*.byIdentifier()` lookup. There is no legitimate use of this pattern
//      anywhere in the generated-script sources today (verified by grep before
//      writing this test), so it is banned with NO allowlist.
//
//   2. Bare name-equality resolution of a "target"-shaped variable
//      (`.name === target`) with no `byIdentifier(` call anywhere earlier in the
//      same file. Name-based fallback resolution is legitimate ONLY as a
//      fallback after an id-based lookup has already been attempted (e.g.
//      `resolveProjectFlexible` in mutation/snippets.ts: try
//      `Project.byIdentifier(target)` first, fall back to a name scan only if
//      that returns null). A file that resolves a target purely by name with no
//      byIdentifier attempt anywhere is exactly the "name-based target
//      resolution where an ID is available" shape OMN-240 flags.
//
// Self-test: a fixture string modeled on a NEW mutation path resolving a project
// via JXA `.id() ===` (the 33f0217 shape, reintroduced) must be flagged by guard
// 1. A fixture resolving a target purely by name with no byIdentifier attempt
// must be flagged by guard 2. These pin the regression this test exists to catch.
//
// SCOPE CAVEAT: guard 2 is a file-level heuristic ("is there a byIdentifier(
// call anywhere in this file"), not a true per-function/per-resolution-path
// check — a large file that legitimately uses byIdentifier() for one resolution
// path could theoretically mask an unguarded bare-name resolution added
// elsewhere in the same file. Tighten to a function-scoped check only if a real
// violation slips through this way in practice; a full AST-scoped check is more
// machinery than the current file sizes and structure justify.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../../../');

const SCAN_DIRS = ['src/contracts/ast', 'src/omnifocus/scripts'];

// Strip comments before scanning, matching the convention in
// schema-impl-parity.test.ts — avoids phantom matches inside explanatory
// comments (like the ones in this very file) being mistaken for real code.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

interface ScannedFile {
  relPath: string;
  raw: string;
  stripped: string;
}

const scannedFiles: ScannedFile[] = SCAN_DIRS.flatMap((dir) =>
  walk(path.join(REPO_ROOT, dir)).map((abs) => {
    const raw = readFileSync(abs, 'utf8');
    return { relPath: path.relative(REPO_ROOT, abs), raw, stripped: stripComments(raw) };
  }),
);

// -----------------------------------------------------------------------------
// Guard 1: JXA `.id()` used in an equality comparison — the literal 33f0217
// shape. No allowlist: grepping the full src/ tree before writing this test
// found zero legitimate uses of this pattern (JXA reads use `.id()` on its own,
// e.g. to construct a return value; equality comparison against an id is always
// an OmniJS `*.byIdentifier()` job).
// -----------------------------------------------------------------------------

const JXA_ID_EQUALITY_PATTERN = /\.id\(\)\s*(===|==|!==|!=)/;

describe('Guard: JXA .id() equality comparison is banned (33f0217 class, OMN-240)', () => {
  it('guard pattern actually matches a fixture reproducing the 33f0217 shape (self-test)', () => {
    const fixture = `
      function buildEvilCompleteScript(target) {
        const items = doc.flattenedProjects();
        for (let i = 0; i < items.length; i++) {
          if (items[i].id() === target) {
            return items[i];
          }
        }
      }
    `;
    expect(JXA_ID_EQUALITY_PATTERN.test(fixture)).toBe(true);
  });

  it('guard pattern does not fire on legitimate JXA .id() reads (no false positive)', () => {
    const fixture = `
      const folderId = folders[i].id();
      return JSON.stringify({ folderId: folderId });
    `;
    expect(JXA_ID_EQUALITY_PATTERN.test(fixture)).toBe(false);
  });

  for (const file of scannedFiles) {
    it(`${file.relPath} contains no JXA .id() equality comparison`, () => {
      const match = JXA_ID_EQUALITY_PATTERN.exec(file.stripped);
      expect(
        match,
        `${file.relPath} compares JXA .id() by equality (\`${match?.[0]}\`) — this is the 33f0217 bug shape: ` +
          `JXA .id() and OmniJS id.primaryKey can disagree for the same object (project.id() returns the root ` +
          `task's id, not the project id). Resolve the target via Task.byIdentifier / Project.byIdentifier / ` +
          `Folder.byIdentifier instead.`,
      ).toBeNull();
    });
  }
});

// -----------------------------------------------------------------------------
// Guard 2: bare name-equality resolution of a "target" variable, unguarded by
// any byIdentifier() attempt in the same file. Legitimate uses (verified by
// reading every match before writing this test) all try *.byIdentifier(target)
// first and only fall back to a name scan when that returns null/undefined —
// see resolveFolderFlexible / resolveProjectFlexible in
// src/contracts/ast/mutation/snippets.ts, emitProjectComparison in
// src/contracts/ast/emitters/omnijs.ts, and validateProject in
// src/omnifocus/scripts/shared/helpers.ts. None of those needs an allowlist
// entry because each file DOES contain a byIdentifier( call — the guard checks
// for that call's presence, not its correctness.
// -----------------------------------------------------------------------------

const BARE_NAME_TARGET_PATTERN = /\.name\s*===\s*target\b/;
const BY_NAME_CALL_PATTERN = /\bbyName\(/;
const BY_IDENTIFIER_PATTERN = /\bbyIdentifier\(/;

describe('Guard: unguarded name-based target resolution is banned (OMN-240)', () => {
  it('guard fires on a target resolved purely by name with no byIdentifier attempt (self-test)', () => {
    const fixture = `
      function resolveTargetProjectByNameOnly(target) {
        var found = flattenedProjects.filter(function (p) { return p.name === target; });
        return found[0];
      }
    `;
    const hasNameResolution = BARE_NAME_TARGET_PATTERN.test(fixture) || BY_NAME_CALL_PATTERN.test(fixture);
    const hasByIdentifierGuard = BY_IDENTIFIER_PATTERN.test(fixture);
    expect(hasNameResolution).toBe(true);
    expect(hasByIdentifierGuard).toBe(false);
  });

  it('guard does not fire when byIdentifier is attempted first (no false positive)', () => {
    const fixture = `
      function resolveProjectFlexible(target) {
        var byId = Project.byIdentifier(target);
        if (byId) return byId;
        for (var i = 0; i < flattenedProjects.length; i++) {
          if (flattenedProjects[i].name === target) return flattenedProjects[i];
        }
        return null;
      }
    `;
    const hasNameResolution = BARE_NAME_TARGET_PATTERN.test(fixture) || BY_NAME_CALL_PATTERN.test(fixture);
    const hasByIdentifierGuard = BY_IDENTIFIER_PATTERN.test(fixture);
    // A real violation only exists if name-resolution fires WITHOUT the guard.
    expect(hasNameResolution && !hasByIdentifierGuard).toBe(false);
  });

  for (const file of scannedFiles) {
    const hasNameResolution = BARE_NAME_TARGET_PATTERN.test(file.stripped) || BY_NAME_CALL_PATTERN.test(file.stripped);
    if (!hasNameResolution) continue; // nothing to guard in this file

    it(`${file.relPath} guards its target-by-name resolution with a byIdentifier attempt`, () => {
      expect(
        BY_IDENTIFIER_PATTERN.test(file.stripped),
        `${file.relPath} resolves a "target" by bare name equality (or byName()) but never attempts ` +
          `*.byIdentifier() anywhere in the file. Name-based resolution is only safe as a FALLBACK after an ` +
          `id-based lookup — resolving a mutation target by name alone reopens the class of bug fixed in 33f0217 ` +
          `(silently resolving/operating on the wrong object, or none, while reporting success).`,
      ).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------------
// Sanity guard: the scan must actually find files, or every test above passes
// vacuously (paths moved, extension changed, etc. — the OMN-54 empty-universe
// failure mode from schema-impl-parity.test.ts, same shape here).
// -----------------------------------------------------------------------------

describe('Sanity: the byIdentifier-enforcement scan is non-vacuous', () => {
  it('found at least one .ts file under each scanned directory', () => {
    for (const dir of SCAN_DIRS) {
      const count = scannedFiles.filter((f) => f.relPath.startsWith(dir)).length;
      expect(count, `no .ts files found under ${dir} — did the directory move?`).toBeGreaterThan(0);
    }
  });

  it('at least one file exercises the byIdentifier-guarded name-fallback pattern (guard 2 is reachable)', () => {
    const reachable = scannedFiles.some(
      (f) => BARE_NAME_TARGET_PATTERN.test(f.stripped) || BY_NAME_CALL_PATTERN.test(f.stripped),
    );
    expect(reachable, 'no file matched the name-fallback pattern — guard 2 would pass vacuously').toBe(true);
  });
});
