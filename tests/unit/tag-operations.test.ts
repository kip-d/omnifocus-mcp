import { describe, it, expect } from 'vitest';
import { LIST_TAGS_SCRIPT } from '../../src/omnifocus/scripts/tags/list-tags-v3.js';
import { MANAGE_TAGS_SCRIPT } from '../../src/omnifocus/scripts/tags/manage-tags.js';

describe('Tag Operations Fix Verification', () => {
  it('should use OmniJS bridge for tag property access (v3)', () => {
    // V3 uses pure OmniJS bridge - no safeGet needed
    expect(LIST_TAGS_SCRIPT).toContain('evaluateJavascript');
    expect(LIST_TAGS_SCRIPT).toContain('flattenedTags.forEach');
    expect(LIST_TAGS_SCRIPT).toContain('tag.name');
    expect(LIST_TAGS_SCRIPT).toContain('tag.id.primaryKey');
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
    const listMatches = LIST_TAGS_SCRIPT.match(returnPattern);
    const manageMatches = MANAGE_TAGS_SCRIPT.match(returnPattern);
    
    expect(listMatches).not.toBeNull();
    expect(listMatches!.length).toBeGreaterThan(0);
    expect(manageMatches).not.toBeNull();
    expect(manageMatches!.length).toBeGreaterThan(0);
  });
});