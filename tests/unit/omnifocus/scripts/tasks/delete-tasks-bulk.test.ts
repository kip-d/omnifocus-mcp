import { describe, it, expect } from 'vitest';
import { buildBulkDeleteTasksScript } from '../../../../../src/omnifocus/scripts/tasks/delete-tasks-bulk';

describe('buildBulkDeleteTasksScript', () => {
  it('serializes taskIds array into the script body', () => {
    const script = buildBulkDeleteTasksScript({ taskIds: ['id1', 'id2', 'id3'] });
    expect(script).toContain('"taskIds":["id1","id2","id3"]');
  });

  it('handles an empty taskIds array (returns the empty-input fast path in JXA)', () => {
    const script = buildBulkDeleteTasksScript({ taskIds: [] });
    expect(script).toContain('"taskIds":[]');
    expect(script).toContain("'No task IDs provided'");
  });

  it('emits a JXA IIFE with Task.byIdentifier + deleteObject', () => {
    const script = buildBulkDeleteTasksScript({ taskIds: ['x'] });
    expect(script).toMatch(/Application\('OmniFocus'\)/);
    expect(script).toContain('Task.byIdentifier(id)');
    expect(script).toContain('deleteObject(task)');
    expect(script).toContain("formatError(error, 'bulk_delete_tasks')");
  });

  it('escapes IDs that contain quotes safely via JSON.stringify', () => {
    const script = buildBulkDeleteTasksScript({ taskIds: ['has"quote', 'plain'] });
    expect(script).toContain('"taskIds":["has\\"quote","plain"]');
  });
});
