# OMN-161: per-query-type filter contracts — design

**Status:** DRAFT — pending review. **Baseline:** `main` @ `dd956de` (post-OMN-151/156/157/158/159, PRs
#93/#95/#96/#97/#98). **Ticket:** OMN-161 (redesign: QueryCompiler emits typed per-query-type filters, no handler
re-narrowing seams). **Normative spec:** `docs/spec/read-filters.md` (OMN-148 §1) — P1 (strict boundary), P2
(conjunctive composition), P3 (no silent widening), §6 (projects/folders/tags/perspectives contracts). **Generalizes:**
`docs/superpowers/specs/2026-06-12-omn-151-156-logical-operator-honesty-design.md` §3.3/§4 (the projects key-disposition
table — this doc's per-type tables extend that pattern).

**Scope decisions (Kip, 2026-06-13):** full discriminated union over **all** query types; folders/tags get **basic
filtering capability**; behavior riders **R1** (per-branch default) and **R6** (OR/NOT on projects) are **in scope** for
the program. Delivery: write this whole-program spec, then execute and merge **S1 only** this session; **S2–S4 file as
separate OMN tickets** with this doc as their requirements input.

---

## 1. Premise-check — verified against `dd956de` (2026-06-13)

The OMN-161 ticket `# Why` names three silent-drop layers as the live problem. A parallel-probe audit against current
`main` found **the ticket text is substantially stale** — it was inherited from the _pre-fix_ problem statement of the
OMN-151/156 PR this ticket was scoped to generalize, and that PR (plus #97/#98) landed. Enumerated from code, not the
ticket:

| Ticket claim (`# Why`)                                    | Status on `dd956de`          | Evidence (stable anchor)                                                                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compiler `transformFilters` early-return drops siblings   | **STALE — closed (OMN-151)** | `QueryCompiler.transformFilters` builds `MergeSource[]` → `mergeConflictChecked`; no early-return                                                                                                                                 |
| `buildAST` drops base keys beside `orBranches`            | **STALE — closed (OMN-151)** | `builder.ts buildAST` pushes the OR node into `conditions[]` then `and(...conditions)`                                                                                                                                            |
| `handleProjectQuery` cherry-picks 7 keys → match-all      | **STALE — closed (OMN-156)** | `OmniFocusReadTool.handleProjectQuery` reads `compiled.projectFilter`; cherry-pick seam deleted                                                                                                                                   |
| "`CompiledQuery.filters` task-shaped, no `projectFilter`" | **half-stale**               | `projectFilter?: ProjectFilter` side-channel exists; but `filters` IS still `NormalizedTaskFilter` for every type                                                                                                                 |
| "audit analyze tool's separate `ProjectFilter`"           | **DISSOLVED**                | `OmniFocusAnalyzeTool` has **no** ProjectFilter compile path; `AnalysisCompiler.compileStandard` is a `{type,scope,params}` pass-through. There is no seam to align (a different silent scope-key drop exists, out of scope here) |

**What actually remains (REAL, verified against code):**

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Anchor                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F1  | `CompiledQuery.filters: NormalizedTaskFilter` is the SAME shape for all six `type` values. Projects has a bolted-on `projectFilter?` side-channel; tasks/projects/tags/folders/export/perspectives share one filter field. This is the structural defect.                                                                                                                                                                                                              | `QueryCompiler.CompiledQuery`                                                |
| F2  | `compile()` diverts ONLY projects: `const rawFilters = !isProjects && query.filters ? this.transformFilters(...) : {}`. Folders/tags/export/perspectives **run the tasks-side transform**, then their handlers ignore the result.                                                                                                                                                                                                                                      | `QueryCompiler.compile`                                                      |
| F3  | `handleTagQuery(_compiled)` and `handleFolderQuery(_compiled)` ignore filters entirely (underscore param). A _supported_ tasks key (e.g. `flagged:true`) on a folders query compiles into `compiled.filters` then vanishes — **P1 accept-then-ignore** (rider 3).                                                                                                                                                                                                      | `OmniFocusReadTool`                                                          |
| F4  | `STATUS_TO_PROJECT: Record<string, ProjectStatus>` is loose — NOT `satisfies`-bound to the schema status enum. A future enum value could go unmapped (defended at runtime, but not at compile time). (rider 4)                                                                                                                                                                                                                                                         | `filter-merge.ts STATUS_TO_PROJECT`                                          |
| F5  | `transformStatus` throws `on_hold` rejection with hardcoded `path: ['query','filters','status']`, ignoring `origin` — inside `OR[1]` it still reports `filters.status`, not `filters.OR[1].status`. `transformFlatFilter` already threads `origin`/`originToPath`; `transformStatus` does not receive it. (rider 5b)                                                                                                                                                   | `QueryCompiler.transformStatus`                                              |
| F6  | The folder/on_hold rejection messages say "tasks or export queries", but `compile()` routes folders/tags/perspectives queries through the same tasks-side transform (F2), so a `{type:'folders', filters:{folder:'Bills'}}` query gets a message naming the wrong query type. (rider 5a)                                                                                                                                                                               | `task-key-disposition.ts FOLDER_TASKS_REJECTION`                             |
| F7  | Empty-AND-item asymmetry: tasks reject `AND:[{}]` (`usableKeyCount===0`); projects' `mergeFrom` skips empty items silently (no usable-key check) → `AND:[{}]` is a no-op on projects. (rider 2)                                                                                                                                                                                                                                                                        | `QueryCompiler.transformFilters` vs `transform-project-filters.ts mergeFrom` |
| F8  | Per-branch default hazard: `buildFilteredTasksScript` injects `dropped:false` onto the TOP-LEVEL `effectiveFilter`; `buildAST` then ANDs it over the OR node. `{OR:[{status:'dropped'},{flagged:true}]}` → `dropped==false AND (dropped==true OR flagged)` — the dropped branch is silently unsatisfiable. (rider 1)                                                                                                                                                   | `script-builder.ts buildFilteredTasksScript` + `builder.ts buildAST`         |
| F9  | `compiled.filters.search` is read on the export path but the compiler never writes `result.search` (it writes `result.text`) — dead read, always `undefined`.                                                                                                                                                                                                                                                                                                          | `OmniFocusReadTool.handleTaskExport`                                         |
| F10 | `filters_applied` (echoes the compiled `TaskFilter`) and `filter_description` (from `describeFilterForScript`, which has branches only for a SUBSET of keys — missing `deferDate`, `flagged`, `blocked`, `inInbox`, `completionDate`, `plannedDate`, `added`) derive independently with no reconciliation. A filter on a missing-branch key reads `filter_description:"all tasks"` while `filters_applied` shows the key — self-contradiction. (inert-filter detector) | `script-builder.ts describeFilterForScript`                                  |

OMN-151/156/157/158/159 shifted no premise except by closing the three layers above. The cluster's _motivating bugs are
fixed_; OMN-161 is now a **structural-coherence redesign** (fork-driven quality bar — `project_fork_driven_redesign`)
plus the riders the typed contract makes cheap.

## 2. Goals / non-goals

**Goals**

1. `CompiledQuery` becomes a discriminated union keyed by `type`; each variant's `filters` is its own type
   (`TaskFilter | ProjectFilter | TagFilter | FolderFilter | ExportFilter`; perspectives carry no filter). Reading the
   wrong filter shape in a handler is a **compile error**.
2. Every query type compiles its filters through a type-specific transform that (a) validates in **input vocabulary**,
   (b) rejects unsupported keys at the compile boundary with steering (P1 — accept-then-ignore forbidden), (c) is closed
   by `satisfies Record<AllInputKeys, Disposition>` so a future schema field forces a per-type disposition decision.
3. No handler re-narrowing seam survives on the read path. The `projectFilter?` side-channel is folded into the union
   and deleted.
4. Close the honesty riders the contract makes cheap: F4 (status `satisfies`), F5 (origin-aware status path), F6
   (per-type reject messages name the right query type), F7 (empty-item symmetry), F9 (dead `.search` read).

**Non-goals (deferred to sliced follow-up tickets — §8)**

- **S2:** folders/tags _filtering capability_ (supported `name`/parent keys). S1 makes folders/tags reject-all honestly;
  S2 adds the supported keys.
- **S3:** OR/NOT _evaluation_ on projects (R6 — branch compilation + status-array complement).
- **S4:** the per-branch default fix (R1, F8) and the `filter_description`↔`filters_applied` reconciliation (F10).
- Tasks-side `id` fast-path co-filter drop (design doc §7 follow-up 3) — same shape as the projects id rule; audit, not
  in this program unless trivial.
- OMN-167 (tasks-by-folder capability) — a distinct, harder semantic problem (inbox matching, ancestor-vs-direct-parent,
  dropped folders). **Stays parked.** S2's folder filtering is filtering _folders_ queries, not _tasks-by-folder_ — no
  overlap.
- Recursive nested logical operators. Schema stays one-level.

## 3. Design — S1 (the only slice executing this session)

### 3.1 `CompiledQuery` discriminated union

Replace the flat interface with a discriminated union on `type`. Shared response-control fields
(`fields`/`sort`/`limit`/`offset`/`details`/`countOnly`/…) live on a `CompiledQueryBase`; each variant adds its typed
`filters` and type-specific fields:

```ts
interface CompiledQueryBase { fields?: string[]; sort?: …; limit?: number; offset?: number; details?: boolean; … }
type CompiledQuery =
  | (CompiledQueryBase & { type: 'tasks';        filters: NormalizedTaskFilter; mode?: TaskMode; fastSearch?: boolean; daysAhead?: number; countOnly?: boolean })
  | (CompiledQueryBase & { type: 'projects';     filters: ProjectFilter })
  | (CompiledQueryBase & { type: 'tags';         filters: TagFilter })
  | (CompiledQueryBase & { type: 'folders';      filters: FolderFilter })
  | (CompiledQueryBase & { type: 'perspectives'; filters: PerspectiveFilter })
  | (CompiledQueryBase & { type: 'export';       filters: ExportFilter; exportType?: …; format?: …; … });
```

The `projectFilter?` field is **removed**; projects' typed filter lands on `filters`. Handlers switch on `compiled.type`
(already the dispatch discriminant) and TS narrows `filters` to the right type.

`TagFilter`, `FolderFilter`, `PerspectiveFilter`, `ExportFilter` are new types in `src/contracts/filters.ts`. In S1
`TagFilter`/`FolderFilter`/`PerspectiveFilter` are **empty** (`Record<string, never>` or a branded empty object) — they
carry no supported keys yet; S2 adds the folder/tag fields. `ExportFilter` is the existing ad-hoc shape from
`handleTaskExport`, lifted to a named type and produced by a transform (F9: drop the `.search` field — never populated).

### 3.2 Per-type transforms + dispatch

`compile()` dispatches on `query.type` to one transform per type, each returning that type's filter:

| Type         | Transform                                                              | S1 behavior                                                                                          |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| tasks        | `transformTaskFilters` (rename of `transformFilters`, unchanged logic) | full task vocabulary (status quo)                                                                    |
| projects     | `transformProjectFilters` (exists; output now lands on `filters`)      | unchanged disposition table; F7 fix (empty-item symmetry)                                            |
| export       | `transformExportFilters`                                               | reuses the task transform, then projects to `ExportFilter`; drops dead `.search`                     |
| tags         | `transformTagFilters` (NEW)                                            | **reject-all**: any present filter key → steering error naming tags' (currently empty) supported set |
| folders      | `transformFolderFilters` (NEW)                                         | **reject-all**: any present filter key → steering error naming folders' supported set                |
| perspectives | (no transform)                                                         | perspectives accept no filters; reject if any present                                                |

Each transform owns a `satisfies Record<<Type>InputKey, Disposition>` table (the `PROJECT_KEY_DISPOSITION` pattern). For
tags/folders the table is all-`reject` in S1 (S2 flips `name`/parent to `map`). The per-type `Disposition` unions stay
**separate** (tasks `'map'|'compose'|'reject'`, projects `'map'|'merge'|'reject'`) per the §3.1 decision — a
tags/folders table can be the minimal `'reject'`-only union.

This makes F2/F3 disappear: folders/tags no longer run the _tasks_ transform, so they no longer emit the wrong-type
message (F6) and no longer accept-then-ignore a supported tasks key (F3 — it now rejects).

### 3.3 Shared rejection machinery + rider fixes

- **F4 (status `satisfies`):** derive the read-schema status enum's literal union as a type and change
  `STATUS_TO_PROJECT: Record<string, ProjectStatus>` → `… satisfies Record<ReadStatus, ProjectStatus>` (where
  `ReadStatus = 'active'|'completed'|'dropped'|'on_hold'`, sourced from the schema enum). A future enum value becomes a
  compile error here.
- **F5 (origin-aware status path):** thread `origin` into `transformStatus` (it already flows to `transformFlatFilter`);
  build the path as `[...originToPath(origin), 'status']` so `on_hold` inside `OR[1]` reports `filters.OR[1].status`.
- **F6 (right-type messages):** each type's reject error names its own supported set. The shared
  `FOLDER_TASKS_REJECTION`/`ON_HOLD_TASKS_REJECTION` constants stay for the tasks/export path (correct there);
  tags/folders get their own messages from their transforms.
- **F7 (empty-item symmetry):** extract a `usableKeyCount`-equivalent and apply it in projects' `mergeFrom` so
  `AND:[{}]` rejects on projects exactly as on tasks. Factor the empty-operator/empty-item rejection into shared helpers
  (`filter-merge.ts`) so all transforms get identical semantics.
- **F9 (dead `.search`):** `transformExportFilters` does not emit `search`; the `ExportFilter` type omits it.

### 3.4 Error surface

All new rejects are `z.ZodError` with `path: ['query','filters', …]` and messages that name the offending key and the
type's supported set (OMN-131 pattern) → VALIDATION_ERROR in the failure log, InvalidParams over MCP. Unchanged from the
established surface; only the _origin paths_ (F5) and _message type-names_ (F6) are corrected.

### 3.5 Docs / spec / tests

- `read-filters.md`: §6 — add a **drift row** recording F3 (folders/tags accept-then-ignore) resolved by S1's reject-all
  contracts; note S2 will add capability. Update §6 tags/folders rows to "filters reject with steering (S1); name/parent
  filtering OMN-S2-ticket". Add F5/F6/F7/F9 as resolved drift entries.
- `read-schema.ts` header + `OmniFocusReadTool` inputSchema/description: audit for claims about folders/tags filtering;
  state the reject-with-steering contract (dual-schema rule).
- Tests: every F-finding gets a unit test. New: discriminated-union narrowing (a handler reading the wrong filter type
  fails to compile — a `// @ts-expect-error` pin); `transformTagFilters`/`transformFolderFilters` reject matrix;
  `satisfies` exhaustiveness (add a fake enum value in a type-level test → expect compile error pattern); F5 origin-path
  assertion (`on_hold` in `OR[1]` → `filters.OR[1].status`); F7 `AND:[{}]` rejects on projects; F9 `.search` absent.
  Pin: tasks-side behavior byte-identical (existing golden scripts unchanged).
- Conformance: `npm run conformance` vs a **same-day main control run** (recorded baseline drifted — OMN-168);
  llama3.1:8b + qwen2.5:7b. New tags/folders rejects must not regress the bar; steering message is the fix surface.

## 4. Design — S2/S3/S4 (deferred; requirements for follow-up tickets)

**S2 — folders/tags filtering capability.** Flip `name` (and folders' parent/`topLevelOnly`) from `reject` to `map` in
the tag/folder disposition tables; populate `TagFilter`/`FolderFilter`; wire the supported keys into
`buildFilteredFoldersScript` / the tags query script. Reuses `extractTextCondition`. Pure capability add on S1's
contracts.

**S3 — OR/NOT on projects (R6).** Lift `OR`/`NOT` from `reject` in `PROJECT_KEY_DISPOSITION`. `NOT:{status}` →
status-array complement (the four-state complement). `OR` → branch compilation in `buildFilteredProjectsScript` (mirror
the tasks `orBranches` → OmniJS `||` path). Each branch a flat `ProjectFilter`.

**S4 — per-branch default (R1, F8) + metadata reconciliation (F10).** R1: make the dropped-exclusion default per-branch
(suppress the top-level default when the query has OR branches, inject per branch that lacks an explicit
dropped/status), OR — the simpler honest option — detect the `{OR:[{status:'dropped'},…]}` contradiction and reject with
steering. Decision deferred to the S4 spec. F10: reconcile `filters_applied` with `filter_description` — backfill the
missing `describeFilterForScript` branches (deferDate/flagged/blocked/inInbox/completionDate/plannedDate/added) and add
a test asserting every key present in `filters_applied` is described (the cheap inert-filter detector).

## 5. Alternatives considered

| Alternative                                                                                    | Why not                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bare union** `filters: TaskFilter \| ProjectFilter \| …` without the `type` discriminant     | Handlers must cast/narrow by `type` manually — that IS the re-narrowing seam, relocated. The discriminated union makes the narrowing the compiler's job. Rejected.                                                                                                                                                                                                                                                      |
| Keep the `projectFilter?` side-channel, add `tagFilter?`/`folderFilter?` siblings              | Repeats the bolt-on for every type; `filters` stays vestigially task-shaped; no compile-time guarantee a handler reads the right one. The side-channel was the C-lite _interim_; OMN-161 exists to remove it.                                                                                                                                                                                                           |
| Honor the kickoff's tentative slice table verbatim (tags/folders typed contract in S2, not S1) | The union can't half-exist: leaving tags/folders on the tasks `NormalizedTaskFilter` while tasks/projects/export are typed ships an incoherent union (task-shaped filters on non-task variants) and keeps F3/F6 open. Refinement: S1 front-loads all _honesty_ (every variant typed, reject-all where no capability yet); S2–S4 are purely additive _capability/behavior_. **Flagged for Kip at the spec-review gate.** |
| Implement S2/S3/S4 in one PR with S1                                                           | ~4 PRs of work; Kip scoped S1-only this session (bandwidth). Each slice is independently valuable and SAFE-gated.                                                                                                                                                                                                                                                                                                       |
| Share one `Disposition` union across all types                                                 | The tasks/projects unions already diverge deliberately (§3.1); tags/folders need only `reject`. Forcing one union couples unrelated transforms.                                                                                                                                                                                                                                                                         |

## 6. Risks

| Risk                                                                                                                                                         | Mitigation                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folders/tags queries that previously _silently ignored_ a stray filter now **reject** — a prod LLM client sending a no-op filter sees a new VALIDATION_ERROR | Intended (P1 honesty); steering message carries the supported set; conformance run before merge; this is the same accepted trade-off as OMN-156/162 |
| Discriminated-union migration ripples across `CompiledQuery` consumers                                                                                       | Probe inventory bounded the consumers to `OmniFocusReadTool` handlers + the compiler; per-task migration + `tsc` catches every unhandled narrowing  |
| `satisfies` enum-binding (F4) breaks if the schema enum and `ProjectStatus` diverge                                                                          | The binding is the point — divergence becomes a compile error, which is the desired forcing function; covered by a type-level test                  |
| S1 reject-all for tags/folders then S2 capability churns the same files twice                                                                                | Accepted: S1 closes honesty atomically, S2 is additive (flip `reject`→`map`); the disposition table localizes the churn to one constant             |
| Tasks-side behavior accidentally changes during the `transformFilters`→`transformTaskFilters` rename                                                         | Pure rename + re-home; golden scripts + the full unit suite pin byte-identical task output                                                          |

## 7. Testing strategy

TDD per task (superpowers). Unit: discriminated-union narrowing (`@ts-expect-error` pins), per-type reject matrices,
`satisfies` exhaustiveness, F5 origin paths, F7 projects empty-item, F9 export `.search` absence, tasks-side
byte-identical golden pins. Integration (small): a tags-query-with-filter rejection and a folders-query-with-filter
rejection (C18-shape). Full `npm run test:unit`, `npm run test:integration` (backgrounded, never killed — OMN-143; not
concurrent with unit — guard-test flake), `npm run conformance` (same-day control) before PR.

## 8. Follow-ups (file as OMN tickets after S1 merges)

1. **S2** — folders/tags filtering capability (name/parent). Requirements: §4 S2.
2. **S3** — OR/NOT on projects (R6). Requirements: §4 S3.
3. **S4** — per-branch dropped default (R1, F8) + `filter_description`↔`filters_applied` reconciliation (F10).
   Requirements: §4 S4.
4. Tasks-side `id` fast-path co-filter drop audit (design doc §7.3) — fold into S3 scope notes or file separately.
5. Analyze-tool scope-key silent drop (premise-check F-table "dissolved" row) — distinct from OMN-161; file if it
   matters.
