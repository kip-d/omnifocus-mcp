import { describe, it, expect } from 'vitest';
import { createUpdateTaskScript } from '../../src/omnifocus/scripts/tasks/update-task-v3.js';

describe('Task Search Limit Bug Fix', () => {
  // Generate a test script once for all tests
  const UPDATE_TASK_SCRIPT = createUpdateTaskScript('test-id', { name: 'test', projectId: 'proj-id' });

  it('should avoid whose() and use safe iteration', () => {
    // We explicitly avoid whose() due to performance and reliability issues
    expect(UPDATE_TASK_SCRIPT).not.toContain('whose(');
    // Confirm it iterates over flattenedTasks and compares ids safely
    expect(UPDATE_TASK_SCRIPT).toContain('const tasks = doc.flattenedTasks');
    expect(UPDATE_TASK_SCRIPT).toMatch(/for \(let i = 0; i < tasks\.length; i\+\+\)/);
    expect(UPDATE_TASK_SCRIPT).toMatch(/tasks\[i\]\.id\.primaryKey === taskId/);
  });

  it('should directly scan tasks collection without whose()', () => {
    expect(UPDATE_TASK_SCRIPT).toContain('doc.flattenedTasks');
    expect(UPDATE_TASK_SCRIPT).not.toContain('whose(');
  });

  it('should handle projectId in the simplified script', () => {
    // Verify projectId support was added
    expect(UPDATE_TASK_SCRIPT).toContain('if (updates.projectId !== undefined)');

    // Check that it handles moving to inbox (various patterns possible)
    expect(UPDATE_TASK_SCRIPT).toMatch(/assignedContainer|moveTasks|moveTaskViaBridge/);

    // Check for project validation/lookup (various patterns)
    expect(UPDATE_TASK_SCRIPT).toMatch(/projects\[i\]|targetProject|validateProject/);
  });
});
