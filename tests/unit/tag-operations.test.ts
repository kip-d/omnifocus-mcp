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

  it('should use OmniJS bridge for merge tag retagging', () => {
    // Merge must use evaluateJavascript (OmniJS bridge) — JXA tag mutations silently fail
    expect(MANAGE_TAGS_SCRIPT).toContain('app.evaluateJavascript(mergeScript)');

    // Should use singular OmniJS methods inside the bridge
    expect(MANAGE_TAGS_SCRIPT).toContain('task.removeTag(srcTag)');
    expect(MANAGE_TAGS_SCRIPT).toContain('task.addTag(tgtTag)');
  });

  it('should not use JXA plural tag methods for merge', () => {
    // JXA plural methods (addTags/removeTags) silently fail — must not be used
    expect(MANAGE_TAGS_SCRIPT).not.toContain('task.removeTags(');
    expect(MANAGE_TAGS_SCRIPT).not.toContain('task.addTags(');
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

describe('MANAGE_TAGS_SCRIPT - nested tag hierarchy syntax', () => {
  it('should contain parseTagPath helper function', () => {
    expect(MANAGE_TAGS_SCRIPT).toContain('function parseTagPath(');
  });

  it('should use OmniJS bridge for path tag creation', () => {
    // Path creation uses evaluateJavascript with new Tag(name, parent)
    expect(MANAGE_TAGS_SCRIPT).toContain('new Tag(segments[i], parent)');
  });

  it('should check for path syntax conflict with parentTagName', () => {
    expect(MANAGE_TAGS_SCRIPT).toContain('Cannot use path syntax');
  });

  it('should handle path syntax in create action', () => {
    expect(MANAGE_TAGS_SCRIPT).toContain('parseTagPath(tagName)');
  });
});
