import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  SCRIPT_ERROR_CONTEXT,
  detectKnownErrorShape,
  truncateRawOutput,
  slimUnionIssues,
} from '../../../src/omnifocus/script-result-types.js';

describe('detectKnownErrorShape', () => {
  it('detects legacy {error: true} — canonical SCRIPT_REPORTED context', () => {
    const r = detectKnownErrorShape({ error: true, message: 'boom', details: 'ctx' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('boom');
    expect(r?.context).toBe(SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED);
    expect(r?.details).toBe('ctx');
  });

  it("detects legacy {error: 'true'} (stringified by the bridge) — canonical SCRIPT_REPORTED context", () => {
    const r = detectKnownErrorShape({ error: 'true', message: 'boom' });
    expect(r?.success).toBe(false);
    expect(r?.context).toBe(SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED);
  });

  it('detects the modern envelope error {ok: false, error: {message}, v}', () => {
    const r = detectKnownErrorShape({ ok: false, error: { message: 'bridge died' }, v: '3' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('bridge died');
  });

  it('detects {success: false} — canonical SCRIPT_REPORTED context; script context moved to details', () => {
    const r = detectKnownErrorShape({ success: false, message: 'no project', context: 'projects_for_review' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('no project');
    // context is now the canonical string, NOT the script-supplied value
    expect(r?.context).toBe(SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED);
    // script's original context is preserved in details.scriptContext
    expect((r?.details as Record<string, unknown>)?.scriptContext).toBe('projects_for_review');
  });

  it('detects {success: false} without script context — canonical SCRIPT_REPORTED context', () => {
    const r = detectKnownErrorShape({ success: false, error: 'mark failed' });
    expect(r?.error).toBe('mark failed');
    expect(r?.context).toBe(SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED);
  });

  it('returns null for success shapes and non-errors', () => {
    expect(detectKnownErrorShape({ ok: true, v: '3', data: {} })).toBeNull();
    expect(detectKnownErrorShape({ tasks: [] })).toBeNull();
    expect(detectKnownErrorShape({ error: false, count: 3 })).toBeNull();
    expect(detectKnownErrorShape('Error: timeout')).toBeNull(); // strings are NOT a known shape — schema handles them
    expect(detectKnownErrorShape(null)).toBeNull();
    expect(detectKnownErrorShape({ error: 'iteration aborted' })).toBeNull(); // error-as-string ≠ known shape; fails closed at schema step
  });
});

describe('slimUnionIssues', () => {
  // Schemas used in tests
  const RenamedBranch = z
    .object({ action: z.literal('renamed'), oldName: z.string(), newName: z.string(), message: z.string() })
    .strict();
  const DeletedBranch = z.object({ action: z.literal('deleted'), tagName: z.string(), message: z.string() }).strict();
  const CreatedPathBranch = z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      path: z.string(),
      createdSegments: z.array(z.string()),
      message: z.string(),
    })
    .strict();
  const CreatedFlatBranch = z
    .object({
      action: z.literal('created'),
      tagName: z.string(),
      tagId: z.string(),
      parentTagName: z.string().nullable(),
      parentTagId: z.string().nullable(),
      message: z.string(),
    })
    .strict();

  const TestUnion = z.union([RenamedBranch, DeletedBranch, CreatedPathBranch, CreatedFlatBranch]);

  // Non-union schema for passthrough tests
  const PlainSchema = z.object({ taskId: z.string(), name: z.string() }).strict();

  it('returns input unchanged when issues array is empty', () => {
    const issues: z.ZodIssue[] = [];
    expect(slimUnionIssues(TestUnion, {}, issues)).toBe(issues);
  });

  it('returns input unchanged when top issue is not invalid_union', () => {
    const validation = PlainSchema.safeParse({ taskId: 123, name: 'x' });
    expect(validation.success).toBe(false);
    const issues = validation.error!.issues;
    expect(issues[0].code).not.toBe('invalid_union');
    expect(slimUnionIssues(TestUnion, { taskId: 123, name: 'x' }, issues)).toBe(issues);
  });

  it('returns input unchanged for a non-union schema', () => {
    const failVal = { taskId: 123 };
    const validation = TestUnion.safeParse(failVal);
    expect(validation.success).toBe(false);
    const issues = validation.error!.issues;
    // Pass a non-union schema — should return issues unchanged
    expect(slimUnionIssues(PlainSchema, failVal, issues)).toBe(issues);
  });

  it('slims to the single matching branch (renamed near-miss: oldName wrong type)', () => {
    // action:'renamed' matches only RenamedBranch; oldName is wrong type
    const value = { action: 'renamed', oldName: 123, newName: 'x', message: 'y' };
    const validation = TestUnion.safeParse(value);
    expect(validation.success).toBe(false);
    const original = validation.error!.issues;
    expect(original[0].code).toBe('invalid_union');

    const slimmed = slimUnionIssues(TestUnion, value, original);
    // Must not be the full unionErrors — must be only the renamed branch's issues
    expect(slimmed).not.toBe(original);
    // All slimmed issues should reference the 'renamed' branch (oldName wrong type)
    expect(slimmed.length).toBeGreaterThan(0);
    // The slimmed issues should not contain reference to other branches' keys
    const paths = slimmed.map((i) => i.path[0] as string);
    expect(paths).toContain('oldName');
    // Should not contain issues about keys like 'tagName' (deleted branch) or 'tagId' (created)
    expect(paths.every((p) => !['tagName', 'tagId', 'path', 'createdSegments'].includes(p))).toBe(true);
  });

  it('returns input unchanged when no branch action literal matches (action:bogus)', () => {
    const value = { action: 'bogus', oldName: 'a', newName: 'b', message: 'c' };
    const validation = TestUnion.safeParse(value);
    expect(validation.success).toBe(false);
    const original = validation.error!.issues;
    expect(slimUnionIssues(TestUnion, value, original)).toBe(original);
  });

  it('returns input unchanged when multiple branches share the same action literal (created: two branches)', () => {
    // action:'created' matches BOTH CreatedPathBranch and CreatedFlatBranch
    const value = { action: 'created', tagName: 'Work', tagId: 't1', path: 123, message: 'y' };
    const validation = TestUnion.safeParse(value);
    expect(validation.success).toBe(false);
    const original = validation.error!.issues;
    expect(slimUnionIssues(TestUnion, value, original)).toBe(original);
  });

  it('returns input unchanged for shared-literal schema (both branches share completed:literal(true))', () => {
    // Both branches have completed:literal(true) → both match the literal → multiple match → unchanged.
    const CompleteSchema = z.union([
      z.object({ taskId: z.string(), name: z.string(), completed: z.literal(true) }).strict(),
      z.object({ projectId: z.string(), name: z.string(), completed: z.literal(true) }).strict(),
    ]);
    // A value where completed:true is present but something else is wrong (taskId wrong type)
    const value = { taskId: 123, name: 'x', completed: true };
    const validation = CompleteSchema.safeParse(value);
    expect(validation.success).toBe(false);
    const original = validation.error!.issues;
    // Both branches match completed:literal(true) → multiple match → unchanged
    expect(slimUnionIssues(CompleteSchema, value, original)).toBe(original);
  });

  it('returns input unchanged when value is not an object (array)', () => {
    const value = ['not', 'an', 'object'];
    const validation = TestUnion.safeParse(value);
    expect(validation.success).toBe(false);
    const original = validation.error!.issues;
    expect(slimUnionIssues(TestUnion, value, original)).toBe(original);
  });
});

describe('truncateRawOutput', () => {
  it('truncates serialized output to 2000 chars with a marker', () => {
    const big = { blob: 'x'.repeat(5000) };
    const out = truncateRawOutput(big);
    expect(out.length).toBeLessThanOrEqual(2000 + '…[truncated]'.length);
    expect(out.endsWith('…[truncated]')).toBe(true);
  });
  it('passes short output through unchanged', () => {
    expect(truncateRawOutput({ a: 1 })).toBe('{"a":1}');
  });
  it('passes strings through as-is', () => {
    expect(truncateRawOutput('plain')).toBe('plain');
  });
  it("returns 'undefined' for undefined input without throwing", () => {
    expect(truncateRawOutput(undefined)).toBe('undefined');
  });
  it('falls back to String(value) for circular references (catch branch)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(truncateRawOutput(circular)).toBe('[object Object]');
  });
});
