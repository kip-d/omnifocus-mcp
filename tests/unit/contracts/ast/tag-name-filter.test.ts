import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../../../src/contracts/ast/tag-script-builder.js';

/**
 * OMN-170 S2: tags-by-name filtering on the basic mode (the only mode the read
 * seam uses). Tests go through the PUBLIC buildTagsScript — buildBasicTagsScript
 * is module-private and not exported.
 */
describe('buildTagsScript basic mode — name filter (OMN-170 S2)', () => {
  it('unfiltered basic mode is structurally intact (not byte-pinned)', () => {
    const { script } = buildTagsScript({ mode: 'basic', includeEmpty: true, sortBy: 'name' });
    expect(script).toContain('flattenedTags.forEach');
    expect(script).toContain("mode: 'basic'");
    expect(script).toContain('total:');
    // matchesName is the no-op `true` predicate when unfiltered
    expect(script).toContain('return true;');
  });

  it('name CONTAINS → case-insensitive substring predicate on tag.name', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: 'Home', nameOperator: 'CONTAINS' });
    expect(script).toContain('(tag.name || \'\').toLowerCase().includes("home")');
  });

  it('name MATCHES → safe RegExp predicate (OMN-149 pattern)', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: '^Home$', nameOperator: 'MATCHES' });
    expect(script).toContain("new RegExp(\"^Home$\", 'i').test((tag.name || ''))");
  });

  it('emits total_matched separately from total (OMN-154 count honesty)', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: 'X', nameOperator: 'CONTAINS' });
    expect(script).toContain('totalMatched++');
    expect(script).toContain('total_matched:');
  });

  it('backtick-bearing name does not leave a raw backtick in the inner template', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: 'a`b', nameOperator: 'CONTAINS' });
    // The whole inner OmniJS source is escapeTemplateString-wrapped, so any
    // backtick in the term is escaped (\`) and cannot terminate the template.
    expect(script).not.toMatch(/includes\("a`b"/);
    expect(script).toContain('a\\`b');
  });

  it('filterDescription reflects the name filter', () => {
    const gen = buildTagsScript({ mode: 'basic', name: 'Home', nameOperator: 'CONTAINS' });
    expect(gen.filterDescription).toContain('Home');
    expect(gen.isEmptyFilter).toBe(false);
    const unfiltered = buildTagsScript({ mode: 'basic' });
    expect(unfiltered.isEmptyFilter).toBe(true);
  });
});
