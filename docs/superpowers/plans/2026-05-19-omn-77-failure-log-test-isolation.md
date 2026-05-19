# OMN-77 Failure-Log Test Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run test:integration` produce zero failure-log entries that the weekly `diagnose-failures` job
ingests, automatically, without losing real production failures.

**Architecture:** A single pure predicate (`failureLogSuppression`) gates the one method all failure-log writes funnel
through (`BaseTool.logToolFailure`). When suppressed, the method emits one `info`-level stderr breadcrumb and returns
before any filesystem work. `diagnose-failures` and the record schema are untouched.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), Vitest, existing `src/utils/logger.ts`.

**Spec:** `docs/superpowers/specs/2026-05-19-omn-77-failure-log-test-isolation-design.md`

---

## Critical Implementation Hazard (read before starting)

**Vitest sets `process.env.NODE_ENV="test"` for `npm run test:unit`** (verified empirically). The gate's
`NODE_ENV==='test'` clause therefore also fires during the _unit_ suite. `tests/unit/tools/base.test.ts` has multiple
existing tests that drive `logToolFailure` (via `ErrorTestTool.execute()`) and assert `fs.writeFileSync` /
`fs.mkdirSync` were called. Adding the gate naively turns all of them red.

**Mitigation (Task 2, Step 1):** add a suite-level `beforeEach`/`afterEach` to `base.test.ts` that forces
`NODE_ENV='production'` and unsets `OMNIFOCUS_MCP_DISABLE_FAILURE_LOG` (saving/restoring originals), so the whole
existing suite runs gate-OFF. The new gate tests opt back into gate-ON locally. The pure predicate's own tests pass an
explicit `env` object and never touch `process.env`, so they are immune.

---

## File Structure

| File                                                       | Responsibility                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/diagnostics/failure-log-gate.ts` (create)             | Pure, total predicate `failureLogSuppression(env)`; the only place the gating rule lives |
| `tests/unit/diagnostics/failure-log-gate.test.ts` (create) | Truth-matrix unit tests for the predicate                                                |
| `src/tools/base.ts` (modify)                               | Call the gate at the top of `logToolFailure`; breadcrumb + early return                  |
| `tests/unit/tools/base.test.ts` (modify)                   | Suite-level gate neutralization; new gate-ON / gate-OFF tests                            |
| `tests/integration/helpers/mcp-test-client.ts` (modify)    | Set `OMNIFOCUS_MCP_DISABLE_FAILURE_LOG='1'` on the spawned server                        |
| `docs/user/PRIVACY_AND_LOGGING.md` (modify)                | Document the env var + that `test:integration` self-isolates                             |

Out of scope (YAGNI): separate sink, `source` field, any change to
`diagnose-failures.ts`/`clustering.ts`/`ledger.ts`/marker, log rotation, CLAUDE.md (no env-var list there; avoids the
`claude-md-paths` guard).

---

## Task 1: Pure suppression predicate (TDD)

**Files:**

- Create: `src/diagnostics/failure-log-gate.ts`
- Test: `tests/unit/diagnostics/failure-log-gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/diagnostics/failure-log-gate.test.ts`:

```ts
// tests/unit/diagnostics/failure-log-gate.test.ts
import { describe, it, expect } from 'vitest';
import { failureLogSuppression } from '../../../src/diagnostics/failure-log-gate.js';

describe('failureLogSuppression', () => {
  it('not suppressed when no signals present', () => {
    expect(failureLogSuppression({})).toEqual({ suppressed: false, reason: null });
    expect(failureLogSuppression({ NODE_ENV: 'production' })).toEqual({ suppressed: false, reason: null });
  });

  it('suppressed via NODE_ENV=test', () => {
    expect(failureLogSuppression({ NODE_ENV: 'test' })).toEqual({ suppressed: true, reason: 'node-env-test' });
  });

  it('suppressed via flag truthy values', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      expect(failureLogSuppression({ OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: v })).toEqual({
        suppressed: true,
        reason: 'disabled-flag',
      });
    }
  });

  it('flag off values do not suppress', () => {
    for (const v of ['', '0', 'false', 'FALSE', '   ']) {
      expect(failureLogSuppression({ OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: v, NODE_ENV: 'production' })).toEqual({
        suppressed: false,
        reason: null,
      });
    }
  });

  it('flag wins the reason when both signals are set', () => {
    expect(failureLogSuppression({ OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1', NODE_ENV: 'test' })).toEqual({
      suppressed: true,
      reason: 'disabled-flag',
    });
  });

  it('defaults to process.env when called with no argument', () => {
    // Under vitest NODE_ENV==='test', so the no-arg call must report suppressed.
    expect(failureLogSuppression().suppressed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/diagnostics/failure-log-gate.test.ts --reporter=basic` Expected: FAIL —
`Cannot find module '.../failure-log-gate.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/diagnostics/failure-log-gate.ts`:

```ts
// src/diagnostics/failure-log-gate.ts

export type SuppressionReason = 'disabled-flag' | 'node-env-test';

export interface FailureLogSuppression {
  suppressed: boolean;
  reason: SuppressionReason | null;
}

// The flag is ON unless its (trimmed, lowercased) value is one of these.
// Unset (undefined) is also OFF. Any other value (1, true, yes, ...) is ON.
const FLAG_OFF_VALUES = new Set(['', '0', 'false']);

/**
 * Pure, total decision for whether failure-log writes are suppressed.
 * Never throws, never does I/O. Takes env explicitly so unit tests do not
 * mutate process.env.
 *
 * Precedence: explicit disable flag, then NODE_ENV=test.
 */
export function failureLogSuppression(env: NodeJS.ProcessEnv = process.env): FailureLogSuppression {
  const flag = env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
  if (flag !== undefined && !FLAG_OFF_VALUES.has(flag.trim().toLowerCase())) {
    return { suppressed: true, reason: 'disabled-flag' };
  }
  if (env.NODE_ENV === 'test') {
    return { suppressed: true, reason: 'node-env-test' };
  }
  return { suppressed: false, reason: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/diagnostics/failure-log-gate.test.ts --reporter=basic` Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics/failure-log-gate.ts tests/unit/diagnostics/failure-log-gate.test.ts
git commit -m "feat(OMN-77): pure failure-log suppression predicate"
```

---

## Task 2: Gate `logToolFailure` + neutralize the existing suite (TDD)

**Files:**

- Modify: `src/tools/base.ts` (import + guard at top of `logToolFailure`, ~line 301–310)
- Modify: `tests/unit/tools/base.test.ts` (suite-level neutralization + 2 new tests)

- [ ] **Step 1: Neutralize the gate for the existing suite, prove no regression**

In `tests/unit/tools/base.test.ts`, add a dedicated env save/restore pair at the **top of the outermost `describe`**
(sibling to the existing `beforeEach` near line 115). Do not modify existing tests.

```ts
// --- OMN-77: keep the whole existing suite running with the failure-log gate OFF.
//     Vitest sets NODE_ENV=test, which would otherwise suppress writes and
//     break the existing fs.writeFileSync/mkdirSync assertions.
let __omn77SavedNodeEnv: string | undefined;
let __omn77SavedFlag: string | undefined;
beforeEach(() => {
  __omn77SavedNodeEnv = process.env.NODE_ENV;
  __omn77SavedFlag = process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
  process.env.NODE_ENV = 'production';
  delete process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
});
afterEach(() => {
  if (__omn77SavedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = __omn77SavedNodeEnv;
  if (__omn77SavedFlag === undefined) delete process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;
  else process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG = __omn77SavedFlag;
});
```

Place this block immediately inside the top-level `describe('BaseTool', ...)`, **before** the existing `beforeEach`, so
neutralization runs first. Vitest runs multiple `beforeEach` hooks in registration order.

Run: `npx vitest run tests/unit/tools/base.test.ts --reporter=basic` Expected: PASS — unchanged from baseline (gate does
not exist yet; this only proves the env shim itself is harmless).

- [ ] **Step 2: Write the failing gate tests**

Add a new `describe` block at the end of `tests/unit/tools/base.test.ts` (inside the top-level describe). It reuses
`ErrorTestTool` (already used elsewhere in the file as `errorTestTool`). If `errorTestTool` is scoped to another block,
instantiate a local one the same way that block does (`new ErrorTestTool(mockCache)` — match the existing construction
call in the file).

```ts
describe('OMN-77 failure-log gate', () => {
  it('suppresses the write and emits an info breadcrumb when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;

    const tool = new ErrorTestTool(mockCache); // match existing ErrorTestTool construction in this file
    const infoSpy = vi.spyOn((tool as any).logger, 'info');
    const writeSpy = vi.mocked(fs.writeFileSync);
    writeSpy.mockClear();

    await tool.execute({ errorType: 'timeout' });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('failure-log suppressed (reason=node-env-test)'));
  });

  it('suppresses via the explicit disable flag with reason=disabled-flag', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG = '1';

    const tool = new ErrorTestTool(mockCache);
    const infoSpy = vi.spyOn((tool as any).logger, 'info');
    const writeSpy = vi.mocked(fs.writeFileSync);
    writeSpy.mockClear();

    await tool.execute({ errorType: 'timeout' });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('failure-log suppressed (reason=disabled-flag)'));
  });

  it('still writes the failure log when no suppression signal is set (regression guard)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.OMNIFOCUS_MCP_DISABLE_FAILURE_LOG;

    const tool = new ErrorTestTool(mockCache);
    const writeSpy = vi.mocked(fs.writeFileSync);
    writeSpy.mockClear();

    await tool.execute({ errorType: 'timeout' });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('failures-'),
      expect.any(String),
      expect.objectContaining({ flag: 'a' }),
    );
  });
});
```

> Note: confirm the exact `ErrorTestTool` constructor call and the `mockCache` variable name by reading
> `tests/unit/tools/base.test.ts` (search `new ErrorTestTool`); use the file's existing construction verbatim. Confirm
> `(tool as any).logger` is the instance the breadcrumb uses (base.ts calls `this.logger.debug(...)` in
> `logToolFailure`, so `.logger` is correct).

- [ ] **Step 3: Run gate tests to verify they fail**

Run: `npx vitest run tests/unit/tools/base.test.ts -t "OMN-77 failure-log gate" --reporter=basic` Expected: FAIL — the
two suppression tests fail because `writeFileSync` IS still called (gate not yet implemented); the regression test
passes.

- [ ] **Step 4: Implement the gate in `src/tools/base.ts`**

Add the import near the other `src/` imports (top of file, alongside
`import { createLogger, Logger, redactArgs } from '../utils/logger.js';`):

```ts
import { failureLogSuppression } from '../diagnostics/failure-log-gate.js';
```

In `logToolFailure` (currently `src/tools/base.ts:301`), insert the guard as the **first statements inside the existing
`try {`**, before `const logsDir = ...`:

```ts
    try {
      // OMN-77: never write the failure log under test / when explicitly disabled.
      // Emit one info breadcrumb so a red integration test never silently eats
      // a server-side error (visible at the harness's default LOG_LEVEL=info).
      const suppression = failureLogSuppression();
      if (suppression.suppressed) {
        this.logger.info(
          `failure-log suppressed (reason=${suppression.reason}) tool=${this.name} errorType=${errorType}`,
        );
        return;
      }

      // Create logs directory if it doesn't exist
      const logsDir = join(homedir(), '.omnifocus-mcp', 'tool-failures');
      // ... rest unchanged ...
```

Do not change anything else in the method.

- [ ] **Step 5: Run gate tests + full base suite to verify pass**

Run: `npx vitest run tests/unit/tools/base.test.ts --reporter=basic` Expected: PASS — all existing tests still green
(thanks to Step 1 neutralization) AND the 3 new gate tests green.

- [ ] **Step 6: Mutation-verify the gate (repo norm: revert → fail → restore)**

Temporarily delete the `return;` line inside the new guard in `src/tools/base.ts`. Run:
`npx vitest run tests/unit/tools/base.test.ts -t "OMN-77 failure-log gate" --reporter=basic` Expected: FAIL — the two
suppression tests fail (write now happens despite suppression). This proves the tests are not vacuously green. Restore
the `return;` line. Re-run the same command. Expected: PASS.

- [ ] **Step 7: Typecheck + full unit suite**

Run: `npm run build && npm run test:unit` Expected: `tsc` clean; full unit suite green (no collateral breakage in other
tool tests).

- [ ] **Step 8: Commit**

```bash
git add src/tools/base.ts tests/unit/tools/base.test.ts
git commit -m "feat(OMN-77): gate failure-log writes in logToolFailure + tests"
```

---

## Task 3: Wire the integration harness

**Files:**

- Modify: `tests/integration/helpers/mcp-test-client.ts` (env block, ~line 70)

- [ ] **Step 1: Add the explicit flag to the spawned server's env**

Find the env block (search `NODE_ENV: 'test'`, ~line 70). It is currently a **single-line literal**, e.g.
`const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' };`. Add the one new key to that existing literal in
place — do not reformat to multi-line, and do not disturb any conditional `ENABLE_CACHE_WARMING` logic that may follow
it:

```ts
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1' };
```

(`OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1'` — OMN-77: never pollute the diagnose-failures log. Prettier may reflow this
line on commit; that is fine.)

- [ ] **Step 2: Typecheck**

Run: `npm run build` Expected: `tsc` clean.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/helpers/mcp-test-client.ts
git commit -m "test(OMN-77): integration harness sets OMNIFOCUS_MCP_DISABLE_FAILURE_LOG"
```

---

## Task 4: Document + retire the manual constraint

**Files:**

- Modify: `docs/user/PRIVACY_AND_LOGGING.md`

- [ ] **Step 1: Document the env var**

Add a subsection to `docs/user/PRIVACY_AND_LOGGING.md` (read the file first; match its heading style). Content:

```markdown
### Failure-log isolation under test

The server records tool failures to `~/.omnifocus-mcp/tool-failures/failures-<date>.jsonl` for the weekly diagnosis job.
To keep test runs from polluting that signal, the failure log is **suppressed** when either:

- `OMNIFOCUS_MCP_DISABLE_FAILURE_LOG` is set to a truthy value (anything other than unset, ``, `0`, `false`), or
- `NODE_ENV=test`.

When suppressed, the server emits one `info`-level stderr line
(`failure-log suppressed (reason=...) tool=... errorType=...`) instead of writing. `npm run test:integration` sets the
flag automatically — no action required.
```

- [ ] **Step 2: Verify docs guard still passes**

Run: `npx vitest run tests/unit/docs/claude-md-paths.test.ts --reporter=basic` Expected: PASS (we did not touch
CLAUDE.md; this is a safety check).

- [ ] **Step 3: Commit**

```bash
git add docs/user/PRIVACY_AND_LOGGING.md
git commit -m "docs(OMN-77): document failure-log test isolation"
```

- [ ] **Step 4: Post-merge cleanup (record in PR description, not a commit)**

These are done by the human/PR-merger after merge, not in the worktree:

- Update memory `feedback_no_adhoc_integration_tests.md`: change the **Tracking** line to "shipped" and soften the
  constraint to "historical — `test:integration` now self-isolates via OMN-77".
- Comment on Linear OMN-77 confirming acceptance criteria 1–5 and close it.
- Note in the PR body the manual verification for AC#1:
  `wc -l ~/.omnifocus-mcp/tool-failures/failures-$(date +%F).jsonl` before/after a local `npm run test:integration` (run
  intentionally), expecting no delta. (Do not run `test:integration` ad-hoc per the standing constraint until this
  ships.)

---

## Final Verification (whole plan)

- [ ] `npm run build` — `tsc` clean
- [ ] `npm run test:unit` — full unit suite green, including the 6 new gate-predicate tests and 3 new base-gate tests
- [ ] `git log --oneline` shows the 4 task commits on `worktree-omn-77-failure-log-test-isolation`
- [ ] Spec acceptance criteria 1–4 satisfied by automated tests; AC#5 (docs/constraint retirement) by Task 4
