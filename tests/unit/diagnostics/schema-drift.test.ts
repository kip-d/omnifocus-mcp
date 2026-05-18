// tests/unit/diagnostics/schema-drift.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { canonicalizeInputSchema, canonicalizeZodSchema } from '../../../src/diagnostics/schema-drift.js';

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

describe('canonicalizeZodSchema', () => {
  it('marks z.coerce.number() fields coercible and bare z.number() non-coercible (behavioral probe, not syntactic)', () => {
    const schema = z.object({
      a: z.coerce.number(),
      b: z.number(),
      mode: z.enum(['x', 'y']),
      note: z.string().optional(),
    });
    const c = canonicalizeZodSchema(schema);
    // NOTE: `coercible` is only meaningful for NUMERIC fields. A non-numeric optional like
    // `note` also probes coercible=true (z.string().optional().safeParse('5') succeeds); that
    // is harmless because diffSchemas only consults `coercible` when advertised type==='number'.
    expect(c.a.coercible).toBe(true); // z.coerce.number().safeParse('5') succeeds
    expect(c.b.coercible).toBe(false); // z.number().safeParse('5') fails
    expect(c.mode.enum).toEqual(['x', 'y']);
    expect(c.note.required).toBe(false);
  });

  it('descends a single wrapper key whose inner is z.preprocess(...) over a discriminatedUnion (the real read/write/analyze shape)', () => {
    // Mirrors ReadSchema = z.object({ query: coerceObject(QuerySchema) }),
    // QuerySchema = z.discriminatedUnion('type', [...]). coerceObject = z.preprocess(fn, inner).
    const coerceObject = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => v, s);
    const QuerySchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('tasks'), limit: z.coerce.number().optional(), flagged: z.boolean().optional() }),
      z.object({ type: z.literal('projects'), limit: z.coerce.number().optional() }),
    ]);
    const ReadSchema = z.object({ query: coerceObject(QuerySchema) });

    const c = canonicalizeZodSchema(ReadSchema, 'query');
    // Discriminator: union of member literal values.
    expect(c.type.enum?.sort()).toEqual(['projects', 'tasks']);
    expect(c.type.required).toBe(true); // required in every member
    // limit present in all members -> required iff required in all (it's optional -> not required), and coercible.
    expect(c.limit.coercible).toBe(true);
    expect(c.limit.required).toBe(false);
    // flagged present in only ONE member -> not required (absent from a member counts as not-required).
    expect(c.flagged.required).toBe(false);
  });
});
