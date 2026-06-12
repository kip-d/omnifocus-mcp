# OMN-151 + OMN-156: logical-operator compile honesty — design

**Status:** DRAFT — pending review. **Baseline:** `main` @ `05745aa` (post-OMN-139/157). **Tickets:** OMN-151
(QueryCompiler logical-operator siblings), OMN-156 (projects OR silently dropped → match-all). **Normative spec:**
`docs/spec/read-filters.md` (OMN-148 §1) — this change implements P1/P2/P3 at two seams. **Approach decision (Kip,
2026-06-12):** C-lite — projects filter disposition moves INTO the compiler (input-vocabulary errors, no `CompiledQuery`
union ripple). The full per-query-type filter-contract redesign is deliberately deferred and tracked as **OMN-161**;
this PR's disposition enumeration is that ticket's requirements input.

## 1. Verified premises (probes against `05745aa`, 2026-06-12)

All probe scripts ran `QueryCompiler.transformFilters` / `buildAST` directly (unit level).

| #   | Behavior today                                                                                                                                                                                                              | Probe result                                                                  | Violates |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| V1  | Sibling keys beside NOT/AND/OR silently dropped (`transformFilters` early-return)                                                                                                                                           | `{flagged:true, NOT:{status:'completed'}}` → `{completed:false}`              | P2       |
| V2  | `AND` merges via `Object.assign` — last-wins on conflicting keys                                                                                                                                                            | `AND:[{status:'active'},{status:'completed'}]` → completed-only               | P2       |
| V3  | `OR: []` compiles to `{}` — match-all (two pinning tests exist)                                                                                                                                                             | `{OR:[]}` → `{}`                                                              | P3       |
| V4  | `{AND:[…], OR:[…]}` keeps AND, silently drops OR (operator precedence early-returns)                                                                                                                                        | probe-confirmed                                                               | P2       |
| V5  | **`buildAST` drops base keys beside `orBranches`** (early return, `src/contracts/ast/builder.ts`)                                                                                                                           | `{flagged:true, completed:false, orBranches:[…]}` emits ONLY the OR predicate | P2       |
| V6  | **Unfiled shipping bug:** task modes augment the filter with base keys, so `mode:'flagged'` (or overdue/today/…) + `OR` filter silently ignores the mode constraints entirely                                               | V5 probe models exactly the `augmentFilterForMode` output                     | P2, P5   |
| V7  | Projects handler cherry-picks 7 keys into `ProjectFilter`; everything else silently drops → match-all. Includes `orBranches` (OMN-156 / D10), but also `flagged`, `completed:false` (the documented GTD idiom), dates, tags | code-confirmed (`OmniFocusReadTool.handleProjectQuery`)                       | P1, P3   |

Ticket corrections vs. today's code: none material. Two under-claims: V4 (a fourth sibling-drop shape) and V5/V6 (the
same drop one layer down, where it is a live wrong-results bug). OMN-139 and OMN-157 did not shift any premise.

**Architecture answer (scope question from kickoff):** the compiler is shared between tasks and projects; the
_consumption_ is duplicated. Tasks feed the full `TaskFilter` to `buildAST`; projects re-narrow through the cherry-pick.
The class therefore lives at three places: compiler early-return, AST early-return, projects seam. Fixing fewer than all
three moves the drop instead of removing it.

## 2. Goals / non-goals

**Goals**

1. No filter input that survives schema validation is ever silently dropped on the tasks or projects read path (P1/P2).
2. Unsupported or empty logical composition produces a VALIDATION_ERROR that names working alternatives — never
   match-all (P3, OMN-131 precedent).
3. Close the projects seam as a _class_: the handler re-narrowing seam is deleted (projects filters compile to a typed
   `ProjectFilter` in the compiler), and a future input-schema field cannot silently drop — compile-time exhaustiveness
   over input keys forces a disposition decision (the MUTATION_DEFS registration pattern).

**Non-goals**

- Implementing OR/NOT _evaluation_ for projects queries (OMN-156 option 2). Reject-with-steering satisfies the spec;
  branch compilation for projects is a capability add — folded into OMN-161. (AND of _supported_ projects filters does
  work here, via input-space merge — §3.3.)
- The full per-query-type filter-contract redesign — OMN-161, sequenced after this PR and the OMN-158/159/160 arc.
- Folders/tags handler seams: audited during execution; fixes land only if trivial, else ticketed.
- Recursive (nested) logical operators. Schema stays one-level (`FlatFilterSchema` inside operators).
- Cache honesty re-verification (C17/R11) — explicitly sequenced _after_ this fix per OMN-156 acceptance.

## 3. Design

### 3.1 Compiler: conflict-checked merge replaces early-return (`QueryCompiler.transformFilters`)

New semantics — base fields and all present logical operators **AND-compose** (P2):

1. Transform base (non-operator) fields as today.
2. `AND: [...]` — transform each condition; merge into the base result with **conflict detection** (below).
3. `NOT: {...}` — unchanged OMN-131 contract (`{status:'completed'}` / `{status:'active'}` only, everything else
   hard-rejects). Its result merges into the base result with conflict detection.
4. `OR: [...]` — each branch transforms to a flat `TaskFilter` → `orBranches`, attached _alongside_ the merged base keys
   (semantics made real by §3.2).
5. Multiple operators together (V4) all apply: AND/NOT keys merge, OR becomes `orBranches`.

**Conflict detection:** while merging, a `TaskFilter` key acquiring two non-deep-equal values is a hard reject —
`z.ZodError` at `['query','filters']` naming the key and both values, steering: conflicting values under AND are
unsatisfiable (true contradiction, e.g. `status` active+completed) or unrepresentable (two `name` conditions — steer to
a single combined pattern, `text`, or `OR`). Deep-equal duplicate assignments merge silently. The OMN-72 intra-filter
precedence (`completed` overrides `status`-derived completion _within one flat filter_) is preserved; conflict detection
applies only **across** merge sources.

**Error vocabulary:** tasks-side conflicts are detected in transformed (`TaskFilter`) space — that is what catches
cross-vocabulary contradictions like `status:'active'` AND `completed:true` — but messages reverse-map internal key
names to input vocabulary via a small static table (`completed`→`status`/`completed`, `dueBefore`→`dueDate`,
`orBranches`→`OR`, …) so callers see the keys they sent.

**Empty operators:** `AND: []` and `OR: []` both reject. Rationale: vacuous-AND-is-true would technically justify `{}`,
but an empty operator array is a caller bug in every observed case, and the kickoff guidance is explicit — empty logic
yields VALIDATION_ERROR naming alternatives, never match-all. Message: omit the operator or supply ≥1 condition.

### 3.2 AST: compose base conditions with OR branches (`buildAST`)

Replace the `orBranches` early-return: build the OR node **and** the base-key conditions, returning
`and(...baseConditions, or(...branches))` (or the bare OR node when no base conditions exist). Pure-OR queries emit
byte-identical predicates; OR+siblings and OR+mode now narrow correctly. This single change fixes V5 and the live V6 bug
(mode constraints honored beside OR). Recursion is bounded — branches are schema-enforced flat.

Interaction check (execution-phase verification task): the OMN-157 default dropped-exclusion routes through the AST
emitter; confirm OR task queries now also exclude dropped by default and that the OMN-157 pinning test still passes.
Same check for `buildTaskCountScript` (countOnly path must agree with the row path, C15).

### 3.3 Projects path: compiler-level typed transform (C-lite)

A new `transformProjectFilters(input: FilterValue): ProjectFilter` runs inside `compile()` when
`query.type === 'projects'`, operating on **raw input keys** (so rejects speak input vocabulary natively). Its output
lands on a new `CompiledQuery.projectFilter?: ProjectFilter`; `compiled.filters` for projects becomes the empty
normalized filter, and `handleProjectQuery` (including the id fast path and the narrow-lookup summary suppression)
consumes **only** `projectFilter` — the handler's cherry-pick re-narrowing seam is deleted, not guarded.

Disposition is declared over every input-schema filter key, typed
`satisfies Record<keyof FlatFilterValue | 'AND' | 'OR' | 'NOT', Disposition>` so a future schema field is a compile
error until someone decides its projects disposition (class-closing, mirrors MUTATION_DEFS):

| Disposition   | Input keys                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **map**       | `status`→`status:[mapped]` (via STATUS_TO_PROJECT), `folder` (string→`folderName`, null→`topLevelOnly`), `text`→`text`/`textOperator`, `name`→`name`/`nameOperator`, `id` (exclusive — see below) | today's effective mappings, kept; text/name share extraction helpers with the tasks transform rather than duplicating them                                                                                                                                                                                  |
| **map (new)** | `flagged`                                                                                                                                                                                         | `ProjectFilter.flagged` exists and the script builder already emits it — it was simply never wired                                                                                                                                                                                                          |
| **map (new)** | `completed`                                                                                                                                                                                       | `true`→`status:['done']`; `false`→`status:['active','onHold']` — see the decision record below. If `status` is also present, post-transform consistency check: disjoint status sets (e.g. `completed:true` + `status:'active'`, or `completed:false` + `status:'dropped'`) → VALIDATION_ERROR with steering |
| **merge**     | `AND: [...]`                                                                                                                                                                                      | flat items merge with the top-level keys in **input space** (same input key, non-deep-equal values → conflict reject), then the merged input transforms as above                                                                                                                                            |
| **reject**    | `OR`, `NOT`                                                                                                                                                                                       | steering: "logical operators are not supported on projects queries; use a single `filters.name`/`filters.text`/`filters.status`, or run one query per alternative." NOT-status has a clean future mapping (status-array complement) — deferred to OMN-161                                                   |
| **reject**    | `tags`, all date filters (`dueDate`/`deferDate`/`plannedDate`/`completionDate`/`added`), `estimatedMinutes`, `project`, `projectId`, `parentTaskId`, `inInbox`, `available`, `blocked`            | VALIDATION_ERROR naming the key (input vocabulary) and the projects-supported set                                                                                                                                                                                                                           |

**Decision record — `completed:false` excludes dropped (GTD reading over boolean-strict; Kip, 2026-06-12).** Strictly
boolean, a dropped project is "not completed," so the complement reading would be `['active','onHold','dropped']`. We
deliberately map to `['active','onHold']`:

1. **Task-side parity (load-bearing):** on tasks, `{completed:false}` composes with the OMN-157 default
   dropped-exclusion, so the equivalent task query already returns live items only. Projects must not read the same
   input more broadly than tasks do — that divergence would be its own honesty bug.
2. **GTD semantics:** completed and dropped are the two terminal verdicts (three-terminal-states rule, spec §3.1).
   `completed:false` asks "still tracking this?"; a dropped project's answer is "no, deliberately."
3. **P5 safety:** projects selections feed write sweeps; including deliberately-killed projects in a "not completed"
   selection is the unsafe direction.

Escape hatch: `status:'dropped'` is the explicit, precise vocabulary — no capability is lost. The cross-vocabulary
combination `{completed:false, status:'dropped'}` is compatible on tasks (separate booleans: dropped tasks are not
completed) but disjoint under this projects mapping; rather than silently pick a reading, it REJECTS with steering
("`completed:false` on projects means active/on-hold; for dropped projects use `status:'dropped'` alone"). The mapping
is documented user-facing in the tool description (dual-schema rule) and spec §6.

Rejection throws `z.ZodError` from `compile()` — exactly the OMN-131 surface (VALIDATION_ERROR in the failure log,
InvalidParams over MCP), and it fires **before** any cache interaction. No cache poisoning: legacy match-all cache
entries are keyed by the empty `projectFilter`, which only legitimately-bare queries hit.

**`id` is an exclusive fast path:** when `id` co-occurs with any other filter key, reject with steering ("id is an exact
lookup; remove the other filters, or drop id to search"). Today's handler silently ignores co-filters once it sees `id`
— the same drop class this design closes. (The tasks-side id fast path has the same shape; audit noted in §7, not in
scope here.)

Execution-phase verification tasks: confirm `compiled.filters.search` on projects is dead code (the compiler never sets
`search`); grep all `compiled.filters` consumers on the projects path (`executeProjectIdLookup`, narrow-lookup,
countOnly availability on the projects schema) and migrate them to `projectFilter`.

### 3.4 Error surface

All new rejects are `z.ZodError` with `path: ['query','filters', …]` and messages that (a) name the offending
key/values, (b) name working alternatives — the OMN-131 message pattern. They land in the failure log as
VALIDATION_ERROR and over MCP as InvalidParams.

### 3.5 Docs, spec, and test updates

- `read-schema.ts` header comment (~36-40): rewrite to the new semantics (OMN-151 doc nit — currently claims "OR: uses
  first condition only", wrong since OMN-30).
- Rewrite both empty-OR pinning tests (`tests/unit/tools/unified/compilers/QueryCompiler.test.ts`,
  `tests/unit/contracts/ast/filter-coverage.test.ts`); audit for other pins of V1–V5 behavior.
- New unit coverage: every V1–V7 probe becomes a test; `transformProjectFilters` disposition matrix (map / input-space
  AND merge / reject / completed-status consistency / id-exclusivity incl. the `AND:[{id},…]` shape); `buildAST`
  composition; one tasks-side pin that `{completed:false, status:'dropped'}` REMAINS ACCEPTED on tasks (returns dropped
  tasks) — insurance against over-applying the projects-only reject.
- Integration (small): OR-on-projects rejects with steering (C18 shape); one mode+OR composition assertion (D9 partial).
- `docs/spec/read-filters.md`: §3.6 rows updated (sibling merge, AND conflict-reject, empty-operator reject); §6
  projects-supported-filters statement incl. the id-exclusive fast-path rule and the `completed`→status mapping; D10
  marked resolved; new drift entries for V1–V6 recorded as resolved-by-this-change; C18 updated with the shipped shape
  (validation error).
- Dual-schema rule (CLAUDE.md): audit `OmniFocusReadTool` `inputSchema`/description for claims touched by these
  semantics; update if affected.
- Conformance gate: run `npm run conformance` (local-model support bar) — new rejects must not break the published bar;
  if a case regresses, the steering message is the fix surface, not the reject itself.

## 4. Alternatives considered

| Alternative                                                                                                                 | Why not                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-symptom patches (reject empty OR + reject siblings; projects rejects operators only)                                    | Leaves V5/V6 (AST layer) and V7's non-operator drops open — moves the class, doesn't close it                                                                                                                                                                                                                                                                                        |
| Reject siblings beside operators instead of merging                                                                         | `FilterSchema` explicitly advertises base fields alongside AND/OR/NOT; rejecting schema-valid input punishes correct callers. AND is the only sane semantics (P2: filters AND-compose everywhere else). Real conflicts still reject loudly                                                                                                                                           |
| **B:** keep the projects narrowing in `handleProjectQuery`, guarded by a disposition table over `NormalizedTaskFilter` keys | Same class-closure as C-lite but the rejects speak internal vocabulary (`orBranches`, `dueBefore`) needing a reverse-map, and the translation point stays split across compiler + handler (the `transformFilters` "single translation point" docstring stays false for projects). C-lite costs ~1.3× the diff and removes the seam instead of guarding it. Decision: Kip, 2026-06-12 |
| **C (full):** `CompiledQuery.filters` becomes a per-query-type discriminated union; every handler consumes its own contract | The right end state, but honestly done it is a per-query-type contract redesign across tasks/projects/tags/folders/export plus the analyze tool — a redesign wearing a bugfix's clothes. **Deferred and tracked: OMN-161** (fork-driven quality-bar shift; this doc's disposition table is its requirements input)                                                                   |
| Empty `AND: []` keeps compiling to `{}` (vacuous truth)                                                                     | Defensible mathematically; rejected per kickoff guidance (empty logic → VALIDATION_ERROR, never match-all) and because empty operator arrays are caller bugs in practice                                                                                                                                                                                                             |
| Implement OR on projects now (OMN-156 option 2)                                                                             | Capability add, not honesty fix; either shape satisfies spec P3. Folded into OMN-161, where the typed contract makes branch compilation natural                                                                                                                                                                                                                                      |

## 5. Risks

| Risk                                                                                                           | Mitigation                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Previously-"working" (match-all) projects queries now reject — prod LLM clients will see new VALIDATION_ERRORs | Intended per OMN-156 acceptance; steering messages carry the working alternative; conformance run before merge                           |
| `buildAST` change alters emitted scripts for every OR task query                                               | Pure-OR emits identically (unit-pinned); OR+base narrows — the correction. OMN-157/mode pinning tests + golden scripts catch regressions |
| Conflict-detection false positives (deep-equal edge cases: arrays `projectStatus`, `tags`)                     | Deep-equal helper unit-tested on array/scalar/operator-pair shapes                                                                       |
| `completed`→status mapping on projects surprises (`false` excludes dropped)                                    | Matches OMN-157 task-side default; documented in spec §6; consistency-check rejects contradictory combos                                 |
| `transformProjectFilters` duplicates text/name/folder extraction logic, drifting from the tasks transform      | Extract shared helpers from `transformTextFilters` (write-into-target generalization) rather than copy                                   |
| Two pinning tests + unknown other pins encode old behavior                                                     | Execution plan starts with a pin-audit task                                                                                              |

## 6. Testing strategy

TDD per task (superpowers): the V1–V7 probes are the failing-test seeds. Unit: compiler merge/conflict/empty/multi-
operator matrix, `buildAST` composition, projects disposition table exhaustiveness. Integration: C18-shape rejection
plus one mode+OR narrowing assertion. Full `npm run test:unit`, `npm run test:integration` (backgrounded), and
`npm run conformance` before PR.

## 7. Follow-ups

1. **OMN-161 (filed 2026-06-12):** per-query-type filter contracts redesign — absorbs "implement OR on projects" and the
   NOT-status array-complement mapping.
2. Folders/tags handler seam audit findings (if non-trivial, ticket; likely fold into OMN-161 scope notes).
3. Tasks-side `id` fast path silently ignores co-occurring filters (same shape as the projects id rule pinned in §3.3) —
   audit and fold into OMN-161 scope notes.
4. Linear comment on OMN-151/156 noting V4/V5/V6 under-claims and that V6 (mode+OR) ships here.
