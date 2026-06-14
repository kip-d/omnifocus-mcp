import { describe, it, expect } from 'vitest';
import { normalizeFilter, stripNormalizedBrand } from '../../../src/contracts/filters.js';

// OMN-177: the __normalized__ brand is an internal NormalizedTaskFilter marker.
// It must never reach user-facing metadata (filters_applied). stripNormalizedBrand
// returns a brand-free shallow copy for echo sites.
describe('OMN-177: stripNormalizedBrand', () => {
  it('removes the __normalized__ brand key from a normalized filter', () => {
    const branded = normalizeFilter({ deferBefore: '2026-12-31' });
    // sanity: it really is branded
    expect((branded as Record<string, unknown>).__normalized__).toBe(true);

    const stripped = stripNormalizedBrand(branded);

    expect(Object.keys(stripped)).not.toContain('__normalized__');
    // real filter keys survive
    expect(stripped.deferBefore).toBe('2026-12-31');
  });

  it('returns an equivalent object for a non-branded filter', () => {
    const stripped = stripNormalizedBrand({ flagged: true });
    expect(stripped).toEqual({ flagged: true });
  });

  it('does not mutate the input filter', () => {
    const branded = normalizeFilter({ flagged: true });
    stripNormalizedBrand(branded);
    expect((branded as Record<string, unknown>).__normalized__).toBe(true);
  });
});
