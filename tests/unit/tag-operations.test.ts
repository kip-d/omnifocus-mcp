import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../src/contracts/ast/tag-script-builder.js';
import { MANAGE_TAGS_SCRIPT } from '../../src/omnifocus/scripts/tags/manage-tags.js';

describe('Tag Operations Fix Verification', () => {
  it('should use OmniJS bridge for tag property access (AST)', () => {
    // AST builder uses pure OmniJS bridge - no safeGet needed
    const { script } = buildTagsScript({ mode: 'full' });
    expect(script).toContain('evaluateJavascript');
    expect(script).toContain('flattenedTags.forEach');
    expect(script).toContain('tag.name');
    expect(script).toContain('tag.id.primaryKey');
  });

  it('should use plural methods for tag manipulation', () => {
    // Verify we're using the correct plural methods
    expect(MANAGE_TAGS_SCRIPT).toContain('task.removeTags([sourceTag])');
    expect(MANAGE_TAGS_SCRIPT).toContain('task.addTags([targetTagObj])');

    // Should not contain singular methods
    expect(MANAGE_TAGS_SCRIPT).not.toContain('task.removeTag(');
    expect(MANAGE_TAGS_SCRIPT).not.toContain('task.addTag(');
  });

  it('should properly handle array conversions', () => {
    // Check that we're passing arrays to add/remove methods
    const addTagsPattern = /task\.addTags\(\[[^\]]+\]\)/;
    const removeTagsPattern = /task\.removeTags\(\[[^\]]+\]\)/;

    expect(MANAGE_TAGS_SCRIPT).toMatch(addTagsPattern);
    expect(MANAGE_TAGS_SCRIPT).toMatch(removeTagsPattern);
  });

  it('should return JSON stringified results', () => {
    // Verify all return statements use JSON.stringify
    const returnPattern = /return JSON\.stringify\(/g;
    const { script: listScript } = buildTagsScript({ mode: 'full' });
    const listMatches = listScript.match(returnPattern);
    const manageMatches = MANAGE_TAGS_SCRIPT.match(returnPattern);

    expect(listMatches).not.toBeNull();
    expect(listMatches!.length).toBeGreaterThan(0);
    expect(manageMatches).not.toBeNull();
    expect(manageMatches!.length).toBeGreaterThan(0);
  });
});
