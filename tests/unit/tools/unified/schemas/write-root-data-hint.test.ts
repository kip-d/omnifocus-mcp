// OMN-260 (spec: Technical/specs/OMN-260-root-data-only-wrapper-lift.md):
// root data-only mutation payloads ({data:{...}} with NO operation key) bypass
// wrapper-lift by construction — the leniency's discriminant gate is
// `'operation' in current`, and inferring the operation was declined with data
// (the create case would need a second inference for `target`, which has no
// default; the flag-update case is irreducibly multi-match). The adopted fix
// is REJECT-AND-HINT: the strict surface is unchanged (these payloads still
// fail), but the root-level unrecognized-'data' error now names the missing
// mutation envelope so any model/caller gets an actionable correction.
import { describe, it, expect } from 'vitest';
import { WriteSchema } from '../../../../../src/tools/unified/schemas/write-schema.js';
import { parseWithNormalization } from '../../../../../src/tools/normalization/normalize-input.js';

/** The two payloads recorded verbatim from the OMN-168 re-baseline (qwen2.5:7b, 2026-07-08). */
const RECORDED_PAYLOADS: Array<[string, Record<string, unknown>]> = [
  ['create-task-tags', { data: { name: 'Email Bob', tags: ['work', 'urgent'] } }],
  ['flag-update', { data: { flagged: true, id: 'xyz789' } }],
];

function joinedIssues(error: import('zod').ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
}

describe('OMN-260 — root data-only payloads reject WITH an envelope hint', () => {
  it.each(RECORDED_PAYLOADS)('%s: still fails validation (strict surface unchanged)', (_name, payload) => {
    const r = parseWithNormalization(WriteSchema, payload, 'omnifocus_write');
    expect(r.success).toBe(false);
    expect(r.applied).toEqual([]); // no leniency fires — nothing infers the operation
  });

  it.each(RECORDED_PAYLOADS)('%s: the error names the missing mutation envelope', (_name, payload) => {
    const r = parseWithNormalization(WriteSchema, payload, 'omnifocus_write');
    expect(r.success).toBe(false);
    const message = joinedIssues(r.error!);
    expect(message).toContain('mutation');
    expect(message).toContain("'operation' is required");
    expect(message).toContain('cannot be inferred');
  });

  it('the hint is root-only: an unrecognized data key at a NESTED level keeps the plain error', () => {
    // 'data' misplaced inside update.changes must not claim the envelope is
    // missing — the envelope is present; the field is just wrong.
    const r = WriteSchema.safeParse({
      mutation: { operation: 'update', target: 'task', id: 'x', changes: { data: { flagged: true } } },
    });
    expect(r.success).toBe(false);
    const message = r.success ? '' : joinedIssues(r.error);
    expect(message).not.toContain("'operation' is required");
  });

  it('canonical payloads are untouched (no hint, parse succeeds)', () => {
    const r = parseWithNormalization(
      WriteSchema,
      { mutation: { operation: 'create', target: 'task', data: { name: 'Buy milk' } } },
      'omnifocus_write',
    );
    expect(r.success).toBe(true);
    expect(r.applied).toEqual([]);
  });
});
