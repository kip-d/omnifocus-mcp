import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  transformTagFilters,
  transformFolderFilters,
  transformPerspectiveFilters,
} from '../../../../../src/tools/unified/compilers/reject-filters.js';

describe('tags/folders filter transforms (OMN-170 S2 capability)', () => {
  // -------------------------------------------------------------------------
  // Tags: name supported; everything else (incl. folder, logical ops) rejects.
  // -------------------------------------------------------------------------
  describe('tags', () => {
    it('empty filter → {} (no reject)', () => {
      expect(transformTagFilters({})).toEqual({});
    });
    it('name {contains} → {name, nameOperator:CONTAINS}', () => {
      expect(transformTagFilters({ name: { contains: 'Home' } } as any)).toEqual({
        name: 'Home',
        nameOperator: 'CONTAINS',
      });
    });
    it('name {matches} → {name, nameOperator:MATCHES}', () => {
      expect(transformTagFilters({ name: { matches: '^Home$' } } as any)).toEqual({
        name: '^Home$',
        nameOperator: 'MATCHES',
      });
    });
    it('flagged still rejects with a tags-named message', () => {
      try {
        transformTagFilters({ flagged: true } as any);
        throw new Error('did not throw');
      } catch (e) {
        expect(e).toBeInstanceOf(z.ZodError);
        expect((e as z.ZodError).issues[0].message).toMatch(/tags queries/i);
        expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'flagged']);
      }
    });
    it('folder rejects on tags (folder is a folders-only key)', () => {
      expect(() => transformTagFilters({ folder: 'Bills' } as any)).toThrow(z.ZodError);
    });
    it('logical operators reject (AND/OR/NOT)', () => {
      expect(() => transformTagFilters({ OR: [{ name: { contains: 'x' } }] } as any)).toThrow(z.ZodError);
    });
    it('skips undefined-valued keys (does not reject)', () => {
      expect(transformTagFilters({ flagged: undefined } as any)).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // Folders: name + folder(parent/topLevel) supported; everything else rejects.
  // -------------------------------------------------------------------------
  describe('folders', () => {
    it('empty filter → {} (no reject)', () => {
      expect(transformFolderFilters({})).toEqual({});
    });
    it('name {contains} → {name, nameOperator:CONTAINS}', () => {
      expect(transformFolderFilters({ name: { contains: 'Work' } } as any)).toEqual({
        name: 'Work',
        nameOperator: 'CONTAINS',
      });
    });
    it('name {matches} → {name, nameOperator:MATCHES}', () => {
      expect(transformFolderFilters({ name: { matches: 'Wo.k' } } as any)).toEqual({
        name: 'Wo.k',
        nameOperator: 'MATCHES',
      });
    });
    it('folder:"Bills" → {parentName:"Bills"} (mirrors projects)', () => {
      expect(transformFolderFilters({ folder: 'Bills' } as any)).toEqual({ parentName: 'Bills' });
    });
    it('folder:null → {topLevelOnly:true}', () => {
      expect(transformFolderFilters({ folder: null } as any)).toEqual({ topLevelOnly: true });
    });
    it('name + folder compose at top level', () => {
      expect(transformFolderFilters({ name: { contains: 'Q' }, folder: null } as any)).toEqual({
        name: 'Q',
        nameOperator: 'CONTAINS',
        topLevelOnly: true,
      });
    });
    it('status still rejects with a folders-named message', () => {
      try {
        transformFolderFilters({ status: 'active' } as any);
        throw new Error('no throw');
      } catch (e) {
        expect((e as z.ZodError).issues[0].message).toMatch(/folders queries/i);
      }
    });
    it('flagged / id / logical operators reject', () => {
      expect(() => transformFolderFilters({ flagged: true } as any)).toThrow(z.ZodError);
      expect(() => transformFolderFilters({ id: 'x' } as any)).toThrow(z.ZodError);
      expect(() => transformFolderFilters({ AND: [{ name: { contains: 'x' } }] } as any)).toThrow(z.ZodError);
    });
  });

  // -------------------------------------------------------------------------
  // Perspectives: still reject EVERYTHING — incl. `name` (the key that flipped
  // for tags/folders must stay rejected here; guards against table mix-up).
  // -------------------------------------------------------------------------
  describe('perspectives (still reject-all)', () => {
    it('status rejects naming perspectives', () => {
      try {
        transformPerspectiveFilters({ status: 'active' } as any);
        throw new Error('no throw');
      } catch (e) {
        expect((e as z.ZodError).issues[0].message).toMatch(/perspectives queries/i);
      }
    });
    it('name STILL rejects on perspectives', () => {
      expect(() => transformPerspectiveFilters({ name: { contains: 'x' } } as any)).toThrow(z.ZodError);
    });
    it('empty filter → {}', () => {
      expect(transformPerspectiveFilters({})).toEqual({});
    });
  });
});
