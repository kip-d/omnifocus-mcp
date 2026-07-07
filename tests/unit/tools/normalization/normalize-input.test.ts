import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ReadSchema } from '../../../../src/tools/unified/schemas/read-schema.js';
import { WriteSchema } from '../../../../src/tools/unified/schemas/write-schema.js';
import { AnalyzeSchema } from '../../../../src/tools/unified/schemas/analyze-schema.js';
import { parseWithNormalization } from '../../../../src/tools/normalization/normalize-input.js';

// OMN-122: normalize-then-strict input layer.
// Invariants asserted across every leniency (the TDD contract from the ticket):
//   1. malformed-in  → canonical-out (normalization applied, strict re-validate passes)
//   2. canonical-in  → untouched     (strict passes first try, `applied` empty)
//   3. un-normalizable → ORIGINAL strict error preserved (byte-for-byte behavior)

describe('parseWithNormalization — invariants', () => {
  it('canonical read input passes untouched (no normalization applied)', () => {
    const r = parseWithNormalization(ReadSchema, { query: { type: 'tasks' } }, 'omnifocus_read');
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });

  it('canonical write input passes untouched (no normalization applied)', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'create', target: 'task', data: { name: 'Buy milk' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });

  it('un-normalizable input preserves the ORIGINAL strict ZodError', () => {
    // A genuinely invalid read: unknown discriminant value, nothing the normalizer can repair.
    const args = { query: { type: 'not_a_real_type' } };
    const original = ReadSchema.safeParse(args);
    expect(original.success).toBe(false);

    const r = parseWithNormalization(ReadSchema, args, 'omnifocus_read');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
    // Same error issues as a plain strict parse — unchanged behavior.
    expect(r.error).toBeInstanceOf(z.ZodError);
    expect(JSON.stringify(r.error!.issues)).toBe(JSON.stringify((original as z.SafeParseError<unknown>).error.issues));
  });

  it('unknown tool name (no wrapper hint) returns the original strict error, no normalization', () => {
    const args = { operation: 'create' };
    const r = parseWithNormalization(WriteSchema, args, 'system');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
  });
});

describe('leniency #1 — wrapper-lift (malformed-in → canonical-out)', () => {
  it('read: lifts root-level {type:"tasks"} into {query:{...}}', () => {
    const r = parseWithNormalization(ReadSchema, { type: 'tasks' }, 'omnifocus_read');
    expect(r.success).toBe(true);
    expect(r.applied).toContain('wrapper-lift');
    expect(r.data).toEqual({ query: { type: 'tasks' } });
  });

  it('read: lifts root-level query fields alongside the discriminant', () => {
    const r = parseWithNormalization(ReadSchema, { type: 'tasks', mode: 'flagged', limit: 10 }, 'omnifocus_read');
    expect(r.success).toBe(true);
    expect(r.applied).toContain('wrapper-lift');
    expect(r.data).toMatchObject({ query: { type: 'tasks', mode: 'flagged', limit: 10 } });
  });

  it('analyze: lifts root-level {type:"productivity_stats"} into {analysis:{...}}', () => {
    const r = parseWithNormalization(AnalyzeSchema, { type: 'productivity_stats' }, 'omnifocus_analyze');
    expect(r.success).toBe(true);
    expect(r.applied).toContain('wrapper-lift');
    expect(r.data).toEqual({ analysis: { type: 'productivity_stats' } });
  });

  it('write: lifts root-level create {operation,target,data} into {mutation:{...}}', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { operation: 'create', target: 'task', data: { name: 'Buy milk' } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('wrapper-lift');
    expect(r.data).toMatchObject({ mutation: { operation: 'create', target: 'task', data: { name: 'Buy milk' } } });
  });

  it('does NOT lift when the wrapper key is already present (canonical wins)', () => {
    const r = parseWithNormalization(ReadSchema, { query: { type: 'tasks' } }, 'omnifocus_read');
    expect(r.applied).toEqual([]);
  });

  it('does NOT lift when the discriminant is absent (nothing to recognize)', () => {
    // No `type` and no `query` → not a recognizable inner shape; original error preserved.
    const r = parseWithNormalization(ReadSchema, { limit: 10 }, 'omnifocus_read');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
  });
});

describe('leniency #2 — stringified-wrapper repair-parse (malformed-in → canonical-out)', () => {
  // The 70b's signature (OMN-121): the wrapper value is a JSON string, often TRUNCATED
  // (missing trailing closing braces) so coerceObject's strict JSON.parse rejects it.
  it('parses a well-formed stringified mutation wrapper', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: '{"operation":"create","target":"task","data":{"name":"Buy milk"}}' },
      'omnifocus_write',
    );
    // coerceObject already handles valid JSON at the wrapper — passes WITHOUT our layer.
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });

  it('repairs a TRUNCATED stringified mutation (missing closing brace) — real 70b shape', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: '{"operation": "create", "target": "task", "data": {"name": "Buy milk"}' },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('stringified-wrapper-repair');
    expect(r.data).toMatchObject({ mutation: { operation: 'create', target: 'task', data: { name: 'Buy milk' } } });
  });

  it('repairs a truncated stringified query wrapper (read)', () => {
    const r = parseWithNormalization(
      ReadSchema,
      { query: '{"type": "tasks", "filters": {"project": null}' },
      'omnifocus_read',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('stringified-wrapper-repair');
    expect(r.data).toMatchObject({ query: { type: 'tasks', filters: { project: null } } });
  });

  it('does NOT misrepair an unrelated string → original strict error preserved', () => {
    const r = parseWithNormalization(WriteSchema, { mutation: 'not json at all' }, 'omnifocus_write');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
  });
});

describe('leniency #3 — data-hoist on non-create mutations (malformed-in → canonical-out)', () => {
  // The 8b's signature (OMN-121): `id` nested inside `data` on complete/update/delete.
  it('hoists id out of data on complete — real 8b shape', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'complete', target: 'task', data: { id: 'abc123' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('data-hoist-id');
    expect(r.data).toMatchObject({ mutation: { operation: 'complete', target: 'task', id: 'abc123' } });
  });

  it('hoists id and maps remaining data→changes on update', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'update', target: 'task', data: { id: 'xyz', flagged: true } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('data-hoist-id');
    expect(r.data).toMatchObject({ mutation: { operation: 'update', id: 'xyz', changes: { flagged: true } } });
  });

  it('preserves a sibling completionDate when hoisting id out of data on complete (no silent drop)', () => {
    // Double-malformation: id AND a schema-valid completionDate both nested in data.
    // The hoist must not silently drop completionDate (OMN-97 anti-pattern).
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'complete', target: 'task', data: { id: 'abc', completionDate: '2026-06-01 17:00' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('data-hoist-id');
    expect(r.data).toMatchObject({
      mutation: { operation: 'complete', target: 'task', id: 'abc', completionDate: '2026-06-01 17:00' },
    });
  });

  it('hoists id out of data on delete', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'delete', target: 'task', data: { id: 'del1' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('data-hoist-id');
    expect(r.data).toMatchObject({ mutation: { operation: 'delete', target: 'task', id: 'del1' } });
  });

  it('does NOT touch create (data is canonical on create)', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'create', target: 'task', data: { name: 'x' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });

  it('does NOT touch a canonical update with id already at mutation level', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'update', id: 'abc', changes: { flagged: true } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });
});

describe('leniency #4 — mutation-field-alias (OMN-168)', () => {
  it('recovers the recorded qwen complete artifact: root {operation, target_id} (2026-06-12)', () => {
    // Verbatim shape from the OMN-168 ticket: strict error was
    // "mutation: Required; (root): Unrecognized key(s): 'operation', 'target_id'",
    // which fully determines the root keys. Wrapper-lift alone left the lifted
    // mutation failing strict on the field name; the alias closes it.
    const r = parseWithNormalization(
      WriteSchema,
      { operation: 'complete', target_id: 'task-abc123' },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toContain('wrapper-lift');
    expect(r.applied).toContain('mutation-field-alias');
    expect(r.data).toMatchObject({ mutation: { operation: 'complete', id: 'task-abc123' } });
  });

  it('aliases target_id → id inside an already-wrapped mutation (no lift needed)', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'complete', target: 'task', target_id: 'task-xyz' } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual(['mutation-field-alias']);
    expect(r.data).toMatchObject({ mutation: { operation: 'complete', target: 'task', id: 'task-xyz' } });
  });

  it('composes with data-hoist: update with data.target_id + residual fields', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { operation: 'update', data: { target_id: 'task-42', note: 'hello' } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual(['wrapper-lift', 'mutation-field-alias', 'data-hoist-id']);
    expect(r.data).toMatchObject({
      mutation: { operation: 'update', id: 'task-42', changes: { note: 'hello' } },
    });
  });

  it('collision-safe: both id and target_id present → leniency skipped, original error stands', () => {
    const args = { mutation: { operation: 'complete', target: 'task', id: 'a', target_id: 'b' } };
    const original = WriteSchema.safeParse(args);
    expect(original.success).toBe(false);

    const r = parseWithNormalization(WriteSchema, args, 'omnifocus_write');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
    expect(JSON.stringify(r.error!.issues)).toBe(JSON.stringify((original as z.SafeParseError<unknown>).error.issues));
  });

  it('does NOT touch delete, where target_id is a native schema-level alias (OMN-71)', () => {
    // Strict-first: this shape is already valid, so normalization never runs.
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'delete', target: 'task', target_id: 'del-1' } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });
});

describe('OMN-247 — leniencies must never rewrite the mutation discriminant', () => {
  it('gate round 2: ABSENT outer target + nested data.target is NOT a contradiction — complete recovers (OMN-75 leniency)', () => {
    // Pre-#247 this recovered (complete spreads data.target up); the first
    // guard draft compared nested !== undefined and aborted. Absent means
    // "fill from nested", never "conflict".
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'complete', data: { id: 't1', target: 'project' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    const m = (r.data as { mutation: Record<string, unknown> }).mutation;
    expect(m.id).toBe('t1');
    expect(m.target).toBe('project');
    expect(r.applied).toEqual(['data-hoist-id']);
  });

  it('gate round 2: delete with a residual data field ABORTS recovery — never silently drops it (OMN-97 class)', () => {
    const args = {
      mutation: { operation: 'delete', target: 'task', data: { id: 't1', reason: 'duplicate-of-t2' } },
    };
    const original = WriteSchema.safeParse(args);
    expect(original.success).toBe(false);

    const r = parseWithNormalization(WriteSchema, args, 'omnifocus_write');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
    expect(JSON.stringify(r.error!.issues)).toBe(JSON.stringify((original as z.SafeParseError<unknown>).error.issues));
  });

  it('the confirmed hijack: complete + nested data.operation:delete is NOT recovered as a delete', () => {
    // /code-review 2026-07-07 verified trace: strict fails (complete has no
    // `data`), the hoist copied the residual over the top level, and the
    // flipped object passed the DELETE schema — task deleted instead of
    // completed. The recovery must abort: conflicting dispatch keys mean the
    // request's intent is ambiguous, so the ORIGINAL strict error stands.
    const args = {
      mutation: { operation: 'complete', target: 'task', data: { id: 't1', operation: 'delete' } },
    };
    const original = WriteSchema.safeParse(args);
    expect(original.success).toBe(false);

    const r = parseWithNormalization(WriteSchema, args, 'omnifocus_write');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
    expect(JSON.stringify(r.error!.issues)).toBe(JSON.stringify((original as z.SafeParseError<unknown>).error.issues));
  });

  it('nested data.target conflicting with the outer target also aborts recovery', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'complete', target: 'task', data: { id: 't1', target: 'project' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
  });

  it('delete + conflicting nested data.operation aborts instead of silently dropping the conflict', () => {
    // Pre-OMN-247 the delete branch dropped ALL residuals, so a nested
    // operation:'complete' was silently discarded and the DELETE executed —
    // the same ambiguity in the other direction.
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'delete', target: 'task', data: { id: 't1', operation: 'complete' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]);
  });

  it('a REDUNDANT echo of the outer discriminant is dropped and recovery proceeds', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'complete', target: 'task', data: { id: 't1', operation: 'complete' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual(['data-hoist-id']);
    expect(r.data).toMatchObject({ mutation: { operation: 'complete', target: 'task', id: 't1' } });
  });

  it('legitimate complete residuals (completionDate) still hoist and spread', () => {
    const r = parseWithNormalization(
      WriteSchema,
      {
        mutation: {
          operation: 'complete',
          target: 'task',
          data: { id: 't1', completionDate: '2026-07-01 12:00' },
        },
      },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual(['data-hoist-id']);
    expect(r.data).toMatchObject({
      mutation: { operation: 'complete', id: 't1', completionDate: '2026-07-01 12:00' },
    });
  });

  it('update with an echoed data.operation recovers to changes WITHOUT the dispatch key', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'update', target: 'task', data: { id: 't1', operation: 'update', note: 'hi' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual(['data-hoist-id']);
    expect(r.data).toMatchObject({ mutation: { operation: 'update', id: 't1', changes: { note: 'hi' } } });
  });
});
