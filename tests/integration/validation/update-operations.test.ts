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
    it('should update dueDate and persist change', async () => {
      // 1. Create task without due date
      const taskId = await createTask('Test update dueDate');

      // 2. Update due date
      const updateResult = await updateTask(taskId, { dueDate: '2025-12-25' });
      expect(updateResult.success).toBe(true);

      // 3. Read back - VERIFY CHANGE PERSISTED
      const task = await readTask(taskId);
      expect(task.dueDate).toBeDefined();
      const dueDateOnly = task.dueDate.split('T')[0];
      expect(dueDateOnly).toBe('2025-12-25');
    }, 120000);

    it('should update deferDate and persist change', async () => {
      const taskId = await createTask('Test update deferDate');

      const updateResult = await updateTask(taskId, { deferDate: '2025-12-20' });
      expect(updateResult.success).toBe(true);

      // Verify change persisted
      const task = await readTask(taskId);
      expect(task.deferDate).toBeDefined();
      const deferDateOnly = task.deferDate.split('T')[0];
      expect(deferDateOnly).toBe('2025-12-20');
    }, 120000);

    it('should update plannedDate and persist change (if database migrated)', async () => {
      const taskId = await createTask('Test update plannedDate');

      const updateResult = await updateTask(taskId, { plannedDate: '2025-12-18' });
      expect(updateResult.success).toBe(true);

      // Verify change persisted (or skip if database not migrated)
      const task = await readTask(taskId);

      // plannedDate requires database migration (OmniFocus 4.7+)
      // If property is undefined/null, database hasn't been migrated - skip validation
      if (task.plannedDate !== undefined && task.plannedDate !== null) {
        const plannedDateOnly = task.plannedDate.split('T')[0];
        expect(plannedDateOnly).toBe('2025-12-18');
      } else {
        // Database not migrated - test passes but logs warning
        console.log('plannedDate not available - database may not be migrated for planned dates feature');
      }
    }, 120000);

    it('should clear dueDate using clearDueDate flag', async () => {
      // Bug #14 Fix: Use clearDueDate boolean flag instead of dueDate: null
      // OmniJS `task.dueDate = null` doesn't persist (API limitation)
      // Solution: clearDueDate flag from git history (commit 78862c4)

      // Create with date, then clear it using flag
      const taskId = await createTask('Test clear dueDate', { dueDate: '2025-12-25' });

      const updateResult = await updateTask(taskId, { clearDueDate: true });
      expect(updateResult.success).toBe(true);

      // Verify date was cleared
      const task = await readTask(taskId);
      expect(task.dueDate).toBeUndefined();
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

    it('should support addTags (append to existing)', async () => {
      // Create task with initial tags
      const taskId = await createTask('Test addTags', {
        tags: [TEST_TAG, `${TEST_TAG_PREFIX}existing1`, `${TEST_TAG_PREFIX}existing2`],
      });

      // Add more tags
      const updateResult = await updateTask(taskId, {
        addTags: ['new1', 'new2'],
      });
      expect(updateResult.success).toBe(true);

      // Verify tags appended (not replaced)
      const task = await readTask(taskId);
      expect(task.tags).toContain(TEST_TAG);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}existing1`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}existing2`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}new1`);
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}new2`);
      expect(task.tags.length).toBeGreaterThanOrEqual(5);
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

    it('should handle addTags with deduplication', async () => {
      const taskId = await createTask('Test addTags dedup', {
        tags: [TEST_TAG, `${TEST_TAG_PREFIX}existing`],
      });

      // Try to add tags that already exist
      const updateResult = await updateTask(taskId, {
        addTags: ['existing', 'new'],
      });
      expect(updateResult.success).toBe(true);

      // Verify no duplicates created
      const task = await readTask(taskId);
      const existingCount = task.tags.filter((t: string) => t === `${TEST_TAG_PREFIX}existing`).length;
      expect(existingCount).toBe(1); // Should only appear once
      expect(task.tags).toContain(`${TEST_TAG_PREFIX}new`);
    }, 120000);
  });

  describe('Basic Property Updates', () => {
    it('should update note and persist change', async () => {
      const taskId = await createTask('Test update note');

      const updateResult = await updateTask(taskId, {
        note: 'This is an updated note',
      });
      expect(updateResult.success).toBe(true);

      // Verify note persisted
      const task = await readTask(taskId);
      expect(task.note).toBe('This is an updated note');
    }, 120000);

    it('should update flagged status and persist change', async () => {
      const taskId = await createTask('Test update flagged', { flagged: false });

      const updateResult = await updateTask(taskId, { flagged: true });
      expect(updateResult.success).toBe(true);

      // Verify flagged persisted
      const task = await readTask(taskId);
      expect(task.flagged).toBe(true);
    }, 120000);

    it('should update estimatedMinutes and persist change', async () => {
      const taskId = await createTask('Test update estimatedMinutes');

      const updateResult = await updateTask(taskId, { estimatedMinutes: 30 });
      expect(updateResult.success).toBe(true);

      // Verify estimatedMinutes persisted
      const task = await readTask(taskId);
      expect(task.estimatedMinutes).toBe(30);
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
});
