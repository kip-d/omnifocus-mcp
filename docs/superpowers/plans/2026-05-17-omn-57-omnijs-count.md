# OMN-57 #1 — countOnly OmniJS Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `buildTaskCountScript` from a pure-JXA per-element scan to a single `app.evaluateJavascript` OmniJS in-process count, removing the ~40 s Apple-Event IPC component (~51 s → ~10 s) while returning identical counts and the same response contract (only the `optimization` discriminator changes).

**Architecture:** TDD. The existing `buildTaskCountScript` unit tests pin JXA syntax (`doc.flattenedTasks()`, `task.completed() === false`); rewriting them to the OmniJS contract makes them RED against current code, the rewrite makes them GREEN. The AST and filter normalization are unchanged — only the script emitter (`'jxa'`→`'omnijs'`) and the script shell change. Counts must be byte-identical to today; verified by live parity probe, not assumed.

**Tech Stack:** TypeScript, JXA→OmniJS bridge (`app.evaluateJavascript`), AST filter emitters (`generateFilterCode(filter, 'omnijs')`), vitest.

**Spec:** `docs/superpowers/specs/2026-05-17-omn-57-omnijs-count-design.md`

---

## File Structure

| File | Responsibility | Action |
| ---- | -------------- | ------ |
| `src/contracts/ast/script-builder.ts` | `buildTaskCountScript` (~1907-2029): JSDoc, emitter target, script shell | Modify |
| `tests/unit/contracts/ast/script-builder.test.ts` | `describe('buildTaskCountScript')` (459-530): JXA→OmniJS contract | Modify |
| `tests/unit/architecture/schema-impl-parity.test.ts` | line 286: `task.completed() === true` JXA pin | Modify |
| `tests/integration/tools/unified/end-to-end.test.ts` | count-only-active test (199/232/239): name, `optimization` assert, budget | Modify |

No new files. The `'omnijs'` emitter and the `evaluateJavascript`-embedding pattern already exist in `script-builder.ts` (list path) — reuse, do not reinvent.

---

## Task 1: Flip the count unit tests to the OmniJS contract (RED)

**Files:**
- Modify: `tests/unit/contracts/ast/script-builder.test.ts:459-530`
- Modify: `tests/unit/architecture/schema-impl-parity.test.ts:286`

- [ ] **Step 1: Rewrite `describe('buildTaskCountScript')` assertions to the OmniJS contract**

In `script-builder.test.ts`, within `describe('buildTaskCountScript')` (lines 459-530), replace the JXA-syntax expectations with the OmniJS contract. The *semantic* intent of each test is unchanged; only the asserted script shape changes:

- The script must go through the bridge: add to a representative case
  `expect(result.script).toContain('evaluateJavascript')`.
- Inbox collection: `doc.inboxTasks()` → the OmniJS global `inbox`. Replace
  `expect(result.script).toContain('doc.inboxTasks()')` with
  `expect(result.script).toContain('inbox')` AND keep
  `expect(result.script).not.toContain('doc.inboxTasks()')` and
  `expect(result.script).not.toContain('doc.flattenedTasks()')`.
- Non-inbox collection: `doc.flattenedTasks()` → the OmniJS global `flattenedTasks`. Replace
  `expect(result.script).toContain('doc.flattenedTasks()')` with
  `expect(result.script).toContain('flattenedTasks')` AND
  `expect(result.script).not.toContain('doc.flattenedTasks()')`.
- Predicate syntax (OmniJS property access, no `()`):
  - `task.completed() === false` → `task.completed === false`
  - `task.completed() === true` → `task.completed === true`
  - `task.flagged() === true` → `task.flagged === true`
  - `'=== false'` substring assertions stay (`=== false` still appears).
  - the `inInbox` test: keep `expect(result.script).not.toContain('task.inInbox')` (OmniJS form; was `task.inInbox()`).
  - project name test: `.name()` → `.name` ; project id test: `.id().primaryKey()` → `.id.primaryKey`.
  - the regex `/task\.completed\(\)\s*===\s*false/` (line ~515) → `/task\.completed\s*===\s*false/`.
- `isEmptyFilter`/`isEmptyFilter === false` semantic assertions: unchanged (AST behavior is unchanged).
- Add one assertion that the discriminator changed:
  `const r = buildTaskCountScript({ flagged: true }); expect(r.script).toContain('omnijs_count');
  expect(r.script).not.toContain('pure_jxa');`

In `schema-impl-parity.test.ts:286`, change
`expect(countScript).toMatch(/task\.completed\(\)\s*===\s*true/);` →
`expect(countScript).toMatch(/task\.completed\s*===\s*true/);` (drop the `\(\)`). Lines 278-279
(`/task\.completed/`) are already paren-agnostic — leave them.

- [ ] **Step 2: Run the count unit tests — verify RED**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts -t "buildTaskCountScript"`
Expected: FAIL — current code still emits `doc.flattenedTasks()` / `task.completed() === false` /
`pure_jxa`, so the new OmniJS-contract assertions fail.
Run: `npx vitest run tests/unit/architecture/schema-impl-parity.test.ts -t "OMN-52"`
Expected: the `=== true` parity test FAILS (current emits `task.completed() === true`).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/contracts/ast/script-builder.test.ts tests/unit/architecture/schema-impl-parity.test.ts
git commit -m "test(OMN-57): pin countOnly to the OmniJS contract (RED)"
```

---

## Task 2: Rewrite `buildTaskCountScript` to OmniJS (GREEN)

**Files:**
- Modify: `src/contracts/ast/script-builder.ts` — JSDoc (~1907-1920), in-body comment (~1957),
  emitter target (~1949), script shell (~1958-2029)

- [ ] **Step 1: Correct the now-false JSDoc + in-body comment**

Replace the JSDoc block above `export function buildTaskCountScript` (currently claims *"pure JXA …
~40x faster"*, *"OmniJS bridge: ~2 minutes (AppleEvent timeout!)"*) and the in-body comment
(*"Critical: Do NOT use app.evaluateJavascript() - it's ~40x slower!"*) with accurate text:

```ts
/**
 * Build a JXA script that counts tasks matching AST-generated filters by
 * delegating the scan to OmniJS via a single app.evaluateJavascript() call.
 *
 * Performance (OMN-57): pure-JXA counting iterates doc.flattenedTasks() with
 * a per-element Apple-Event round-trip per task and per accessor — ~51 s for a
 * ~2900-task DB. Running the count inside OmniJS removes that per-element IPC
 * (one bridge round-trip total) → ~10 s. The remaining ~7-10 s is the
 * flattenedTasks materialization, an irreducible floor with the public API.
 * NOTE: the "evaluateJavascript is ~40x slower" heuristic holds only for
 * SMALL result sets where bridge-setup cost dominates; for whole-DB iteration
 * the per-element JXA IPC dominates and the bridge wins. Do not "optimize"
 * this back to pure JXA.
 *
 * @param filter - TaskFilter criteria to count (normalized internally)
 * @param options - Count options (maxScan limit)
 * @returns Complete JXA script (delegates to OmniJS) ready for execution
 */
```

Remove the `// Critical: Do NOT use app.evaluateJavascript()...` comment; replace with
`// Count runs in OmniJS (see JSDoc): one bridge round-trip, no per-task IPC.`

- [ ] **Step 2: Switch the filter emitter to OmniJS**

Line ~1949: `const filterCode = generateFilterCode(filterForCode, 'jxa');` →
`const filterCode = generateFilterCode(filterForCode, 'omnijs');`
Leave the line above it (`buildAST(filterForCode)`), `isEmptyFilterValue`, `filterDescription`, and
`needsTags` (~1954, `filterCode.predicate.includes('taskTags')`) unchanged — `needsTags` keys off the
predicate string and stays correct.

- [ ] **Step 3: Replace the script shell with a JXA→OmniJS delegator**

Replace the `const script = \`(() => { const app = Application('OmniFocus'); ... })()\`` body
(~1958-2029) with a JXA shell that builds an OmniJS source string and returns
`app.evaluateJavascript(...)` verbatim. **Mirror the existing list-path embedding pattern in this same
file** (e.g. the `app.evaluateJavascript(omniJsScript)` blocks around lines 1246-1290 / 1530-1560) for
how the OmniJS string is constructed and escaped — do not hand-roll new escaping. The OmniJS source:

```js
(() => {
  try {
    const startTime = Date.now();
    const maxScan = ${maxScan};
    let count = 0;
    let scanned = 0;
    // OmniJS globals (property access, no ()): `inbox` is the pre-filtered
    // inbox collection, `flattenedTasks` the whole-DB flattened collection.
    const tasks = ${checkInbox ? 'inbox' : 'flattenedTasks'};
    const totalTasks = tasks.length;
    // Filter: ${filterDescription}
    function matchesFilter(task${needsTags ? ', taskTags' : ''}) {
      return ${filterCode.predicate};
    }
    // maxScan bounds only this (cheap, ~0.03ms/task) loop — NOT the
    // flattenedTasks materialization above, which is the real cost and is
    // already paid. `limited:true` no longer implies a perf saving (OMN-57).
    for (let i = 0; i < tasks.length && scanned < maxScan; i++) {
      scanned++;
      try {
        const task = tasks[i];
        ${
          needsTags
            ? `let taskTags = [];
        try { const tg = task.tags; if (tg) taskTags = tg.map(t => t.name); } catch (e) {}
        if (matchesFilter(task, taskTags)) {`
            : 'if (matchesFilter(task)) {'
        }
          count++;
        }
      } catch (e) {}
    }
    const endTime = Date.now();
    return JSON.stringify({
      count: count,
      filters_applied: ${JSON.stringify(filter)},
      query_time_ms: endTime - startTime,
      optimization: 'omnijs_count${needsTags ? '_with_tags' : '_no_tags'}',
      filter_description: ${JSON.stringify(filterDescription)},
      scanned: scanned,
      total_tasks: totalTasks,
      ...(scanned >= maxScan ? { warning: 'Count may be incomplete due to scan limit', limited: true } : { limited: false })
    });
  } catch (error) {
    return JSON.stringify({ error: true, message: (error && error.message) || String(error), context: 'task_count_omnijs' });
  }
})()
```

The outer JXA wrapper: create the app, build the OmniJS string above, and
`try { return app.evaluateJavascript(omniJsScript); } catch (e) { return JSON.stringify({ error:true, message: e.message || String(e), context:'task_count_omnijs' }); }`.
`evaluateJavascript` returns the JSON string; the JXA function returns it unchanged so `execJson`
parses it exactly as before. Keep `GeneratedScript` return shape and any size-budget bookkeeping the
function already returns.

- [ ] **Step 4: Run the count unit tests — verify GREEN**

Run: `npx vitest run tests/unit/contracts/ast/script-builder.test.ts -t "buildTaskCountScript"`
Expected: PASS.
Run: `npx vitest run tests/unit/architecture/schema-impl-parity.test.ts`
Expected: PASS (both OMN-52 parity tests green).

- [ ] **Step 5: Full unit suite (no collateral breakage)**

Run: `npm run build` — Expected: exit 0.
Run: `npm run test:unit 2>&1 | grep -E "Test Files|Tests "` — Expected: 0 failures. If any other test
pinned the JXA count-script text, update it to the OmniJS contract (same intent) and note it; do not
weaken assertions.

- [ ] **Step 6: Commit**

```bash
git add src/contracts/ast/script-builder.ts
git commit -m "fix(OMN-57): count tasks in OmniJS (one bridge round-trip), not per-element JXA IPC"
```

---

## Task 3: Honest integration test

**Files:**
- Modify: `tests/integration/tools/unified/end-to-end.test.ts` (~199, ~232, ~239)

- [ ] **Step 1: Update the count-only-active test**

- Line ~199: rename — drop the false "33x faster optimization". E.g.
  `it('should return count-only for active tasks (OmniJS in-process count)', async () => {`.
- Line ~232: `expect(parsed.metadata.optimization).toMatch(/^pure_jxa/);` →
  `expect(parsed.metadata.optimization).toMatch(/^omnijs_count/);`
- Line ~239: the test-budget `}, 60000);` → `}, 30000);`.

- [ ] **Step 2: Sweep for other `pure_jxa` count assertions**

Run: `grep -rn "pure_jxa" tests/ src/` — Expected after Task 2: matches only in this test file (now
updated) — `src/contracts/ast/script-builder.ts` no longer contains `pure_jxa`. If any other test
asserts `pure_jxa` on a count response, update it to `omnijs_count` (same intent). `grep -rn "33x" tests/`
— reword any remaining count-perf-claim wording you find.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tools/unified/end-to-end.test.ts
git commit -m "test(OMN-57): honest count-only assertions — omnijs_count, 30s budget, drop 33x claim"
```

---

## Task 4: Live parity + performance verification

**Files:** none (verification only)

- [ ] **Step 1: Build and confirm unit green**

Run: `npm run build && npm run test:unit 2>&1 | grep -E "Test Files|Tests "`
Expected: exit 0, 0 failures.

- [ ] **Step 2: Parity + perf probe against live OmniFocus**

The count MUST equal the pre-change JXA count for the same filter. Spawn the built server and call
`omnifocus_read` countOnly for `status:active`, `flagged:true`, and an inbox count
(`filters:{ inInbox:true }` or `project:null`). For each, capture `metadata.total_count`,
`metadata.optimization`, `metadata.query_time_ms`.

Run (from the worktree, after `npm run build`):
```bash
for F in '{"status":"active"}' '{"flagged":true}' '{"inInbox":true}'; do
  echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"omnifocus_read\",\"arguments\":{\"query\":{\"type\":\"tasks\",\"filters\":$F,\"countOnly\":true}}}}"
done | node dist/index.js 2>/dev/null | grep -o '"total_count":[0-9]*\|"optimization":"[^"]*"\|"query_time_ms":[0-9]*'
```
Expected: `optimization` = `omnijs_count_*`; `query_time_ms` for the whole-DB filters ≈ 8000-15000
(not ≈ 50000); counts are sane. Then confirm parity: the pre-change baselines measured this session
are `status:active` → **2263**, `flagged:true` → **15** on this DB. The new counts MUST match those
(if the DB is unchanged). If a count differs, STOP — the OmniJS emitter diverged from the JXA emitter;
do not proceed, surface it (this is the spec's primary risk).

- [ ] **Step 3: The actual failing test, now under budget**

Run: `npx vitest tests/integration/tools/unified/end-to-end.test.ts -t "count-only for active" --run`
Expected: PASS, well under the 30 s budget (the prior failure was a 60021 ms timeout).

- [ ] **Step 4: Commit (only if a verification-driven test tweak was needed; otherwise skip)**

```bash
git add -A && git commit -m "test(OMN-57): verification adjustments from live parity probe"
```

---

## Task 5: Final gate

**Files:** none

- [ ] **Step 1: Verification matrix**

```bash
npm run build
npm run test:unit
npx vitest tests/integration/tools/unified/end-to-end.test.ts --run
```
Expected: build exit 0; unit 0 failures; `end-to-end.test.ts` — the count-only-active test passes; any
pre-existing OMN-57 #2/#3 latent-flake behavior is unrelated and out of scope (note it, do not fix).

- [ ] **Step 2: Scope discipline**

`git diff main...HEAD --stat` touches only: `src/contracts/ast/script-builder.ts`,
`tests/unit/contracts/ast/script-builder.test.ts`,
`tests/unit/architecture/schema-impl-parity.test.ts`,
`tests/integration/tools/unified/end-to-end.test.ts`, and the spec/plan docs. No `projectStatus` AST
handler, no cache, no scope-narrowing, no non-count path changes.

---

## Post-plan (project convention — execution handoff, not a plan task)

PR to `kip-d/omnifocus-mcp` cross-referencing OMN-57; mandatory code-reviewer subagent gated on a SAFE
verdict; `gh pr merge --squash --auto` (never `--admin`); then comment OMN-57 with measured before/after
(`query_time_ms` JXA vs OmniJS, identical counts), and decide #1 disposition with the user (close #1 /
split #2/#3 to a new issue) — not pre-committed here.
