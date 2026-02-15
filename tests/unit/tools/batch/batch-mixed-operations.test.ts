import { describe, it, expect } from 'vitest';

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
              clearRepeatRule: 'false',
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
      expect(changes.clearRepeatRule).toBe(false);
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
