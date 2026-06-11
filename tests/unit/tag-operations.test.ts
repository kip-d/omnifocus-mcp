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
    // The whole merge program crosses to OmniJS via the launcher's
    // evaluateJavascript call — JXA tag mutations silently fail
    expect(script).toContain('evaluateJavascript(');

    // Singular OmniJS methods against the resolved tag bindings (mergeRetag node)
    expect(script).toContain('task.removeTag(_src)');
    expect(script).toContain('task.addTag(_tgt)');
  });

  it('should not use JXA plural tag methods for merge', async () => {
    const { script } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });
    // JXA plural methods (addTags/removeTags) silently fail — must not be used
    expect(script).not.toContain('task.removeTags(');
    expect(script).not.toContain('task.addTags(');
  });

  it('should contain zero backticks — the OMN-111/113 nested-template injection class is structurally dead', async () => {
    // The legacy builders interpolated user data into nested-backtick
    // evaluateJavascript islands (bit twice: OMN-111, OMN-113). The emitted
    // script now crosses the JXA→OmniJS boundary as ONE JSON.stringify'd
    // literal, so a single stray backtick anywhere is a regression.
    const { script: mergeScript } = await buildMergeTagsScript({ tagName: 'src', targetTag: 'tgt' });
    expect(mergeScript).not.toContain('`');

    const { script: createScript } = await buildCreateTagScript({ tagName: 'A : B' });
    expect(createScript).not.toContain('`');
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
  it('should lower a path-syntax create to the createTagPath snippet', async () => {
    // ' : ' paths are split at BUILD time; the emitted program calls the
    // find-or-create walk. (wrapInLauncher JSON-escapes the program, so the
    // segments array appears with escaped quotes — assert the quote-free call.)
    const { script } = await buildCreateTagScript({ tagName: 'A : B' });
    expect(script).toContain('createTagPath(');
  });

  it('should not include the path walk for a flat-name create', async () => {
    const { script } = await buildCreateTagScript({ tagName: 'Test' });
    expect(script).not.toContain('createTagPath(');
  });

  it('should emit a constant error envelope for path syntax combined with parentTagName', async () => {
    const { script } = await buildCreateTagScript({ tagName: 'A : B', parentTagName: 'P' });
    expect(script).toContain(
      "Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both.",
    );
  });
});
