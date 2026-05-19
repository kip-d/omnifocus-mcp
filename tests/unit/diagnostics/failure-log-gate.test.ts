// tests/unit/diagnostics/failure-log-gate.test.ts
import { describe, it, expect } from 'vitest';
import { failureLogSuppression } from '../../../src/diagnostics/failure-log-gate.js';

describe('failureLogSuppression', () => {
  it('not suppressed when no signals present', () => {
    expect(failureLogSuppression({})).toEqual({ suppressed: false, reason: null });
    expect(failureLogSuppression({ NODE_ENV: 'production' })).toEqual({ suppressed: false, reason: null });
  });

  it('suppressed via NODE_ENV=test', () => {
    expect(failureLogSuppression({ NODE_ENV: 'test' })).toEqual({ suppressed: true, reason: 'node-env-test' });
  });

  it('suppressed via flag truthy values', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      expect(failureLogSuppression({ OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: v })).toEqual({
        suppressed: true,
        reason: 'disabled-flag',
      });
    }
  });

  it('flag off values do not suppress', () => {
    for (const v of ['', '0', 'false', 'FALSE', '   ']) {
      expect(failureLogSuppression({ OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: v, NODE_ENV: 'production' })).toEqual({
        suppressed: false,
        reason: null,
      });
    }
  });

  it('flag wins the reason when both signals are set', () => {
    expect(failureLogSuppression({ OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1', NODE_ENV: 'test' })).toEqual({
      suppressed: true,
      reason: 'disabled-flag',
    });
  });

  it('defaults to process.env when called with no argument', () => {
    // Under vitest NODE_ENV==='test', so the no-arg call must report suppressed.
    expect(failureLogSuppression().suppressed).toBe(true);
  });
});
