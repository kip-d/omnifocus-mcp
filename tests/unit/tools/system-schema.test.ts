import { describe, it, expect } from 'vitest';
import { SystemToolSchema } from '../../../src/tools/system/SystemTool.js';

// OMN-90: SystemToolSchema must reject unknown fields. Without `.strict()`,
// an LLM that hallucinates a flag like `verbose` or `cacheKey` gets
// `success:true` with the field silently dropped, and the diagnose-failures
// pipeline never sees the schema mismatch — the same blind-spot class
// OMN-76 closed for omnifocus_write.
//
// Driven through `SystemToolSchema.safeParse` — the same seam
// `BaseTool.execute()` validates production input through.

describe('SystemToolSchema strictness (OMN-90)', () => {
  it('rejects unknown field on version operation', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'version',
      unknownField: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown field on diagnostics operation', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'diagnostics',
      testScript: 'list_tasks',
      unknownField: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown field on metrics operation (was silently dropped)', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'metrics',
      metricsType: 'detailed',
      unknownField: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown field on cache operation', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'cache',
      cacheAction: 'stats',
      unknownField: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects bare unknown field (no operation specified, falls back to version default)', () => {
    const result = SystemToolSchema.safeParse({ unknownField: 'x' });
    expect(result.success).toBe(false);
  });

  it('still accepts the documented version surface (no regression)', () => {
    const result = SystemToolSchema.safeParse({ operation: 'version' });
    expect(result.success).toBe(true);
  });

  it('still accepts the documented diagnostics surface (no regression)', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'diagnostics',
      testScript: 'list_tasks',
    });
    expect(result.success).toBe(true);
  });

  it('still accepts the documented metrics surface (no regression)', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'metrics',
      metricsType: 'summary',
    });
    expect(result.success).toBe(true);
  });

  it('still accepts the documented cache surface (no regression)', () => {
    const result = SystemToolSchema.safeParse({
      operation: 'cache',
      cacheAction: 'clear',
    });
    expect(result.success).toBe(true);
  });

  it('still accepts empty input — operation, testScript, metricsType, cacheAction all default (no regression)', () => {
    const result = SystemToolSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operation).toBe('version');
    }
  });
});
