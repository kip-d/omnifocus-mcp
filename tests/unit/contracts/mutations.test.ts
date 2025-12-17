import { describe, it, expect } from 'vitest';
import {
  validateMutation,
  createMutation,
  type TaskMutation,
  type CreateMutation,
  type UpdateMutation,
  type CompleteMutation,
  type DeleteMutation,
  type BatchMutation,
  type BulkDeleteMutation,
} from '../../../src/contracts/mutations.js';

describe('validateMutation', () => {
  describe('create mutation', () => {
    it('validates valid task creation', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: 'Test Task' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates valid project creation', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'project',
        data: { name: 'Test Project', sequential: true },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates task with all optional fields', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Complete Task',
          note: 'This is a note',
          project: 'Work',
          tags: ['urgent', 'review'],
          dueDate: '2025-12-31',
          deferDate: '2025-12-01',
          flagged: true,
          estimatedMinutes: 30,
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing data', () => {
      const mutation = {
        operation: 'create',
        target: 'task',
      } as CreateMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'data',
        }),
      );
    });

    it('rejects empty name', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: '' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'data.name',
        }),
      );
    });

    it('rejects whitespace-only name', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: '   ' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'data.name',
        }),
      );
    });

    it('rejects invalid due date format', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: 'Test', dueDate: 'tomorrow' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'data.dueDate',
        }),
      );
    });

    it('rejects invalid defer date format', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: 'Test', deferDate: '12/31/2025' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'data.deferDate',
        }),
      );
    });

    it('accepts date with time format', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: 'Test', dueDate: '2025-12-31 14:30' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('accepts project: null for inbox', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: 'Inbox Task', project: null },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });
  });

  describe('create mutation with repetition rule', () => {
    it('validates valid daily repetition', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Daily Task',
          repetitionRule: { frequency: 'daily', interval: 1 },
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('validates valid weekly repetition with days', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Weekly Task',
          repetitionRule: {
            frequency: 'weekly',
            interval: 1,
            daysOfWeek: [{ day: 'MO' }, { day: 'WE' }, { day: 'FR' }], // Mon, Wed, Fri
          },
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('validates hourly and minutely frequencies', () => {
      const hourlyMutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Hourly Task',
          repetitionRule: { frequency: 'hourly', interval: 2 },
        },
      };
      expect(validateMutation(hourlyMutation).valid).toBe(true);

      const minutelyMutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Minutely Task',
          repetitionRule: { frequency: 'minutely', interval: 30 },
        },
      };
      expect(validateMutation(minutelyMutation).valid).toBe(true);
    });

    it('rejects invalid frequency', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Bad Task',
          repetitionRule: { frequency: 'secondly' as any, interval: 1 },
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'repetitionRule.frequency',
        }),
      );
    });

    it('rejects zero interval', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Bad Task',
          repetitionRule: { frequency: 'daily', interval: 0 },
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'repetitionRule.interval',
        }),
      );
    });

    it('rejects invalid days of week', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Bad Task',
          repetitionRule: {
            frequency: 'weekly',
            interval: 1,
            daysOfWeek: [7], // Invalid: 0-6 only
          },
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'repetitionRule.daysOfWeek',
        }),
      );
    });
  });

  describe('update mutation', () => {
    it('validates valid task update', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: { name: 'Updated Name' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates update with multiple changes', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          name: 'Updated',
          flagged: true,
          dueDate: '2025-12-31',
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('rejects missing id', () => {
      const mutation = {
        operation: 'update',
        target: 'task',
        changes: { name: 'Updated' },
      } as UpdateMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'id',
        }),
      );
    });

    it('rejects missing changes', () => {
      const mutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
      } as UpdateMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'changes',
        }),
      );
    });

    it('rejects empty changes object', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {},
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'changes',
        }),
      );
    });

    it('rejects conflicting tag operations', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          tags: ['new-tag'],
          addTags: ['another-tag'],
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CONFLICTING_FIELDS',
          field: 'changes.tags',
        }),
      );
    });

    it('rejects tags with removeTags conflict', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          tags: ['new-tag'],
          removeTags: ['old-tag'],
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
    });

    it('allows addTags and removeTags together', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          addTags: ['new-tag'],
          removeTags: ['old-tag'],
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('rejects invalid due date in changes', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: { dueDate: 'next week' },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'changes.dueDate',
        }),
      );
    });

    it('allows null to clear due date', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: { dueDate: null },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('allows clearDueDate flag', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: { clearDueDate: true },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });
  });

  describe('complete mutation', () => {
    it('validates valid completion', () => {
      const mutation: CompleteMutation = {
        operation: 'complete',
        target: 'task',
        id: 'task-123',
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('validates completion with custom date', () => {
      const mutation: CompleteMutation = {
        operation: 'complete',
        target: 'task',
        id: 'task-123',
        completionDate: '2025-11-24',
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('rejects missing id', () => {
      const mutation = {
        operation: 'complete',
        target: 'task',
      } as CompleteMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'id',
        }),
      );
    });

    it('rejects invalid completion date', () => {
      const mutation: CompleteMutation = {
        operation: 'complete',
        target: 'task',
        id: 'task-123',
        completionDate: 'yesterday',
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          field: 'completionDate',
        }),
      );
    });
  });

  describe('delete mutation', () => {
    it('validates valid deletion', () => {
      const mutation: DeleteMutation = {
        operation: 'delete',
        target: 'task',
        id: 'task-123',
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('rejects missing id', () => {
      const mutation = {
        operation: 'delete',
        target: 'task',
      } as DeleteMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'id',
        }),
      );
    });
  });

  describe('batch mutation', () => {
    it('validates valid batch with creates', () => {
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { name: 'Task 1' } },
          { operation: 'create', target: 'task', data: { name: 'Task 2' } },
        ],
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('validates batch with mixed operations', () => {
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { name: 'New Task' } },
          {
            operation: 'update',
            target: 'task',
            id: 'task-123',
            changes: { flagged: true },
          },
        ],
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('validates batch with tempId for parent references', () => {
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'task',
            data: { name: 'Parent' },
            tempId: 'parent-1',
          },
          {
            operation: 'create',
            target: 'task',
            data: { name: 'Child' },
            parentTempId: 'parent-1',
          },
        ],
        createSequentially: true,
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('rejects empty operations array', () => {
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations: [],
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'operations',
        }),
      );
    });

    it('rejects missing operations', () => {
      const mutation = {
        operation: 'batch',
        target: 'task',
      } as BatchMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
    });

    it('rejects batch exceeding 100 operations', () => {
      const operations = Array.from({ length: 101 }, (_, i) => ({
        operation: 'create' as const,
        target: 'task' as const,
        data: { name: `Task ${i}` },
      }));
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations,
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          message: expect.stringContaining('100'),
        }),
      );
    });

    it('rejects batch operation with missing name', () => {
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'create', target: 'task', data: { name: '' } }],
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'operations[0].data.name',
        }),
      );
    });

    it('rejects batch update without id or changes', () => {
      const mutation: BatchMutation = {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'update', target: 'task' }] as any,
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
    });
  });

  describe('bulk_delete mutation', () => {
    it('validates valid bulk delete', () => {
      const mutation: BulkDeleteMutation = {
        operation: 'bulk_delete',
        target: 'task',
        ids: ['task-1', 'task-2', 'task-3'],
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('rejects empty ids array', () => {
      const mutation: BulkDeleteMutation = {
        operation: 'bulk_delete',
        target: 'task',
        ids: [],
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELD',
          field: 'ids',
        }),
      );
    });

    it('rejects missing ids', () => {
      const mutation = {
        operation: 'bulk_delete',
        target: 'task',
      } as BulkDeleteMutation;
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
    });

    it('rejects bulk delete exceeding 100 ids', () => {
      const ids = Array.from({ length: 101 }, (_, i) => `task-${i}`);
      const mutation: BulkDeleteMutation = {
        operation: 'bulk_delete',
        target: 'task',
        ids,
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_VALUE',
          message: expect.stringContaining('100'),
        }),
      );
    });
  });

  describe('createMutation helper', () => {
    it('returns mutation unchanged (type-safe factory)', () => {
      const mutation = createMutation({
        operation: 'create',
        target: 'task',
        data: { name: 'Test' },
      });

      expect(mutation.operation).toBe('create');
      expect(mutation.target).toBe('task');
    });
  });

  describe('edge cases', () => {
    it('handles project creation with review interval', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'project',
        data: {
          name: 'Review Project',
          reviewInterval: 7,
          status: 'active',
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('handles project update with folder change', () => {
      const mutation: UpdateMutation = {
        operation: 'update',
        target: 'project',
        id: 'project-123',
        changes: {
          folder: 'Work',
          status: 'on_hold',
        },
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });

    it('validates minimalResponse flag', () => {
      const mutation: CreateMutation = {
        operation: 'create',
        target: 'task',
        data: { name: 'Test' },
        minimalResponse: true,
      };
      const result = validateMutation(mutation);

      expect(result.valid).toBe(true);
    });
  });
});
