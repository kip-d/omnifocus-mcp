import { describe, it, expect } from 'vitest';
import { ReadSchema } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('ReadSchema', () => {
  it('should validate simple tasks query', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: { status: 'active' },
        limit: 25,
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate complex filter with tags', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: {
          tags: { any: ['work', 'urgent'] },
          dueDate: { before: '2025-01-31' },
        },
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const input = {
      query: {
        type: 'invalid',
        filters: {},
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should validate query with offset for pagination', () => {
    const input = {
      query: {
        type: 'tasks',
        mode: 'all',
        limit: 100,
        offset: 200,
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.offset).toBe(200);
    }
  });

  it('should coerce string offset to number', () => {
    const input = {
      query: {
        type: 'tasks',
        mode: 'all',
        limit: '100',
        offset: '200',
      },
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.offset).toBe(200);
      expect(result.data.query.limit).toBe(100);
    }
  });
});
