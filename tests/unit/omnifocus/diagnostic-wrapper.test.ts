import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { isExpressionScript, wrapScriptWithDiagnostics } from '../../../src/omnifocus/DiagnosticOmniAutomation.js';
import { buildListTasksScriptV4 } from '../../../src/omnifocus/scripts/tasks.js';

// OMN-337: the diagnostic wrapper embedded every script as a function BODY, so an
// IIFE-expression script (no leading `return`) evaluated to undefined and
// diagnostics reported success with no payload. Pure string/eval tests — the
// wrapped JXA runs in a vm against a stubbed Application, no osascript.

function runWrapped(script: string, doc: unknown = {}): Record<string, unknown> {
  const sandbox = {
    Application: () => ({ name: () => 'OmniFocus', defaultDocument: () => doc }),
  };
  return JSON.parse(vm.runInNewContext(wrapScriptWithDiagnostics(script), sandbox) as string);
}

describe('isExpressionScript', () => {
  it('detects an IIFE expression, with or without a trailing semicolon', () => {
    expect(isExpressionScript('(() => { return 1; })()')).toBe(true);
    expect(isExpressionScript('(() => { return 1; })();\n')).toBe(true);
  });

  it('treats a top-level-return body as a body', () => {
    expect(isExpressionScript('return JSON.stringify({ a: 1 });')).toBe(false);
    expect(isExpressionScript('const x = 1;\nreturn JSON.stringify({ x });')).toBe(false);
  });

  it('classifies the real list-tasks V4 script as an expression', () => {
    const script = buildListTasksScriptV4({ filter: { limit: 1, mode: 'all' }, fields: [], limit: 1 });
    expect(isExpressionScript(script)).toBe(true);
  });
});

describe('wrapScriptWithDiagnostics', () => {
  it("returns an IIFE-expression script's value", () => {
    const out = runWrapped('(() => JSON.stringify({ test: "expr", n: 1 }))();');
    expect(out.test).toBe('expr');
    expect(out.n).toBe(1);
    expect(out.diagnostics).toBeDefined();
  });

  it('still runs a body script (top-level return, wrapper-scope app/doc)', () => {
    const out = runWrapped(
      'return JSON.stringify({ test: "body", appName: app.name(), docAvailable: doc ? true : false });',
    );
    expect(out).toMatchObject({ test: 'body', appName: 'OmniFocus', docAvailable: true });
  });

  it('reports a missing document as an error payload', () => {
    const out = runWrapped('return JSON.stringify({ test: "body" });', null);
    expect(out.error).toBe(true);
    expect(out.message).toContain('No OmniFocus document available');
  });

  it('the real list-tasks V4 script wraps into valid JavaScript', () => {
    const script = buildListTasksScriptV4({ filter: { limit: 1, mode: 'all' }, fields: [], limit: 1 });
    expect(() => new vm.Script(wrapScriptWithDiagnostics(script))).not.toThrow();
  });
});
