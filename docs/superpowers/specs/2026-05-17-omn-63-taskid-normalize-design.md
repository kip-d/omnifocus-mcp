# OMN-63 — Guarantee `data.task.taskId` on the create response

Date: 2026-05-17 Linear: OMN-63 (split from OMN-57 #2/#3) Status: Design approved (2026-05-17), pending spec review

## Problem

`omnifocus_write` create returns `success: true` but `data.task.taskId` is sometimes `undefined` (OMN-57 #2/#3:
`end-to-end.test.ts` "should update task with new planned date" L584 and "should create task with daily repeat rule"
L689 — latent flakes that pass only when a JXA-id race lands favorably).

### Root cause (code-verified, current main `d9f783a`)

`OmniFocusWriteTool.handleTaskCreate` builds the success response as
`createSuccessResponseV2('omnifocus_write', { task: parsedResult, id: createdTaskId, name, operation }, …)` (L401-405).
`data.task` is `parsedResult` — the raw create-script object verbatim. The create script
(`mutation-script-builder.ts:800`) emits `taskId` (never `id`), but:

- `parseAndValidateCreateResult` (`OmniFocusWriteTool.ts:534`) accepts the result if **either** `taskId` **or** `id` is
  present (L569-571) and returns `parsedResult` unmodified.
- `createdTaskId = parsedResult.taskId || parsedResult.id || null` (L587-588) — correctly coalesced, used for `data.id`
  and `metadata.created_id`, so the _envelope_ always has the id.
- But `data.task` (the echoed script object) is **not** normalized. Any create path/race that yields a `parsedResult`
  lacking `taskId` (only `id`, or a transient/empty JXA `.id()` before the OmniJS-`primaryKey` upgrade at
  `mutation-script-builder.ts:~588-610`) → `data.task.taskId` is `undefined` while `success:true` and `data.id` is fine.

### Canonical field (resolved by codebase evidence, not a fork)

`taskId` is unambiguously canonical for the create response: the create script emits `taskId`; the broad ecosystem reads
`data.task.taskId` (`mcp-protocol.test.ts:118`, smoke-test-v2, omnifocus-sanity, test-tag-\*, test-parent-child,
test-move-to-parent, test-as-claude-desktop's `taskId || id`). `data.task.id` is read only on update/v3-envelope paths
(a different response shape, out of scope). The fix is to **guarantee** `data.task.taskId`, not migrate consumers.

## Scope

In scope: one normalization statement in `parseAndValidateCreateResult` + unit tests proving it + integration
verification of the two OMN-57 flakes.

Out of scope (explicit):

- The script-side JXA-`.id()` → OmniJS-`primaryKey` race (`mutation-script-builder.ts:~588-610`). Normalization makes
  the contract deterministic regardless of that race; chasing it is a separate, riskier concern (tracked implicitly by
  the existing bridge-nonce code; file separately if pursued).
- `data.id`, `metadata.created_id`, the validation guard, all consumers — unchanged.
- The update / v3-envelope create-response paths (`data.task.id`) — unchanged.
- No consumer migration; no behavior change for any path that already returned a `taskId`.

## Design

### Change — `src/tools/unified/OmniFocusWriteTool.ts`, `parseAndValidateCreateResult`

After the structure-validation block (which guarantees `parsedResult` is an object and
`parsedResult.taskId || parsedResult.id` is truthy) and after `const createdTaskId = …` (therefore **non-null** at this
point: validation forbids both being absent), and immediately before `return { parsedResult, createdTaskId };`, insert:

```ts
// OMN-63: data.task is parsedResult verbatim; the create script emits `taskId`
// but some paths/races yield only `id` (or a transient JXA id), leaving
// data.task.taskId undefined while success:true. Backfill from createdTaskId
// (already = taskId || id, non-null here per the validation above) so the
// create-response contract — data.task.taskId — holds deterministically.
// `??=` never clobbers a valid script-emitted taskId.
(parsedResult as Record<string, unknown>).taskId ??= createdTaskId;
```

Rationale for the specifics:

- `??=` (not `=`): only fills when `taskId` is `null`/`undefined`; when the script already emitted a valid `taskId`,
  `createdTaskId` equals it anyway, so `??=` is both safe and a no-op there.
- `Record<string, unknown>` cast (not the ticket's `as any`): satisfies `@typescript-eslint/no-explicit-any` (lint
  cleanliness — that rule is `warn`, and `lint:strict` must stay green per OMN-59); `parsedResult` is a freshly-parsed
  local object, safe to mutate.
- Placed after validation so `parsedResult` is guaranteed a non-null object and `createdTaskId` is guaranteed non-null —
  no new null-guard needed.

No change to the function signature, return shape, the validation, or the caller.

### Tests

**Unit (the TDD anchor — fast, deterministic, no live OmniFocus):**
`tests/unit/tools/unified/OmniFocusWriteTool.test.ts` (existing suite for this tool). Add cases exercising the create
path through `handleTaskCreate` (the existing tests in this file already mock the script result and assert
`result.data.task.*`):

1. **Bug shape:** script result has `id` but **no** `taskId` → assert `result.data.task.taskId` equals that `id` (and
   `result.data.id` unchanged). RED before the change (parsedResult passed verbatim → `taskId` undefined), GREEN after.
2. **Preservation:** script result has a real `taskId` (and no `id`) → assert `result.data.task.taskId` is that exact
   value, unclobbered (guards against accidental `=` semantics).
3. **`??=` no-op under both present:** script result has both `taskId` and a _different_ `id` → assert
   `result.data.task.taskId` is the original `taskId` (not the `id`), proving `??=` does not overwrite and
   `createdTaskId`'s `taskId || id` precedence is consistent.

Mirror the existing mocking/assertion pattern in that test file (it already drives create and reads
`result.data.task.id` / `result.data.id` for v3 cases — use the same harness).

**Integration (verification, not the anchor):** `tests/integration/tools/unified/end-to-end.test.ts` "should update task
with new planned date" and "should create task with daily repeat rule" — already assert `data.task.taskId` toBeDefined;
with the fix they pass deterministically. No test edits expected; if either still flakes, STOP and surface (the
normalization should make them deterministic — a remaining flake means a different root cause).

## Verification

1. `npm run build` — exit 0.
2. `npm run test:unit` — new unit cases green; the existing `OmniFocusWriteTool.test.ts` cases **still green**
   unchanged: L62 reads `data.id` on the basic create path; L151/180/226 read `data.task.id` on v3/update paths — this
   change only backfills a missing `taskId`, never alters `id` or any path that already has a `taskId`. Full suite 0
   failures.
3. `npm run lint:strict` — exit 0 (no new `any`/warnings; OMN-59 left it clean).
4. Integration: the two OMN-57 #2/#3 tests pass against live OmniFocus; optionally run each in isolation a few times to
   confirm determinism (the unit test already proves it).

## Risks and mitigations

| Risk                                               | Mitigation                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------- |
| `??=` clobbers a valid taskId                      | It only assigns when nullish; and `createdTaskId` === `taskId` when taskId present. Unit test #2 guards this.                                |
| `createdTaskId` could be null → taskId set to null | Impossible here: validation (L569-571) rejects both-absent, so `taskId                                                                       |     | id`is truthy →`createdTaskId` non-null at the insertion point. |
| Mutating `parsedResult` affects other paths        | `parsedResult` is a per-call freshly-parsed local; the only consumer is the response builder in the same function's caller. No shared state. |
| Lint regression (`any`)                            | Use `Record<string, unknown>`; `lint:strict` in verification.                                                                                |

## Linear

On completion: comment OMN-63 with the unit-proven determinism + the two integration flakes now green; close OMN-63.
(OMN-57 already closed; OMN-64/OMN-65 remain independent.)
