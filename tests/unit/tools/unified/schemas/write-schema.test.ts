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

  // ─── Fix 1: daysOfWeek must be DayOfWeek[] objects, not number[] ────

  it('accepts daysOfWeek as DayOfWeek objects (MO, WE, FR)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'MWF task',
          repetitionRule: {
            frequency: 'weekly',
            daysOfWeek: [{ day: 'MO' }, { day: 'WE' }, { day: 'FR' }],
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { daysOfWeek: unknown[] } } }).data;
      expect(data.repetitionRule.daysOfWeek).toEqual([{ day: 'MO' }, { day: 'WE' }, { day: 'FR' }]);
    }
  });

  it('accepts daysOfWeek with position for monthly rules (last Friday)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Last Friday task',
          repetitionRule: {
            frequency: 'monthly',
            daysOfWeek: [{ day: 'FR', position: -1 }],
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { daysOfWeek: unknown[] } } }).data;
      expect(data.repetitionRule.daysOfWeek).toEqual([{ day: 'FR', position: -1 }]);
    }
  });

  it('rejects old number[] format for daysOfWeek', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Bad format',
          repetitionRule: {
            frequency: 'weekly',
            daysOfWeek: [1, 3, 5],
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  // ─── Fix 2: Missing RepetitionRuleSchema fields ─────────────────────

  it('accepts daysOfMonth for monthly rules (1st and 15th)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Bimonthly task',
          repetitionRule: {
            frequency: 'monthly',
            daysOfMonth: [1, 15],
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { daysOfMonth: number[] } } }).data;
      expect(data.repetitionRule.daysOfMonth).toEqual([1, 15]);
    }
  });

  it('accepts negative daysOfMonth (last day of month)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Last day task',
          repetitionRule: {
            frequency: 'monthly',
            daysOfMonth: [-1],
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts count with string coercion (MCP bridge)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Limited recurrence',
          repetitionRule: {
            frequency: 'weekly',
            count: '10',
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { count: number } } }).data;
      expect(data.repetitionRule.count).toBe(10);
    }
  });

  it('accepts count as number', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Limited recurrence',
          repetitionRule: {
            frequency: 'daily',
            count: 5,
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { count: number } } }).data;
      expect(data.repetitionRule.count).toBe(5);
    }
  });

  it('accepts weekStart enum', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Monday start',
          repetitionRule: {
            frequency: 'weekly',
            weekStart: 'MO',
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { weekStart: string } } }).data;
      expect(data.repetitionRule.weekStart).toBe('MO');
    }
  });

  it('accepts setPositions for BYSETPOS filtering', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'First and last',
          repetitionRule: {
            frequency: 'monthly',
            daysOfWeek: [{ day: 'MO' }],
            setPositions: [1, -1],
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { setPositions: number[] } } }).data;
      expect(data.repetitionRule.setPositions).toEqual([1, -1]);
    }
  });

  // ─── Fix 4: catchUpAutomatically MCP bridge coercion ────────────────

  it('coerces string catchUpAutomatically to boolean', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'No catch-up',
          repetitionRule: {
            frequency: 'daily',
            catchUpAutomatically: 'false',
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { catchUpAutomatically: boolean } } }).data;
      expect(data.repetitionRule.catchUpAutomatically).toBe(false);
    }
  });

  it('accepts boolean catchUpAutomatically directly', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'With catch-up',
          repetitionRule: {
            frequency: 'daily',
            catchUpAutomatically: true,
          },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { repetitionRule: { catchUpAutomatically: boolean } } }).data;
      expect(data.repetitionRule.catchUpAutomatically).toBe(true);
    }
  });

  // ─── Round 2: repetitionRule: null clears the rule ──────────────────

  it('accepts repetitionRule: null in update to clear the rule', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          repetitionRule: null,
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: { repetitionRule: null } }).changes;
      expect(changes.repetitionRule).toBeNull();
    }
  });

  // ─── Round 2: reviewInterval in direct create ───────────────────────

  it('accepts reviewInterval in direct project create', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'project',
        data: {
          name: 'Review project',
          reviewInterval: 14,
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { reviewInterval: number } }).data;
      expect(data.reviewInterval).toBe(14);
    }
  });

  it('coerces string reviewInterval to number in project create (MCP bridge)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'project',
        data: {
          name: 'Review project',
          reviewInterval: '7',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { reviewInterval: number } }).data;
      expect(data.reviewInterval).toBe(7);
    }
  });

  // ─── Round 3: reviewInterval object form (OMN-38) ─────────────────

  it('accepts reviewInterval as { steps, unit } object in project create', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'project',
        data: {
          name: 'Weekly review project',
          reviewInterval: { steps: 1, unit: 'weeks' },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { reviewInterval: number } }).data;
      expect(data.reviewInterval).toBe(7);
    }
  });

  it('accepts reviewInterval as { steps, unit } with plural and singular units', () => {
    const cases = [
      { input: { steps: 2, unit: 'weeks' }, expected: 14 },
      { input: { steps: 1, unit: 'week' }, expected: 7 },
      { input: { steps: 3, unit: 'days' }, expected: 3 },
      { input: { steps: 1, unit: 'day' }, expected: 1 },
      { input: { steps: 1, unit: 'months' }, expected: 30 },
      { input: { steps: 1, unit: 'month' }, expected: 30 },
      { input: { steps: 1, unit: 'years' }, expected: 365 },
      { input: { steps: 1, unit: 'year' }, expected: 365 },
    ];

    for (const { input: ri, expected } of cases) {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'create',
          target: 'project',
          data: { name: 'Test', reviewInterval: ri },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = (result.data.mutation as { data: { reviewInterval: number } }).data;
        expect(data.reviewInterval).toBe(expected);
      }
    }
  });

  it('accepts reviewInterval object in project update changes', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'proj-1',
        changes: {
          reviewInterval: { steps: 2, unit: 'months' },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: { reviewInterval: number } }).changes;
      expect(changes.reviewInterval).toBe(60);
    }
  });

  it('coerces string steps in reviewInterval object (MCP bridge)', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'project',
        data: {
          name: 'Coercion test',
          reviewInterval: { steps: '2', unit: 'weeks' },
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { reviewInterval: number } }).data;
      expect(data.reviewInterval).toBe(14);
    }
  });

  // ─── Folder creation ──────────────────────────────────────────────

  it('validates create_folder with name only (top-level)', () => {
    const input = {
      mutation: {
        operation: 'create_folder',
        data: {
          name: 'Home',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mutation.operation).toBe('create_folder');
      const data = (result.data.mutation as { data: { name: string } }).data;
      expect(data.name).toBe('Home');
    }
  });

  it('validates create_folder with parentFolder (nested folder)', () => {
    const input = {
      mutation: {
        operation: 'create_folder',
        data: {
          name: 'Home',
          parentFolder: 'Personal',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { name: string; parentFolder: string } }).data;
      expect(data.name).toBe('Home');
      expect(data.parentFolder).toBe('Personal');
    }
  });

  it('validates create_folder with path syntax parentFolder', () => {
    const input = {
      mutation: {
        operation: 'create_folder',
        data: {
          name: 'Phones',
          parentFolder: 'Library : Electronics',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = (result.data.mutation as { data: { name: string; parentFolder: string } }).data;
      expect(data.parentFolder).toBe('Library : Electronics');
    }
  });

  it('rejects create_folder without name', () => {
    const input = {
      mutation: {
        operation: 'create_folder',
        data: {},
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects create_folder with empty name', () => {
    const input = {
      mutation: {
        operation: 'create_folder',
        data: {
          name: '',
        },
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
