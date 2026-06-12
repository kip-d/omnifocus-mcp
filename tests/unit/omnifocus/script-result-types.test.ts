import { describe, it, expect } from 'vitest';
import { detectKnownErrorShape, truncateRawOutput } from '../../../src/omnifocus/script-result-types.js';

describe('detectKnownErrorShape', () => {
  it('detects legacy {error: true} with verbatim wire context', () => {
    const r = detectKnownErrorShape({ error: true, message: 'boom', details: 'ctx' });
    expect(r).toEqual({ success: false, error: 'boom', context: 'Legacy script error', details: 'ctx' });
  });

  it("detects legacy {error: 'true'} (stringified by the bridge)", () => {
    const r = detectKnownErrorShape({ error: 'true', message: 'boom' });
    expect(r?.success).toBe(false);
    expect(r?.context).toBe('Legacy script error');
  });

  it('detects the modern envelope error {ok: false, error: {message}, v}', () => {
    const r = detectKnownErrorShape({ ok: false, error: { message: 'bridge died' }, v: '3' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('bridge died');
  });

  it('detects {success: false} and prefers the script-supplied context field', () => {
    const r = detectKnownErrorShape({ success: false, message: 'no project', context: 'projects_for_review' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('no project');
    expect(r?.context).toBe('projects_for_review'); // spec §3.4 precedence
  });

  it("falls back to 'Legacy script error' context for {success: false} without context", () => {
    const r = detectKnownErrorShape({ success: false, error: 'mark failed' });
    expect(r?.error).toBe('mark failed');
    expect(r?.context).toBe('Legacy script error');
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
