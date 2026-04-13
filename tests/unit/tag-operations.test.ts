import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../src/contracts/ast/tag-script-builder.js';
import { buildMergeTagsScript, buildCreateTagScript } from '../../src/contracts/ast/tag-mutation-script-builder.js';

describe('Tag Operations Fix Verification', () => {
  it('should use OmniJS bridge for tag property access (AST)', () => {
    // AST builder uses pure OmniJS bridge - no safeGet needed
    const { script } = buildTagsScript({ mode: 'full' });
    expect(script).toContain('evaluateJavascript');
    expect(script).toContain('flattenedTags.forEach');
    expect(script).toContain('tag.name');
    expect(script).toContain('tag.id.primaryKey');
  });

  it('should use OmniJS bridge for merge tag retagging', async () => {
    const { script } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });
    // Merge must use evaluateJavascript (OmniJS bridge) — JXA tag mutations silently fail
    expect(script).toContain('app.evaluateJavascript(mergeScript)');

    // Should use singular OmniJS methods inside the bridge
    expect(script).toContain('task.removeTag(srcTag)');
    expect(script).toContain('task.addTag(tgtTag)');
  });

  it('should not use JXA plural tag methods for merge', async () => {
    const { script } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });
    // JXA plural methods (addTags/removeTags) silently fail — must not be used
    expect(script).not.toContain('task.removeTags(');
    expect(script).not.toContain('task.addTags(');
  });

  it('should return JSON stringified results', async () => {
    // Verify all return statements use JSON.stringify
    const returnPattern = /return JSON\.stringify\(/g;
    const { script: listScript } = buildTagsScript({ mode: 'full' });
    const { script: mergeScript } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });
    const listMatches = listScript.match(returnPattern);
    const mergeMatches = mergeScript.match(returnPattern);

    expect(listMatches).not.toBeNull();
    expect(listMatches!.length).toBeGreaterThan(0);
    expect(mergeMatches).not.toBeNull();
    expect(mergeMatches!.length).toBeGreaterThan(0);
  });
});

describe('Tag mutation builders - nested tag hierarchy syntax', () => {
  it('should contain parseTagPath helper function', async () => {
    const { script } = await buildCreateTagScript({ tagName: 'Test' });
    expect(script).toContain('function parseTagPath(');
  });

  it('should use OmniJS bridge for path tag creation', async () => {
    const { script } = await buildCreateTagScript({ tagName: 'Test' });
    // Path creation uses evaluateJavascript with new Tag(name, parent)
    expect(script).toContain('new Tag(segments[i], parent)');
  });

  it('should check for path syntax conflict with parentTagName', async () => {
    const { script } = await buildCreateTagScript({ tagName: 'Test' });
    expect(script).toContain('Cannot use path syntax');
  });

  it('should handle path syntax in create action', async () => {
    const { script } = await buildCreateTagScript({ tagName: 'Test' });
    expect(script).toContain('parseTagPath(tagName)');
  });
});
