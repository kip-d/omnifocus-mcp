// tests/unit/diagnostics/classify.test.ts
import { describe, it, expect } from 'vitest';
import { classifyCluster, isIgnored } from '../../../src/diagnostics/clustering.js';
import type { FailureCluster } from '../../../src/diagnostics/clustering.js';

const cluster = (over: Partial<FailureCluster>): FailureCluster => ({
  fingerprint: 'abc',
  tool: 't',
  normalizedError: 'e',
  inputShape: 'a',
  count: 5,
  firstSeen: '',
  lastSeen: '',
  escalated: true,
  example: {
    timestamp: '',
    tool: 't',
    errorType: 'VALIDATION_ERROR',
    errorMessage: 'e',
    inputArgs: {},
    schemaDescription: 'd',
  },
  ...over,
});

describe('isIgnored', () => {
  it('ignores data/infra noise classes', () => {
    for (const t of ['INVALID_ID', 'NULL_RESULT', 'OMNIFOCUS_NOT_RUNNING', 'SCRIPT_TIMEOUT', 'CONNECTION_TIMEOUT']) {
      expect(isIgnored(cluster({ example: { ...cluster({}).example, categorization: { errorType: t } } }))).toBe(true);
    }
  });
  it('does not ignore validation errors', () => {
    expect(isIgnored(cluster({}))).toBe(false);
  });
});

describe('classifyCluster', () => {
  it('classifies a Zod validation cluster as VALIDATION (candidate for drift/coercion/description)', () => {
    expect(classifyCluster(cluster({}))).toBe('VALIDATION');
  });
  it('classifies an ignored cluster as DATA_ERROR', () => {
    const c = cluster({
      example: { ...cluster({}).example, errorType: 'EXECUTION_ERROR', categorization: { errorType: 'INVALID_ID' } },
    });
    expect(classifyCluster(c)).toBe('DATA_ERROR');
  });
});
