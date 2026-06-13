import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../src/tools/unified/compilers/QueryCompiler.js';

describe('CompiledQuery discriminated union (OMN-161 S1)', () => {
  const c = new QueryCompiler();
  it('projects: typed ProjectFilter lands on compiled.filters (no projectFilter side-channel)', () => {
    const compiled = c.compile({ query: { type: 'projects', filters: { status: 'active' } } } as any);
    expect(compiled.type).toBe('projects');
    expect((compiled as any).filters).toEqual({ status: ['active'] });
    expect((compiled as any).projectFilter).toBeUndefined();
  });
  it('tags: a present filter key rejects at compile', () => {
    expect(() => c.compile({ query: { type: 'tags', filters: { flagged: true } } } as any)).toThrow();
  });
  it('folders: folder filter rejects with a folders-named message (not tasks/export)', () => {
    try {
      c.compile({ query: { type: 'folders', filters: { folder: 'Bills' } } } as any);
      throw new Error('no throw');
    } catch (e: any) {
      expect(String(e.issues?.[0]?.message ?? e.message)).toMatch(/folders queries/i);
    }
  });
  it('tasks: unchanged — full task filter compiles onto filters', () => {
    const compiled = c.compile({ query: { type: 'tasks', filters: { flagged: true } } } as any);
    expect((compiled as any).filters.flagged).toBe(true);
  });
  it('export: task-vocabulary filter compiles onto filters (NormalizedTaskFilter)', () => {
    const compiled = c.compile({
      query: { type: 'export', exportType: 'tasks', filters: { completed: false } },
    } as any);
    expect((compiled as any).filters.completed).toBe(false);
  });
  it('type-level: projects filter is not task-shaped (compile guard)', () => {
    const compiled = c.compile({ query: { type: 'projects', filters: {} } } as any);
    if (compiled.type === 'projects') {
      // @ts-expect-error ProjectFilter has no task-only `dropped` key
      const _x: boolean | undefined = compiled.filters.dropped;
      void _x;
    }
    expect(compiled.type).toBe('projects');
  });
});
