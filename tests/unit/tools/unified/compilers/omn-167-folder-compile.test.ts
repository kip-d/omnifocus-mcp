/**
 * OMN-167 — QueryCompiler now MAPS folder on tasks queries (was OMN-162 reject).
 *
 *   folder: "<path>"  → TaskFilter.folder = "<path>"
 *   folder: null      → TaskFilter.folderTopLevel = true   (top-level-project tasks)
 *
 * The flip from 'reject' to 'map' is a pure widening: an error becoming a working
 * query breaks no existing caller.
 */

import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';

describe('OMN-167: QueryCompiler folder mapping on tasks', () => {
  const compiler = new QueryCompiler();

  it('maps a folder path string to TaskFilter.folder (no longer rejects)', () => {
    const result = compiler.transformFilters({ folder: 'Development : Web' });
    expect(result.folder).toBe('Development : Web');
    expect(result.folderTopLevel).toBeUndefined();
  });

  it('maps folder: null to folderTopLevel: true', () => {
    const result = compiler.transformFilters({ folder: null });
    expect(result.folderTopLevel).toBe(true);
    expect(result.folder).toBeUndefined();
  });

  it('does not throw when a tasks query filters by folder', () => {
    expect(() => compiler.transformFilters({ folder: 'Personal' })).not.toThrow();
  });

  it('compiles an end-to-end tasks query with a folder filter', () => {
    expect(() => compiler.compile({ query: { type: 'tasks', filters: { folder: 'Development' } } })).not.toThrow();
  });
});
