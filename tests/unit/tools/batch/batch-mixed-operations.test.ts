import { describe, it, expect, vi } from 'vitest';

// Import the WriteSchema to test BatchOperationSchema indirectly
// (BatchOperationSchema is not exported, but is validated through WriteSchema)
import { WriteSchema } from '../../../../src/tools/unified/schemas/write-schema.js';

describe('UpdateChangesSchema MCP bridge coercion', () => {
  it('should coerce string "true" to boolean for flagged in batch update', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'update',
            target: 'task',
            id: 'test-id',
            changes: { flagged: 'true' },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const ops = (result.data.mutation as any).operations;
      expect(ops[0].changes.flagged).toBe(true);
    }
  });

  it('should coerce string booleans for clearDueDate and other clear flags', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'update',
            target: 'task',
            id: 'test-id',
            changes: {
              clearDueDate: 'true',
              clearDeferDate: 'false',
              clearPlannedDate: 'true',
              clearEstimatedMinutes: 'true',
            },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as any).operations[0].changes;
      expect(changes.clearDueDate).toBe(true);
      expect(changes.clearDeferDate).toBe(false);
      expect(changes.clearPlannedDate).toBe(true);
      expect(changes.clearEstimatedMinutes).toBe(true);
    }
  });

  it('should coerce string to number for estimatedMinutes in batch update', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'update',
            target: 'task',
            id: 'test-id',
            changes: { estimatedMinutes: '45' },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as any).operations[0].changes;
      expect(changes.estimatedMinutes).toBe(45);
    }
  });
});

describe('BatchOperationSchema — all operation types', () => {
  it('should accept complete operations in a batch', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'complete', target: 'task', id: 'task-123' }],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept complete with optional completionDate', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'complete', target: 'task', id: 'task-123', completionDate: '2026-02-15' }],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept delete operations in a batch', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'delete', target: 'task', id: 'task-456' }],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept mixed create+update+complete+delete in a single batch', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { name: 'New task' } },
          { operation: 'update', target: 'task', id: 'task-1', changes: { flagged: true } },
          { operation: 'complete', target: 'task', id: 'task-2' },
          { operation: 'delete', target: 'task', id: 'task-3' },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';

class StubCache {
  invalidate(): void {}
  invalidateProject(): void {}
  invalidateTag(): void {}
  invalidateTaskQueries(): void {}
  invalidateForTaskChange(): void {}
  clear(): void {}
}

describe('routeToBatch — partition and delegate', () => {
  it('should handle batch with only updates (original bug)', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    // Mock the inline handleTaskUpdate via execJson (used by buildUpdateTaskScript path)
    const execJsonSpy = vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: { ok: true, v: '3', data: { task: { id: 'task-1', name: 'Updated' } } },
    });

    const result = await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'update', target: 'task', id: 'task-1', changes: { flagged: true } },
          { operation: 'update', target: 'task', id: 'task-2', changes: { name: 'Renamed' } },
        ],
      },
    });

    expect(execJsonSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty('success', true);

    execJsonSpy.mockRestore();
  });

  it('should execute operations in correct order: creates, updates, completes, deletes', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);
    const callOrder: string[] = [];

    // Mock inline executeBatchCreates
    vi.spyOn(tool as any, 'executeBatchCreates').mockImplementation(async () => {
      callOrder.push('create');
      return {
        success: true,
        created: 1,
        failed: 0,
        totalItems: 1,
        results: [{ tempId: 'temp1', realId: 'real-1', success: true, type: 'task' }],
        mapping: { temp1: 'real-1' },
      };
    });

    // Mock inline task handlers via dispatchTaskOperation
    vi.spyOn(tool as any, 'dispatchTaskOperation').mockImplementation(async (compiled: any) => {
      callOrder.push(compiled.operation);
      return { success: true, data: { task: { id: compiled.taskId, updated: true } } };
    });

    await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'delete', target: 'task', id: 'task-del' },
          { operation: 'update', target: 'task', id: 'task-upd', changes: { name: 'X' } },
          { operation: 'create', target: 'task', data: { name: 'New' } },
          { operation: 'complete', target: 'task', id: 'task-cmp' },
        ],
      },
    });

    // Regardless of input order, execution order should be: create, update, complete, delete
    expect(callOrder).toEqual(['create', 'update', 'complete', 'delete']);
  });
});

describe('previewBatch — dry run', () => {
  it('should preview all four operation types', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    const result = (await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { name: 'New task' } },
          { operation: 'update', target: 'task', id: 'task-1', changes: { name: 'Updated' } },
          { operation: 'complete', target: 'task', id: 'task-2' },
          { operation: 'delete', target: 'task', id: 'task-3' },
        ],
        dryRun: true,
      },
    })) as any;

    expect(result.success).toBe(true);
    expect(result.data.wouldAffect.count).toBe(4);
    expect(result.data.wouldAffect.creates).toBe(1);
    expect(result.data.wouldAffect.updates).toBe(1);
    expect(result.data.wouldAffect.completes).toBe(1);
    expect(result.data.wouldAffect.deletes).toBe(1);
  });
});
