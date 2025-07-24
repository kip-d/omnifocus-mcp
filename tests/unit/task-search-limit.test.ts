import { describe, it, expect } from 'vitest';
import { UPDATE_TASK_SCRIPT } from '../../src/omnifocus/scripts/tasks';

describe('Task Search Limit Bug Fix', () => {
  it('should not have an artificial 100 task limit in UPDATE_TASK_SCRIPT', () => {
    // The script should search through ALL tasks, not just first 100
    expect(UPDATE_TASK_SCRIPT).toContain('for (let i = 0; i < tasks.length; i++)');
    expect(UPDATE_TASK_SCRIPT).not.toContain('i < 100');
    expect(UPDATE_TASK_SCRIPT).not.toContain('Math.min(100');
  });

  it('should search all tasks to find the target task', () => {
    // Verify the loop searches the entire tasks array
    const searchPattern = /for \(let i = 0; i < tasks\.length; i\+\+\)/;
    expect(UPDATE_TASK_SCRIPT).toMatch(searchPattern);
  });

  it('should handle projectId in the simplified script', () => {
    // Verify projectId support was added
    expect(UPDATE_TASK_SCRIPT).toContain('if (updates.projectId !== undefined)');
    expect(UPDATE_TASK_SCRIPT).toContain('task.assignedContainer = null');
    expect(UPDATE_TASK_SCRIPT).toContain('projects[i].id.primaryKey === updates.projectId');
  });
});