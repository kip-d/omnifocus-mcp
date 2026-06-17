import { describe, it, expect } from 'vitest';
import { PROJECT_VALIDATION, ROUND1_HELPER, round1 } from '../../../../../src/omnifocus/scripts/shared/helpers.js';

describe('round1 (TS helper)', () => {
  it('rounds to 1 decimal place and returns a number', () => {
    expect(round1(1.25)).toBe(1.3);
    expect(round1(1.24)).toBe(1.2);
    expect(round1(10)).toBe(10);
    expect(round1(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(round1(-1.25)).toBe(-1.3);
  });
});

describe('ROUND1_HELPER (injectable JS snippet)', () => {
  it('is a self-contained function definition string', () => {
    expect(ROUND1_HELPER).toContain('function round1');
    expect(ROUND1_HELPER).toContain('toFixed(1)');
    expect(ROUND1_HELPER).toContain('parseFloat');
  });

  it('matches the TS round1 implementation', () => {
    // The snippet should be evaluable in a JS context and produce
    // the same result as the TS export.
    const fn = new Function(`${ROUND1_HELPER}; return round1;`)() as (n: number) => number;
    expect(fn(1.25)).toBe(round1(1.25));
    expect(fn(0)).toBe(round1(0));
    expect(fn(10)).toBe(round1(10));
  });
});

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
