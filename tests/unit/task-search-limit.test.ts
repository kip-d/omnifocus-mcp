import { describe, it, expect } from 'vitest';
import { createUpdateTaskScript } from '../../src/omnifocus/scripts/tasks/update-task-v3';

describe('Task Search Limit Bug Fix', () => {
  // Test the v3 function-generated script
  const testScript = createUpdateTaskScript('test-id-123', {
    name: 'Test Task',
    projectId: 'test-project-id'
  });

  it('should avoid whose() and use safe iteration', () => {
    // We explicitly avoid whose() due to performance and reliability issues
    expect(testScript).not.toContain('whose(');
    // Confirm it iterates over flattenedTasks and compares ids safely
    expect(testScript).toContain('doc.flattenedTasks');
    expect(testScript).toMatch(/for \(let i = 0; i < tasks\.length; i\+\+\)/);
    // v3 uses direct property access: tasks[i].id.primaryKey === taskId
    expect(testScript).toMatch(/tasks\[i\]\.id\.primaryKey === taskId|tasks\[i\]\.id\(\)\) === taskId|safeGet\(\(\) => tasks\[i\]\.id\(\)\)/);
  });

  it('should directly scan tasks collection without whose()', () => {
    expect(testScript).toContain('doc.flattenedTasks');
    expect(testScript).not.toContain('whose(');
  });

  it('should handle projectId in the simplified script', () => {
    // Verify projectId support was added
    expect(testScript).toContain('if (updates.projectId !== undefined)');

    // Check that it handles moving to inbox (various patterns possible)
    expect(testScript).toMatch(/assignedContainer|moveTasks|inboxTasks/);

    // Check for project validation/lookup (various patterns)
    expect(testScript).toMatch(/projects\[i\]|targetProject|findProject/);
  });
});
