/**
 * Tests for flat batch response shape.
 *
 * flattenBatchResults() is a pure function that transforms the nested
 * per-operation results from routeToBatch() into a flat array.
 *
 * Also tests that the batch schema accepts optional top-level `target`.
 */

import { describe, it, expect } from 'vitest';
import { flattenBatchResults, type FlatBatchResult } from '../../../../src/tools/unified/batch-response-flatten.js';

// ── flattenBatchResults() ────────────────────────────────────────────

describe('flattenBatchResults', () => {
  it('should flatten creates into flat array with operation, id, tempId, type, name', () => {
    const nestedResults = {
      created: [
        {
          success: true,
          created: 2,
          failed: 0,
          totalItems: 2,
          results: [
            { tempId: 't1', realId: 'real1', success: true, type: 'task' as const },
            { tempId: 't2', realId: 'real2', success: true, type: 'project' as const },
          ],
          mapping: { t1: 'real1', t2: 'real2' },
        },
      ],
      updated: [],
      completed: [],
      deleted: [],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(2);
    expect(flat[0]).toEqual({
      operation: 'create',
      success: true,
      id: 'real1',
      tempId: 't1',
      type: 'task',
    });
    expect(flat[1]).toEqual({
      operation: 'create',
      success: true,
      id: 'real2',
      tempId: 't2',
      type: 'project',
    });
  });

  it('should flatten completed operations extracting id and name from nested envelope', () => {
    const nestedResults = {
      created: [],
      updated: [],
      completed: [
        {
          success: true,
          data: { task: { id: 'abc123', name: 'Buy milk' } },
          metadata: { operation: 'omnifocus_write', timestamp: '2026-02-24T21:00:00Z', completed_id: 'abc123' },
        },
      ],
      deleted: [],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toEqual({
      operation: 'complete',
      success: true,
      id: 'abc123',
      name: 'Buy milk',
    });
  });

  it('should flatten updated operations extracting id, name, and changes', () => {
    const nestedResults = {
      created: [],
      updated: [
        {
          success: true,
          data: {
            task: {
              id: 'task1',
              name: 'Updated task',
              updated: true,
              changes: { flagged: true, dueDate: '2026-03-01' },
            },
          },
          metadata: { operation: 'omnifocus_write', timestamp: '2026-02-24T21:00:00Z' },
        },
      ],
      completed: [],
      deleted: [],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toEqual({
      operation: 'update',
      success: true,
      id: 'task1',
      name: 'Updated task',
      changes: ['flagged', 'dueDate'],
    });
  });

  it('should flatten deleted operations extracting id and name', () => {
    const nestedResults = {
      created: [],
      updated: [],
      completed: [],
      deleted: [
        {
          success: true,
          data: { task: { id: 'del1', name: 'Deleted task' } },
          metadata: { operation: 'omnifocus_write', timestamp: '2026-02-24T21:00:00Z' },
        },
      ],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toEqual({
      operation: 'delete',
      success: true,
      id: 'del1',
      name: 'Deleted task',
    });
  });

  it('should flatten errors with success: false and error message', () => {
    const nestedResults = {
      created: [],
      updated: [],
      completed: [],
      deleted: [],
      errors: [{ phase: 'complete', id: 'missing1', error: 'Task not found' }],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toEqual({
      operation: 'complete',
      success: false,
      id: 'missing1',
      error: 'Task not found',
    });
  });

  it('should handle mixed operations preserving type ordering (creates, updates, completes, deletes, errors)', () => {
    const nestedResults = {
      created: [
        {
          success: true,
          created: 1,
          failed: 0,
          totalItems: 1,
          results: [{ tempId: 't1', realId: 'real1', success: true, type: 'task' as const }],
          mapping: { t1: 'real1' },
        },
      ],
      updated: [
        {
          success: true,
          data: { task: { id: 'u1', name: 'Task U', updated: true, changes: { flagged: true } } },
          metadata: {},
        },
      ],
      completed: [
        {
          success: true,
          data: { task: { id: 'c1', name: 'Task C' } },
          metadata: {},
        },
      ],
      deleted: [
        {
          success: true,
          data: { task: { id: 'd1', name: 'Task D' } },
          metadata: {},
        },
      ],
      errors: [{ phase: 'update', id: 'err1', error: 'Permission denied' }],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(5);
    expect(flat[0].operation).toBe('create');
    expect(flat[1].operation).toBe('update');
    expect(flat[2].operation).toBe('complete');
    expect(flat[3].operation).toBe('delete');
    expect(flat[4].operation).toBe('update'); // error inherits phase
    expect(flat[4].success).toBe(false);
  });

  it('should handle empty batch with no operations', () => {
    const nestedResults = {
      created: [],
      updated: [],
      completed: [],
      deleted: [],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toEqual([]);
  });

  it('should handle failed creates (success: false on individual items)', () => {
    const nestedResults = {
      created: [
        {
          success: false,
          created: 0,
          failed: 1,
          totalItems: 1,
          results: [{ tempId: 't1', realId: null, success: false, type: 'task' as const, error: 'Script error' }],
        },
      ],
      updated: [],
      completed: [],
      deleted: [],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toEqual({
      operation: 'create',
      success: false,
      id: null,
      tempId: 't1',
      type: 'task',
      error: 'Script error',
    });
  });

  it('should handle minimalResponse update results (no nested data.task envelope)', () => {
    // When minimalResponse is true, handleTaskUpdate returns a flat object
    // instead of createSuccessResponseV2 envelope
    const nestedResults = {
      created: [],
      updated: [
        {
          success: true,
          id: 'task1',
          operation: 'update_task',
          task_id: 'task1',
          fields_updated: ['flagged', 'dueDate'],
        },
      ],
      completed: [],
      deleted: [],
      errors: [],
    };

    const flat = flattenBatchResults(nestedResults);

    expect(flat).toHaveLength(1);
    expect(flat[0].operation).toBe('update');
    expect(flat[0].success).toBe(true);
    expect(flat[0].id).toBe('task1');
    expect((flat[0] as FlatBatchResult & { changes: string[] }).changes).toEqual(['flagged', 'dueDate']);
  });
});

// ── Batch schema: optional target ────────────────────────────────────

describe('batch schema optional target', () => {
  // Dynamically import to test schema validation
  it('should accept batch operation without top-level target', async () => {
    const { WriteSchema } = await import('../../../../src/tools/unified/schemas/write-schema.js');

    const input = {
      mutation: {
        operation: 'batch',
        operations: [
          {
            operation: 'create',
            target: 'task',
            data: { name: 'Test task' },
          },
          {
            operation: 'create',
            target: 'project',
            data: { name: 'Test project' },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should still accept batch operation with top-level target (backwards compatible)', async () => {
    const { WriteSchema } = await import('../../../../src/tools/unified/schemas/write-schema.js');

    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'task',
            data: { name: 'Test task' },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ── previewBatch uses per-operation target ────────────────────────────

describe('previewBatch per-operation target', () => {
  it('should use per-operation target in preview items, not top-level target', async () => {
    const { OmniFocusWriteTool } = await import('../../../../src/tools/unified/OmniFocusWriteTool.js');
    const { vi } = await import('vitest');

    const mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidateForTaskChange: vi.fn(),
      invalidateProject: vi.fn(),
      invalidateTag: vi.fn(),
      invalidateTaskQueries: vi.fn(),
      clear: vi.fn(),
    };

    const tool = new OmniFocusWriteTool(mockCache as never);

    const result = (await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task', // top-level says 'task'
        operations: [
          {
            operation: 'create',
            target: 'project', // per-op says 'project'
            data: { name: 'My Project' },
          },
          {
            operation: 'create',
            target: 'task',
            data: { name: 'My Task' },
          },
        ],
        dryRun: true,
      },
    })) as {
      success: boolean;
      data: { wouldAffect: { items: Array<{ type: string; name: string }> } };
    };

    expect(result.success).toBe(true);
    // Bug fix: items should use per-operation target, not top-level
    expect(result.data.wouldAffect.items[0].type).toBe('project');
    expect(result.data.wouldAffect.items[1].type).toBe('task');
  });
});
