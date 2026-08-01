import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractRefs as extractRefsWithPrefixes, normalizeRef, classifyRef as classify } from './markdown-path-refs.js';

// ---- Thin bindings over the shared matcher (see markdown-path-refs.ts) ----

const PREFIXES = ['src', 'docs'];
const ALLOWED_EXT = /\.(ts|js|md|dot|json)$/;

/** Extract candidate path strings from inline code, fenced code, and markdown link targets only. */
export function extractRefs(markdown: string): string[] {
  return extractRefsWithPrefixes(markdown, PREFIXES);
}

export function classifyRef(norm: string): 'dir' | 'file' | 'malformed' {
  return classify(norm, ALLOWED_EXT);
}

export { normalizeRef };

describe('claude-md path matcher', () => {
  it('extracts only from code spans and link targets, not bare prose or link text', () => {
    const md = [
      'bare src/foo.ts in prose should be ignored',
      'inline `src/a.ts` here',
      '[docs/DOCS_MAP.md](docs/DOCS_MAP.md) link',
      '```\nsrc/b.ts\n```',
    ].join('\n');
    expect(extractRefs(md).sort()).toEqual(['docs/DOCS_MAP.md', 'src/a.ts', 'src/b.ts'].sort());
  });

  it('ignores tokens not starting src/ or docs/ (urls, dist)', () => {
    const md = 'see `node dist/index.js` and `https://modelcontextprotocol.io/specification/2025-06-18/`';
    expect(extractRefs(md)).toEqual([]);
  });

  it('normalizes leading slash to repo-root form', () => {
    expect(normalizeRef('/docs/dev/PATTERNS.md')).toBe('docs/dev/PATTERNS.md');
  });

  it('strips :NN line suffix', () => {
    expect(normalizeRef('src/x.ts:41')).toBe('src/x.ts');
    expect(normalizeRef('src/x.ts:41:7')).toBe('src/x.ts');
  });

  it('strips trailing sentence punctuation', () => {
    expect(normalizeRef('docs/dev/PATTERNS.md).')).toBe('docs/dev/PATTERNS.md');
  });

  it('classifies dir, file, malformed', () => {
    expect(classifyRef('src/tools/unified/')).toBe('dir');
    expect(classifyRef('docs/dev/x.dot')).toBe('file');
    expect(classifyRef('src/tools/unified')).toBe('malformed'); // no ext, no trailing /
  });

  it('anchors src/ and docs/ at a path-token boundary (no mid-path partial match)', () => {
    // CLAUDE.md §2 self-reference: tests/-rooted; inner docs/ must NOT partial-match.
    expect(extractRefs('`tests/unit/docs/claude-md-paths.test.ts`')).toEqual([]);
    // Mid-path src/ is not a boundary -> not matched.
    expect(extractRefs('`foo/src/bar.ts`')).toEqual([]);
    // Leading-slash boundary still matches; normalization strips the '/' later.
    expect(extractRefs('`/docs/dev/x.md`')).toEqual(['/docs/dev/x.md']);
    // Backtick boundary still works for both prefixes.
    const both = extractRefs('see `src/a.ts` and `docs/b.md`');
    expect(both).toContain('src/a.ts');
    expect(both).toContain('docs/b.md');
  });
});

describe('CLAUDE.md path references all resolve', () => {
  const root = process.cwd(); // vitest runs from repo root (verified: worktree IS the project root)

  it('every src/ and docs/ reference in CLAUDE.md resolves on disk', () => {
    const md = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    const failures: string[] = [];
    for (const raw of new Set(extractRefs(md))) {
      const norm = normalizeRef(raw);
      const kind = classifyRef(norm);
      const abs = join(root, norm);
      if (kind === 'malformed') {
        failures.push(`CLAUDE.md: malformed reference "${raw}" (no allowed extension, no trailing /)`);
      } else if (kind === 'dir') {
        if (!(existsSync(abs) && statSync(abs).isDirectory()))
          failures.push(`CLAUDE.md: directory "${norm}" does not resolve`);
      } else if (!(existsSync(abs) && statSync(abs).isFile())) {
        failures.push(`CLAUDE.md: file "${norm}" does not resolve`);
      }
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
  });
});
