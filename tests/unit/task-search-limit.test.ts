import { describe, it, expect } from 'vitest';
import { UPDATE_TASK_SCRIPT } from '../../src/omnifocus/scripts/tasks';

describe('Task Search Limit Bug Fix', () => {
  it('should use O(1) task lookup instead of iteration', () => {
    // The script should use Task.byIdentifier for O(1) lookup
    expect(UPDATE_TASK_SCRIPT).toContain('Task.byIdentifier(taskId)');
    expect(UPDATE_TASK_SCRIPT).not.toContain('i < 100');
    expect(UPDATE_TASK_SCRIPT).not.toContain('Math.min(100');
  });

  it('should not iterate through all tasks', () => {
    // Verify we're NOT using iteration anymore
    const searchPattern = /for \(let i = 0; i < tasks\.length; i\+\+\)/;
    expect(UPDATE_TASK_SCRIPT).not.toMatch(searchPattern);
    expect(UPDATE_TASK_SCRIPT).toContain('Task.byIdentifier');
  });

  it('should handle projectId in the simplified script', () => {
    // Verify projectId support was added
    expect(UPDATE_TASK_SCRIPT).toContain('if (updates.projectId !== undefined)');
    expect(UPDATE_TASK_SCRIPT).toContain('task.assignedContainer = null');
    expect(UPDATE_TASK_SCRIPT).toContain('projects[i].id() === updates.projectId');
  });
});