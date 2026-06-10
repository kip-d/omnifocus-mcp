# OMN-128 Slice 5 — complete + delete on the Mutation AST

**Date:** 2026-06-10 **Ticket:** OMN-128 (umbrella) **Predecessors:**
`docs/superpowers/specs/2026-06-08-write-side-mutation-ast-design.md` (slice 1, `buildCreateProjectScript`, PR #74);
`docs/superpowers/specs/2026-06-09-create-task-batch-mutation-ast-design.md` (slice 2, create-task + batch-create, PR
#78); `docs/superpowers/specs/2026-06-09-create-folder-mutation-ast-design.md` (slice 3, create-folder — the create
family is complete); `docs/superpowers/specs/2026-06-10-update-task-project-mutation-ast-design.md` (slice 4,
update-task + update-project — the update family is complete). This slice migrates the **lifecycle family** (complete +
delete, single and bulk) and deletes the two production-dead template builders, leaving only the tag builders (slice 6)
on template-string codegen.

## 1. Scope — the call-site map is wider than the builder names suggest

The session-start audit found that "migrate `buildCompleteScript` + `buildDeleteScript`" understates the slice: the
single-op **task** paths don't use those builders at all. Five production paths converge on this slice:

| Path                                                                                 | Today                                                                             | Hazards today                                                                                                    | New                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| task complete (`handleTaskComplete`)                                                 | `buildCompleteTaskScript` (`src/omnifocus/scripts/tasks/complete-task.ts`)        | **No sandbox guard**; nested-backtick island with `'\${taskId}'` interpolation — the OMN-111/113 mechanism, live | `dispatchMutation('complete/task')`                   |
| task delete (`handleTaskDelete`)                                                     | `buildDeleteTaskScript` (`src/omnifocus/scripts/tasks/delete-task.ts`)            | **No sandbox guard**; raw string-concat of `taskId` into the OmniJS source                                       | `dispatchMutation('delete/task')`                     |
| project complete (`handleProjectComplete`)                                           | `buildCompleteScript('project', …)` (mutation-script-builder)                     | guarded; template codegen                                                                                        | `dispatchMutation('complete/project')`                |
| project delete (`handleProjectDelete`, bulk-projects loop, `rollbackBatchCreations`) | `buildDeleteScript(target, …)`                                                    | guarded; template codegen                                                                                        | `dispatchMutation('delete/task' \| 'delete/project')` |
| bulk task delete (`handleBulkDeleteTasks`)                                           | `buildBulkDeleteTasksScript` (`src/omnifocus/scripts/tasks/delete-tasks-bulk.ts`) | **No sandbox guard — open OMN-120**; string-concat of the ids JSON                                               | `dispatchMutation('bulk_delete/task')`                |

**Public builder surface after the slice:** `buildCompleteScript(target, id, completionDate?)` and
`buildDeleteScript(target, id)` keep their signatures and become thin dispatch wrappers (the slice-4 pattern) — the
project handlers and `rollbackBatchCreations` (which passes `item.type`, so the task arm is live via rollback) call them
unchanged. `buildCompleteTaskScript`, `buildDeleteTaskScript`, and `buildBulkDeleteTasksScript` (plus their two script
files) are **deleted**; the task/bulk handlers rewire onto the unified builders.
`buildBulkDeleteTasksScript({ taskIds })` is re-exported from `mutation-script-builder.ts` with the same name but
returning `GeneratedMutationScript` (async — dispatch awaits the guard); the handler updates to `.script`.

**Ride-along A — dead-code deletion (in scope).** `buildBatchScript` and `buildBulkDeleteScript`
(mutation-script-builder) have **zero production callers** — `routeToBatch` dispatches batch sub-ops through the
single-op handlers, and bulk delete uses `buildBulkDeleteTasksScript`/the per-project loop. Both are deleted with their
unit tests and any exports/types that lose their last consumer (`BatchOperation`/`BatchOptions` stay if the batch
envelope still uses them — check with grep; expect a ts-prune cascade round per `project_cascading_discovery_rule`). The
last `batchNonce` dies with `buildBatchScript` — **OMN-134 residue closed by deletion, not migration.**

**Ride-along B — bulk task delete migration (in scope, flagged for review).** The `ids` array is schema-capped at 100,
so an unrolled per-id program is ~10–20 KB — far under the 200 KB emitted-size guard. Migrating it closes **OMN-120**
structurally (guard at dispatch validates every id) rather than patching the legacy script with a tool-layer check. This
is the one genuine scope addition; if it makes the slice too big it cleanly defers to its own PR — everything else
stands alone.

**Riding doc minors (from PR #81 final review):** fix the slice-4 spec §4.2 sentence claiming `OMNIJS_RESOLVE_TAG_PATH`
"survives until the tag builders migrate (slice 5+)" (tag builders are slice 6), and the `CALL_METHOD_ALLOWLIST` export
comment that claims present-tense callers.

**Out of scope:** tag builders (`tag-mutation-script-builder.ts`, slice 6); OMN-129 read-side retrofit; OMN-141 (batch
stopOnError flattening); OMN-142 (name filter matches notes); the OMN-137 codebase-wide audit item (§2.4).

## 2. Behavior deltas (deliberate, recorded)

### 2.1 Sandbox guard now covers single-op task complete/delete (closes a previously unrecorded OMN-120-class hole)

`handleTaskComplete`/`handleTaskDelete` call builders with **no guard** today — the OMN-119 comment in `routeToBatch`
("complete/delete sub-ops dispatch through the already-guarded single-op handlers") is **false for tasks**. After this
slice the claim becomes true: all five paths run `validateTaskInSandbox`/`validateProjectInSandbox` at `MUTATION_DEFS`
dispatch, and the bulk guard validates **all ids before any delete executes** (`Promise.all`, no-op outside test mode —
same posture as the legacy `buildBulkDeleteScript` guard). In test mode, completing or deleting a real (non-sandbox)
task now **refuses loudly** where legacy would have executed it.

### 2.2 O(1) resolution + unified not-found messages

| Path                    | Legacy lookup                             | New                           |
| ----------------------- | ----------------------------------------- | ----------------------------- |
| task complete           | `flattenedTasks.forEach` full scan (O(n)) | `Task.byIdentifier` (O(1))    |
| task delete             | `Task.byIdentifier`                       | unchanged                     |
| project complete/delete | `flattenedProjects.find` full scan        | `Project.byIdentifier` (O(1)) |
| bulk task delete        | `Task.byIdentifier` per id                | unchanged                     |

All paths are strict-ID today (no name fallback anywhere in this family), so resolution semantics don't change — only
the lookup cost and the message wording. Not-found messages unify on the slice-4 wording: `Task not found: <id>` /
`Project not found: <id>`. **Delta:** the legacy `buildCompleteScript`/`buildDeleteScript` inner script returns
`{success: false, error: "Not found"}`, and the outer remap's `result.error || "${target} not found: …"` fallback is
dead code (`"Not found"` is always truthy) — so legacy clients of the project paths actually see bare `Not found`, with
no id. The new wording adds the entity and the id. The task-side scripts already used the capitalized
`Task not found: <id>` form (no delta there). Bulk per-item errors keep the legacy `Task not found` (per-id entry in
`errors[]`, no id echo in the message — the entry carries `taskId`).

### 2.3 Envelopes — no `success` key (the slice-4 convention)

`OmniAutomation.executeJson` wraps the parsed script output in its own `{success, data}` `ScriptResult` before
`BaseTool.execJson` inspects it, so `result.data` is always the script envelope — including, today, the legacy project
paths' redundant inner `success: true` key, which therefore reaches clients inside the response data. The migrated
envelopes follow the slice-4 convention and omit `success`: the transport wrapper owns success/failure signaling, and an
inner `success: false` would be remapped to a ScriptError by `isLegacyScriptError` rather than read as data — error
signaling belongs to the `{error: true, message}` guard envelope alone. New envelopes (read live where possible, never
echoes — except the deleted-object id, which is unreadable after `deleteObject` by construction; `name` is captured
pre-delete):

```js
// complete/task                                  // complete/project
{ taskId: task.id.primaryKey, name: task.name,    { projectId: proj.id.primaryKey, name: proj.name,
  completed: true,                                  completed: true,
  completionDate: <live ISO or null> }              completionDate: <live ISO or null> }
// delete/task                                    // delete/project
{ taskId: <requested id>, name: <pre-delete>,     { projectId: <requested id>, name: <pre-delete>,
  deleted: true }                                   deleted: true }
// bulk_delete/task
{ deleted: [{ id, name }…], errors: [{ taskId, error }…], message: "Deleted <n> of <m> tasks" }
```

**Deltas:** (a) task complete/delete envelopes rename `id` → `taskId` (consistency with every other migrated envelope);
the handler wraps them under `task:` in the MCP response, so client-visible key paths are `task.taskId` instead of
`task.id` — recorded, and the handlers' own response assembly is updated in the same change. (b) project complete/delete
response data loses the redundant inner `success: true` key (§ above). (c) bulk keeps its legacy shape
(`collectBulkDeleteResults` consumes `deleted[]`/`errors[]` unchanged) minus the same inner `success` key. (d)
**`completionDate` now reaches project completes:** the write schema accepts it for `complete` on either target, but
`handleProjectComplete(projectId)` silently drops it today (both call sites pass only the id). The lowering input
carries `completionDate?` and the handler wires `compiled.completionDate` through with the same `localToUTC` conversion
the task path uses — fixing a pre-existing silent drop (`feedback_no_silent_failures`) rather than preserving it;
recorded here because a client that passed the field and relied on it being ignored would see a behavior change. Handler
simplification rides along: the `'success' in res ? … : {success: true, data: res}` re-wrapping dance in
`handleTaskComplete`/`handleTaskDelete` collapses to the uniform `isScriptError` + `result.data` pattern the project
handlers use.

### 2.4 OMN-137 posture — nothing left to swallow on these paths

Complete and delete are **single mutating calls** (`markComplete`, `deleteObject`) — there are no post-resolution
best-effort applies, so these programs emit **no `bestEffort` nodes and no `warnings` key** (omit-when-empty is
vacuously satisfied; a thrown `markComplete`/`deleteObject` is a loud hard error, which is correct — there is no partial
result to preserve). The slice's OMN-137 contribution is deletion: the dead `buildBatchScript` carried the last
empty-`catch` swallows on a write path (three in the nonce-bridge mechanism: two JXA-level plus one inside the bridge
string). After this slice the remaining swallowers are the two `catch(e) {}` blocks in `tag-mutation-script-builder.ts`
(the `id:"unknown"` fallback class — slice 6) and OMN-137's codebase-audit item; whether the ticket closes now or at
slice 6 is Kip's call, recorded in the ticket on merge. `rollbackBatchCreations` catches rollback failures and only logs
— surfacing those into the batch error response is adjacent but **out of scope** (it's tool-layer policy, not builder
migration; noted here so it isn't lost).

## 3. Legacy-faithful semantics (preserved exactly)

| Semantics                                                                                                      | Behavior                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| completionDate                                                                                                 | Tool layer converts via `localToUTC(date, 'completion')` (task path; unchanged). With a date: `markComplete(<dateExpr>)`; without: `markComplete()` — bare call completes "now", matching both legacy variants (explicit `new Date()` vs no-arg are equivalent)                                                       |
| completionDate read-back                                                                                       | Envelope reads `item.completionDate ? item.completionDate.toISOString() : null` live after the call (legacy-faithful, and a real read-back not an echo)                                                                                                                                                               |
| Project complete                                                                                               | `Project.markComplete(date): Task` is a real OmniJS API (`src/omnifocus/api/OmniFocus-4.8.6-d.ts`) — same call shape as tasks                                                                                                                                                                                         |
| Delete                                                                                                         | `name` captured before `deleteObject`; envelope echoes the requested id (the object no longer exists to read)                                                                                                                                                                                                         |
| Bulk delete                                                                                                    | Continue-on-error per id: each id gets its own resolve + delete inside a per-item `try`, failures append `{taskId, error}` and the loop continues (legacy-faithful; this is loud per-item reporting, not a swallow). Empty-array short-circuit stays at the tool layer (schema `min(1)` makes it unreachable via MCP) |
| Apply order                                                                                                    | resolve → guard → (capture name) → mutate → envelope; resolve-first ordering is trivial here (one reference per program; bulk is per-item resolve-then-delete, preserving legacy's interleaved order)                                                                                                                 |
| Cache invalidation, JXA-access-denied remaps, error codes (`COMPLETE_FAILED`, `DELETE_FAILED`, `SCRIPT_ERROR`) | Tool layer, unchanged                                                                                                                                                                                                                                                                                                 |

## 4. Substrate additions

### 4.1 One new node: `deleteObject` (`mutation/types.ts`, `mutation/emitter.ts`)

The session-start note assumed "delete needs deleteObject added to the allowlist" — that's not expressible: `callMethod`
emits `<target>.<method>(args)` and `deleteObject(item)` is a **free function**. A dedicated statement node is the
smallest correct addition:

| Node           | Emission                  | Notes                                                                                                                                                                                                        |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `deleteObject` | `deleteObject(<target>);` | `target: Expr` (a resolve bind ref). No binding, no `bestEffort` (a failed delete is a hard error, §2.4). Validator: counts as a resolve-bind consumer (rule 7 — guard required between resolve and consume) |

`markComplete` is already in `CALL_METHOD_ALLOWLIST` and `callMethod` already supports args — complete needs **zero
allowlist changes** (the existing `callMethod(bind, 'markComplete', [dateExpr…])` covers it). The allowlist comment gets
its riding fix (§1).

### 4.2 Lowerings (`mutation/defs.ts`)

```ts
export interface CompleteTaskInput {
  taskId: string;
  completionDate?: string | null;
}
export interface CompleteProjectInput {
  projectId: string;
  completionDate?: string | null;
}
export interface DeleteTaskInput {
  taskId: string;
}
export interface DeleteProjectInput {
  projectId: string;
}
export interface BulkDeleteTasksInput {
  taskIds: string[];
}
```

One shared helper per operation — task/project shapes genuinely coincide here (the slice-2/slice-4 sharing rule):
`lowerComplete(kind: 'task' | 'project', id, completionDate?)` and `lowerDelete(kind, id)`, differing only in the
resolve node (`resolveTask` vs `resolveProjectById`), the guard message, and the envelope id key. The bulk lowering
unrolls `taskIds` into per-item resolve/capture/delete blocks accumulating into program-scope `_deleted`/`_errors`
arrays (the slice-2 per-item capture pattern; no `_aborted` — bulk continues on error). Exhaustiveness guards are
near-trivial at 1–2 keys but applied anyway — uniformity is what makes the discipline checkable.

### 4.3 Registry + sandbox guard (`MUTATION_DEFS`)

```ts
'complete/task':    { guard: (d) => validateTaskInSandbox(d.taskId, 'complete'),    build: buildCompleteTaskProgram },
'complete/project': { guard: (d) => validateProjectInSandbox(d.projectId, 'complete'), build: buildCompleteProjectProgram },
'delete/task':      { guard: (d) => validateTaskInSandbox(d.taskId, 'delete'),      build: buildDeleteTaskProgram },
'delete/project':   { guard: (d) => validateProjectInSandbox(d.projectId, 'delete'), build: buildDeleteProjectProgram },
'bulk_delete/task': { guard: (d) => Promise.all(d.taskIds.map((id) => validateTaskInSandbox(id, 'bulk delete'))),
                      build: buildBulkDeleteTasksProgram },
```

Key naming follows the registry's `operation/target` convention. Carry-over: the guard pre-flight is ID-only, so live
verifies of not-found and non-sandbox probes need the bounded unguarded window (§7).

## 5. Validator (`mutation/validator.ts`)

- `deleteObject`: register its `target` in the statement-consumed-refs walker so the generalized rule 7 (any resolve
  bind consumed by any later statement needs an intervening guard) covers it with no new rule text.
- Reserved-identifier rule: the bulk lowering's `_deleted`/`_errors` program-scope names join the reserved set
  (alongside `_warnings`, `_aborted`, `/^_w\d+$/`) so user data can't collide with them.
- **Considered and skipped:** a use-after-delete rule (no statement may consume a bind after `deleteObject(bind)`). The
  lowerings never do this (name is captured before), and the envelope echoes the id string, not the bind. Cheap to add
  later if a lowering ever wants post-delete reads; YAGNI now.

## 6. Tool layer (`OmniFocusWriteTool.ts`)

- No schema field changes → **no `inputSchema` edits** (dual-schema rule satisfied vacuously). Audit the tool
  description string for stale complete/delete/bulk_delete claims; update if any describe the old behavior.
- `handleTaskComplete`/`handleTaskDelete`: rewire to `await buildCompleteScript('task', …)` /
  `await buildDeleteScript('task', …)`; collapse the success-rewrapping dance to `isScriptError` + `result.data` (§2.3).
  Verify the compiled `minimalResponse` flag (carried for complete since Bug #21) — confirm whether anything consumes it
  on this path; if dead, leave it (not this slice's cleanup).
- `handleBulkDeleteTasks`: same-name builder now async returning `GeneratedMutationScript` — await it, execute
  `.script`; `collectBulkDeleteResults` unchanged.
- `handleProjectComplete`: accept and forward `compiled.completionDate` (converted via `localToUTC(date, 'completion')`)
  to `buildCompleteScript('project', id, date)` — both call sites pass only the id today (§2.3d).
- Delete `src/omnifocus/scripts/tasks/complete-task.ts`, `delete-task.ts`, `delete-tasks-bulk.ts` and their re-exports
  in `src/omnifocus/scripts/tasks.ts`; delete `buildBatchScript` + `buildBulkDeleteScript` + their tests + orphaned
  exports in `src/contracts/ast/index.ts`. Expect one ts-prune cascade round.

## 7. Testing & verification

| Layer                                                       | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden unit                                                 | `tests/unit/contracts/ast/mutation/complete.test.ts` + `delete.test.ts` (+ bulk): program shape per target; exact guard messages (§2.2 wording); `markComplete` arg with/without completionDate; name-capture-before-delete ordering; bulk per-item unroll + reserved accumulators; no `warnings`/`bestEffort` emission (§2.4)                                                                                                                     |
| `node:vm` execution                                         | Stubbed `Task.byIdentifier`/`Project.byIdentifier`/`deleteObject`/`markComplete`: envelope correctness incl. live completionDate read-back; **zero mutation on not-found** (deleteObject stub never called); bulk continue-on-error (mix of found/not-found ids → both arrays correct); throwing `deleteObject` → hard error envelope                                                                                                              |
| Validator unit                                              | `deleteObject` rule-7 positive/negative; reserved `_deleted`/`_errors`                                                                                                                                                                                                                                                                                                                                                                             |
| Tool-layer unit                                             | Handler envelope adaptation (`taskId` key; no inner `success` key in response data; project `completionDate` wired through with `localToUTC`, §2.3d); bulk response assembly unchanged                                                                                                                                                                                                                                                             |
| Live integration (OMN-138 — closes the complete/delete gap) | Sandbox fixtures: complete a task (read back `completed` + `completionDate` via an `includeCompleted`-capable query), complete a project, delete task/project (read back **absence**), bulk delete (mixed sandbox ids + one bogus id → per-item results). Read-backs assert persisted state, never envelope echoes                                                                                                                                 |
| Live `/verify` matrix                                       | Bounded unguarded window (of-call.mjs recreated in job tmp) for: not-found messages (task/project/bulk-item); **decoy-fixture guard probes** — uniquely-named non-sandbox task/project, attempt complete + delete through the guarded dev server, expect TEST GUARD refusal and decoys unharmed (this is the §2.1 keystone: legacy would have executed them); `pgrep -fl vitest` before probes; integration only via `run_in_background` (OMN-143) |

Review gates per `feedback_review_gates`: spec review loop → user spec review → plan + plan review → user plan review →
per-task two-stage subagent reviews (spec-compliance, then code-quality with the vacuous-green/wrong-seam check) → final
pre-merge `superpowers:code-reviewer` gated on SAFE → `gh pr merge --squash --auto`.

## 8. Decision record (alternatives not taken)

- **`deleteObject` via `callMethod` with a null target** — rejected: stretches one node across two call shapes and
  muddies the allowlist's "methods on a resolved object" semantics; a free-function statement node keeps the validator
  rules crisp.
- **Migrate `buildBatchScript` instead of deleting it** — rejected: zero production callers since `routeToBatch` began
  dispatching through single-op handlers; migrating dead code launders it into maintained code.
- **Patch OMN-120 with a tool-layer id check and defer the bulk migration** — rejected (unless scope forces the defer,
  §1): the tool-layer check is the OMN-119 pattern, a second guard site to keep in sync; dispatch-time guarding is the
  structural fix and the migration cost is one small lowering.
- **Unify bulk-project deletion into one program** — rejected: the per-project tool-layer loop through guarded
  `handleProjectDelete` works, is safe, and changing its envelope shape buys nothing this slice.
- **Keep the `id` envelope key on task complete/delete** — rejected: every migrated envelope uses `taskId`/ `projectId`;
  carrying the inconsistency forward costs more than the recorded one-time key rename (§2.3).
- **Add a `warnings` array to complete/delete envelopes for uniformity** — rejected: no best-effort steps exist (§2.4);
  an always-empty key invites clients to treat it as load-bearing.
