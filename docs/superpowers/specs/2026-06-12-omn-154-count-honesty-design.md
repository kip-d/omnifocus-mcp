# OMN-154: Read-metadata count honesty — design

**Ticket:** OMN-154 — `total_count` must report the matching population, not the returned rows (+ `truncated` flag).
**Cluster:** selection-honesty (last open member). Resolves Q3 of the OMN-148 filter-semantics spec (PR #85 §10), drift
D13. Spec anchors: P4 (honest results), R10.

## 1. Problem

`metadata.total_count` and the `summary` headline counts echo the returned rows, so a truncated response is structurally
indistinguishable from a complete one.

Live evidence (prod buildId `64ecfcb9`, 2026-06-12):

| Probe                                        | Result                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| tasks `{flagged, completed:false}` `limit:2` | `metadata.total_count: 2`, `summary.total_count: 2`                        |
| same filters, `countOnly:true`               | `total_count: 48` (truthful)                                               |
| same filters, `limit:2` + `sort`             | `metadata.total_matched: 48` **and** `total_count: 2` in the same response |
| projects `{status:active}` `limit:3`         | `total_count: 3`, `summary.total_projects: 3` (~160 active exist)          |

The third probe is the design key: the sorted tasks path already computes and ships the truthful population
(`total_matched`); the envelope ignores it for the headline counts.

### Premise changes vs the ticket as written

- **D5 fold-in (tool description "default 14" → 7) already shipped** as a PR #93 rider. AC item 4 is satisfied on
  current main; dropped from this scope.
- countOnly population measured 48, not 49 (database drift; immaterial).

## 2. Current count-producer inventory (audited 2026-06-12, main `64ecfcb`)

| Surface                                                                    | Producer                                                         | Counts today                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| tasks `metadata.total_count`/`returned_count`                              | `createTaskResponseV2` (`src/utils/response-format.ts`)          | returned rows                                                                                                          |
| tasks `summary.total_count` + `breakdown`                                  | `generateTaskSummary`                                            | returned rows                                                                                                          |
| tasks `metadata.total_matched`                                             | sorted script path only, plumbed via `list-tasks-ast.ts` wrapper | matching population (truthful, sorted path only)                                                                       |
| projects `metadata.total_count`, `summary.total_projects` + status tallies | `createListResponseV2` / `generateProjectSummary`                | returned rows; handler **discards the script's metadata block** (`total_available`, `returned_count`, `limit_applied`) |
| projects script `total_available`                                          | `buildFilteredProjectsScript`                                    | pre-**filter** DB total (third semantic; never surfaced)                                                               |
| folders `metadata.total_folders`                                           | `handleFolderQuery`                                              | returned rows (hardcoded limit 100); script's `total_available` ignored                                                |
| tags `summary.total` / `metadata.total`                                    | tag scripts                                                      | full population — honest as wired (handler never passes a limit)                                                       |
| `countOnly`                                                                | `buildTaskCountScript`                                           | truthful; same `generateFilterCode` predicate as row path                                                              |
| export                                                                     | `limited` → `summary.truncated` + `cap`                          | already honest about limit truncation                                                                                  |
| tasks `metadata.truncated`                                                 | `createTaskResponseV2`                                           | **character-limit** truncation only (semantic collision)                                                               |
| `metadata.has_more`                                                        | declared in `StandardMetadataV2`, never set                      | dead field                                                                                                             |

Script mechanics that make the fix cheap: the unsorted tasks, inbox, and projects scripts all use `forEach` with
`if (count >= limit) return;` — a body-skip, not a break. The full collection is traversed regardless of limit; the only
cost of counting all matches is predicate evaluation on the tail. The ~7-10s `flattenedTasks` materialization floor is
paid either way; field projection (the expensive part) stays limited. The sorted path already collects all matches
before slicing.

## 3. Approach decision

**A. Scripts emit the population everywhere; the envelope consumes it at one seam. (Chosen.)** Extend the proven
`total_matched` counter to the unsorted-tasks, inbox, and projects scripts; fix the envelope once in a shared counts
helper used by both response builders.

**B. Envelope-only: re-run `countOnly` when `returned == limit`. (Rejected.)** Doubles query latency (7-10s → 15-20s)
exactly on the queries that are truncated. The whole-DB floor is real (perf memory, OMN-57 decomposition).

**C. Full typed `ResponseCounts` contract per query type. (Deferred to OMN-161.)** Right structure, wrong ticket. A's
shared helper centralizes count semantics at one seam OMN-161 can later formalize; that keeps this fix from becoming a
per-symptom patch without expanding scope.

## 4. Normative behavior

Scope: `omnifocus_read` row queries — tasks (all modes, including inbox and smart_suggest) and projects. Folders ride
along (R7). Definitions: **population** = tasks/projects matching the compiled predicate, counted post-filter,
pre-offset, pre-limit, within the mode's collection (inbox mode counts inbox matches).

- **R1 — `metadata.total_count` = population.** `returned_count` stays the number of rows in `data`. The countOnly path
  is unchanged (already truthful).
- **R2 — `metadata.truncated: true` present iff `offset + returned_count < total_count`.** Omitted otherwise (AC permits
  absent-or-false). The formula makes the last page of a paginated walk read complete, and an offset past the end
  (`offset ≥ total`) read complete, not truncated.
- **R3 — summary headline counts = population.** `summary.total_count` (tasks) and `summary.total_projects` (projects)
  report the population. `summary.returned_count` stays row-scoped. Breakdown/status tallies and preview stay row-scoped
  (computing population breakdowns would duplicate date/status logic in-script for marginal value). When truncated, the
  summary gains an explicit insight line — `"Showing N of M matching tasks (truncated)"` in `key_insights` / the
  projects `key_insight` — so truncation is unmistakable in the LLM-facing summary, not only in metadata.
- **R4 — same-predicate agreement.** Row queries and `countOnly` share `generateFilterCode` (already true); an
  integration test pins `total_count == countOnly count` for identical filters (conformance case C11).
- **R5 — one `truncated` flag.** Limit truncation and character truncation both set `metadata.truncated: true`;
  character truncation additionally keeps `truncation_message`. The flag means "data rows are not the full matching
  population." `truncated` is never set without `total_count` present.
- **R6 — caches stay honest.** The projects cache entry stores the population alongside rows; cached responses rebuild
  counts from stored values, never from row length. (Tags/folders caches: same rule where touched.)
- **R7 — folders rider.** `handleFolderQuery` surfaces the script's existing `total_available` as `metadata.total_count`
  with R2 truncation semantics (`total_folders` keyed alias retained for compatibility). The folders query has no
  filter, so pre-filter total = population. This converts the known silent-false-pass gotcha (absence checks beyond the
  100 cap) into a visible signal.
- **R8 — script changes.** Unsorted tasks, inbox, and projects scripts count all matches: hoist the `count >= limit`
  short-circuit so the predicate runs for every element, increment `totalMatched` per match, and push rows only within
  the offset/limit window. Scripts return `total_matched` beside the existing fields. Sorted tasks path already
  complies.

### Decisions recorded (alternatives not taken)

- **D1: count in-script, not via a second query** — see §3 B.
- **D2: unify on the existing `truncated` flag** rather than a new `limit_truncated` field. Two flags meaning "you don't
  have everything" invites consumers to check the wrong one. The existing field is in additive position (optional
  metadata), so unification is non-breaking.
- **D3: `metadata.total_matched` is removed** once `total_count` is truthful. Alternatives: keep both (two fields, one
  meaning — invites drift; the redundancy was live evidence in §1) or alias indefinitely. It appeared only weeks ago
  (sort-before-limit fix), only on the sorted path, and is undocumented. The external fork sees a cleaner contract.
- **D4: breakdown/preview stay row-scoped** (see R3) — population breakdowns would require duplicating TS date logic in
  OmniJS; the truncation insight line covers the honesty requirement.
- **D5: offset participates in the truncation formula** (R2) — `returned < total` alone would brand every non-first page
  truncated.
- **D6: `has_more` stays unset** — dead field, untouched here; candidates for OMN-161's contract.
- **D7: tags, perspectives, export, countOnly `maxScan` are out of scope** — tags/perspectives are uncapped as wired
  (honest), export already reports `limited`/`truncated`, countOnly's `maxScan: 10000` cap already emits `limited` +
  warning.

## 5. Implementation shape

1. **Scripts** (`src/contracts/ast/script-builder.ts`): `buildUnsortedScript`, `buildInboxScript`, and
   `buildFilteredProjectsScript` gain the `totalMatched` counter; output gains `total_matched`. The projects JXA wrapper
   forwards it in its metadata block.
2. **Wrapper** (`src/omnifocus/scripts/tasks/list-tasks-ast.ts`): already forwards `total_matched`; no shape change.
3. **Envelope seam** (`src/utils/response-format.ts`): one shared helper (e.g.
   `applyCountHonesty(metadata, summary, { totalMatched, returnedCount, offset })`) used by `createTaskResponseV2` and
   `createListResponseV2`; sets `total_count`, `truncated` (R2), summary headline counts (R3), and the truncation
   insight. Builders take the population via an explicit option, not metadata-spread ordering.
4. **Handlers** (`src/tools/unified/OmniFocusReadTool.ts`): tasks handler passes the script's `total_matched` into the
   builder; projects handler stops discarding the script metadata block and passes `total_matched` through (and into the
   cache entry, R6); folders handler surfaces `total_available` (R7).
5. **Schema note:** script-output Zod schemas (`listResultSchema`) type `metadata` as `z.unknown()` — no schema change
   needed for new script fields. The MCP-facing `inputSchema` is untouched (response shape only); tool **description**
   gains a one-line note that `total_count` is the matching population and `truncated` signals partial results.

### Expected blast radius

Unit tests that pin the echo behavior (`total_count == returned rows`) will go RED first and be rewritten as the
regression guard (cluster pattern: tests pin bugs). Known pinned surface: `createTaskResponseV2`/`createListResponseV2`
unit tests, possibly golden envelope snapshots. Rider expectation (7-for-7 in this cluster): the projects handler's
discarded script-metadata block and the cache-entry shape are the most likely homes for a second silently-dropped-input
bug; both are explicitly in scope (R6, step 4).

## 6. Test plan

- **Unit (TDD):** script builders emit `total_matched` on all three paths (assert generated script text + vm-executed
  counts where the harness exists); counts helper math — truncated true/false/absent across (offset, limit, population)
  including offset-past-end and exact-boundary; summary insight line; D3 removal (no `total_matched` in envelope
  metadata).
- **Integration (live):** AC probe pair — `limit:2` flagged query returns population `total_count`, `truncated: true`,
  and `countOnly` agrees (R4/C11); un-truncated query reports no `truncated`; projects `limit < population` shows
  population; projects cache-hit response repeats the honest counts (R6); folders `total_count` ≥ returned when DB
  exceeds cap (best-effort at current DB size); offset pagination last-page reads complete.
- **Conformance:** C11 as written in the OMN-148 spec §9.
- **Live verify (post-deploy):** re-run the §1 probe table on prod buildId; all four rows must flip to population counts
  with `truncated: true` on the limited probes.

## 7. Acceptance criteria (restated against current main)

- [ ] `limit:2` flagged tasks query: `total_count` = population (countOnly-equivalent), `truncated: true`, countOnly
      agrees.
- [ ] Complete responses: `truncated` absent (or false).
- [ ] Projects `limit < population`: population in `total_count` and `summary.total_projects`; cached hit identical.
- [ ] Inbox/sorted/offset paths follow R1/R2.
- [ ] Folders surfaces `total_count` per R7.
- [ ] `metadata.total_matched` no longer emitted (D3).
- [ ] Conformance C11 passes as written.
- [x] Tool description upcoming default = 7 (shipped in #93; verified on `64ecfcb`).
