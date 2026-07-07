// tests/unit/scripts/conformance-grading.test.ts
// OMN-246 — the conformance probe's grader must persist the model's RAW
// tool-call arguments on every failing case. The 2026-06-12 qwen failures were
// unrecoverable because only Zod issue strings were recorded (OMN-168's spec
// demanded artifact-derived fixes and half the shapes were gone); this makes
// any future failure diagnosable from the probe's own output.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { gradeToolCall, serializeRawArgs } from '../../../scripts/lib/conformance-grading.js';

const STRICT = z.object({ query: z.object({ type: z.literal('tasks') }).strict() }).strict();
const SCHEMAS = { omnifocus_read: STRICT };
const CASE = { id: 'today', prompt: 'What today?', expect: ['omnifocus_read'], note: 'n' };

function call(name: string, args: unknown): { function: { name: string; arguments: unknown } } {
  return { function: { name, arguments: args } };
}

describe('gradeToolCall — rawArgs capture (OMN-246)', () => {
  it('pass: no rawArgs recorded (report stays lean)', () => {
    const r = gradeToolCall(CASE, call('omnifocus_read', { query: { type: 'tasks' } }), SCHEMAS);
    expect(r.outcome).toBe('pass');
    expect(r.rawArgs).toBeUndefined();
  });

  it('schema_invalid: rawArgs carries the verbatim argument JSON', () => {
    const args = { data: { name: 'Buy milk', target_id: 'abc' } };
    const r = gradeToolCall(CASE, call('omnifocus_read', args), SCHEMAS);
    expect(r.outcome).toBe('schema_invalid');
    expect(r.rawArgs).toBe(JSON.stringify(args));
  });

  it('wrong_tool: rawArgs carries the argument JSON too', () => {
    const r = gradeToolCall(CASE, call('system', { operation: 'version' }), SCHEMAS);
    expect(r.outcome).toBe('wrong_tool');
    expect(r.rawArgs).toBe(JSON.stringify({ operation: 'version' }));
  });

  it('unparseable stringified arguments: rawArgs preserves the raw string', () => {
    const r = gradeToolCall(CASE, call('omnifocus_read', '{"query": {'), SCHEMAS);
    expect(r.outcome).toBe('schema_invalid');
    expect(r.issues).toEqual(['arguments not valid JSON']);
    expect(r.rawArgs).toBe('{"query": {');
  });

  it('no_tool_call: no rawArgs (there are no arguments)', () => {
    const r = gradeToolCall(CASE, undefined, SCHEMAS);
    expect(r.outcome).toBe('no_tool_call');
    expect(r.rawArgs).toBeUndefined();
  });

  it('stringified-but-valid arguments still grade (parity with the old grader)', () => {
    const r = gradeToolCall(CASE, call('omnifocus_read', JSON.stringify({ query: { type: 'tasks' } })), SCHEMAS);
    expect(r.outcome).toBe('pass');
  });
});

describe('serializeRawArgs', () => {
  it('serializes objects to JSON and passes strings through', () => {
    expect(serializeRawArgs({ a: 1 })).toBe('{"a":1}');
    expect(serializeRawArgs('already a string')).toBe('already a string');
  });

  it('truncates past the cap with a loud marker (never silently)', () => {
    const big = { note: 'x'.repeat(10_000) };
    const out = serializeRawArgs(big);
    expect(out.length).toBeLessThanOrEqual(4_000 + 40);
    expect(out).toContain('…[truncated');
  });

  it('survives unserializable values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(serializeRawArgs(cyclic)).toContain('unserializable');
  });

  it('survives values JSON.stringify maps to undefined (argument-less tool calls)', () => {
    // JSON.stringify(undefined) returns the VALUE undefined — without the
    // String() fallback this threw on `.length` and killed the case's artifact.
    expect(serializeRawArgs(undefined)).toBe('undefined');
    expect(serializeRawArgs(() => {})).toContain('=>');
  });
});
