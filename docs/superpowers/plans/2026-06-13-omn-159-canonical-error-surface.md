# OMN-159 Canonical Error Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize all script-error `context` strings into one documented closed vocabulary (drop
`'Legacy script error'`, B2) AND route every returned `ScriptError` into the diagnose-failures JSONL + count it as a
metrics failure (fixing the returned-error silent gap).

**Architecture:** Two independent slices. (1) A `SCRIPT_ERROR_CONTEXT` constant in `script-result-types.ts` pins the 7
canonical wire strings; the three emitting modules (`script-result-types.ts`, `OmniAutomation.ts`, `base.ts`) reference
it; a closed-vocabulary test scans all three. (2) `BaseTool` gains an `AsyncLocalStorage` execution context; `execJson`
pushes returned `ScriptError`s into it; `execute()` reads it after `executeValidated()` to log each failure once and
record the call as a failure instead of `success:true`. Detection ORDER and which inputs are errors are unchanged
(OMN-139 settled that); the only behavioral change is `{success:false}`-with-context canonicalizing to
`Script reported an error` with the script's own context moved into `details`.

**Tech Stack:** TypeScript, Zod 3, vitest, `node:async_hooks` (`AsyncLocalStorage` — Node stdlib).

**Spec:** `docs/superpowers/specs/2026-06-13-omn-159-canonical-error-surface-design.md` — read §3 (vocabulary), §4
(routing + the committed ALS mechanism), §5 (matcher/test scope). §5 is authoritative where it and §6 differ.

**Worktree:** `/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-159-canonical-errors` (branch
`worktree-omn-159-canonical-errors`, based on main incl. OMN-158 `1273d4b`). `npm run build` before MCP testing.

**Breaking change:** wire-observable `context` strings change. CHANGELOG entry required (Task 3).

---

## File structure

- `src/omnifocus/script-result-types.ts` — add `SCRIPT_ERROR_CONTEXT` const + canonicalize `detectKnownErrorShape`
  emissions (the `{success:false}` context-to-details move lives here).
- `src/omnifocus/OmniAutomation.ts` — reference the const; rename `'OmniAutomation execution error'` →
  `'Script execution error'`.
- `src/tools/base.ts` — reference the const at the two execJson emission sites; add the `AsyncLocalStorage` context,
  push-on-returned-error in `execJson`, read-and-record in `execute()`.
- `tests/unit/omnifocus/script-result-types.test.ts`, `tests/unit/omnifocus/OmniAutomation.test.ts`,
  `tests/unit/tools/*` (the base.ts routing tests) — update pinned strings, add closed-vocab + routing tests.
- `CHANGELOG.md` — breaking-change entry.

---

### Task 1: Canonical vocabulary constant + rename emissions (no routing)

**Files:**

- Modify: `src/omnifocus/script-result-types.ts` (add const; `detectKnownErrorShape`)
- Modify: `src/omnifocus/OmniAutomation.ts` (`executeJson` error contexts)
- Modify: `src/tools/base.ts` (`execJson` two emission sites — context labels only, NOT routing yet)
- Modify: `tests/unit/omnifocus/script-result-types.test.ts`, `tests/unit/omnifocus/OmniAutomation.test.ts`
- Create: a closed-vocabulary test (co-locate with `script-result-types.test.ts` or a new
  `tests/unit/omnifocus/error-context-vocabulary.test.ts`)

**The constant (exact 7 canonical strings, §3):**

```typescript
/** Closed vocabulary of wire-observable ScriptError `context` strings (OMN-159 B2).
 *  These are the ONLY values `context` may take. Wire contract — changing a value is breaking. */
export const SCRIPT_ERROR_CONTEXT = {
  ERROR_ENVELOPE: 'Script error envelope',
  SCRIPT_REPORTED: 'Script reported an error', // replaces 'Legacy script error' (legacy {error:true} + {success:false})
  UNRECOGNIZED_SHAPE: 'Unrecognized script output shape',
  EXECUTION_ERROR: 'Script execution error', // replaces 'OmniAutomation execution error'
  UNEXPECTED: 'Unexpected error during script execution',
  NULL_RESULT: 'Script returned null or undefined',
  EXECUTION_EXCEPTION: 'Script execution exception',
} as const;
export type ScriptErrorContext = (typeof SCRIPT_ERROR_CONTEXT)[keyof typeof SCRIPT_ERROR_CONTEXT];
```

**`detectKnownErrorShape` changes (the behavioral one):**

- `{ok:false}` branch → `SCRIPT_ERROR_CONTEXT.ERROR_ENVELOPE` (string unchanged).
- legacy `{error:true}` branch → `SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED` (was `'Legacy script error'`).
- `{success:false}` branch → **canonicalize to `SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED`** (no longer uses the script's own
  `context` as the wire context). **Preserve the script's own `context` in `details`** so no info is lost — e.g.
  `createScriptError(message, SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED, { scriptContext: obj.context, raw: obj.details ?? value })`
  (re-verify the current details shape and keep prior fields). Update the wire-contract doc-comment (drop the
  `'Legacy script error'` reference; point at the constant).

**`OmniAutomation.ts`:** reference the constant for all four contexts it emits; rename
`'OmniAutomation execution error'` → `SCRIPT_ERROR_CONTEXT.EXECUTION_ERROR`. Others map to their unchanged constants.

**`base.ts` execJson:** the null branch keeps `error: 'NULL_RESULT'` (LOAD-BEARING — do not change the `error` value;
the consumer and clustering IGNORE_SET key on it) and uses `SCRIPT_ERROR_CONTEXT.NULL_RESULT` for context; the catch
branch uses `SCRIPT_ERROR_CONTEXT.EXECUTION_EXCEPTION`.

- [ ] **Step 1: closed-vocabulary test (failing).** Assert that the set of string literals passed as the 2nd arg to
      `createScriptError` across the three modules is a subset of `Object.values(SCRIPT_ERROR_CONTEXT)`. Implement by
      `fs.readFileSync` each module's source and regex-extracting `createScriptError(<msg>, '<literal>'` / the constant
      references, OR (cleaner) by asserting the constant exists and the modules import from it and use no bare string
      literal as a context arg. Also assert `'Legacy script error'` and `'OmniAutomation execution error'` appear
      NOWHERE in `src/`. Run → FAILS (const doesn't exist; old strings present).
- [ ] **Step 2: dialect/behavioral tests (failing).** In `script-result-types.test.ts`: legacy `{error:true}` → context
      `SCRIPT_ERROR_CONTEXT.SCRIPT_REPORTED`; `{success:false, context:'X', message:'m'}` → context
      `Script reported an error` AND `details` contains the original `'X'` (the context-to-details move); `{ok:false}` →
      `ERROR_ENVELOPE`. In `OmniAutomation.test.ts`: the execution-error path → `Script execution error`. Run → FAIL.
- [ ] **Step 3: implement** the constant + the three modules' emissions per above.
- [ ] **Step 4: run** `npx vitest run tests/unit/omnifocus/` → PASS; `npm run test:unit` → green (update any other test
      pinning the old strings; the `NULL_RESULT` `error`-value tests must still pass unchanged). `npm run build`.
- [ ] **Step 5: commit** `feat(OMN-159): canonical script-error context vocabulary; drop 'Legacy script error'`

### Task 2: Route returned ScriptErrors to failure-log + metrics (AsyncLocalStorage)

**Files:**

- Modify: `src/tools/base.ts` (ALS context; `execute()` body wrap + metrics block; `execJson` push; `handleExecuteError`
  double-log guard)
- Modify/Create: `tests/unit/tools/` base-tool routing tests (find the existing BaseTool/execute test file; if none
  drives execute()+execJson together, create `tests/unit/tools/base-failure-routing.test.ts` with a minimal concrete
  BaseTool subclass + mocked `omniAutomation.executeJson`)

**Mechanism (committed — §4 option (i), localized to base.ts; NOT an instance flag, NOT correlationId-dependent):**

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
// module scope (shared across instances — ALS scopes by async execution, not by instance):
const execContext = new AsyncLocalStorage<{ returnedErrors: ScriptError[] }>();
```

- `execute(args)`: wrap the existing body in
  `return execContext.run({ returnedErrors: [] }, async () => { ...existing... })`.
- `execJson`: immediately before `return result;`, if `!result.success`, push it:
  `execContext.getStore()?.returnedErrors.push(result);` (optional-chain: a direct `execJson` caller outside `execute()`
  has no store — harmless no-op; note version-detection uses `executeJson` directly, not `execJson`, so it never reaches
  here).
- `execute()` success path (the post-`executeValidated` block that currently records `success: true`): read
  `const returned = execContext.getStore()?.returnedErrors ?? []`. If `returned.length > 0`:
  - for EACH `err` in `returned`:
    `this.logToolFailure(args, 'EXECUTION_ERROR', err.error, undefined, categorizeError(err, this.name))` (one JSONL
    entry per returned ScriptError; reuses the existing writer + `failureLogSuppression()` gate; include the canonical
    `err.context`).
  - record the execution metric with `success: false` and an `errorType` (derive from the first/most-severe error's
    categorization), NOT `success: true`.
  - else (no returned errors): record `success: true` as today.
- `handleExecuteError` (thrown path) — add a guard so a returned error that was pushed AND then rethrown isn't logged
  twice: before its `logToolFailure`, check whether the thrown error corresponds to an already-pushed store entry (e.g.
  same `ScriptError` reference / message) and skip the duplicate. (In practice returned ScriptErrors are converted to
  responses, not rethrown, so the common path is disjoint — but add the guard to be safe and test it.)

**Partial-success exclusion:** only `result.success === false` pushes. Bulk ops return `success:true` with per-item
`errors[]` (OMN-144) — they never push. Add an explicit test.

- [ ] **Step 1: failing routing tests.** With a concrete test BaseTool subclass whose `executeValidated` calls
      `execJson` against a mocked `omniAutomation.executeJson`: (a) mock returns a `ScriptError` → assert exactly ONE
      `logToolFailure` JSONL write (spy/mock the writer or `recordToolExecution`) AND the recorded metric is
      `success:false` (not true); (b) mock returns `success:true` with a populated `errors[]` array (bulk shape) →
      assert NO failure log + metric `success:true`; (c) `executeValidated` throws → still exactly one log (no double
      via the guard); (d) a returned error then rethrown → exactly one log. Run → FAIL.
- [ ] **Step 2: implement** the ALS context + the four edits above.
- [ ] **Step 3: run** the routing tests → PASS. `npm run test:unit` → green (the existing execute() success-metric tests
      may need updating to the ALS-aware shape — update them, don't loosen). `npm run build`.
- [ ] **Step 4: mutation-verify the metrics fix (report result).** Temporarily revert the `execute()` block to
      always-`success:true` → test (a)'s metric assertion must FAIL → restore. Confirm the failure-log write assertion
      is non-vacuous the same way (revert the push → test (a)'s log assertion fails → restore).
- [ ] **Step 5: commit** `feat(OMN-159): route returned ScriptErrors to failure-log + fail metrics (AsyncLocalStorage)`

### Task 3: CHANGELOG + gates

**Files:** `CHANGELOG.md`; (no code)

- [ ] **Step 1: CHANGELOG** — under `[Unreleased] ### Changed` (breaking): the `context`-string renames
      (`'Legacy script error'` → `'Script reported an error'`; `'OmniAutomation execution error'` →
      `'Script execution error'`; `{success:false}` scripts no longer surface their own context on the wire — preserved
      in `details`); MCP clients matching old strings must update; + the failure-log/metrics fix (returned errors now
      logged + counted as failures).
- [ ] **Step 2: full unit + build + lint.** `npm run build` clean; `npm run test:unit` green; `npx eslint src` → 0
      errors, `no-unsafe-argument` still 0 (the ALS store typing must not introduce `any`). Run in isolation — do NOT
      run concurrently with any integration suite (OMN-143 / the concurrency-flake lesson).
- [ ] **Step 3: integration (controller runs, run_in_background, npm not bun, never kill — OMN-143).**
      `npm run test:integration`. Force-a-known-error coverage: assert that a script returning `{ok:false}` surfaces the
      canonical `Script error envelope` context AND (respecting `failureLogSuppression()` — integration sets
      suppression, so assert the breadcrumb/log path rather than a real file write) the returned-error routing fires.
      Full suite as regression gate. A lone flake (e.g. tag-paths merge) → clean single-file re-run before judging.
- [ ] **Step 4:** commit `docs(OMN-159): CHANGELOG breaking-change entry` + PR.

### Execution notes for the controller

- Task 1 → Task 2 → Task 3 sequential (Task 2's logging uses Task 1's constant; both edit base.ts). Sonnet implementers;
  two-stage review (spec-compliance then code-quality) per task per superpowers:subagent-driven-development.
- Reviewers: confirm (a) the closed-vocabulary test actually scans all THREE modules and would fail on a stray literal
  (mutation-verify by adding a bare-string `createScriptError` somewhere → test fails → revert); (b) the ALS mechanism
  records exactly one log + one metric and is not an instance flag (test concurrency if feasible: two overlapping
  `execute()` calls, one erroring, must not cross-contaminate); (c) the `NULL_RESULT` `error` value is byte-preserved
  (consumer + IGNORE_SET still match); (d) detection ORDER/outcomes unchanged except the documented `{success:false}`
  context-to-details move.
- Memory to update post-merge (mine, not a code task): `project_failure_log_real_signal` (returned errors are no longer
  a silent gap), `project_diagnose_failures_scheduled` (the JSONL now includes returned errors).
- After merge → SAFE final gate → Kip redeploys + live-verifies (force a known error, assert canonical context + that
  the failure log gains an entry).
