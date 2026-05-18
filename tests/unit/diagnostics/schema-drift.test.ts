// tests/unit/diagnostics/schema-drift.test.ts
import { describe, it, expect } from 'vitest';
import { canonicalizeInputSchema } from '../../../src/diagnostics/schema-drift.js';

describe('canonicalizeInputSchema', () => {
  it('flattens a flat advertised JSON schema (system tool — no wrapper)', () => {
    const adv = {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['version', 'cache'] },
        limit: { type: 'number' },
      },
      required: ['operation'],
    };
    const c = canonicalizeInputSchema(adv); // wrapperKey omitted
    expect(c.operation).toEqual({ type: 'string', required: true, enum: ['version', 'cache'] });
    expect(c.limit).toEqual({ type: 'number', required: false, enum: undefined });
  });

  it('descends into a single wrapper key (read/write/analyze nest real fields under query/mutation/analysis)', () => {
    // Mirrors OmniFocusReadTool.inputSchema: { properties: { query: { properties: {...}, required: ['type'] } } }
    const adv = {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: { type: { type: 'string', enum: ['tasks', 'projects'] }, limit: { type: 'number' } },
          required: ['type'],
        },
      },
      required: ['query'],
    };
    const c = canonicalizeInputSchema(adv, 'query');
    expect(c.type).toEqual({ type: 'string', required: true, enum: ['tasks', 'projects'] });
    expect(c.limit).toEqual({ type: 'number', required: false, enum: undefined });
    expect(c.query).toBeUndefined(); // the wrapper itself is not a field
  });
});
