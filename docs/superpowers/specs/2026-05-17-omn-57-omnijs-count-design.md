# OMN-57 #1 — countOnly: pure-JXA → OmniJS in-process count

Date: 2026-05-17 Linear: OMN-57 (item #1; #2/#3 tracked separately in the same ticket) Status: Design approved
(2026-05-17), pending spec review

## Problem

`omnifocus_read` with `countOnly: true` over a whole-DB filter takes ~51 s (`status:active`) to ~113 s (`flagged:true`)
on a 2928-task database, blowing the 60 s integration-test budget (`end-to-end.test.ts:199`, observed 60021 ms) and —
more importantly — making count queries unusably slow for real users.

### Root cause (decomposition-verified, 2928-task DB)

`buildTaskCountScript` (`src/contracts/ast/script-builder.ts:1921`) emits a **pure-JXA** script:
`const tasks = doc.flattenedTasks(); for (i…) { const task = tasks[i]; if (matchesFilter(task)) count++ }`. Two
compounding costs, isolated by probe:

| step (JXA)                                                            | cost                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| `doc.flattenedTasks()` collection build                               | ~7–10 s (irreducible; OmniFocus flattening the task tree) |
| per-task `tasks[i]` + accessor (`task.completed()` …) Apple-Event IPC | ~40 s (≈ tasks × accessors round-trips)                   |

The same count in OmniJS via one `evaluateJavascript`: ~7–10 s flatten + ~90 ms loop (per-task property access is ~0.03
ms — _not_ a bottleneck in-process). Net: moving the count into OmniJS removes the ~40 s IPC component → **~5× speedup
(≈51 s → ≈10 s)**.

The ~7–10 s `flattenedTasks` materialization is a hard floor — no indexed count primitive exists in the public
OmniAutomation API (`project.numberOfTasks` → `null`). **Sub-second whole-DB counts are not achievable here; ~10 s is
the target, not sub-second.** The in-code comment _"Do NOT use app.evaluateJavascript() - it's ~40x slower!"_ is a
premature generalization: true for small ops where bridge-setup cost dominates, false for whole-DB iteration where
per-element IPC dominates.

## Scope

In scope:

1. Rewrite the `buildTaskCountScript` script body from pure-JXA to a single `app.evaluateJavascript` OmniJS count,
   reusing the existing `'omnijs'` filter emitter.
2. Preserve the response JSON contract byte-for-byte except the `optimization` discriminator.
3. Update the integration test(s) that assert the now-false `pure_jxa` discriminator and the 60 s budget; correct the
   misleading "33x faster optimization" wording.

Out of scope (explicit — no scope creep):

- No count cache, no short-TTL layer (`executeCountOnly` keeps bypassing the cache as today).
- No scope-aware enumeration (inbox/project-narrowed fast paths) — separate future work.
- No `projectStatus` AST handler — the pre-existing silent-drop of `projectStatus` from the predicate is **kept
  unchanged**; fixing it would change counts and is a different concern.
- No change to non-count code paths (list/export/analyze).
- OMN-57 #2/#3 (create-response `taskId` normalization) — tracked separately in the ticket; not this spec.

## Design

### 1. `buildTaskCountScript` — `src/contracts/ast/script-builder.ts:1921`

Keep the function signature, the `normalizeFilter`, `checkInbox`, and the OMN-52 `filterForCode` derivation
(`if (f.completed === undefined) f.completed = false`; strip `inInbox` when `checkInbox`) **unchanged** — these
determine the counts and must not move.

Change only the emitted script and the emitter:

- Predicate: `generateFilterCode(filterForCode, 'jxa')` → `generateFilterCode(filterForCode, 'omnijs')`. The `'omnijs'`
  emitter already exists and is used by the list path (`script-builder.ts:466/582/751/1502`). The OMN-52 `needsTags`
  optimization stays (the predicate string still drives whether tags are gathered).
- Script body: a thin JXA shell that builds the OmniJS source string and calls `app.evaluateJavascript(omniJsScript)`,
  returning its JSON string verbatim. Inside OmniJS:
  - collection: `const tasks = ${checkInbox ? 'inbox' : 'flattenedTasks'};` (OmniJS globals — note `inbox` not
    `doc.inboxTasks()`, `flattenedTasks` not `doc.flattenedTasks()`; property access, no `()` — per JXA-vs-OmniJS
    rules).
  - `const totalTasks = tasks.length;`
  - `function matchesFilter(task${needsTags ? ', taskTags' : ''}) { return ${filterCode.predicate}; }` where
    `filterCode` is the `'omnijs'` emitter output (OmniJS property-access syntax).
  - loop `for (let i = 0; i < tasks.length && scanned < maxScan; i++)` incrementing `scanned`, reading
    `const task = tasks[i];`, gathering `taskTags = task.tags.map(t => t.name)` only when `needsTags` (OmniJS:
    `task.tags` is a property; `.name` not `.name()`), `if (matchesFilter(...)) count++;`, wrapped in try/catch per task
    (skip on error) to match current resilience.
  - `query_time_ms`: measure inside the OmniJS script (`Date.now()` around the flatten+loop) so the reported number
    reflects the real in-OmniFocus cost, as today.
  - return
    `JSON.stringify({ count, filters_applied, query_time_ms, optimization, filter_description, scanned, total_tasks, ...(scanned >= maxScan ? { warning, limited:true } : { limited:false }) })`.
- `optimization` discriminator: `'pure_jxa_no_tags'` / `'pure_jxa_with_tags'` → `'omnijs_count_no_tags'` /
  `'omnijs_count_with_tags'`.
- Outer JXA try/catch around `evaluateJavascript` returns the existing
  `{ error:true, message, context:'task_count_jxa' }` shape on failure (rename context to `task_count_omnijs`);
  `executeCountOnly` already maps a non-success result to `SCRIPT_ERROR`.

`maxScan` (default 10000) is **kept** for response-contract compatibility (`scanned`, `limited`, `warning`). Add an
in-code comment: it now bounds only the cheap in-process iteration, **not** the expensive `flattenedTasks`
materialization (already paid before the loop), so `limited:true` no longer implies a performance saving. No
consumer/contract break (fields unchanged).

**Update the now-false documentation in the same function.** The JSDoc header (`script-builder.ts:1907-1920`) and the
in-body comment (~line 1957) currently assert _"pure JXA … ~40x faster"_ and _"Do NOT use app.evaluateJavascript() -
it's ~40x slower!"_. After this change those are actively false and are precisely the "disproven hypothesis baked into a
comment" that caused this ticket. Replace them with an accurate note: the count runs in OmniJS via one
`evaluateJavascript` because for whole-DB iteration the per-element JXA Apple-Event IPC (~40 s) dominates the one-time
`evaluateJavascript` bridge cost; the ~7–10 s `flattenedTasks` materialization is the irreducible floor either way. (The
"evaluateJavascript is ~40× slower" heuristic holds only for _small_ result sets — state that caveat so the comment
doesn't get "corrected" back.)

Script-size: the OmniJS source is small (well under the 261 KB OmniJS-bridge limit; current largest script is ~31 KB per
`SCRIPT_SIZE_LIMITS.md`).

### 2. Behavior parity (must hold)

The count returned for any filter MUST equal the pre-change JXA count. The predicate is the same AST through a different
emitter; the `filterForCode` derivation is untouched; the pre-existing `projectStatus`-drop is preserved (so
`status:'active'` stays `completed==false`). Parity is verified empirically (Verification §3), not assumed.

### 3. Tests — `tests/integration/tools/unified/end-to-end.test.ts`

- Line ~239: raise the count-only-active test budget `60000` → `30000` (covers ~10 s flatten + variance + MCP/transport
  overhead; deliberately _below_ 60 s so a regression back toward JXA fails the test loudly rather than silently
  passing).
- Line ~233: `expect(parsed.metadata.optimization).toMatch(/^pure_jxa/)` →
  `expect(parsed.metadata.optimization).toMatch(/^omnijs_count/)`.
- Rename the test so it no longer claims "33x faster optimization" — describe it as the count-only active path (e.g.
  `should return count-only for active tasks (OmniJS in-process count)`).
- Grep the whole `tests/` tree for any other assertion of `pure_jxa` against a count response and update consistently.
  (Search term: `pure_jxa`.)

## Verification

1. `npm run build` — exit 0.
2. `npm run test:unit` — no failures (count path has unit coverage via `script-builder` tests; ensure they still pass /
   update any that pin the JXA script text or `pure_jxa` literal).
3. **Parity probe (live OmniFocus):** for at least `status:active`, `flagged:true`, and an inbox count, confirm the new
   OmniJS count returns the **same number** as the pre-change JXA path and `query_time_ms` ≈ 10 s (not ≈ 50 s). Use an
   independent measurement, not the count's own echo.
4. `end-to-end.test.ts` count-only-active test passes comfortably under the new 30 s budget against live OmniFocus.
5. Full `npm run test:integration` shows no new failures attributable to the count change (the run may still surface
   OMN-57 #2/#3 as latent flakes — those are separate and out of scope).

## Risks and mitigations

| Risk                                                                                                      | Mitigation                                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| OmniJS emitter produces a subtly different predicate than the JXA emitter → count drift                   | Parity probe (§3) on multiple filters before merge; same AST, emitter already battle-tested by the list path.                           |
| `inbox`/`flattenedTasks` OmniJS globals behave differently than `doc.inboxTasks()`/`doc.flattenedTasks()` | Verified in probe: `inbox` (4 ms, 99) and `flattenedTasks` (2928) return expected collections.                                          |
| A unit test pins the literal JXA script text or `pure_jxa`                                                | Step 2 explicitly updates them; grep for `pure_jxa`.                                                                                    |
| 30 s budget still flaky under heavy load                                                                  | 30 s is ~3× the measured ~10 s; if flaky in practice, revisit budget — but JXA-regression must still fail, so do not raise toward 60 s. |

## Linear

On completion: comment OMN-57 with the measured before/after (`query_time_ms` JXA vs OmniJS, same counts), note #1
resolved; leave OMN-57 open for #2/#3 (or split #2/#3 to a new issue and close #1) — disposition decided with the user
at completion, not pre-committed here.
