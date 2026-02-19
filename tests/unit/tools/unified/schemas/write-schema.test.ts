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
});
