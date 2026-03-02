import { describe, it, expect } from 'vitest';
import { PROJECT_VALIDATION } from '../../../../../src/omnifocus/scripts/shared/helpers.js';

describe('PROJECT_VALIDATION', () => {
  it('uses OmniJS bridge with Project.byIdentifier instead of JXA .id()', () => {
    // Should use OmniJS bridge for O(1) lookup by id.primaryKey
    expect(PROJECT_VALIDATION).toContain('Project.byIdentifier');
    // Should NOT use JXA .id() which returns a different ID format
    expect(PROJECT_VALIDATION).not.toMatch(/projects\[i\]\.id\(\)/);
  });

  it('includes name fallback for robustness', () => {
    // Should fall back to name matching if byIdentifier doesn't find it
    expect(PROJECT_VALIDATION).toContain('.name');
  });

  it('preserves the validateProject function signature', () => {
    // The function must keep the same (projectId, doc) signature
    expect(PROJECT_VALIDATION).toMatch(/function validateProject\(projectId,\s*doc\)/);
  });
});
