/**
 * OMN-167 — folder-path VALIDATION at the compiler boundary (review findings 1, 2, 6).
 *
 * An invalid folder path (empty string, empty segment, leading/trailing/interior
 * `:`) must reject as a ZodError → VALIDATION_ERROR with steering, at compile time —
 * NOT defer to OmniJS code-gen where parseFolderPath throws a plain Error that
 * surfaces as an opaque EXECUTION_ERROR. This holds on BOTH tasks and projects, and
 * the ZodError must carry the structured origin path (AND[i]/OR[i]).
 *
 * (Plain mapping of valid paths is covered by QueryCompiler.test.ts /
 * filter-coverage.test.ts; this file owns the validation contract only.)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';
import { transformProjectFilters } from '../../../../../src/tools/unified/compilers/transform-project-filters.js';

describe('OMN-167: folder-path validation rejects as ZodError (tasks)', () => {
  const compiler = new QueryCompiler();
  const invalid = [' : Bills', 'A : ', 'A : : B', ''];

  for (const folder of invalid) {
    it(`rejects folder=${JSON.stringify(folder)} with a ZodError (not a late plain Error)`, () => {
      expect(() => compiler.transformFilters({ folder })).toThrow(z.ZodError);
    });
  }

  it('a valid path still maps (no false positive)', () => {
    expect(compiler.transformFilters({ folder: 'Personal : Bills' }).folder).toBe('Personal : Bills');
  });

  it('rejects the folder + folder:null contradiction instead of silently returning 0 (finding 3)', () => {
    // folder:"Work" → TaskFilter.folder; folder:null → TaskFilter.folderTopLevel.
    // ANDed they are unsatisfiable (a project cannot be both inside "Work" and top-level).
    // Must reject loudly, not compile to an always-false predicate (silent empty result).
    expect(() =>
      compiler.compile({ query: { type: 'tasks', filters: { AND: [{ folder: 'Work' }, { folder: null }] } } } as never),
    ).toThrow(z.ZodError);
  });

  it('carries the AND-branch origin path in the ZodError (finding 6)', () => {
    try {
      compiler.compile({ query: { type: 'tasks', filters: { AND: [{ folder: ' : B' }] } } } as never);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'AND', 0]);
    }
  });
});

describe('OMN-167: folder-path validation rejects as ZodError (projects)', () => {
  it('rejects empty-string folder instead of silently matching all projects (finding 2)', () => {
    expect(() => transformProjectFilters({ folder: '' })).toThrow(z.ZodError);
  });

  it('rejects an empty-segment path', () => {
    expect(() => transformProjectFilters({ folder: ' : Bills' })).toThrow(z.ZodError);
  });

  it('a valid path still maps to folderName', () => {
    expect(transformProjectFilters({ folder: 'Personal : Bills' }).folderName).toBe('Personal : Bills');
  });
});
