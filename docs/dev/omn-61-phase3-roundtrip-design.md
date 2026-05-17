# OMN-61 Phase 3 — per-field write→read round-trip harness (design)

Status: **BUILT** (2026-05-17), **OMN-62 resolved** (2026-05-17 — project `tags`/`plannedDate` promoted from xfail to
real round-trip rows) — `tests/integration/tools/unified/field-roundtrip.test.ts`, 26/26 green (zero xfails) against
live OmniFocus, wired into `test:integration` (excluded from `test:unit` by location). Prereqs shipped: Phase 1 (read
parity, PR #11), Phase 2 (write parity, PR #12), `assertFieldPersisted` helper (OMN-41, in
`tests/integration/helpers/`). The doc below is retained as the rationale of record; the matrix and hard lessons are now
enforced by the harness. Build note: the `project.folder` move row initially read back from the _source_ folder — the
exact OMN-60 confounded-oracle trap this doc warned about. Caught during the live run, root-caused (the writer was
correct; the move persisted), and fixed by reading back from the _destination_ folder.

## Goal

Phases 1–2 are _static_ gates (declared ↔ implemented). They prove a field is _wired_, not that it _persists_. Phase 3
closes that: for each settable field, set a **non-default** value via the public write tool, read it back through an
**independent** `omnifocus_read`/`omnifocus_analyze` call, assert it persisted. This is the gate that would have caught
OMN-60's actual _behavior_ (not just its shape), and the `fixed`-class silent no-op.

## Hard lessons baked in (from OMN-60 — do not relearn)

1. **Non-default values only.** OmniFocus' default review interval is `{weeks,2}`; a round-trip asserting a value equal
   to the system default cannot distinguish "wrote correctly" from "did nothing." Every row's test value MUST be one
   OmniFocus would never produce on its own.
2. **The reader must be able to see the field.** A field settable but absent from the read projection yields `undefined`
   on read-back — that is a read gap, NOT a persistence failure. Such fields are `xfail` + a tracked ticket, never a
   silent skip.
3. **Independent read.** Re-read via a _separate_ tool call (separate `evaluateJavascript` context) — never trust the
   write response's own echo.

## Round-trippable matrix (settable AND independently readable)

Derived 2026-05-16 from `CreateDataSchema`/`UpdateChangesSchema` ∩ `TaskFieldEnum`/`ProjectFieldEnum`. Values are
illustrative non-defaults.

### Task (create + update)

| field             | non-default set value      | read field        | notes                                  |
| ----------------- | -------------------------- | ----------------- | -------------------------------------- |
| name              | `"__TEST__ RT <ts>"`       | name              |                                        |
| note              | `"rt-note-<ts>"`           | note              |                                        |
| flagged           | `true`                     | flagged           | default false                          |
| dueDate           | a specific future datetime | dueDate           |                                        |
| deferDate         | a specific future datetime | deferDate         |                                        |
| plannedDate       | a specific future datetime | plannedDate       | OF 4.7+                                |
| estimatedMinutes  | `37`                       | estimatedMinutes  | odd value                              |
| tags              | `["__test-rt-<ts>"]`       | tags              | bridge-applied — high silent-fail risk |
| repetitionRule    | a weekly rule              | repetitionRule    | bridge-applied — high risk             |
| project           | a sandbox project id       | project/projectId | move                                   |
| parentTaskId      | a sandbox parent task id   | parentTaskId      |                                        |
| clearDueDate etc. | two-phase (see below)      | dueDate → null    | clear\* variants — NOT a single row    |

### Project (create + update)

| field                                   | non-default set value    | read field     | notes                       |
| --------------------------------------- | ------------------------ | -------------- | --------------------------- |
| name, note, flagged, dueDate, deferDate | as task                  | same           |                             |
| status                                  | `on_hold`                | status         | default active              |
| folder                                  | a sandbox folder         | folder         |                             |
| sequential                              | `true`                   | sequential     | default false               |
| reviewInterval                          | `{unit:'month',steps:5}` | reviewInterval | OMN-60 — the canonical case |
| tags                                    | `["__test-rt-<ts>"]`     | tags           | OMN-62 — bridge-applied     |
| plannedDate                             | a specific future datetime | plannedDate  | OMN-62 — OF 4.7+            |

### `clear*` rows — two-phase assertion (not a single round-trip)

A `clear*` row's _expected_ read-back value **is** `null`. That collides head-on with hard lesson #2: a single read
returning `null` cannot distinguish "cleared correctly" from "field never in the projection." Encode each `clear*` field
as a **two-phase** assertion, not one matrix row:

1. **Set phase** — write a non-default value → independent re-read → assert the field is **present and equals that
   value**. This proves the field _is_ in the read projection, so phase 2's `null` is meaningful.
2. **Clear phase** — issue the `clear*` op → independent re-read → assert the field is **`null`**.

Phase 1 is the disambiguator: only after a value is provably visible does a subsequent `null` prove the clear fired. A
`clear*` field whose set phase already reads back `undefined` is a read gap (lesson #2) → `xfail` + ticket, not a clear
failure.

## Known read-gaps → RESOLVED (OMN-62)

Project **`tags`** and project **`plannedDate`** were settable via the shared `CreateDataSchema` but **absent from
`ProjectFieldEnum` and the project projection** — unreadable through the public API (the exact OMN-60 shape, different
fields). Originally filed as **OMN-62** and held in Phase 3 as `it.fails`/`xfail` placeholders.

**OMN-62 shipped:** both fields were added to `ProjectFieldEnum`, `generateProjectFieldProjection` (accessors verified
live via a raw OmniJS probe on OF 4.8.9 — `project.tags.map(t => t.name)`, `project.plannedDate`), and the
`OmniFocusReadTool` `inputSchema` advertisement. The two `it.fails` placeholders were **promoted to genuine round-trip
rows** in `projectRows` (not left as xfails — that would silently never exercise the now-working path, a vacuous green).
No remaining project read-gaps.

## Mechanics (reuse, don't reinvent)

- Harness: the spawned-stdio-server pattern from `tests/integration/tools/unified/review-interval-round-trip.test.ts`
  (OMN-60) — already a working template, including the `assertFieldPersisted` `ClientLike` adapter.
- Per-field assertion: `assertFieldPersisted` (OMN-41).
- Isolation: sandbox-manager (`__MCP_TEST_SANDBOX__` / `__TEST__` / `__test-`); create entity per row, delete in
  `afterAll`/`afterEach`. Honor OMN-46 (fixture-leak): fail loud if cleanup leaves residue.
- Data-driven: one `describe.each`/table of rows `{entity, op, field, setValue, readQuery, extract, expected}` so adding
  a field = adding a row.

## Tagging / CI

This suite mutates the real OmniFocus DB and is slow (one+ live evaluateJS per row). It is **not** a CI unit gate. Tag
it like the other integration suites (separate vitest project / `test:integration`, excluded from `test:unit`). Phases
1–2 remain the fast CI gates; Phase 3 is the on-demand depth check.

## Build checklist (next session)

1. New `tests/integration/.../field-roundtrip.test.ts` from the OMN-60 template.
2. Encode the matrix above as a table; one parametrized round-trip per row. Encode `clear*` fields as the two-phase
   set→verify-present→clear→verify-null assertion, not a single row.
3. ~~`xfail` the two known read-gaps with the ticket id.~~ **Done, then resolved by OMN-62** — promoted to real
   round-trip rows (see "Known read-gaps → RESOLVED" above).
4. Run once against live OmniFocus; any unexpected non-persistence is a real bug → systematic-debugging (remember:
   confounded-oracle + blind-instrument traps from OMN-60 before blaming the writer).
5. Wire into `test:integration`, not `test:unit`.
