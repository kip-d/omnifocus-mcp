/**
 * OMN-111 — parse-safety guard for the sandbox-manager OmniJS sweep scripts.
 *
 * The cleanup sweeps embed an OmniJS program inside a JXA
 * `app.evaluateJavascript(`...`)` backtick template. A stray backtick anywhere
 * in that inner program (most insidiously a markdown-style `` `word` `` in a
 * comment) terminates the template literal early. The JS engine then parses the
 * next identifier as a bare token in the call's argument list and the WHOLE
 * sweep dies at parse time with "Unexpected identifier … Expected ')'". Because
 * the sweep is teardown code whose result is logged-not-asserted, the failure is
 * silent: every fixture the sweep should have deleted leaks into the real DB
 * (the OMN-111 inbox leak).
 *
 * Two complementary invariants pin the hazard: (1) the script PARSES — we wrap
 * it exactly as `executeJXA` does and hand it to `new Function` (same parse
 * pattern the OMN-87 predicate-parity test already uses); a template-termination
 * bug is a SyntaxError at parse time. (2) the script holds EXACTLY the two
 * delimiter backticks of its single `evaluateJavascript(\`…\`)` template — any
 * extra backtick is a body backtick, i.e. the bug. (An even-count or
 * balanced-pair check would be fooled by a stray `` `word` `` pair; an exact
 * count of two is not.)
 */

import { describe, it, expect } from 'vitest';
import { buildDeleteTestInboxFixturesScript } from '../../integration/helpers/sandbox-manager.js';

/**
 * Mirror of the JXA wrapper in `executeJXA` (sandbox-manager.ts). We only need
 * the structure that affects parsing — `app`/`doc` are never invoked here, so
 * referencing them is fine; `new Function` checks syntax, not runtime.
 */
function wrapLikeExecuteJXA(script: string): string {
  return `
    (() => {
      const app = Application('OmniFocus');
      app.includeStandardAdditions = true;
      const doc = app.defaultDocument();
      ${script}
    })()
  `;
}

describe('OMN-111: sandbox-manager OmniJS sweep scripts are parse-safe', () => {
  it('inbox-fixture deletion script parses (no stray backtick terminating the inner template)', () => {
    const wrapped = wrapLikeExecuteJXA(buildDeleteTestInboxFixturesScript());

    // A stray backtick in the inner app.evaluateJavascript(`...`) template
    // would split it and make this throw a SyntaxError.
    expect(() => new Function(wrapped)).not.toThrow();
  });

  it('inner evaluateJavascript template contains no unescaped backticks in its body', () => {
    // The script holds the intended template delimiters as a single backtick
    // pair. Anything beyond those two delimiter backticks is a body backtick —
    // the exact OMN-111 hazard. Assert there are exactly two backticks total
    // (the open + close of the single evaluateJavascript template).
    const backticks = (buildDeleteTestInboxFixturesScript().match(/`/g) || []).length;
    expect(backticks).toBe(2);
  });
});
