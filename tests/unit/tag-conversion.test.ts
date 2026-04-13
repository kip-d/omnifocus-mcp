import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../src/contracts/ast/tag-script-builder.js';
import { buildMergeTagsScript } from '../../src/contracts/ast/tag-mutation-script-builder.js';

describe('Tag Type Conversion Issues', () => {
  it('should check for array/object conversion patterns in tag scripts', async () => {
    const { script: LIST_TAGS_SCRIPT } = buildTagsScript({ mode: 'full' });
    const { script: MERGE_SCRIPT } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });

    // Neither script should use JXA plural tag methods (they silently fail)
    expect(LIST_TAGS_SCRIPT).not.toContain('.addTags([');
    expect(LIST_TAGS_SCRIPT).not.toContain('.removeTags([');
    expect(MERGE_SCRIPT).not.toContain('.addTags([');
    expect(MERGE_SCRIPT).not.toContain('.removeTags([');
  });

  it('should verify tag array handling patterns', async () => {
    // AST builder uses OmniJS bridge - check for bridge patterns
    const { script: LIST_TAGS_SCRIPT } = buildTagsScript({ mode: 'full', includeUsageStats: true });
    expect(LIST_TAGS_SCRIPT).toContain('flattenedTags.forEach');
    expect(LIST_TAGS_SCRIPT).toContain('task.tags');

    // Merge uses OmniJS bridge with singular methods (JXA plural methods silently fail)
    const { script: MERGE_SCRIPT } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });
    expect(MERGE_SCRIPT).toContain('task.addTag(');
    expect(MERGE_SCRIPT).toContain('task.removeTag(');
  });

  it('should use JSON.stringify for all return values', async () => {
    const { script: LIST_TAGS_SCRIPT } = buildTagsScript({ mode: 'full' });
    const { script: MERGE_SCRIPT } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });

    const returnPattern = /return JSON\.stringify\(/g;
    expect(LIST_TAGS_SCRIPT.match(returnPattern)!.length).toBeGreaterThan(0);
    expect(MERGE_SCRIPT.match(returnPattern)!.length).toBeGreaterThan(0);
  });
});
