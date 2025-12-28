/**
 * P0 Priority: Update Operations with Read-Back Validation
 *
 * PURPOSE: Prevent bugs like #11 (date updates) and #12 (tag operations)
 * by validating that updates actually persist, not just return success.
 *
 * PATTERN: create → update → read-back → verify → cleanup
 *
 * Uses the test sandbox for isolation:
 * - Inbox tasks use __TEST__ prefix
 * - Tags prefixed with __test-
 * - Cleanup via sandbox manager
 *
 * OPTIMIZATION (2025-12-26): Consolidated from 12 to 7 tests
 * - Combines related operations into single tests to reduce task creation overhead
 * - Estimated time savings: ~12.4 min → ~7 min (43% reduction)
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from '../helpers/shared-server.js';
import { MCPTestClient } from '../helpers/mcp-test-client.js';
import { fullCleanup, TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from '../helpers/sandbox-manager.js';

describe('Update Operations - Read-Back Validation', () => {
  let client: MCPTestClient;
  const createdTaskIds: string[] = [];
  const TEST_TAG = `${TEST_TAG_PREFIX}update-ops-${Date.now()}`;

  beforeAll(async () => {
    // Use shared server - avoids 13s startup cost per test file
    client = await getSharedClient();
  }, 30000);

  afterAll(async () => {
    // Cleanup: Delete all created tasks via bulk delete first (faster)
    if (createdTaskIds.length > 0) {
      try {
        await client.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'task',
            ids: createdTaskIds,
          },
        });
      } catch (err) {
        console.warn('Failed to cleanup tasks via bulk_delete:', err);
      }
    }

    // Full cleanup sweep for any remaining test data
    await fullCleanup();

    // Don't stop server - globalTeardown handles shared server cleanup
  });

  // Helper functions
  async function createTask(name: string, properties: Record<string, unknown> = {}) {
    // Ensure inbox tasks have __TEST__ prefix
    const taskName = name.startsWith(TEST_INBOX_PREFIX) ? name : `${TEST_INBOX_PREFIX} ${name}`;

    // Ensure tags have __test- prefix
    const tags = properties.tags
      ? (properties.tags as string[]).map((t) => (t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`))
      : [TEST_TAG];

    const result = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: taskName,
          ...properties,
          tags, // Processed tags override any in properties
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.task?.taskId).toBeDefined();

    const taskId = result.data.task.taskId;
    createdTaskIds.push(taskId);
    return taskId;
  }

  async function readTask(taskId: string) {
    const result = await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { id: taskId },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.tasks?.length).toBe(1);
    return result.data.tasks[0];
  }

  async function updateTask(taskId: string, changes: Record<string, unknown>) {
    // Process tag changes to ensure __test- prefix
    const processedChanges = { ...changes };

    if (processedChanges.tags) {
      processedChanges.tags = (processedChanges.tags as string[]).map((t) =>
        t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`,
      );
    }
    if (processedChanges.addTags) {
      processedChanges.addTags = (processedChanges.addTags as string[]).map((t) =>
        t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`,
      );
    }
    if (processedChanges.removeTags) {
      processedChanges.removeTags = (processedChanges.removeTags as string[]).map((t) =>
        t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`,
      );
    }

    const result = await client.callTool('omnifocus_write', {
      mutation: {
        operation: 'update',
        target: 'task',
        id: taskId,
        changes: processedChanges,
      },
    });

    return result;
  }

  describe('Date Updates (Bug #11 Prevention)', () => {
    it('should update dueDate, deferDate, and clear dates (consolidated)', async () => {
      // CONSOLIDATED: Combines dueDate, deferDate, and clearDueDate tests
      // Creates 1 task instead of 3, testing all date operations on the same task

      // 1. Create task without dates
      const taskId = await createTask('Test date updates consolidated');

      // 2. Update dueDate
      let updateResult = await updateTask(taskId, { dueDate: '2025-12-25' });
      expect(updateResult.success).toBe(true);

      // Verify dueDate persisted
      let task = await readTask(taskId);
      expect(task.dueDate).toBeDefined();
      expect(task.dueDate.split('T')[0]).toBe('2025-12-25');

      // 3. Update deferDate
      updateResult = await updateTask(taskId, { deferDate: '2025-12-20' });
      expect(updateResult.success).toBe(true);

      // Verify deferDate persisted (dueDate should still be set)
      task = await readTask(taskId);
      expect(task.deferDate).toBeDefined();
      expect(task.deferDate.split('T')[0]).toBe('2025-12-20');
      expect(task.dueDate.split('T')[0]).toBe('2025-12-25'); // Still set

      // 4. Clear dueDate using clearDueDate flag
      // Bug #14 Fix: Use clearDueDate boolean flag instead of dueDate: null
      updateResult = await updateTask(taskId, { clearDueDate: true });
      expect(updateResult.success).toBe(true);

      // Verify dueDate was cleared
      task = await readTask(taskId);
      expect(task.dueDate).toBeUndefined();
      expect(task.deferDate.split('T')[0]).toBe('2025-12-20'); // Still set
    }, 120000);

    it('should update plannedDate (if database migrated)', async () => {
      // KEPT SEPARATE: plannedDate requires database migration (OmniFocus 4.7+)
      // If property is undefined/null, database hasn't been migrated - skip validation
      const taskId = await createTask('Test update plannedDate');

      const updateResult = await updateTask(taskId, { plannedDate: '2025-12-18' });
      expect(updateResult.success).toBe(true);

      const task = await readTask(taskId);

      if (task.plannedDate !== undefined && task.plannedDate !== null) {
        const plannedDateOnly = task.plannedDate.split('T')[0];
        expect(plannedDateOnly).toBe('2025-12-18');
      } else {
        // Database not migrated - test passes but logs warning
        console.log('plannedDate not available - database may not be migrated for planned dates feature');
      }
    }, 120000);
  });

  describe('Tag Operations (Bug #12 Prevention)', () => {
    it('should support tags (full replacement)', async () => {
      // Create task with initial tags
      const taskId = await createTask('Test tags replacement', {
        tags: [TEST_TAG, `${TEST_TAG_PREFIX}initial1`, `${TEST_TAG_PREFIX}initial2`],
      });

      // Replace tags
      const updateResult = await updateTask(taskId, {
        tags: [TEST_TAG, 'replaced1', 'replaced2', 'replaced3'],
      });
      expect(updateResult.success).toBe(true);

      // Verify tags replaced (not merged)
      const task = await readTask(taskId);
      expect(task.tags).toContain(TEST_TAG);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}replaced1`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}replaced2`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}replaced3`);
      expect(task.tags).not.toContain(`${TEST_TAG_PREFIX}initial1`);
      expect(task.tags).not.toContain(`${TEST_TAG_PREFIX}initial2`);
    }, 120000);

    it('should support addTags with deduplication (consolidated)', async () => {
      // CONSOLIDATED: Combines addTags and addTags dedup tests
      // Tests both append functionality and deduplication in one task

      // Create task with initial tags
      const taskId = await createTask('Test addTags consolidated', {
        tags: [TEST_TAG, `${TEST_TAG_PREFIX}existing1`, `${TEST_TAG_PREFIX}existing2`],
      });

      // Add new tags
      let updateResult = await updateTask(taskId, {
        addTags: ['new1', 'new2'],
      });
      expect(updateResult.success).toBe(true);

      // Verify tags appended
      let task = await readTask(taskId);
      expect(task.tags).toContain(TEST_TAG);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}existing1`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}existing2`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}new1`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}new2`);
      expect(task.tags.length).toBeGreaterThanOrEqual(5);

      // Try to add tags that already exist (deduplication test)
      updateResult = await updateTask(taskId, {
        addTags: ['existing1', 'another-new'],
      });
      expect(updateResult.success).toBe(true);

      // Verify no duplicates created
      task = await readTask(taskId);
      const existing1Count = task.tags.filter((t: string) => t === `${TEST_TAG_PREFIX}existing1`).length;
      expect(existing1Count).toBe(1); // Should only appear once
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}another-new`);
    }, 120000);

    it('should support removeTags (filter out specified)', async () => {
      // Create task with multiple tags
      const taskId = await createTask('Test removeTags', {
        tags: [
          TEST_TAG,
          `${TEST_TAG_PREFIX}keep1`,
          `${TEST_TAG_PREFIX}remove1`,
          `${TEST_TAG_PREFIX}keep2`,
          `${TEST_TAG_PREFIX}remove2`,
        ],
      });

      // Remove specific tags
      const updateResult = await updateTask(taskId, {
        removeTags: ['remove1', 'remove2'],
      });
      expect(updateResult.success).toBe(true);

      // Verify specified tags removed, others kept
      const task = await readTask(taskId);
      expect(task.tags).toContain(TEST_TAG);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}keep1`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}keep2`);
      expect(task.tags).not.toContain(`${TEST_TAG_PREFIX}remove1`);
      expect(task.tags).not.toContain(`${TEST_TAG_PREFIX}remove2`);
    }, 120000);
  });

  describe('Basic Property Updates', () => {
    it('should update note, flagged, and estimatedMinutes (consolidated)', async () => {
      // CONSOLIDATED: Combines note, flagged, and estimatedMinutes tests
      // Tests all basic property updates on a single task

      const taskId = await createTask('Test basic properties consolidated', { flagged: false });

      // 1. Update note
      let updateResult = await updateTask(taskId, {
        note: 'This is an updated note',
      });
      expect(updateResult.success).toBe(true);

      let task = await readTask(taskId);
      expect(task.note).toBe('This is an updated note');

      // 2. Update flagged status
      updateResult = await updateTask(taskId, { flagged: true });
      expect(updateResult.success).toBe(true);

      task = await readTask(taskId);
      expect(task.flagged).toBe(true);
      expect(task.note).toBe('This is an updated note'); // Still set

      // 3. Update estimatedMinutes
      updateResult = await updateTask(taskId, { estimatedMinutes: 30 });
      expect(updateResult.success).toBe(true);

      task = await readTask(taskId);
      expect(task.estimatedMinutes).toBe(30);
      expect(task.flagged).toBe(true); // Still set
      expect(task.note).toBe('This is an updated note'); // Still set
    }, 120000);
  });

  describe('Multiple Updates (Combined Changes)', () => {
    it('should apply multiple field updates in single call', async () => {
      const taskId = await createTask('Test multiple updates');

      const updateResult = await updateTask(taskId, {
        dueDate: '2025-12-31',
        note: 'Updated note',
        flagged: true,
        estimatedMinutes: 45,
        addTags: ['urgent', 'priority'],
      });
      expect(updateResult.success).toBe(true);

      // Verify ALL changes persisted
      const task = await readTask(taskId);
      expect(task.dueDate.split('T')[0]).toBe('2025-12-31');
      expect(task.note).toBe('Updated note');
      expect(task.flagged).toBe(true);
      expect(task.estimatedMinutes).toBe(45);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}urgent`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}priority`);
    }, 120000);
  });

  describe('Parent Task Updates (Bug OMN-5 Fix)', () => {
    it('should move task to become subtask of parent (parentTaskId update)', async () => {
      // 1. Create a parent task (action group)
      const parentTaskId = await createTask('Action Group Parent');

      // 2. Create a standalone task
      const childTaskId = await createTask('Standalone becomes subtask');

      // 3. Update standalone task with parentTaskId to move it under parent
      const updateResult = await updateTask(childTaskId, {
        parentTaskId: parentTaskId,
      });
      expect(updateResult.success).toBe(true);

      // 4. Read back and verify parent-child relationship
      const task = await readTask(childTaskId);
      expect(task.parentTaskId).toBe(parentTaskId);
      expect(task.parentTaskName).toContain('Action Group Parent');
    }, 120000);

    it('should move subtask back to project root (parentTaskId = null)', async () => {
      // 1. Create parent task and child task
      const parentTaskId = await createTask('Parent for removal test');
      const childTaskId = await createTask('Child to be orphaned');

      // 2. First move child to parent
      let updateResult = await updateTask(childTaskId, {
        parentTaskId: parentTaskId,
      });
      expect(updateResult.success).toBe(true);

      // Verify it's a subtask
      let task = await readTask(childTaskId);
      expect(task.parentTaskId).toBe(parentTaskId);

      // 3. Now move child back to project root (remove parent)
      updateResult = await updateTask(childTaskId, {
        parentTaskId: null,
      });
      expect(updateResult.success).toBe(true);

      // 4. Verify parent relationship removed
      task = await readTask(childTaskId);
      // parentTaskId is null when task has no parent (field projection returns null, not undefined)
      expect(task.parentTaskId).toBeNull();
    }, 120000);
  });
});
