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

    const result = projectFieldsOnResult({ projects: [fullProject] }, ['id', 'name', 'status']);

    expect(result.projects[0]).toEqual({
      id: 'abc123',
      name: 'Test Project',
      status: 'active',
    });
  });

  it('should pass through when no fields specified', async () => {
    const { projectFieldsOnResult } = await import('../../../../src/tools/unified/OmniFocusReadTool.js');

    const fullProject = { id: 'abc', name: 'Test', status: 'active' };
    const result = projectFieldsOnResult({ projects: [fullProject] }, undefined);
    expect(result.projects[0]).toEqual(fullProject);
  });
});
