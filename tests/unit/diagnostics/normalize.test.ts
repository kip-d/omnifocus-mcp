// tests/unit/diagnostics/normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeErrorMessage, normalizeInputShape } from '../../../src/diagnostics/normalize.js';

describe('normalizeErrorMessage', () => {
  it('replaces hex IDs and ISO dates with placeholders and truncates to 100 chars', () => {
    expect(normalizeErrorMessage('task a1b2c3d4e5 not found on 2026-05-18')).toBe('task ID not found on DATE');
    expect(normalizeErrorMessage('x'.repeat(200)).length).toBe(100);
  });
});

describe('normalizeInputShape', () => {
  it('produces a stable shape string keyed by sorted top-level keys, not values', () => {
    expect(normalizeInputShape({ b: 2, a: 'hello' })).toBe(normalizeInputShape({ a: 'world', b: 99 }));
    expect(normalizeInputShape({ a: 1 })).not.toBe(normalizeInputShape({ a: 1, c: 2 }));
  });
  it('handles non-object inputs', () => {
    expect(normalizeInputShape(null)).toBe('<non-object>');
    expect(normalizeInputShape('str')).toBe('<non-object>');
  });
});
