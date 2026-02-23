import { describe, it, expect } from 'vitest';
import { WriteSchema } from '../../../../../src/tools/unified/schemas/write-schema.js';

describe('WriteSchema', () => {
  it('should validate create task mutation', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Test task',
          tags: ['work'],
          dueDate: '2025-01-15',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate update mutation with changes', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-id-123',
        changes: {
          flagged: true,
          addTags: ['urgent'],
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate project update with folder change', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'project-123',
        changes: {
          folder: 'Development',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mutation).toHaveProperty('changes');
      const changes = (result.data.mutation as { changes: Record<string, unknown> }).changes;
      expect(changes.folder).toBe('Development');
    }
  });

  it('should validate project update with folder set to null (move to root)', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'project-123',
        changes: {
          folder: null,
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: Record<string, unknown> }).changes;
      expect(changes.folder).toBeNull();
    }
  });

  it('should reject missing required fields', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        // Missing data
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts sequential in project update changes', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'project-123',
        changes: {
          sequential: true,
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: Record<string, unknown> }).changes;
      expect(changes.sequential).toBe(true);
    }
  });

  it('accepts reviewInterval in project update changes', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'project-123',
        changes: {
          reviewInterval: 14,
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: Record<string, unknown> }).changes;
      expect(changes.reviewInterval).toBe(14);
    }
  });

  // Bug: repetitionRule missing from UpdateChangesSchema
  it('accepts repetitionRule in update changes', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          repetitionRule: {
            frequency: 'daily',
            interval: 90,
            method: 'defer-after-completion',
            scheduleType: 'from-completion',
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: Record<string, unknown> }).changes;
      expect(changes.repetitionRule).toEqual({
        frequency: 'daily',
        interval: 90,
        method: 'defer-after-completion',
        scheduleType: 'from-completion',
      });
    }
  });

  // Bug: repetitionRule also needs to work in batch update operations
  it('accepts repetitionRule in batch update operations', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'update',
            target: 'task',
            id: 'task-456',
            changes: {
              repetitionRule: {
                frequency: 'weekly',
                interval: 1,
              },
            },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  // Bug: interval field in RepetitionRuleSchema lacks MCP bridge string coercion
  it('coerces string interval to number in repetitionRule', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Test recurring task',
          repetitionRule: {
            frequency: 'daily',
            interval: '90',
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { interval: number } } }).data;
      expect(data.repetitionRule.interval).toBe(90);
    }
  });

  // String coercion on interval should also work in update context (after Bug 1 fix)
  it('coerces string interval to number in update repetitionRule', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-789',
        changes: {
          repetitionRule: {
            frequency: 'weekly',
            interval: '2',
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: { repetitionRule: { interval: number } } }).changes;
      expect(changes.repetitionRule.interval).toBe(2);
    }
  });

  it('rejects unknown fields after passthrough removal', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'project-123',
        changes: {
          name: 'Valid',
          bogusField: 'should fail',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
