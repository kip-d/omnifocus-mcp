/**
 * Unit tests for batch schemas
 *
 * Ensures batch-schemas.ts inherits all fields from the canonical
 * CreateDataSchema in write-schema.ts, preventing field drift.
 *
 * Regression: project field was silently stripped from task batch items
 * because batch-schemas.ts manually defined schemas instead of deriving
 * from the single source of truth.
 */

import { describe, it, expect } from 'vitest';
import { BatchItemSchema, BatchCreateSchema } from '../../../../src/tools/batch/batch-schemas.js';

describe('BatchItemSchema', () => {
  describe('task items — field preservation', () => {
    it('should preserve the project field on task items', () => {
      const input = {
        type: 'task',
        tempId: 'task1',
        name: 'Test task',
        project: 'My Project',
      };

      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('project', 'My Project');
      }
    });

    it('should allow project: null to explicitly target inbox', () => {
      const input = {
        type: 'task',
        tempId: 'task1',
        name: 'Inbox task',
        project: null,
      };

      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('project', null);
      }
    });

    it('should preserve all CreateDataSchema fields through batch validation', () => {
      const fullTask = {
        type: 'task',
        tempId: 'task1',
        name: 'Full task',
        project: 'Work',
        dueDate: '2026-03-15',
        deferDate: '2026-03-01',
        plannedDate: '2026-03-10',
        flagged: true,
        tags: ['important', 'work'],
        estimatedMinutes: 30,
        note: 'Detailed notes here',
        parentTaskId: 'parent-123',
        folder: 'Work Folder',
        sequential: true,
        status: 'active',
      };

      const result = BatchItemSchema.safeParse(fullTask);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          type: 'task',
          tempId: 'task1',
          name: 'Full task',
          project: 'Work',
          dueDate: '2026-03-15',
          deferDate: '2026-03-01',
          plannedDate: '2026-03-10',
          flagged: true,
          tags: ['important', 'work'],
          estimatedMinutes: 30,
          note: 'Detailed notes here',
          parentTaskId: 'parent-123',
          folder: 'Work Folder',
          sequential: true,
          status: 'active',
        });
      }
    });

    it('should preserve plannedDate field on task items', () => {
      const input = {
        type: 'task',
        tempId: 'task1',
        name: 'Planned task',
        plannedDate: '2026-03-20',
      };

      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('plannedDate', '2026-03-20');
      }
    });
  });

  describe('project items — field preservation', () => {
    it('should preserve project-specific fields', () => {
      const fullProject = {
        type: 'project',
        tempId: 'proj1',
        name: 'My Project',
        folder: 'Work',
        status: 'on_hold',
        sequential: true,
        note: 'Project notes',
        tags: ['quarterly'],
        flagged: true,
        reviewInterval: 14,
      };

      const result = BatchItemSchema.safeParse(fullProject);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          type: 'project',
          name: 'My Project',
          folder: 'Work',
          status: 'on_hold',
          sequential: true,
          note: 'Project notes',
          tags: ['quarterly'],
          flagged: true,
          reviewInterval: 14,
        });
      }
    });
  });

  describe('status enum values', () => {
    it('should accept canonical status values: active, on_hold, completed, dropped', () => {
      for (const status of ['active', 'on_hold', 'completed', 'dropped']) {
        const input = { type: 'project', tempId: 'p1', name: 'P', status };
        const result = BatchItemSchema.safeParse(input);
        expect(result.success, `status "${status}" should be valid`).toBe(true);
      }
    });

    it('should reject legacy status values: on-hold, done', () => {
      for (const status of ['on-hold', 'done']) {
        const input = { type: 'project', tempId: 'p1', name: 'P', status };
        const result = BatchItemSchema.safeParse(input);
        expect(result.success, `status "${status}" should be rejected`).toBe(false);
      }
    });
  });

  describe('date validation', () => {
    it('should accept YYYY-MM-DD format', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', dueDate: '2026-03-15' };
      expect(BatchItemSchema.safeParse(input).success).toBe(true);
    });

    it('should accept YYYY-MM-DD HH:mm format', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', dueDate: '2026-03-15 17:00' };
      expect(BatchItemSchema.safeParse(input).success).toBe(true);
    });

    it('should accept YYYY-MM-DDTHH:mm format', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', dueDate: '2026-03-15T17:00' };
      expect(BatchItemSchema.safeParse(input).success).toBe(true);
    });

    it('should reject ISO-8601 with Z suffix', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', dueDate: '2026-03-15T17:00:00Z' };
      expect(BatchItemSchema.safeParse(input).success).toBe(false);
    });

    it('should reject malformed dates', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', dueDate: 'tomorrow' };
      expect(BatchItemSchema.safeParse(input).success).toBe(false);
    });

    it('should validate deferDate and plannedDate the same way', () => {
      const valid = { type: 'task', tempId: 't1', name: 'T', deferDate: '2026-01-01', plannedDate: '2026-01-01' };
      expect(BatchItemSchema.safeParse(valid).success).toBe(true);

      const invalid = { type: 'task', tempId: 't1', name: 'T', deferDate: 'not-a-date' };
      expect(BatchItemSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('MCP bridge coercion', () => {
    it('should coerce string "true"/"false" to boolean for flagged', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', flagged: 'true' };
      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.flagged).toBe(true);
      }
    });

    it('should coerce string to number for estimatedMinutes', () => {
      const input = { type: 'task', tempId: 't1', name: 'T', estimatedMinutes: '30' };
      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.estimatedMinutes).toBe(30);
      }
    });

    it('should coerce string to boolean for sequential', () => {
      const input = { type: 'project', tempId: 'p1', name: 'P', sequential: 'true' };
      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sequential).toBe(true);
      }
    });

    it('should coerce string to number for reviewInterval', () => {
      const input = { type: 'project', tempId: 'p1', name: 'P', reviewInterval: '14' };
      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reviewInterval).toBe(14);
      }
    });
  });

  describe('repetitionRule', () => {
    it('should accept canonical RepetitionRuleSchema (not legacy RepeatRuleSchema)', () => {
      const input = {
        type: 'task',
        tempId: 't1',
        name: 'Recurring task',
        repetitionRule: {
          frequency: 'weekly',
          method: 'fixed',
        },
      };

      const result = BatchItemSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repetitionRule).toMatchObject({
          frequency: 'weekly',
          method: 'fixed',
        });
      }
    });
  });
});

describe('BatchCreateSchema', () => {
  it('should preserve project field through full batch validation', () => {
    const input = {
      items: [
        {
          type: 'task',
          tempId: 'task1',
          name: 'Task with project',
          project: 'My Project',
        },
      ],
      createSequentially: true,
      returnMapping: true,
      stopOnError: true,
    };

    const result = BatchCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]).toHaveProperty('project', 'My Project');
    }
  });

  it('should coerce string booleans for batch options', () => {
    const input = {
      items: [{ type: 'task', tempId: 't1', name: 'T' }],
      createSequentially: 'false',
      atomicOperation: 'true',
      returnMapping: 'false',
      stopOnError: 'false',
    };

    const result = BatchCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createSequentially).toBe(false);
      expect(result.data.atomicOperation).toBe(true);
      expect(result.data.returnMapping).toBe(false);
      expect(result.data.stopOnError).toBe(false);
    }
  });
});
