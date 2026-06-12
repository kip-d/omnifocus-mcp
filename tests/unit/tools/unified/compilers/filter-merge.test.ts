import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  mergeConflictChecked,
  emptyOperatorError,
  filterDeepEqual,
} from '../../../../../src/tools/unified/compilers/filter-merge.js';

describe('filterDeepEqual', () => {
  it('scalars, arrays, nested objects', () => {
    expect(filterDeepEqual(true, true)).toBe(true);
    expect(filterDeepEqual(['active'], ['active'])).toBe(true);
    expect(filterDeepEqual(['active'], ['done'])).toBe(false);
    expect(filterDeepEqual(['a', 'b'], ['b', 'a'])).toBe(false); // order-sensitive: tag order is semantic input
    expect(filterDeepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(filterDeepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('mergeConflictChecked', () => {
  it('merges disjoint keys from multiple sources', () => {
    const merged = mergeConflictChecked([
      { origin: 'filters', filter: { flagged: true } },
      { origin: 'AND[0]', filter: { completed: false } },
    ]);
    expect(merged).toEqual({ flagged: true, completed: false });
  });

  it('deep-equal duplicate assignments merge silently', () => {
    const merged = mergeConflictChecked([
      { origin: 'filters', filter: { projectStatus: ['active'] } },
      { origin: 'AND[0]', filter: { projectStatus: ['active'] } },
    ]);
    expect(merged).toEqual({ projectStatus: ['active'] });
  });

  it('conflicting values throw ZodError naming the INPUT key and both values', () => {
    expect(() =>
      mergeConflictChecked([
        { origin: 'AND[0]', filter: { completed: false, projectStatus: ['active'] } },
        { origin: 'AND[1]', filter: { completed: true, projectStatus: ['done'] } },
      ]),
    ).toThrowError(z.ZodError);
    try {
      mergeConflictChecked([
        { origin: 'AND[0]', filter: { completed: false } },
        { origin: 'AND[1]', filter: { completed: true } },
      ]);
      expect.unreachable('should have thrown');
    } catch (e) {
      const issue = (e as z.ZodError).issues[0];
      expect(issue.path).toEqual(['query', 'filters']);
      // reverse-mapped vocabulary: internal `completed` names status/completed input keys
      expect(issue.message).toContain('status/completed');
      expect(issue.message).toContain('AND[0]');
      expect(issue.message).toContain('AND[1]');
      expect(issue.message).toContain('false');
      expect(issue.message).toContain('true');
      expect(issue.message).toContain('OR'); // steers to OR for alternatives
    }
  });

  it('undefined values never participate (no false conflicts)', () => {
    const merged = mergeConflictChecked([
      { origin: 'filters', filter: { flagged: undefined, name: 'x' } },
      { origin: 'AND[0]', filter: { flagged: true } },
    ]);
    expect(merged).toEqual({ name: 'x', flagged: true });
  });
});

describe('emptyOperatorError', () => {
  it('produces a ZodError at the operator path with steering', () => {
    const err = emptyOperatorError('OR');
    expect(err).toBeInstanceOf(z.ZodError);
    expect(err.issues[0].path).toEqual(['query', 'filters', 'OR']);
    expect(err.issues[0].message).toMatch(/supply at least one condition|omit the operator/i);
  });
});
