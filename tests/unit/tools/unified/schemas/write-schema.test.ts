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
          dueDate: '2025-01-15'
        }
      }
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
          addTags: ['urgent']
        }
      }
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task'
        // Missing data
      }
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
