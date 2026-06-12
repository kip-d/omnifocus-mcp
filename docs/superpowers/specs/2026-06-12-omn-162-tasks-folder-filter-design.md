# OMN-162: Tasks-side `folder` filter — reject with steering

**Date:** 2026-06-12 **Ticket:** OMN-162 (P8 violation; OR-branch variant compiles to match-all) **Decision:** Option
(b) — reject with steering. Option (a) recorded below as the alternative not taken.

## 1. Verified problem (live, prod buildId e3d84ef9, 2026-06-12)

| Probe (tasks query, countOnly)           | Result | Verdict                                                             |
| ---------------------------------------- | ------ | ------------------------------------------------------------------- |
| no filters (baseline)                    | 2306   | —                                                                   |
| `{folder: "Bills"}`                      | 2306   | filter fully inert                                                  |
| `{flagged: true}`                        | 48     | —                                                                   |
| `OR: [{folder:"Bills"}, {flagged:true}]` | 2306   | folder-only branch → `literal(true)` → whole OR widens to match-all |
| `{status: "on_hold"}`                    | 2306   | **sibling inert key** (rider audit)                                 |

Code path, current main (`e3d84ef`):

- `transformFlatFilter` maps `folder` → `TaskFilter.folder` / `folder:null` → `folderTopLevel` (`QueryCompiler.ts`), but
  **no `FILTER_DEFS` entry consumes either** — grep `folder` in `src/contracts/ast/builder.ts`: zero hits.
- `usableKeyCount` counts raw defined keys, so a folder-only OR/AND branch passes the OMN-151 empty-branch check, then
  `buildAST` returns `literal(true)` for it.
- `transformStatus` maps `status:'on_hold'` on tasks to **only** `projectStatus`, which has zero consumers anywhere on
  the tasks execution path (full-src grep; consumers exist only in projects-side scripts that don't take this filter
  object). The gap is even commented in the code ("tracked as a follow-up to OMN-50") but was never ticketed.
- The export path (`type:'export'`) routes through the same `transformFilters`, so it shares both inert keys.
  `exportType:'projects'` ignores `filters` entirely (script takes only `format`/`includeStats`) — rejecting on this
  path breaks nothing that works.

**Premise correction vs the ticket:** the tool _description_ already hedges — it advertises "folder (projects queries)".
The _schema_ still accepts `folder` on tasks silently. So "advertised" is weaker than the ticket claims; the behavior
claims are fully confirmed. `docs/spec/read-filters.md` §3.4 still describes tasks-folder behavior that does not exist
(D7 says "zero test coverage"; truth is zero implementation).

Bonus finding (out of scope, noted for OMN-161): the response metadata self-contradicts — `filters_applied` echoes
`folder:"Bills"` while `filter_description` says `"all tasks"`. Diffing those two surfaces is a cheap detector for this
bug class.

## 2. Decision and alternative

**Chosen: reject with steering** — tasks (and export) queries that include `filters.folder` (string or null) or
`status:'on_hold'` fail loudly with a `VALIDATION_ERROR` that names the working alternative. This is the OMN-131/151/156
precedent applied symmetrically: projects queries already reject task-only keys with steering (OMN-156); tasks queries
now reject project-only keys.

Why (b) over (a):

1. **Cluster precedent** — every fix in the selection-honesty cluster chose loud rejection over silent widening.
2. **Forward-compatible** — reject→implement-later is purely additive. Implementing folder semantics now forces
   decisions OMN-161's per-query-type contracts should own (inbox tasks vs `folder:null`, substring-at-any-ancestor vs
   direct parent, dropped-folder handling); shipping answers now and re-answering them in OMN-161 would break a
   just-shipped behavior. Maximal-stability choice at the fork.
3. **Surgical** — no new OmniJS emitter, no script-size growth, no perf cost on the hot path.

**Alternative not taken — (a) implement tasks-folder semantics.** A new `FILTER_DEFS` entry emitting an OmniJS ancestor
walk (`task.containingProject.parentFolder` chain; synthetic-field precedent exists in `task.tagStatusValid`). Rejected
for this ticket because the semantic surface is larger than the diff: three underspecified semantics (above) plus
emitter/KNOWN_FIELDS parity work, all of which OMN-161 will revisit. The rejection error text is written so that
implementing (a) later is a pure widening.

## 3. Design

### 3.1 `TASK_KEY_DISPOSITION` registry (mirror of OMN-156's `PROJECT_KEY_DISPOSITION`)

New `satisfies Record<TaskInputKey, Disposition>` registry covering every input-schema filter key with an explicit
**tasks-side** disposition: every currently-working flat key is `'map'`; `folder` is `'reject'`. A future schema field
becomes a compile error here until someone decides its tasks behavior — the same structural close as
OMN-156/MUTATION_DEFS. Lives beside the tasks transform (in `QueryCompiler.ts` or a sibling module, implementer's
choice; export it for the parity test).

Key universe (resolves the mirror-vs-enforcement-point tension): the registry covers the FULL
`keyof FlatFilterValue | 'AND' | 'OR' | 'NOT'` universe like `PROJECT_KEY_DISPOSITION`, with
`Disposition = 'map' | 'compose' | 'reject'` — `AND`/`OR`/`NOT` are `'compose'` (handled structurally by
`transformFilters`, neither mapped nor rejected). The parity test asserts every schema key has a disposition over that
full universe. The tasks module defines its OWN `Disposition` union (the projects one is `'map' | 'merge' | 'reject'`;
do not import/share it).

**Enforcement rule (load-bearing):** the check inside `transformFlatFilter` rejects on `disposition === 'reject'` ONLY —
not the projects-style `!== 'map'` check. The base call (`QueryCompiler.ts` `transformFilters` line ~118) passes the
FULL top-level input including any `AND`/`OR`/`NOT` properties, so a `!== 'map'` mirror would reject every
operator-using query. `'compose'` keys are skipped by enforcement; they exist so the parity test covers the full key
universe.

Enforcement point: `transformFlatFilter`, so base filters, `AND[i]` items, and `OR[i]` branches all reject uniformly
with the offending path in the error. (`NOT` already hard-restricts to two status payloads — unchanged, OMN-131
contract.)

Error text (folder, string or null):

> `filters.folder is not supported on tasks or export queries — it previously matched nothing and silently returned all tasks. To get tasks in a folder: query projects with filters.folder first, then query tasks by projectId. folder remains supported on projects queries.`

(The rejection fires on the shared tasks/export compile path, so the text names both query types statically — no
per-type message adaptation.)

### 3.2 `status:'on_hold'` value-level rejection on tasks

In `transformStatus` (tasks path): `'on_hold'` throws instead of silently mapping to the dead `projectStatus` key. The
existing `projectStatus` assignment for other values stays (harmless; filter-merge uses it for conflict naming — note
conflicts on it surface under the internal name `projectStatus`, not the user-facing `status`; known and accepted).

Error text:

> `status:'on_hold' is not supported on tasks or export queries — on-hold is a project status. Query projects with status:'on_hold' first, then tasks by projectId. (Tasks whose project is on hold also match available:false.)`

The `available:false` claim must be verified live during implementation; drop the parenthetical if it doesn't hold.

### 3.3 Match-all branch guard (defense-in-depth; the ticket's "either way" item)

With 3.1/3.2 the two known inert keys can no longer reach `buildAST`, but the `literal(true)` hazard must die
structurally for _future_ inert keys. In `transformFilters`, after transforming, compile (`buildAST`) and reject the
match-all literal at THREE sites:

- each `AND[i]` item and each `OR[i]` branch (the OMN-162 widening shape), and
- the **base filter**, when the input had at least one defined (`!== undefined`) top-level key EXCLUDING
  `AND`/`OR`/`NOT`, but the merged base (excluding `orBranches`) compiles to match-all. AND items are covered by their
  own per-item check, so they don't count here. A legitimately empty `filters: {}` / absent filters (browse) has zero
  such keys and is untouched.

Replace-or-augment `usableKeyCount` (keep the cheap zero-key check for its better "empty item" message; the AST check
catches has-keys-but-compiles-to-nothing). `buildAST` is pure and cheap; layering is fine (compilers already import from
`contracts/ast`).

**Safety invariant (must hold for zero false positives):** every `TaskFilter` key that `transformFlatFilter` can produce
from a flat input is either consumed by a `FILTER_DEFS` entry or accompanied by one that is. Verified for current keys
(all `status` values set an AST-consumed twin beside the dead `projectStatus`; `fastSearch` is not a filters key). The
unit tests must enumerate one minimal branch per supported key family and assert the guard does NOT fire.

Error text (OR shown; AND and base analogous):

> `OR[i] contains no executable conditions — its keys are accepted by the schema but compile to no task-level filter, which would silently match every task. Remove the branch or use a supported tasks filter.`

### 3.4 Documentation & advertisement sync

- `docs/spec/read-filters.md` §3.4: tasks-folder row → "rejects with steering (OMN-162)"; §8 D7 corrected from "zero
  test coverage" to "was zero implementation; now explicit rejection".
- Tool description (`OmniFocusReadTool.ts`): folder line gains "on tasks queries folder and status:'on_hold' reject with
  guidance".
- Zod schema: `folder` field comment/description updated; the key **stays in the shared schema** (projects need it) —
  rejection is compile-layer, per the OMN-122 layering (schema stays canonical, targeted errors come from the compiler).
- `inputSchema` override: `filters` is advertised as a bare `object` — no structural change needed; description string
  change above covers it. (Dual-schema rule satisfied.)

### 3.5 Tests

- **Unit (compiler):** folder string/null reject on tasks at base, `AND[i]`, `OR[i]` paths with correct error paths;
  on_hold rejects on tasks; on_hold still works on projects; folder still works on projects (regression); export path
  rejects folder; match-all guard fires on a synthetic inert-key branch AND on a synthetic inert-key base filter, does
  NOT fire on browse (`filters: {}` / absent) nor on one minimal branch per supported key family (the §3.3 invariant);
  `TASK_KEY_DISPOSITION` parity test (every schema key has a disposition — mirror the OMN-156 parity test).
- **Integration (live):** tasks query with folder → VALIDATION_ERROR with steering text; OR variant → VALIDATION_ERROR;
  projects folder query unchanged. (Suite ~15–16 min; run via `run_in_background`, npm not bun, never kill — OMN-143.)
- **Conformance:** schema description changes touch the conformance surface; run `npm run conformance` and compare to
  2026-06-12 baselines (95%/89%) before merge.

## 4. Out of scope

- `omnifocus_analyze` — verified NOT to share this path: `AnalysisCompiler` has no `transformFilters` call and no
  folder/on_hold filter handling. No change needed.

- Implementing tasks-folder semantics (OMN-161 owns the per-query-type contract; this rejection makes later
  implementation purely additive).
- The `filters_applied` vs `filter_description` metadata contradiction (note filed to OMN-161).
- Task-level on-hold semantics (none exists in OmniFocus).

## 5. Linear hygiene

- OMN-162: comment with premise correction (description already hedged; schema/behavior confirmed) + live probe numbers;
  close via PR.
- New ticket for the `status:'on_hold'` inert sibling (rider-audit finding), fixed in this same PR as an attributed task
  — referenced from both tickets.
- OMN-161: comment noting (1) the metadata self-contradiction detector, (2) that OMN-162 chose rejection explicitly to
  leave folder semantics to 161.
