import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the progressive-disclosure link web under docs/skills/**.
 *
 * A skill split into SKILL.md + references/*.md routes by naming files. A renamed or
 * mistyped target fails OPEN: the model reads nothing and silently answers from general
 * knowledge instead of the project's conventions. Nothing else in CI catches that —
 * claude-md-paths.test.ts scans only the repo-root CLAUDE.md.
 */

// ---- Pure helpers (exported for fixture tests) ----

/**
 * Extract `references/...` and `docs/...` tokens from inline code, fenced code, and
 * markdown link targets only — never bare prose, which produces false positives on
 * sentences that merely discuss a filename.
 */
export function extractSkillRefs(markdown: string): string[] {
  const spans: string[] = [];
  let rest = markdown.replace(/```[\s\S]*?```/g, (m) => {
    spans.push(m);
    return '';
  });
  for (const m of rest.matchAll(/`[^`\n]+`/g)) spans.push(m[0]);
  for (const m of markdown.matchAll(/\]\(([^)]+)\)/g)) spans.push(m[1]);
  const refs: string[] = [];
  for (const span of spans) {
    for (const m of span.matchAll(/(?<=^|[\s`([\]])\/?(?:references|docs)\/[^\s`)]*/g)) refs.push(m[0]);
  }
  return refs;
}

/** Strip leading '/', trailing :NN[:CC], and trailing sentence punctuation. */
export function normalizeRef(token: string): string {
  return token
    .replace(/^\//, '')
    .replace(/:\d+(?::\d+)?$/, '')
    .replace(/[.,);:]+$/, '');
}

/** 'dir' | 'file' | 'malformed' */
export function classifyRef(norm: string): 'dir' | 'file' | 'malformed' {
  if (norm.endsWith('/')) return 'dir';
  if (/\.md$/.test(norm)) return 'file';
  return 'malformed';
}

/** `references/` resolves against the skill dir; `docs/` against the repo root. */
export function resolveBase(norm: string, root: string, skillDir: string): string {
  return norm.startsWith('docs/') ? root : skillDir;
}

describe('skill reference matcher', () => {
  it('extracts only from code spans and link targets, not bare prose', () => {
    const md = [
      'bare references/foo.md in prose should be ignored',
      'inline `references/a.md` here',
      '[the GTD file](references/b.md) link',
      '```\nreferences/c.md\n```',
    ].join('\n');
    expect(extractSkillRefs(md).sort()).toEqual(['references/a.md', 'references/b.md', 'references/c.md']);
  });

  it('anchors at a path-token boundary (no mid-path partial match)', () => {
    expect(extractSkillRefs('`some/nested/references/x.md`')).toEqual([]);
    expect(extractSkillRefs('`/references/x.md`')).toEqual(['/references/x.md']);
  });

  it('matches a bare directory mention', () => {
    expect(extractSkillRefs('detail lives in `references/`')).toEqual(['references/']);
  });

  it('classifies dir, file, malformed', () => {
    expect(classifyRef('references/')).toBe('dir');
    expect(classifyRef('references/task-creation.md')).toBe('file');
    expect(classifyRef('references/task-creation')).toBe('malformed'); // no ext, no trailing /
  });

  it('routes docs/ to the repo root and references/ to the skill dir', () => {
    expect(resolveBase('docs/dev/PATTERNS.md', '/repo', '/repo/docs/skills/x')).toBe('/repo');
    expect(resolveBase('references/a.md', '/repo', '/repo/docs/skills/x')).toBe('/repo/docs/skills/x');
  });
});

// ---- Live checks over every installed skill ----

const root = process.cwd();
const skillsRoot = join(root, 'docs', 'skills');

/** Every directory under docs/skills/ that actually carries a SKILL.md. */
function discoverSkills(): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(skillsRoot, e.name, 'SKILL.md')))
    .map((e) => e.name);
}

/** SKILL.md plus every references/*.md, as paths relative to the skill dir. */
function skillMarkdownFiles(skillDir: string): string[] {
  const files = ['SKILL.md'];
  const refsDir = join(skillDir, 'references');
  if (existsSync(refsDir)) {
    for (const f of readdirSync(refsDir).filter((f) => f.endsWith('.md'))) files.push(join('references', f));
  }
  return files;
}

const skills = discoverSkills();

describe('docs/skills reference paths all resolve', () => {
  it('finds at least one skill to check', () => {
    // Guards against the whole suite passing vacuously if the layout ever moves.
    expect(skills.length).toBeGreaterThan(0);
  });

  it.each(skills)('%s: every reference in SKILL.md and references/*.md resolves', (skill) => {
    const skillDir = join(skillsRoot, skill);
    const failures: string[] = [];
    for (const rel of skillMarkdownFiles(skillDir)) {
      const md = readFileSync(join(skillDir, rel), 'utf8');
      for (const raw of new Set(extractSkillRefs(md))) {
        const norm = normalizeRef(raw);
        const kind = classifyRef(norm);
        const abs = join(resolveBase(norm, root, skillDir), norm);
        if (kind === 'malformed') {
          failures.push(`${skill}/${rel}: malformed reference "${raw}" (no .md extension, no trailing /)`);
        } else if (kind === 'dir') {
          if (!(existsSync(abs) && statSync(abs).isDirectory()))
            failures.push(`${skill}/${rel}: directory "${norm}" does not resolve`);
        } else if (!(existsSync(abs) && statSync(abs).isFile())) {
          failures.push(`${skill}/${rel}: file "${norm}" does not resolve`);
        }
      }
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
  });

  it.each(skills)('%s: every references/*.md file is reachable from SKILL.md', (skill) => {
    const skillDir = join(skillsRoot, skill);
    const refsDir = join(skillDir, 'references');
    if (!existsSync(refsDir)) return; // unsplit skill — nothing to orphan

    // Reachability, not just direct linkage: a file may be introduced by a sibling
    // reference file ("also read X.md") rather than by the routing table itself.
    const linked = new Set<string>();
    const queue = ['SKILL.md'];
    while (queue.length > 0) {
      const rel = queue.shift() as string;
      const md = readFileSync(join(skillDir, rel), 'utf8');
      for (const raw of new Set(extractSkillRefs(md))) {
        const norm = normalizeRef(raw);
        if (classifyRef(norm) !== 'file' || !norm.startsWith('references/')) continue;
        if (linked.has(norm)) continue;
        linked.add(norm);
        if (existsSync(join(skillDir, norm))) queue.push(norm);
      }
    }

    const orphans = readdirSync(refsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => `references/${f}`)
      .filter((rel) => !linked.has(rel));
    expect(orphans, `\nunreachable from SKILL.md: ${orphans.join(', ')}\n`).toEqual([]);
  });
});
