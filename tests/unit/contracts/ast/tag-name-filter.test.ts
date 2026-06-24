import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../../../src/contracts/ast/tag-script-builder.js';
import { recoverInnerProgram } from '../../../utils/recover-bridge-program.js';

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
    // OMN-129: assert on the recovered (decoded) program where quotes are unescaped.
    expect(recoverInnerProgram(script)).toContain('(tag.name || \'\').toLowerCase().includes("home")');
  });

  it('name MATCHES → safe RegExp predicate (OMN-149 pattern)', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: '^Home$', nameOperator: 'MATCHES' });
    expect(recoverInnerProgram(script)).toContain("new RegExp(\"^Home$\", 'i').test((tag.name || ''))");
  });

  it('emits total_matched separately from total (OMN-154 count honesty)', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: 'X', nameOperator: 'CONTAINS' });
    expect(script).toContain('totalMatched++');
    expect(script).toContain('total_matched:');
  });

  it('backtick-bearing name rides safely across the JSON.stringify boundary (OMN-129)', () => {
    const { script } = buildTagsScript({ mode: 'basic', name: 'a`b', nameOperator: 'CONTAINS' });
    // OMN-129: the program crosses as a JSON string literal, so a backtick in the
    // term is inert (it lives inside an OmniJS double-quoted string). The whole
    // script and the recovered program both parse; the term rides as a plain value.
    expect(() => new Function(script)).not.toThrow();
    const inner = recoverInnerProgram(script);
    expect(() => new Function(inner)).not.toThrow();
    expect(inner).toContain('includes("a`b")');
  });

  // OMN-214: tagNamePredicate now delegates to the canonical folderTextCondition.
  // The exact-output pins above (CONTAINS line ~23 / MATCHES line ~28) already
  // characterize the tag emitter byte-for-byte, and the sibling folder/project
  // pins do the same on their surfaces — so a strategy change applied to the
  // shared emitter without updating a surface fails that surface's pin. No
  // separate "delegates to folderTextCondition" assertion is added: once tag
  // routes through the shared emitter, any tag-output == emitter-output check is
  // tautological, and a source-structure test is not how we verify behavior.

  it('filterDescription reflects the name filter', () => {
    const gen = buildTagsScript({ mode: 'basic', name: 'Home', nameOperator: 'CONTAINS' });
    expect(gen.filterDescription).toContain('Home');
    expect(gen.isEmptyFilter).toBe(false);
    const unfiltered = buildTagsScript({ mode: 'basic' });
    expect(unfiltered.isEmptyFilter).toBe(true);
  });
});
