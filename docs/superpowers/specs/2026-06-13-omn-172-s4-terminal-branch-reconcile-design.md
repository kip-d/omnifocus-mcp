# OMN-172 (OMN-161 S4): terminal-state OR-branch contradiction + metadata reconciliation — design

**Status:** DRAFT (for spec-review + Kip gate). **Ticket:** OMN-172 (OMN-161 S4). **Requirements input:**
`docs/superpowers/specs/2026-06-13-omn-161-per-query-type-filter-contracts-design.md` §4 S4. **Baseline:** real `main` @
`7b52908` (post-OMN-171 S3, PR #101; local `main` was stale at `abcce0a` — fetched). **Decision (Kip, 2026-06-13):**
F8/R1 → **reject-with-steering** (not per-branch injection).

---

## 1. Premise-check — F8 / F10 re-verified against `7b52908`

The two S4 citations were authored against baseline `dd956de` (pre-S1/S2/S3). Re-verified against current code:

| Finding                                          | Verdict                        | Evidence (stable anchor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F8** — per-branch dropped default              | **CONFIRMED LIVE + reachable** | `script-builder.ts buildFilteredTasksScript` still spreads `dropped:false` onto the top-level `effectiveFilter`, gated on top-level `filter.dropped === undefined`. `builder.ts buildAST` pushes the dropped base comparison into `conditions[]` and AND-composes the OR node beside it. `transformStatus` maps `status:'dropped'`→`dropped:true` per branch; `transformFilters` does NOT reject the branch (`usableKeyCount===1`, not match-all). So `{OR:[{status:'dropped'},{flagged:true}]}` → `dropped==false AND (dropped==true OR flagged)` — dropped branch unsatisfiable.                                                                                                                                              |
| **F10** — `filter_description`↔`filters_applied` | **PARTIALLY STALE**            | The divergence _class_ is live, but the spec's enumerated missing-key list is wrong now: `BOOLEAN_FILTER_DESCRIPTORS` in `describeFilterForScript` already covers `flagged`, `blocked`, `inInbox`, `available` (3 of the spec's 7 "missing" keys). Genuine remaining gaps: the **date-range keys** `deferDate`, `completionDate`, `plannedDate`, `added` (only `dueDate` has a `describeDueDateRange` branch); plus `estimatedMinutes*`, `tagStatusValid`, `parentTaskId`. (NOT `project` — spec-review N1: `transformFlatFilter` always rewrites `input.project`→`projectId`/`inInbox`, so a normalized tasks filter never carries `project`; it is EXEMPT, and `projectId` is already described at `script-builder.ts:1057`.) |
| **NEW** — `completed` sibling of F8              | **CONFIRMED LIVE**             | The completed-exclusion default is NOT in the AST; it is a script-level guard (`if (task.completed) return;` in `buildFilteredTasksScript`, gated on top-level `filter.completed === undefined`). `status:'completed'`→`completed:true` per branch. So `{OR:[{status:'completed'},{flagged:true}]}` skips every completed task before the predicate → completed branch equally unsatisfiable, via a _different mechanism_ than dropped. F8 names only dropped; the honest fix must cover both.                                                                                                                                                                                                                                  |

`feedback_spec_citations_go_stale`: a spec's _specific enumeration_ rots like ticket text. F10's fix is therefore the
**every-key-described forcing function**, not a hardcoded backfill of the 7 named keys.

## 2. Goals / non-goals

**Goals**

1. **R1/F8 + completed sibling:** reject, with steering, any **tasks** query whose OR branch explicitly requests a
   terminal state (`dropped` / `completed`) that the query's effective base will exclude — i.e. an unsatisfiable branch.
   One symmetric rule covering both states. The rejection is a `z.ZodError` (VALIDATION_ERROR / InvalidParams), naming
   the offending branch and stating how to actually include that terminal state.
2. **F10:** make `filter_description` and `filters_applied` consistent — backfill the genuinely-missing
   `describeFilterForScript` branches, and add a **forcing-function test** that asserts every describable filter key is
   reflected in the description (so a future filter key can't silently read "all tasks"). Same coverage check for
   `describeProjectFilter`.

**Non-goals**

- **Per-branch injection** (the other F8 option) — Kip chose reject-with-steering. Not implemented.
- **Export path.** `includeCompleted` is an **export-only** schema field (`ExportQuerySchema`, `.strict()` union — a
  tasks query cannot pass it). Export builds its own filter
  (`taskExportFilter = includeCompleted ? {} : {completed:false}`) and does **not** call `buildFilteredTasksScript`
  (verified: the only caller is `list-tasks-ast.ts`). Export is not subject to F8. The contradiction check is scoped to
  the **tasks** compiled variant only.
- Recursive nested logical operators (schema stays one-level).
- AND-item / NOT contradictions of the same shape — out of scope unless trivially covered by the same predicate
  (AND-items already reject empties; a `{AND:[{status:'dropped'}], ...}` top-level-dropped-undefined case is noted as a
  test axis, see §7).

## 3. Design — R1/F8 (reject-with-steering)

### 3.1 The rule (why it's `includeCompleted`-free for tasks)

`includeCompleted` is export-only (§2). Therefore on **every** tasks list/count query the terminal-state exclusion
defaults apply unless the user sets the terminal key at the **top level**. The base AST forces:

- `dropped == false` whenever top-level `dropped !== true` (undefined → default `false`; explicit `false` → same
  effect).
- `completed == false`-equivalent whenever top-level `completed !== true` (undefined → script guard skips completed;
  explicit `false` → AST `completed==false`). Only top-level `completed === true` suppresses the guard.

A branch is **unsatisfiable** under that base iff it requires the excluded terminal state:

```
reject branch i  ⇔  (compiled.filters.dropped   !== true  AND  branch[i].dropped   === true)
                 OR  (compiled.filters.completed !== true  AND  branch[i].completed === true)
```

`branch[i].dropped === true` / `.completed === true` is exactly what `transformStatus` produces from `status:'dropped'`
/ `status:'completed'` (and what an explicit `dropped:true`/`completed:true` produces). A branch with `dropped:false` /
`completed:false` is consistent with the default → **not** rejected. A query with top-level `dropped:true` (or
`completed:true`) lifts the base exclusion → branch is satisfiable → **not** rejected.

### 3.2 Placement — QueryCompiler, tasks variant

The check lives in `QueryCompiler.compile()` for `type === 'tasks'`, immediately after
`const filters = normalizeFilter(raw)`, before returning. Rationale:

- **Correct error surface.** Rejections in the compiler are already `z.ZodError` → VALIDATION_ERROR / InvalidParams
  (§3.4 of the S1 design). Throwing from the codegen layer (`buildFilteredTasksScript`) would surface as
  EXECUTION_ERROR/INTERNAL — wrong class for bad input.
- **Single chokepoint covers list + count + tasks-modes.** Count (`countOnly`) and the standard list both compile
  through the tasks variant; rejecting here covers both without touching three script-builder sites.
- **Script-builders stay byte-identical.** `effectiveFilter` / `completionCheck` logic is untouched → the tasks-side
  golden script pins remain green (the contradictory filter simply never reaches codegen).

The defaulting predicate is centralized as a small helper so the compiler and the script-builder share one source of
truth for "is the terminal-state default in force":

```ts
// filter-merge.ts (or a sibling) — pure, unit-testable
export function terminalStateExcludedByBase(
  filter: Pick<NormalizedTaskFilter, 'dropped' | 'completed'>,
  state: 'dropped' | 'completed',
): boolean {
  return filter[state] !== true; // includeCompleted is export-only; tasks always default-exclude
}
```

The compiler iterates `filters.orBranches` and throws a `z.ZodError` with `path: ['query','filters','OR', i, <state>]`
(origin-aware, consistent with F5) on the first contradiction.

### 3.3 Steering message

The check runs in `compile()` iterating **compiled** branches, where `status:'dropped'` and explicit `dropped:true` have
both collapsed to `branch.dropped === true` (`transformStatus`, `QueryCompiler.ts:391-407`) — the original `status`
token is unrecoverable at this site. So the message is worded in terms of the _compiled fact_, not the input token
(spec-review B2). It must still tell the user how to actually get the terminal state (the reject is only honest if it's
actionable):

> `OR[0]` requires dropped tasks (`status:'dropped'` / `dropped:true`), but tasks queries exclude dropped tasks by
> default and an OR branch cannot re-include them. To include dropped tasks, set `status:'dropped'` (or `dropped:true`)
> at the **top level** of `filters` instead of inside an OR branch, or remove the branch.

Symmetric wording for `completed`. The messages are local constants of the new compiler check; this does **not** expand
the tasks-side `transformFlatFilter` reject map (S1's "don't expand the tasks-side reject map" rule is untouched — the
new reject is a distinct OR-branch contradiction check, not a per-key reject).

## 4. Design — F10 (metadata reconciliation)

### 4.1 Backfill the genuine gaps

`describeFilterForScript` gains branches for the date-range keys (`deferDate`, `completionDate`, `plannedDate`, `added`)
mirroring `describeDueDateRange`, plus `estimatedMinutes*`, `tagStatusValid`, `parentTaskId`. (`project` is EXEMPT —
always rewritten to `projectId`; see §1 N1.) `describeProjectFilter` is audited for the same parity against the
`ProjectFilter` keys; spec-review N4 confirms its one genuine semantic gap is `id` (all other semantic keys —
status/flagged/needsReview/text/name/folderId/folderName/topLevelOnly/orBranches — are already described in
`filter-generator.ts`). The forcing-function test will surface `id` on first run; describe or exempt it.

### 4.2 The forcing-function test (the real fix)

A `satisfies`-backed key-coverage map drives a test that asserts **every describable filter key produces a description
fragment** — so a future filter key forces a describe-or-exempt decision rather than silently reading "all tasks":

- Enumerate the `NormalizedTaskFilter` keys that can appear in `filters_applied`.
- Partition into `DESCRIBED` (must yield a fragment) and `EXEMPT`, typed `satisfies Record<NormalizedTaskFilterKey, …>`
  so adding a key is a compile error until classified. EXEMPT (structural/internal/aliased — spec-review N3):
  `orBranches`, `*Operator` (`tagsOperator`/`textOperator`/`nameOperator`/`dueDateOperator`/`deferDateOperator`/
  `plannedDateOperator`/`completionDateOperator`/`addedDateOperator`), `fastSearch`, `todayMode`, `dueSoonDays`,
  `projectStatus`, `project` (→`projectId`, N1), `mode`, `limit`, `offset`, `folder`, `folderTopLevel`, and the
  **`__normalized__` brand key** (`filters.ts` — it surfaces as a string-literal key of `NormalizedTaskFilter`, flag it
  so deriving `NormalizedTaskFilterKey` doesn't trip the implementer). Note `hasRepetitionRule` and `parentTaskId` are
  DESCRIBED (hasRepetitionRule already at `script-builder.ts:1018`; parentTaskId is a new backfill).
- Test: for each `DESCRIBED` key, a single-key filter yields `filter_description !== 'all tasks'` and contains the
  expected fragment. Plus an aggregate "no key in `filters_applied` is silently undescribed" assertion.
- Same structure for `describeProjectFilter` over `ProjectFilter` keys.

This is the cheap inert-filter detector the ticket asks for, made drift-proof (it can't go stale the way the spec's
enumerated 7-key list did).

## 5. Alternatives considered

| Alternative                                                           | Why not                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-branch injection** (F8 option a)                                | More capability ("dropped OR flagged" works) but more complex, and the `completed` sibling lives in a _script-level guard_ not the AST → covering it symmetrically needs a second mechanism (higher blast radius). Kip chose reject for the stability + symmetric-coverage win (`feedback_stability_over_diff_size`). |
| Detect in `buildFilteredTasksScript` (single SoT at the default site) | Wrong error class (codegen throw → EXECUTION_ERROR, not VALIDATION_ERROR) and would need duplicating at 3 sites (list/count/recurring). Compiler chokepoint covers all three with the right surface; the shared predicate helper preserves SoT.                                                                       |
| F10: hardcode-backfill the spec's 7 named keys                        | 3 of the 7 are already described — blindly re-adding is noise, and a hardcoded list rots again. The forcing-function test is the durable fix.                                                                                                                                                                         |
| Thread `includeCompleted` into the tasks contradiction check          | Dead complexity — it's export-only and the tasks union can't carry it. The rule is correctly `includeCompleted`-free for tasks.                                                                                                                                                                                       |

## 6. Risks

| Risk                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A prod LLM client sending `{OR:[{status:'dropped'},…]}` now gets a VALIDATION_ERROR where before it got (wrong) results | Intended honesty (the branch never worked — it returned an unsatisfiable set). Steering names the fix. Same accepted trade-off as OMN-156/162. Conformance run before merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The `!== true` predicate mis-handles an explicit top-level `dropped:false` + branch `dropped:true`                      | That IS a contradiction (`false AND (true OR …)`), correctly rejected. Covered by a test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `mode` augmentation interacts with the default                                                                          | **Mechanism (spec-review B1):** `augmentFilterForMode` runs AFTER `compile()` (`OmniFocusReadTool.ts:188` `buildTaskQuery`, vs compile at `:402`), so the compiler check does NOT see mode-injected keys. Safe anyway: `MODE_DEFINITIONS` (`task-query-pipeline.ts`) only ever injects _exclusion_ (`dropped:false`/`completed:false`), never `:true`, and augmentation merges `{...augmentation, ...filter}` so the **user's top-level filter wins**. A mode can only reinforce the exclusion, never lift it → the pre-augmentation compiled filter is conservative-correct. §7 keeps the mode × terminal-OR test axis to guard this. |
| F10 EXEMPT set hides a key that _should_ be described                                                                   | The `satisfies` map forces a conscious classification per key; review gate checks the EXEMPT rationale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Tasks-side golden scripts change                                                                                        | They don't — the contradictory filter is rejected pre-codegen; satisfiable filters compile byte-identically. Golden pins assert this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 7. Testing strategy (TDD per task)

**R1/F8 unit (`QueryCompiler` / contradiction):**

- `{OR:[{status:'dropped'},{flagged:true}]}` → rejects, `path` names `OR[0]`, message names dropped + the top-level fix.
- `{OR:[{status:'completed'},{flagged:true}]}` → rejects symmetrically.
- `{dropped:true, OR:[{status:'dropped'},{flagged:true}]}` → **accepts** (base lifts the exclusion).
- `{completed:true, OR:[{status:'completed'},…]}` → **accepts**.
- `{dropped:false, OR:[{status:'dropped'},…]}` → **rejects** (explicit-false is still exclusion).
- `{OR:[{dropped:false},{flagged:true}]}` → **accepts** (branch consistent with default).
- `{OR:[{flagged:true},{available:true}]}` → **accepts** (no terminal request).
- countOnly variant of the rejecting case → rejects identically (same compile path).
- mode axis: `mode:'flagged'|'available'|…` × terminal-OR-branch → behavior matches the compiled top-level filter.
- `terminalStateExcludedByBase` helper unit table.

**F10 unit:**

- Per-`DESCRIBED`-key: single-key filter → fragment present, not "all tasks"
  (deferDate/completionDate/plannedDate/added/ estimatedMinutes\*/tagStatusValid/parentTaskId/project).
- Aggregate forcing-function: every `DESCRIBED` key covered; `satisfies` map exhaustive over `NormalizedTaskFilterKey`.
- `describeProjectFilter` parity test.
- Pin: tasks-side golden scripts byte-identical (satisfiable filters unaffected).

**Integration (small):** one C18-shape live rejection
(`{type:'tasks', filters:{OR:[{status:'dropped'},{flagged:true}]}}` → InvalidParams with steering).

**Full:** `npm run test:unit`, `npm run test:integration` (backgrounded, never killed — OMN-143; not concurrent with
unit), `npm run conformance` vs same-day main control (OMN-168) — new reject must not regress the bar; steering is the
fix surface.

## 8. Docs

- `read-filters.md` **§8 Drift register** (not §6 — plan-review B2): add rows D22 (F8 terminal-state OR-branch
  contradiction → S4 reject-with-steering) and D23 (F10 description/applied reconciliation → forcing-function coverage),
  mirroring the D17–D21 RESOLVED format.
- `read-schema.ts` / `OmniFocusReadTool` description: note that a terminal `status` inside an OR branch is rejected with
  steering toward the top-level form (dual-schema rule — update inputSchema description if it implies otherwise).
