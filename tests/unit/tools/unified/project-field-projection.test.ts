import { describe, it, expect } from 'vitest';

describe('projectFieldsOnResult', () => {
  it('should strip project result to requested fields', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = {
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
      flagged: false,
      note: 'Some note',
      folder: 'Work',
      folderPath: 'Work',
      sequential: false,
    };

    // Matches StandardResponseV2 envelope from ProjectsTool
    const result = projectFieldsOnResult({ data: { projects: [fullProject] }, metadata: {} }, ['id', 'name', 'status']);

    const data = result.data as { projects: Record<string, unknown>[] };
    expect(data.projects[0]).toEqual({
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
    });
  });

  it('should pass through when no fields specified', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = { id: 'abc', name: 'Test', status: 'active' };
    const result = projectFieldsOnResult({ data: { projects: [fullProject] }, metadata: {} }, undefined);
    const data = result.data as { projects: Record<string, unknown>[] };
    expect(data.projects[0]).toEqual(fullProject);
  });

  it('should handle result without data envelope gracefully', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const result = projectFieldsOnResult({ something: 'else' }, ['id', 'name']);
    expect(result).toEqual({ something: 'else' });
  });

  // OMN-270: taskCounts/nextTask/stats are NOT `fields` switch cases — they
  // ride on the performance-mode/includeStats mechanism (see the response
  // schema comment in response-schemas/read.ts). The projection stripped
  // them unconditionally, which was invisible while the taskCounts emitter
  // was dead (the OMN-204 projection-strip class); now that the script
  // emits them, the caller who asked via includeStats must receive them.
  it('carries the includeStats-mechanism extras (taskCounts/nextTask/stats) through projection', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = {
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
      taskCounts: { total: 5, available: 2, completed: 1 },
      nextTask: { id: 't1', name: 'Next up', flagged: false, dueDate: null },
      stats: { active: 4, completed: 1, total: 5, completionRate: 20, overdue: 0, flagged: 0 },
    };

    const result = projectFieldsOnResult({ data: { projects: [fullProject] }, metadata: {} }, ['id', 'name']);

    const data = result.data as { projects: Record<string, unknown>[] };
    expect(data.projects[0]).toEqual({
      id: 'abc123',
      name: 'Test Project',
      taskCounts: { total: 5, available: 2, completed: 1 },
      nextTask: { id: 't1', name: 'Next up', flagged: false, dueDate: null },
      stats: { active: 4, completed: 1, total: 5, completionRate: 20, overdue: 0, flagged: 0 },
    });
  });

  it('does not invent extras keys the row lacks (lite mode rows stay lean)', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const liteProject = { id: 'abc', name: 'Test', status: 'active' };
    const result = projectFieldsOnResult({ data: { projects: [liteProject] }, metadata: {} }, ['id', 'name']);
    const data = result.data as { projects: Record<string, unknown>[] };
    expect(data.projects[0]).toEqual({ id: 'abc', name: 'Test' });
  });
});
