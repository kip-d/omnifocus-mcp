# Read-tool filter semantics — behavioral specification

**OMN-148, section 1.** Status: **DRAFT — pending review.** Baseline: `main` @ `d89d5b7` (post-OMN-142). Statements
describe intended behavior; where the implementation diverges, the Drift register (§8) records it. Provenance uses
stable anchors (paths, ticket IDs, commits, vault note titles) — never line numbers.

## 1. Scope and method

Covers filter semantics of `omnifocus_read` for tasks, projects, folders, and tags queries: filter vocabulary, modes,
logical composition, and result shaping as it affects what a filter returns. Excludes: response envelope details,
export, analytics (later OMN-148 sections).

Reconstructed from a five-source parallel audit (2026-06-11):

| Source                                                                                        | What it contributed                          |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Implementation (`QueryCompiler.ts`, `src/contracts/ast/` read side, `task-query-pipeline.ts`) | Actual semantics                             |
| Advertised contract (`inputSchema`, tool description, SKILL.md, docs/dev)                     | Promises                                     |
| Linear OMN history + CHANGELOG + git log                                                      | Decisions, bug classes, why-it-is-this-way   |
| Test suite (unit + integration)                                                               | Pinned behavior, defect-locks, coverage gaps |
| Obsidian vault (diary, audits, GTD working docs)                                              | Requirements layer (§7)                      |

## 2. Design principles (normative)

| #   | Principle                                                                                                                                                                                                                                                   | Origin                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P1  | **Strict boundary.** Every accepted filter key has defined semantics; unknown keys error. Accept-then-ignore is forbidden anywhere in the compile path.                                                                                                     | commit `0ff71a3`; OMN-76/90; Description-Gap Audit 2026-05-18 ("silent field-dropping is the worst class") |
| P2  | **Conjunctive composition.** All supplied filters AND-compose. A filter is never silently dropped or overridden by a sibling.                                                                                                                               | OMN-142 (`f.text ?? f.search` dropped `name` when both sent)                                               |
| P3  | **No silent widening.** A filter the compiler cannot express MUST produce a validation error — never compile to match-all.                                                                                                                                  | OMN-131 (currently violated — §8 D1)                                                                       |
| P4  | **Honest results.** Truncation is unmistakable (`metadata.total_count` + limit visible); a cache may never serve a response compiled from a different predicate.                                                                                            | 25-row default misleading audits; 2026-05-19 cached-slice incident (§8 D10)                                |
| P5  | **Reads gate writes.** Selection bugs are data-loss bugs: sweeps delete what queries select. P2/P3 are safety properties, not ergonomics.                                                                                                                   | OMN-142 collateral deletion 2026-06-09                                                                     |
| P6  | **Normalize-then-strict front door.** The server accepts more than `inputSchema` advertises: strict parse first; bounded repair (wrapper-lift, stringified-JSON coercion) only on ZodError; strict re-validation; canonical inputs untouched byte-for-byte. | OMN-122; commit `06ba568`                                                                                  |
| P7  | **Field symmetry.** Any field that is writable and returned on read is also filterable.                                                                                                                                                                     | OMN-114 (`parentTaskId` precedent)                                                                         |
| P8  | **Schema-accepted ⇒ runtime-effective.** Parity tests guard against accepted-but-inert keys.                                                                                                                                                                | OMN-115 (`fastSearch` was a documented no-op), OMN-50 (`status:dropped` no-op)                             |

## 3. Filter vocabulary — tasks queries

### 3.1 Status and availability

| Filter                           | Semantics                                                                                                                                               | Provenance                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `status` enum                    | `active` \| `completed` \| `dropped` (tasks); `on_hold` affects projects only — no task-level meaning                                                   | `QueryCompiler.transformStatus`; OMN-50       |
| `completed` boolean              | Direct alias for the completion dimension; **overrides** `status`-derived completion when both supplied (documented exception to P2's no-override rule) | OMN-72, commit `8b8d4e6`                      |
| `dropped` boolean                | Task-level dropped state; was a silent no-op before OMN-50                                                                                              | commits `2673f34`, `13ad6c9`                  |
| `available` / `blocked` booleans | OmniFocus availability model via `Task.Status` enum comparison (defer elapsed, not sequentially blocked, project active) — NOT mere incompleteness      | `src/contracts/ast/types.ts` synthetic fields |
| `flagged` boolean                | Direct flag state                                                                                                                                       | passthrough                                   |
| `inInbox` boolean                | Inbox membership = `task.inInbox` — **never** `!containingProject`                                                                                      | commit `098c5cb`                              |

**Three terminal states rule:** completed, dropped, and active are distinct. Default-safe queries and all modes exclude
`completed` AND `dropped` (commit `e703ec7`; reaffirmed when dropped tasks leaked into a weekly review — vault
`gtd-review-handoff.md`).

### 3.2 Text

| Filter             | Semantics                                                                                                                                                                                    | Provenance                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `name: {contains}` | Case-insensitive substring on the **name field only**. Never matches notes.                                                                                                                  | OMN-142, PR #84 `d89d5b7`                      |
| `name: {matches}`  | Case-insensitive regex on the name field only. Task-side emitter currently raw-interpolates the pattern (§8 D6, OMN-149); project-side uses the safe `new RegExp(JSON.stringify(...))` form. | OMN-142 / OMN-149                              |
| `text: {contains}` | Substring on name OR note                                                                                                                                                                    | commit `dfee69a` (deliberate name+note design) |
| `text: {matches}`  | Case-insensitive regex on name OR note                                                                                                                                                       | `emitters/omnijs.ts`                           |
| `search`           | Legacy alias of `text` — permanent public/internal boundary, not removable debt                                                                                                              | OMN-25 ruling                                  |
| `fastSearch: true` | Restricts `text`/`search` matching to name only (skips note bodies). Was a documented no-op until 2026-05-31.                                                                                | OMN-115, PR #60                                |

`name` and `text` supplied together AND-compose as independent conditions (P2; pre-OMN-142 the name filter was silently
dropped). Text search is an inherent full `flattenedTasks` scan — no indexed primitive exists (OMN-115 analysis); see §5
performance classes.

**History (the OMN-142 drift, fixed 2026-06-11):** before `d89d5b7`, `name` compiled onto the `search` alias — matching
note content (collateral deletion of a real task, 2026-06-09) and silently degrading `matches` to substring. Two unit
tests pinned the defect ("transforms name.contains to search"). Deployments older than `d89d5b7` still carry it.

### 3.3 Dates

| Filter                                                  | Operators                      | Provenance                                       |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| `dueDate`, `deferDate`, `plannedDate`, `completionDate` | `before` / `after` / `between` | DATE_FILTER_DEFS, `QueryCompiler.transformDates` |
| `added` (creation timestamp)                            | `before` / `after` / `between` | OMN-48, commit `daf32c4`                         |

- `before` = inclusive ≤, `after` = inclusive ≥; `between` = inclusive both ends (integration-verified).
- Every date condition wraps in an existence guard: tasks with no value for the field never match (OMN-53 — null ≠
  epoch-zero).
- `plannedDate` (OF 4.7+) is a **first-class peer** of dueDate/deferDate with the identical operator surface —
  load-bearing for the planned-date GTD workflow (§7 R5).
- Input format: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`, never ISO-8601 with `Z` (CLAUDE.md).
- Known inconsistency: the `deferDate` registry entry omits `operatorKey`, so `between` never sets `deferDateOperator`
  (§8 D4).

### 3.4 Containment

| Filter                             | Semantics                                                                                                                                                                 | Provenance                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `project: "<string>"`              | Name-or-id with name-lookup fallback; ambiguous names surface ALL candidates in a warning with `duplicateProjects` metadata — never silently pick one                     | OMN-34, v4.1.0                                           |
| `project: null`                    | Inbox (`inInbox: true`)                                                                                                                                                   | `QueryCompiler`                                          |
| `projectId`                        | O(1) fast path via `Project.byIdentifier`; takes precedence over `project`                                                                                                | OMN-43                                                   |
| `parentTaskId: "<id>"`             | Direct children of a task. String only — `null` ("top-level") deliberately deferred, unlike `folder: null`                                                                | OMN-114                                                  |
| `folder` (tasks)                   | Folder-name substring on the containing hierarchy. Zero test coverage (§8 D7).                                                                                            | TaskFilter                                               |
| `tags: {any}` / `{all}` / `{none}` | OR / AND / NOT-IN over tag names. `{none}` is the supported exclusion path (NOT composition is not — §3.6). Must tolerate case-duplicate and same-name-different-id tags. | `transformTags`; vault Tag Inventory Redesign 2026-06-03 |

**Project root node:** in OmniFocus a project IS a task (its root). A `projectId` task query returns N+1 rows including
the root. The spec defines this as documented behavior — count reconciliations bake in the +1 (vault diary 2026-05-19) —
pending an explicit exclusion knob (§10 Q1).

### 3.5 Numeric

`estimatedMinutes: {equals | lessThan | greaterThan | between}` — range filters exclude tasks with no estimate
(existence-guarded; null ≠ 0). OMN-49/OMN-53.

### 3.6 Logical composition

| Form         | Semantics                                                                                                                                                                                                                                                                         | Provenance                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| (implicit)   | All top-level filters AND-compose (P2)                                                                                                                                                                                                                                            | —                          |
| `OR: [...]`  | Top-level OR groups, each branch independently compiled → `orBranches` → OmniJS `\|\|`. Supported since v4.0.0. Docs claiming "OR is broken" are stale (OMN-104).                                                                                                                 | OMN-30, commit `d32c26b`   |
| `AND: [...]` | Explicit AND; merges one level deep (no recursive OR/AND nesting)                                                                                                                                                                                                                 | `transformLogicalOperator` |
| `NOT: {...}` | **Supported payloads only:** `{status:'completed'}`, `{status:'active'}`. Everything else MUST hard-reject with a validation error. Current behavior silently compiles to `{}` = match-ALL (§8 D1, OMN-131 — decided fix is hard-reject). Tag exclusion belongs to `tags:{none}`. | OMN-131                    |

## 4. Modes — tasks queries

Every mode adds `completed: false AND dropped: false` implicitly (three-terminal-states rule).

| Mode                    | Predicate                                         | Notes                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `today`                 | due within `daysAhead` (default 3) OR flagged     | `reason` field categorizes overdue / due_soon / flagged                                                                                                                                                                                                                                                                                                                      |
| `upcoming`              | due within `daysAhead` (default 7)                | Docs in places say 14 (§8 D5)                                                                                                                                                                                                                                                                                                                                                |
| `overdue`               | `dueDate < now` — **dueDate only**                | NOT OmniFocus Forecast "Past" parity: Forecast Past = `dueDate < startOfToday OR plannedDate < startOfToday AND NOT blocked`. Parity recipe: union `mode:overdue` with `plannedDate:{before:now}`, merge by ID. OMN-133 (open) will add a `forecast_past` mode. Residual ±2 candidates: overdue inbox tasks, project-root-as-task, on-hold parents (vault diary 2026-05-20). |
| `flagged`               | flagged                                           |                                                                                                                                                                                                                                                                                                                                                                              |
| `available` / `blocked` | availability model (§3.1)                         |                                                                                                                                                                                                                                                                                                                                                                              |
| `search`                | no augmentation — filters pass through unmodified | only mode without an implicit predicate beyond terminal-state exclusion                                                                                                                                                                                                                                                                                                      |

## 5. Result shaping (filter-adjacent contract)

| Aspect              | Contract                                                                                                                                                                     | Provenance                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Limits              | tasks/projects default 25; folders hard-cap 100 (name-sorted); export 1000 (5000 with `outputDirectory`)                                                                     | `OmniFocusReadTool`                          |
| Truncation honesty  | Every list response carries `metadata.total_count`; a limited response is distinguishable from a complete one. Audits pass `limit: 500+`; flat-list absence is non-evidence. | P4; vault Project Audit 2026-05-19 pattern G |
| `countOnly`         | Tasks only; returns count metadata, no rows; MUST use the identical predicate as the row query (an inbox triple-bug violated this — commit `aa4be54`)                        | OMN docs "33x faster"                        |
| Sort                | User sort embeds in OmniJS (sort-before-limit); mode-default sorts apply post-hoc                                                                                            | `OmniFocusReadTool`                          |
| Fields projection   | Post-hoc; `id` always included; absent ≠ null (absent = not requested; null = explicitly cleared in OF)                                                                      | `task-query-pipeline`                        |
| Summary suppression | Narrow lookups (search/id filters) suppress the dashboard summary block; broad browses keep it                                                                               | OMN-19                                       |
| Performance classes | Fast: `id`, `projectId`, `parentTaskId`, `countOnly`. Full-scan: `text`/`search`/`name` (~7–10 s whole-DB floor). `fastSearch` narrows scan work, not its class.             | OMN-115; memory perf_whole_db_count_floor    |

## 6. Projects, folders, tags queries

| Query        | Filter contract                                                                                                                                                                                                                                                                                                                                                                                           | Provenance                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| projects     | `status` enum (`active`/`onHold`/`done`/`dropped`); `folder: "<name>"` substring, `folder: null` = top-level only (null-meaning-absence is per-field opt-in, not a general rule); `name` name-scoped; `text` name-or-note (wired by OMN-142 — previously recommended by the tool's own error message yet silently dropped); `id` fast path (OMN-40); `matches` via safe `new RegExp(JSON.stringify(...))` | OMN-96, OMN-142, OMN-40                 |
| folders      | Name-sorted, capped 100; order/absence checks need a direct osascript probe                                                                                                                                                                                                                                                                                                                               | memory tooling_omnifocus_read_defaults  |
| tags         | Basic mode only (`{id, name}`) — tag hierarchy is writable but **unreadable** through the read seam (§8 D3, OMN-145)                                                                                                                                                                                                                                                                                      | OMN-145                                 |
| perspectives | `filterRules` returns null for all perspectives — a stated boundary pending commitment either way (§10 Q4). Dependent workflows (tag migrations) must manually verify perspective filters.                                                                                                                                                                                                                | vault Tag Inventory Redesign 2026-06-03 |

Project-review fields (`nextReviewDate`, `lastReviewDate`, `reviewInterval`, a `needsReview` predicate) are required by
the weekly-review workflow (§7 R8) and are projects-only; task queries requesting them get a steering error, not a bare
reject (type-discriminated field enums — vault Description-Gap Audit gap #2; OMN-130 territory).

## 7. Requirements register (GTD layer — from the vault)

| #   | Requirement                                                                                                             | Source                                | Status                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| R1  | `name` matches name only; a note-only match returning under `name` is a data-loss bug                                   | Diary 2026-06-09                      | Met (`d89d5b7`); conformance case C1                                         |
| R2  | Operators are distinct: `matches` = real regex, `contains` = substring; silent degradation is a defect                  | Diary 2026-06-11                      | Met on projects; tasks pending OMN-149                                       |
| R3  | Filters compose; unsupported combinations error loudly (never partial application)                                      | Diary 2026-06-11                      | Met for name+text; NOT violates (D1)                                         |
| R4  | Mode views exclude all terminal states (dropped leak found during weekly review)                                        | gtd-review-handoff.md                 | Met (`e703ec7`)                                                              |
| R5  | `plannedDate` is a first-class peer of dueDate (planned-cluster + Sunday GC workflow); "past-planned" ≠ "overdue"       | Diary 2026-05-21, 2026-04-30          | Met (filters); mode split pending OMN-133                                    |
| R6  | `overdue` reconcilable with Forecast Past via a documented query pair                                                   | Diary 2026-05-06, 2026-05-20          | Partial — recipe documented (§4); OMN-133 open                               |
| R7  | Exclusion filters net out recurring noise (`tags:{none:["Bills"]}` + mode)                                              | Diary 2026-05-20                      | Met — needs conformance case C4                                              |
| R8  | Review-cycle queryability (needsReview, last-reviewed age) for weekly review step 5                                     | Project Audit 2026-05-19              | Open (OMN-130 territory)                                                     |
| R9  | Availability is queryable and matches OF's model incl. sequential blocking (project-health % available)                 | Project Audit 2026-05-19              | Met — needs sequential-fixture conformance case C13                          |
| R10 | Truncation unmistakable; default limits documented per query type                                                       | Project Audit 2026-05-19 pattern G    | Partial — total_count exists; has-more indicator unverified (§10 Q3)         |
| R11 | Cache never serves a different predicate (OR-of-names returned a stale generic 25-row slice, `from_cache:true`)         | Diary 2026-05-19                      | Unverified post-incident (D10)                                               |
| R12 | Aggregate→worklist parity: every analyze aggregate has a documented read query returning exactly the counted population | Diary 2026-05-18                      | Spec stance adopted; verification deferred to the analyze section of OMN-148 |
| R13 | Fixtures model real scale: ~3,000 tasks, 160+ projects, recurrence ghosts, case-duplicate tags                          | Project Audit, Tag Inventory Redesign | Conformance-suite design input                                               |

## 8. Drift register

| ID  | Spec statement                                                            | Current behavior                                                                                                                     | Severity                            | Ticket                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------- |
| D1  | P3: unsupported NOT errors                                                | Silently compiles to match-ALL                                                                                                       | High (P5: feeds destructive sweeps) | OMN-131 (open, fix decided: hard-reject) |
| D2  | R6: Forecast-Past parity mode                                             | dueDate-only `overdue`; manual two-query recipe                                                                                      | Medium                              | OMN-133 (open, held on OMN-130)          |
| D3  | Tag hierarchy readable (P7 symmetry)                                      | Tags query hardcoded basic mode                                                                                                      | Medium                              | OMN-145 (open)                           |
| D4  | `between` sets the operator for every date field                          | `deferDate` entry lacks `operatorKey`; functional impact likely nil (inclusive bounds equivalent) — verify, then fix for consistency | Low                                 | unticketed                               |
| D5  | `upcoming` default documented = implemented                               | Code 7 days; some docs say 14                                                                                                        | Low                                 | unticketed                               |
| D6  | `name:{matches}` safe regex on tasks                                      | Task-side emitter raw-interpolates pattern (`/` breaks script; injection seam); newly reachable since `d89d5b7`                      | High                                | OMN-149 (open)                           |
| D7  | Tasks `folder` filter tested                                              | Zero unit/integration coverage                                                                                                       | Low                                 | unticketed (conformance case C12 covers) |
| D8  | `parentTaskId` integration-verified                                       | Builder coverage only; no live validation                                                                                            | Low                                 | OMN-135 adjacent                         |
| D9  | Combined-filter RESULT correctness integration-tested (text+date+tag, OR) | No integration test exercises OR result correctness                                                                                  | Medium                              | OMN-135 (open)                           |
| D10 | P4: cache keyed by full compiled predicate                                | 2026-05-19 incident (stale slice served for an OR-of-names query); current state unverified                                          | High if still live                  | unticketed — verify first                |
| D11 | Docs match shipped composition semantics                                  | ~35 stale doc claims incl. "OR is broken"                                                                                            | Low                                 | OMN-104 (open)                           |

## 9. Conformance golden cases (transport-level: MCP request → golden response)

Implementation-independent; each runs against a seeded fixture DB (design per R13).

| #   | Case                                                               | Asserts                                                                                  |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| C1  | `name:{contains}` with note-only marker fixture                    | Note-only match NOT returned (R1 regression lock)                                        |
| C2  | Same term via `name` vs `text`                                     | `text` ⊇ `name`; sets differ on the note-only fixture                                    |
| C3  | `name` + `text` together                                           | Both apply (AND); neither dropped                                                        |
| C4  | `mode:overdue` + `tags:{none}`                                     | Mode and exclusion compose (R7)                                                          |
| C5  | `matches` with regex metacharacters vs `contains` of same string   | Results differ; regex semantics real (R2); include a `/`-bearing pattern (OMN-149 probe) |
| C6  | `dueDate:{between}` boundary fixtures                              | Inclusive both ends; null-due tasks absent                                               |
| C7  | `estimatedMinutes:{lessThan}`                                      | No-estimate tasks absent (null ≠ 0)                                                      |
| C8  | Unsupported `NOT:{tags}`                                           | Validation error, zero rows — never match-all (post-OMN-131)                             |
| C9  | Each mode against a fixture containing a dropped task              | Dropped task absent from every mode                                                      |
| C10 | `mode:overdue` vs `plannedDate:{before:now}` union                 | Documented Forecast-Past recipe returns the fixture's expected set (R6)                  |
| C11 | `limit:5` against a 10-row population                              | `metadata.total_count: 10`; truncation visible (R10)                                     |
| C12 | `project:null`, `folder:null` (projects), tasks `folder` substring | Inbox / top-level / hierarchy semantics                                                  |
| C13 | Sequential-project fixture                                         | `available` excludes second-in-sequence; `blocked` includes it (R9)                      |
| C14 | `projectId` task query                                             | N+1 rows incl. root node, root identifiable (§3.4)                                       |
| C15 | `countOnly:true` vs same query without                             | count == rows length (same predicate)                                                    |
| C16 | `fastSearch:true` with note-only marker                            | Note-only match absent                                                                   |
| C17 | Repeat C-series query after an unrelated cached browse             | Response matches predicate, not cache (R11)                                              |

## 10. Open questions (review gate)

| #   | Question                                      | Options                                                                                            |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Q1  | Project root node in `projectId` task queries | Keep N+1 + document (status quo, spec'd in §3.4) vs add `includeRootTask:false` knob               |
| Q2  | `upcoming` default window                     | Keep 7 + fix docs, or honor the documented 14                                                      |
| Q3  | Truncation indicator                          | Is `metadata.total_count` always present, or is an explicit `has_more` needed? (verify, then spec) |
| Q4  | Perspectives `filterRules: null`              | Commit to surfacing rules (new ticket) or formalize as a stated boundary                           |
| Q5  | D4/D5/D7/D10 tickets                          | File now or batch with the next OMN-148 section                                                    |
