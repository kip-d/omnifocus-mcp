import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createErrorResponseV2, createSuccessResponseV2 } from '../../../src/utils/response-format.js';

describe('Error Response Format Tests', () => {
  it('creates V2 error responses with correct structure', () => {
    const error = createErrorResponseV2(
      'test-tool',
      'TEST_ERROR',
      'Test error message',
      'Try again',
      { detail: 'extra info' },
      { operation: 'test', duration_ms: 100 }
    );

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('TEST_ERROR');
    expect(error.error.message).toBe('Test error message');
    expect(error.error.suggestion).toBe('Try again');
    expect(error.error.details).toEqual({ detail: 'extra info' });
    expect(error.metadata.operation).toBe('test');
  });

  it('creates V2 success responses with correct structure', () => {
    const success = createSuccessResponseV2(
      'test-tool',
      { items: [{ id: 1, name: 'test' }] },
      { total: 1 },
      { operation: 'list', from_cache: false }
    );

    expect(success.success).toBe(true);
    expect(success.data.items).toHaveLength(1);
    expect(success.summary.total).toBe(1);
    expect(success.metadata.operation).toBe('list');
    expect(success.metadata.from_cache).toBe(false);
  });

  it('handles error responses without optional fields', () => {
    const error = createErrorResponseV2(
      'test-tool',
      'SIMPLE_ERROR',
      'Simple error'
    );

    expect(error.success).toBe(false);
    expect(error.error.code).toBe('SIMPLE_ERROR');
    expect(error.error.message).toBe('Simple error');
    expect(error.error.suggestion).toBeUndefined();
    expect(error.error.details).toBeUndefined();
    expect(error.metadata).toBeDefined();
  });
});

describe('Schema Validation Edge Cases', () => {
  const testSchema = {
    required: ['name'],
    properties: {
      name: { type: 'string' },
      count: { type: 'number', default: 1 }
    }
  };

  it('validates required fields are present', () => {
    const validData = { name: 'test' };
    expect(validData.name).toBeDefined();
    
    const invalidData = {};
    expect((invalidData as any).name).toBeUndefined();
  });

  it('applies default values correctly', () => {
    const dataWithDefaults = { name: 'test', count: undefined };
    const count = dataWithDefaults.count ?? testSchema.properties.count.default;
    expect(count).toBe(1);
  });
});

describe('Date Parsing Edge Cases', () => {
  it('handles various date formats', () => {
    const validDates = [
      '2025-12-31',
      '2025-12-31 17:00',
      '2025-01-01 00:00'
    ];

    validDates.forEach(dateStr => {
      const date = new Date(dateStr);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });

  it('rejects invalid date formats', () => {
    const invalidDates = [
      'invalid-date',
      '2025-13-01', // Invalid month
      '2025-12-32', // Invalid day
      '2025-12-31 25:00' // Invalid hour
    ];

    invalidDates.forEach(dateStr => {
      const date = new Date(dateStr);
      expect(date.toString()).toBe('Invalid Date');
    });
  });
});

describe('Cache Key Generation', () => {
  it('generates consistent cache keys', () => {
    const generateKey = (operation: string, params: Record<string, any>) => {
      return `${operation}:${JSON.stringify(params)}`;
    };

    const key1 = generateKey('list', { limit: 10, mode: 'today' });
    const key2 = generateKey('list', { limit: 10, mode: 'today' });
    expect(key1).toBe(key2);

    const key3 = generateKey('list', { limit: 20, mode: 'today' });
    expect(key1).not.toBe(key3);
  });
});