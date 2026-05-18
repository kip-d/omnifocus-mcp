// tests/unit/diagnostics/failure-log.test.ts
import { describe, it, expect } from 'vitest';
import { parseFailureLog } from '../../../src/diagnostics/failure-log.js';

describe('parseFailureLog', () => {
  it('parses valid JSONL lines into FailureRecord[]', () => {
    const jsonl = [
      JSON.stringify({
        timestamp: '2026-05-18T10:00:00.000Z',
        tool: 'omnifocus_write',
        errorType: 'VALIDATION_ERROR',
        errorMessage: 'name: Required',
        inputArgs: { x: 1 },
        schemaDescription: 'd',
      }),
      JSON.stringify({
        timestamp: '2026-05-18T10:01:00.000Z',
        tool: 'omnifocus_read',
        errorType: 'EXECUTION_ERROR',
        errorMessage: 'boom',
        inputArgs: {},
        schemaDescription: 'd',
        categorization: { errorType: 'INVALID_ID', severity: 'low', recoverable: true },
      }),
    ].join('\n');
    const recs = parseFailureLog(jsonl);
    expect(recs).toHaveLength(2);
    expect(recs[0].tool).toBe('omnifocus_write');
    expect(recs[1].categorization?.errorType).toBe('INVALID_ID');
  });

  it('skips malformed lines and blank lines without throwing', () => {
    const jsonl =
      'not json\n\n' +
      JSON.stringify({
        timestamp: '2026-05-18T10:00:00.000Z',
        tool: 't',
        errorType: 'EXECUTION_ERROR',
        errorMessage: 'e',
        inputArgs: {},
        schemaDescription: 'd',
      });
    const recs = parseFailureLog(jsonl);
    expect(recs).toHaveLength(1);
  });
});
