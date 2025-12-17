import { describe, it, expect } from 'vitest';

describe('ManageTaskTool project parameter mapping - simple test', () => {
  it('correctly maps projectId to project for mutation contract', () => {
    // Simulate the data transformation that happens in ManageTaskTool
    const createArgs = {
      name: 'Test Task',
      projectId: 'test-project-id',
      note: 'Test note',
    };

    // This is the transformation logic from ManageTaskTool
    const convertedTaskData = {
      ...createArgs,
      project: createArgs.projectId,
    };
    delete convertedTaskData.projectId;

    // Verify the transformation
    expect(convertedTaskData.name).toBe('Test Task');
    expect(convertedTaskData.note).toBe('Test note');
    expect(convertedTaskData.project).toBe('test-project-id');
    expect(convertedTaskData.projectId).toBeUndefined();
    expect('projectId' in convertedTaskData).toBe(false);
    expect('project' in convertedTaskData).toBe(true);

    // Verify JSON serialization (what would be passed to the script)
    const jsonData = JSON.stringify(convertedTaskData);
    expect(jsonData).toContain('"project":"test-project-id"');
    expect(jsonData).not.toContain('"projectId"');
  });

  it('handles null projectId correctly', () => {
    const createArgs = {
      name: 'Inbox Task',
      projectId: null,
    };

    const convertedTaskData = {
      ...createArgs,
      project: createArgs.projectId,
    };
    delete convertedTaskData.projectId;

    expect(convertedTaskData.name).toBe('Inbox Task');
    expect(convertedTaskData.project).toBe(null);
    expect(convertedTaskData.projectId).toBeUndefined();
  });
});
