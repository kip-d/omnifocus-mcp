# OMN-63 — Guarantee `data.task.taskId` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `omnifocus_write` create response always carry a non-null `data.task.taskId` by backfilling it from the already-coalesced `createdTaskId` in `parseAndValidateCreateResult`, eliminating the OMN-57 #2/#3 "success:true but taskId undefined" flake class.

**Architecture:** One `??=` normalization statement at the end of `parseAndValidateCreateResult` (after the validation guard that already proves `parsedResult` is an object and `taskId||id` is truthy, so `createdTaskId` is non-null there). TDD anchor is a fast unit test driving the create path through the existing `OmniFocusWriteTool.test.ts` mock harness with a script result that has `id` but no `taskId` (RED → GREEN). No live OmniFocus needed to prove determinism; the two ex-OMN-57 integration tests are verification only.

**Tech Stack:** TypeScript, vitest, the existing `execJson` spy + `createScriptSuccess` test harness.

**Spec:** `docs/superpowers/specs/2026-05-17-omn-63-taskid-normalize-design.md`

---

## File Structure

| File | Responsibility | Action |
| ---- | -------------- | ------ |
| `tests/unit/tools/unified/OmniFocusWriteTool.test.ts` | 3 unit cases in the `describe('task create', …)` block: bug-shape backfill (RED), preservation, `??=` no-op | Modify |
| `src/tools/unified/OmniFocusWriteTool.ts` | `parseAndValidateCreateResult` — one normalization statement before the final `return` (~line 591) | Modify |

No new files. Reuse the existing `execJsonSpy` / `createScriptSuccess` / `tool.execute(...)` harness pattern (`OmniFocusWriteTool.test.ts:44-65`).

---

## Task 1: Add the create-response taskId unit cases (RED)

**Files:**
- Modify: `tests/unit/tools/unified/OmniFocusWriteTool.test.ts` — inside `describe('task create', () => { … })`

- [ ] **Step 1: Add three test cases**

Mirror the existing harness exactly (`execJsonSpy.mockResolvedValue(createScriptSuccess({ ok:true, v:'3', data:{…} }))` → `await tool.execute({ mutation:{ operation:'create', target:'task', data:{ name } } })` → assert on `result`). Add inside the `describe('task create', …)` block:

```ts
it('OMN-63: backfills data.task.taskId from id when script omits taskId', async () => {
  execJsonSpy.mockResolvedValue(
    createScriptSuccess({
      ok: true,
      v: '3',
      data: { id: 'task-xyz', name: 'No taskId here' }, // NOTE: no `taskId`
    }),
  );

  const result = (await tool.execute({
    mutation: { operation: 'create', target: 'task', data: { name: 'No taskId here' } },
  })) as any;

  expect(result.success).toBe(true);
  expect(result.data.task.taskId).toBe('task-xyz'); // backfilled from id
  expect(result.data.id).toBe('task-xyz');          // unchanged
});

it('OMN-63: preserves a script-emitted taskId (no id present)', async () => {
  execJsonSpy.mockResolvedValue(
    createScriptSuccess({
      ok: true,
      v: '3',
      data: { taskId: 'real-tid', name: 'Has taskId' },
    }),
  );

  const result = (await tool.execute({
    mutation: { operation: 'create', target: 'task', data: { name: 'Has taskId' } },
  })) as any;

  expect(result.success).toBe(true);
  expect(result.data.task.taskId).toBe('real-tid'); // unclobbered
});

it('OMN-63: ??= is a no-op when both taskId and a differing id are present', async () => {
  execJsonSpy.mockResolvedValue(
    createScriptSuccess({
      ok: true,
      v: '3',
      data: { taskId: 'tid-1', id: 'id-2', name: 'Both present' },
    }),
  );

  const result = (await tool.execute({
    mutation: { operation: 'create', target: 'task', data: { name: 'Both present' } },
  })) as any;

  expect(result.success).toBe(true);
  expect(result.data.task.taskId).toBe('tid-1'); // taskId wins; not overwritten by id
});
```

- [ ] **Step 2: Run — verify the bug-shape case is RED**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusWriteTool.test.ts -t "OMN-63"`
Expected: the **backfill** case FAILS (`result.data.task.taskId` is `undefined`, expected `'task-xyz'` — current code returns `parsedResult` verbatim with no `taskId`). The **preservation** and **no-op** cases PASS already (their script result has `taskId`, so it survives untouched even without the fix) — this is correct: they are regression guards, not the RED anchor.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/tools/unified/OmniFocusWriteTool.test.ts
git commit -m "test(OMN-63): create response must carry data.task.taskId (RED)"
```

---

## Task 2: Normalize `parsedResult.taskId` (GREEN)

**Files:**
- Modify: `src/tools/unified/OmniFocusWriteTool.ts` — `parseAndValidateCreateResult`, immediately before `return { parsedResult, createdTaskId };` (~line 591)

- [ ] **Step 1: Insert the normalization statement**

The current tail of `parseAndValidateCreateResult` is:

```ts
    const createdTaskId =
      (parsedResult as { taskId?: string; id?: string }).taskId || (parsedResult as { id?: string }).id || null;
    this.logger.debug('Post-create task ID', { createdTaskId });

    return { parsedResult, createdTaskId };
```

Insert the normalization between the `logger.debug` line and the `return` (so it sits after the
validation block that guarantees `parsedResult` is a non-null object and `taskId || id` is truthy →
`createdTaskId` is non-null here):

```ts
    this.logger.debug('Post-create task ID', { createdTaskId });

    // OMN-63: data.task is parsedResult verbatim; the create script emits
    // `taskId` but some paths/races yield only `id` (or a transient JXA id),
    // leaving data.task.taskId undefined while success:true. Backfill from
    // createdTaskId (= taskId || id, guaranteed non-null here by the
    // validation above) so the create-response contract holds deterministically.
    // `??=` never clobbers a valid script-emitted taskId.
    (parsedResult as Record<string, unknown>).taskId ??= createdTaskId;

    return { parsedResult, createdTaskId };
```

Do not change the signature, the validation, `createdTaskId`, or the caller. Use the
`Record<string, unknown>` cast exactly as shown (NOT `as any` — `lint:strict` must stay green; that
rule is error-class since OMN-59).

- [ ] **Step 2: Run the OMN-63 unit cases — verify GREEN**

Run: `npx vitest run tests/unit/tools/unified/OmniFocusWriteTool.test.ts -t "OMN-63"`
Expected: all three PASS.

- [ ] **Step 3: Full unit suite + lint (no collateral breakage)**

Run: `npm run build` — Expected: exit 0.
Run: `npm run test:unit 2>&1 | grep -E "Test Files|Tests "` — Expected: 0 failures. In particular the
existing `OmniFocusWriteTool.test.ts` cases reading `data.id` (L62, basic create) and `data.task.id`
(L151/180/226, v3/update paths) MUST still pass — this change only adds a `taskId` key when missing
and never alters `id` or paths that already have a `taskId`. If any of those break, STOP and surface
(would indicate the change touched more than intended).
Run: `npm run lint:strict; echo "exit=$?"` — Expected: `exit=0` (no new `any`/warnings).

- [ ] **Step 4: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts
git commit -m "fix(OMN-63): backfill data.task.taskId from createdTaskId in parseAndValidateCreateResult"
```

---

## Task 3: Live integration verification (the ex-OMN-57 flakes)

**Files:** none (verification only)

- [ ] **Step 1: Run the two formerly-flaky tests against live OmniFocus**

Run: `npx vitest tests/integration/tools/unified/end-to-end.test.ts -t "should update task with new planned date" --run`
Run: `npx vitest tests/integration/tools/unified/end-to-end.test.ts -t "should create task with daily repeat rule" --run`
Expected: both PASS (they assert `data.task.taskId` toBeDefined; the normalization makes this
deterministic).

- [ ] **Step 2: Determinism re-check**

Re-run each of the two tests one more time (back-to-back). Expected: PASS again. The unit test
already proves determinism structurally; this is belt-and-suspenders against any residual
environmental flake. If either test fails or flakes, STOP and surface — the normalization should make
`data.task.taskId` deterministic; a remaining failure indicates a *different* root cause (e.g. the
create itself returning `success:false`), which is out of OMN-63's scope.

- [ ] **Step 3: Commit (only if a verification-driven tweak was required; otherwise skip — no edits expected)**

```bash
git add -A && git commit -m "test(OMN-63): integration verification adjustments"
```

---

## Task 4: Final gate

**Files:** none

- [ ] **Step 1: Verification matrix**

```bash
npm run build
npm run test:unit
npm run lint:strict; echo "lint:strict exit=$?"
```
Expected: build exit 0; unit 0 failures (incl. the 3 OMN-63 cases); `lint:strict exit=0`.

- [ ] **Step 2: Scope discipline**

`git diff main...HEAD --stat` touches only `src/tools/unified/OmniFocusWriteTool.ts`,
`tests/unit/tools/unified/OmniFocusWriteTool.test.ts`, and the spec/plan docs. No change to
`mutation-script-builder.ts` (script race is out of scope), no consumer migration, no `data.id` /
`metadata.created_id` / validation changes.

---

## Post-plan (project convention — execution handoff, not a plan task)

PR to `kip-d/omnifocus-mcp` cross-referencing OMN-63 (and OMN-57 #2/#3 lineage); mandatory
code-reviewer subagent gated on a SAFE verdict; `gh pr merge --squash --auto` (never `--admin`); then
comment OMN-63 with the unit-proven determinism + the two integration tests green, and close OMN-63.
