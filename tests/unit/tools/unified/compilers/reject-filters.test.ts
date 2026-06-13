import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  transformTagFilters,
  transformFolderFilters,
  transformPerspectiveFilters,
} from '../../../../../src/tools/unified/compilers/reject-filters.js';

describe('reject-all filter transforms (OMN-161 S1 F3/F6)', () => {
  it('tags: empty filter → {} (no reject)', () => {
    expect(transformTagFilters({})).toEqual({});
  });
  it('tags: any present key rejects with a tags-named message', () => {
    try {
      transformTagFilters({ flagged: true } as any);
      throw new Error('did not throw');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      expect((e as z.ZodError).issues[0].message).toMatch(/tags queries/i);
      expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'flagged']);
    }
  });
  it('folders: folder key rejects naming folders (not "tasks or export")', () => {
    try {
      transformFolderFilters({ folder: 'Bills' } as any);
      throw new Error('no throw');
    } catch (e) {
      expect((e as z.ZodError).issues[0].message).toMatch(/folders queries/i);
    }
  });
  it('perspectives: status key rejects naming perspectives', () => {
    try {
      transformPerspectiveFilters({ status: 'active' } as any);
      throw new Error('no throw');
    } catch (e) {
      expect((e as z.ZodError).issues[0].message).toMatch(/perspectives queries/i);
    }
  });
  it('tags: logical operators also reject (AND/OR/NOT)', () => {
    expect(() => transformTagFilters({ OR: [{ flagged: true }] } as any)).toThrow(z.ZodError);
  });
  it('skips undefined-valued keys (does not reject)', () => {
    expect(transformTagFilters({ flagged: undefined } as any)).toEqual({});
  });
});
