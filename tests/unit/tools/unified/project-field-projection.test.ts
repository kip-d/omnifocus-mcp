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
    const result = projectFieldsOnResult({ data: { projects: [fullProject], preview: [fullProject] }, metadata: {} }, [
      'id',
      'name',
      'status',
    ]);

    const data = result.data as { projects: Record<string, unknown>[]; preview: Record<string, unknown>[] };
    expect(data.projects[0]).toEqual({
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
    });
    // Preview should also be projected
    expect(data.preview[0]).toEqual({
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
    });
  });

  it('should pass through when no fields specified', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = { id: 'abc', name: 'Test', status: 'active' };
    const result = projectFieldsOnResult(
      { data: { projects: [fullProject], preview: [fullProject] }, metadata: {} },
      undefined,
    );
    const data = result.data as { projects: Record<string, unknown>[] };
    expect(data.projects[0]).toEqual(fullProject);
  });

  it('should handle result without data envelope gracefully', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const result = projectFieldsOnResult({ something: 'else' }, ['id', 'name']);
    expect(result).toEqual({ something: 'else' });
  });
});
