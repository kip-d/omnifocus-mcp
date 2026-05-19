# OMN-77 — Isolate integration test runs from the MCP failure log

**Date:** 2026-05-19 **Status:** Approved (design) **Linear:** OMN-77 **Branch base:** `main` @ `ccaeb8e`

## Problem

`npm run test:integration` spawns the compiled server (`tests/integration/helpers/mcp-test-client.ts:77` →
`spawn('node', ['./dist/index.js'])`). Tool failures during those runs are written by `BaseTool.logToolFailure()`
(`src/tools/base.ts:341`) to `~/.omnifocus-mcp/tool-failures/failures-YYYY-MM-DD.jsonl`. The weekly `diagnose-failures`
launchd job (`scripts/diagnose-failures.ts`) re-reads that whole directory and clusters every entry as a real production
failure. Records carry no provenance, so test-induced failures are indistinguishable from production failures and skew
the triage.

Today this is mitigated by a manual constraint: "don't run `test:integration` between now and the Sunday diagnose job."
This ticket removes that constraint.

## Goal

A test run produces **zero** failure-log entries that `diagnose-failures` ingests, automatically, with no flag for the
developer to remember — while real production failures continue to be logged and diagnosed unchanged.

## Decision Record

| Decision                                        | Choice                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposition of test failures                    | **Suppress** (do not write), not redirect to a separate log                      | A log has value only if it has a consumer. A separate test log would have no automated consumer _by design_ (the point is to keep test data away from `diagnose-failures`). The developer debugging a red integration test already has a higher-fidelity surface: vitest assertions + the returned MCP error payload. "Zero writes under test" is a one-line verifiable invariant; "writes only to isolated dir X, nothing reads X" is a weaker standing obligation with a re-pollution failure mode.                                                            |
| Losing sight of server errors during a red test | **Observable stderr breadcrumb at `info` level** at the suppressed-write site    | Mitigates suppression's only real risk without creating a standing artifact. `info` (not `debug`) because the integration harness runs the server at the default `LOG_LEVEL=info` and does not raise it; a `debug` breadcrumb would be invisible during the exact suite it exists for, leaving suppression effectively silent again. `info` (not `warn`) because a suppressed write under test is an _expected, normal_ condition, not an anomaly — `warn` would cry wolf. The suite is small (6 integration files), so per-failure `info` lines are not spammy. |
| Gating signal                                   | **`OMNIFOCUS_MCP_DISABLE_FAILURE_LOG` truthy OR `NODE_ENV==='test'`** (option C) | The dedicated var is the explicit, greppable, intentional switch usable in any context; the `NODE_ENV` clause is automatic defense-in-depth so any test runner spawning the server is covered without remembering anything. Two well-bounded clauses, each independently justified.                                                                                                                                                                                                                                                                              |

## Architecture

Single gate at the top of the one method all failure-log writes funnel through. Confirmed sole writer + sole call sites:

- `BaseTool.logToolFailure()` — `src/tools/base.ts:301` (sole `writeFileSync` at `:341`)
- Call sites: `:266` (`VALIDATION_ERROR`), `:280` (`EXECUTION_ERROR`), `:639` (`handleErrorV2`)

One guard at the top of `logToolFailure()` therefore covers every write path. `scripts/diagnose-failures.ts`, the
`FailureRecord` schema (`src/diagnostics/failure-log.ts`), `clustering.ts`, `ledger.ts`, and the marker script are **not
modified** — suppressed entries are never written, so the ingest side needs no filter.

## Components

### `src/diagnostics/failure-log-gate.ts` (new)

One exported, pure, total predicate. No I/O, cannot throw.

```ts
export type SuppressionReason = 'disabled-flag' | 'node-env-test';

export function failureLogSuppression(env: NodeJS.ProcessEnv = process.env): {
  suppressed: boolean;
  reason: SuppressionReason | null;
};
```

**Truthiness rule for `OMNIFOCUS_MCP_DISABLE_FAILURE_LOG`** (specified exactly): the flag is ON unless its value is
`undefined`, `''`, `'0'`, or `'false'` / `'FALSE'` (case-insensitive). Any other value (`'1'`, `'true'`, `'yes'`, …) is
ON.

**Precedence:** if the flag is ON, `reason = 'disabled-flag'`. Else if `env.NODE_ENV === 'test'`,
`reason = 'node-env-test'`. Else `{ suppressed: false, reason: null }`.

### Gate call in `logToolFailure()`

Inserted before any filesystem work (currently `src/tools/base.ts:310`):

- If suppressed → emit breadcrumb (below), then `return` (no `mkdirSync`, no `writeFileSync`).
- If not suppressed → existing behavior, byte-for-byte unchanged.

### Breadcrumb

One line via the existing `src/utils/logger.ts` (already writes to **stderr** — required, since stdout is the MCP stdio
protocol channel) at **`info`** level (`logger.ts:71` defaults `LOG_LEVEL` to `info`; the integration harness does not
override it, so `info` is visible by default during the suite and `debug` would not be — see Decision Record):

```
failure-log suppressed (reason=<reason>) tool=<this.name> errorType=<errorType>
```

No args/payload included → no PII surface. Purpose: a red integration test never silently eats a server-side error —
which only holds if the line is visible at the harness's default log level.

### Harness wiring

`tests/integration/helpers/mcp-test-client.ts` (env block at `:70`) adds `OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1'`
alongside the existing `NODE_ENV: 'test'`. Explicit at the spawn site documents intent; the redundancy with the
`NODE_ENV` clause is the approved defense-in-depth.

## Data Flow

```
tool throws
  → handleExecuteError / handleErrorV2
    → logToolFailure(args, errorType, …)
      → failureLogSuppression(process.env)
          suppressed:     logger.info(breadcrumb); return         (zero filesystem touch)
          not suppressed: existing mkdir + JSONL append            (unchanged)
```

`diagnose-failures` runs exactly as today and structurally cannot see test data, because it was never persisted.

## Error Handling

- `failureLogSuppression()` is a pure env read — it cannot throw.
- The gate sits inside the existing `try/catch` at `src/tools/base.ts:349-352` that already swallows logging failures,
  so even a hypothetical throw degrades to "no write," never breaking tool execution.
- **Fail-safe direction (stated, though unreachable given determinism):** absent any positive suppression signal,
  default is **not suppressed** — never silently lose a real production failure.

## Testing

Primary coverage is **unit-level** by deliberate design (see Scope Boundary). New/changed tests:

1. `failure-log-gate` truth matrix — env combinations → expected `{ suppressed, reason }`: unset; `NODE_ENV=test`; flag
   ∈ {`1`,`true`,`yes`,`0`,`false`,``}; flag + `NODE_ENV=test`(flag wins`reason`); `NODE_ENV=production` + flag off.
2. `logToolFailure` with gate **ON**: asserts (a) **no file written** (point the log dir at a temp path / mock `fs`) and
   (b) breadcrumb logged exactly once containing tool name + errorType + reason.
3. `logToolFailure` with gate **OFF**: asserts file still written as before — regression guard that production logging
   is untouched.
4. **Mutation verification** (repo norm): revert the guard line → assert the gate-ON test fails → restore. Confirms the
   test is not vacuously green.

## Scope Boundary

**In scope:** the gate module, the one guard in `logToolFailure`, the breadcrumb, the harness env line, unit tests,
docs/cleanup below.

**Explicitly out of scope (YAGNI):** separate failure sink; `source`/provenance field on `FailureRecord`; any change to
`diagnose-failures.ts`, `clustering.ts`, `ledger.ts`, or the marker script; log rotation.

**No new integration test is added.** The existing suite already runs under `NODE_ENV=test`; the suite's own green run
_is_ the end-to-end exercise. Adding an integration test that the project constraint then forbids running ad-hoc would
be self-defeating. The end-to-end acceptance check is a documented manual/CI step (below).

## Acceptance Criteria

1. After `npm run test:integration`, `~/.omnifocus-mcp/tool-failures/failures-<today>.jsonl` gains **zero** new lines
   attributable to the run (documented verification step: capture line count before/after).
2. With neither signal set, a forced tool failure still writes a record (regression guard — OMN-37 behavior preserved).
3. The mechanism requires no developer action for the standard `npm run test:integration` path.
4. Unit suite (`npm run test:unit`) covers the gate matrix + both `logToolFailure` branches and passes.
5. Documentation updated; the "don't run integration tests before Sunday" manual constraint is retired (memory pointer
   `feedback_no_adhoc_integration_tests.md` and the OMN-77 acceptance note updated to reflect the shipped mechanism).

## Documentation / Cleanup

- Document `OMNIFOCUS_MCP_DISABLE_FAILURE_LOG` where env vars are described (README / docs).
- Note that `test:integration` no longer pollutes the failure log.
- Retire the manual constraint: update `feedback_no_adhoc_integration_tests.md` and close the loop on the OMN-77
  acceptance criterion about retirement.
- Any CLAUDE.md edit must use stable anchors (the `tests/unit/docs/claude-md-paths.test.ts` guard; no `file:NN`, no
  hardcoded versions/counts).

## Related

- OMN-37 (#24, `ccaeb8e`) — introduced the log-based diagnosis pipeline this ticket protects.
- The weekly `diagnose-failures` job is machine-local untracked `~/bin` + LaunchAgents glue; the isolation must
  therefore live in-repo on the writer/harness side, not the job glue.
