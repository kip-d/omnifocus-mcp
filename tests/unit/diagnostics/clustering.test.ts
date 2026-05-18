// tests/unit/diagnostics/clustering.test.ts
import { describe, it, expect } from 'vitest';
import { clusterFailures } from '../../../src/diagnostics/clustering.js';
import type { FailureRecord } from '../../../src/diagnostics/failure-log.js';

const rec = (over: Partial<FailureRecord>): FailureRecord => ({
  timestamp: '2026-05-18T10:00:00.000Z',
  tool: 'omnifocus_write',
  errorType: 'VALIDATION_ERROR',
  errorMessage: 'name: Required',
  inputArgs: { name: 1 },
  schemaDescription: 'd',
  ...over,
});

describe('clusterFailures', () => {
  it('groups by (tool, normalizedError, inputShape) and assigns a stable fingerprint', () => {
    const clusters = clusterFailures([rec({}), rec({ inputArgs: { name: 2 } }), rec({})], {
      minOccurrences: 1,
      minSpanDays: 999,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
    expect(clusters[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('escalates a cluster with count >= minOccurrences', () => {
    const recs = [rec({}), rec({}), rec({})];
    const [c] = clusterFailures(recs, { minOccurrences: 3, minSpanDays: 999 });
    expect(c.escalated).toBe(true);
  });

  it('escalates a low-count cluster that spans >= minSpanDays', () => {
    const recs = [rec({ timestamp: '2026-05-10T10:00:00.000Z' }), rec({ timestamp: '2026-05-18T10:00:00.000Z' })];
    const [c] = clusterFailures(recs, { minOccurrences: 99, minSpanDays: 2 });
    expect(c.escalated).toBe(true);
    expect(c.count).toBe(2);
  });

  it('does not escalate a fresh low-count cluster', () => {
    const [c] = clusterFailures([rec({}), rec({})], { minOccurrences: 3, minSpanDays: 2 });
    expect(c.escalated).toBe(false);
  });

  it('treats unparseable timestamps as span=0 (no NaN misfire, falls back to count rule)', () => {
    const [c] = clusterFailures([rec({ timestamp: '' }), rec({ timestamp: '' })], {
      minOccurrences: 3,
      minSpanDays: 2,
    });
    expect(c.escalated).toBe(false);
  });
});
