// tests/unit/contracts/ast/mutation/snippets.test.ts
import { describe, it, expect } from 'vitest';
import { SNIPPETS, collectSnippets } from '../../../../../src/contracts/ast/mutation/snippets.js';

describe('snippet registry', () => {
  it('exposes the flexible folder resolver source', () => {
    expect(SNIPPETS.resolveFolderFlexible.source).toContain('function resolveFolderFlexible');
  });
  it('collectSnippets pulls declared deps + transitive deps, deduped, in dependency order', () => {
    const out = collectSnippets(['resolveFolderFlexible']);
    expect(out).toContain('function parseFolderPath');
    expect(out).toContain('function resolveFolderPath');
    expect(out).toContain('function resolveFolderFlexible');
    expect(out.indexOf('function parseFolderPath')).toBeLessThan(out.indexOf('function resolveFolderFlexible'));
  });
  it('deduplicates a snippet requested twice', () => {
    const out = collectSnippets(['resolveFolderFlexible', 'resolveFolderFlexible']);
    expect(out.match(/function resolveFolderFlexible/g)).toHaveLength(1);
  });
});

describe('resolveProjectFlexible', () => {
  it('is registered with no deps and resolves byIdentifier then by name', () => {
    expect(SNIPPETS.resolveProjectFlexible).toBeDefined();
    expect(SNIPPETS.resolveProjectFlexible.deps).toEqual([]);
    const src = SNIPPETS.resolveProjectFlexible.source;
    expect(src).toContain('function resolveProjectFlexible');
    expect(src).toContain('Project.byIdentifier');
    expect(src).toContain('flattenedProjects');
    expect(src).toContain('return null'); // not-found is null — guard handles loudness
  });
});
