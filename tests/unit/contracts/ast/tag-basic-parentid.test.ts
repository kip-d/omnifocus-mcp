import { describe, it, expect } from 'vitest';
import { buildTagsScript } from '../../../../src/contracts/ast/tag-script-builder.js';
import { recoverInnerProgram } from '../../../utils/recover-bridge-program.js';

/**
 * OMN-145: basic mode tags must expose parentId so tag hierarchy is readable
 * through the MCP read seam.
 *
 * Design note (see also: tag-script-builder.ts buildBasicTagsScript):
 * Option A — add parentId unconditionally to basic mode — was chosen over an
 * opt-in mode/fields param. An opt-in flag hidden behind a param an LLM client
 * won't know to set defeats "make hierarchy reachable"; an additive parentId is
 * lower-friction and lower-API-surface.
 */
describe('buildTagsScript basic mode — parentId field (OMN-145)', () => {
  it('emits tag.parent lookup in the OmniJS program (inner script)', () => {
    const { script } = buildTagsScript({ mode: 'basic' });
    const inner = recoverInnerProgram(script);
    // Must read tag.parent to obtain the parent reference
    expect(inner).toContain('tag.parent');
  });

  it('emits parentId field in the pushed tag object', () => {
    const { script } = buildTagsScript({ mode: 'basic' });
    const inner = recoverInnerProgram(script);
    // Must push parentId key into each tag object
    expect(inner).toContain('parentId');
  });

  it('emits null for top-level tags (no parent)', () => {
    const { script } = buildTagsScript({ mode: 'basic' });
    const inner = recoverInnerProgram(script);
    // The null fallback for tags with no parent must be present
    expect(inner).toContain('null');
    // The ternary pattern: parent ? parent.id.primaryKey : null
    expect(inner).toContain('parent ? ');
  });

  it('parentId field is present whether or not a name filter is applied', () => {
    const filtered = buildTagsScript({ mode: 'basic', name: 'Home', nameOperator: 'CONTAINS' });
    const inner = recoverInnerProgram(filtered.script);
    expect(inner).toContain('parentId');
    expect(inner).toContain('tag.parent');
  });
});
