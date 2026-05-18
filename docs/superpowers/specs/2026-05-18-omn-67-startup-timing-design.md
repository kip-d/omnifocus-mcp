# OMN-67 — Consolidated STARTUP COMPLETE timing line

Date: 2026-05-18 Linear: OMN-67 Status: Implemented (2026-05-18) — pending review/merge

## Problem

The MCP server blocks its transport behind an awaited `cacheWarmer.warmCache()`: in `src/index.ts`,
`await cacheWarmer.warmCache()` (≈:117) runs in `runServer()` **before** the mode branch
(`if (cliConfig.httpMode) runHttpServer else runStdioServer`, ≈:127–132) and therefore before the stdio transport
`connect()` (≈:218) or the HTTP listener start. On a cold start this exceeds the client's fixed 30s connect window, so
the first `/mcp` reconnect times out and only the second works (root cause diagnosed and empirically verified
2026-05-18: warm alone ≈15.4s even on a fully hot machine; a cold redeploy adds cold `node_modules` FS read after
`npm ci`, cold OmniFocus DB materialization, and possible TCC re-eval on top).

Existing logs are timestamped and the cache warmer already logs
`Cache warming completed: N/N operations succeeded in NNNNNms` plus a per-category breakdown
(`projects … / tags … / tasks_unified … / perspectives …`). What is missing:

1. The **module-load / Node-bootstrap slice** — everything before the first log line, which is exactly the cold-`npm ci`
   FS cost — is invisible.
2. A single **at-a-glance summary** that localizes _which_ phase dominated, so the operator never has to subtract
   timestamps by hand or guess by reading code.

A `time`-wrapped pre-warm already yields the true end-to-end cold wall (it measures the whole process). This work is
purely about **decomposition and turnkey visibility**, not about producing a number that is otherwise unobtainable.

## Key facts (reuse, don't reinvent)

- **`load` is derivable for free.** `performance.now()` is measured relative to `performance.timeOrigin` (≈ process
  init). ESM hoists all `import` statements above any executable code, so by the time `runServer()` runs the entire
  dependency graph is already loaded. Therefore the value of `performance.now()` at the **first executable statement of
  the entrypoint** _is_ the `load` duration (Node bootstrap + full import graph). No separate first-imported timing
  module is required. Placement note: `src/index.ts` has a few module-top-level statements (`createLogger`,
  `parseCLIArgs`) that run before `runServer()` is invoked. The `StartupTimer` must therefore be instantiated /
  first-marked at **module top level** (as early as possible), not at the top of `runServer()`, so the `load` value is
  not undercounted by the top-level CLI parse. The plan must pin this placement.
- **The expensive phases are pre-branch and shared.** `load`, `init`, `perms`, `warm` are all captured in `runServer()`
  _before_ the stdio/HTTP split. Only the final `ready` boundary differs by mode, and `register` is **stdio-only**:
  `runHttpServer` never calls `registerTools`/`registerPrompts` — HTTP registers tools lazily per-session inside
  `SessionManager` (`session-manager.ts`), after the listener is already up (i.e. after `ready`). In HTTP mode
  `register` therefore renders `0`, exactly the way `warm` renders `0` when warming is disabled. Instrumenting both
  modes is one extra emit call reusing the shared pre-branch timestamps — excluding HTTP would add a conditional, not
  remove code.
- **The warm phase already has drill-down.** `CacheWarmer` logs its per-category durations on the line immediately
  preceding where the summary will emit. The summary carries the six top-level phases; the warmer's existing line
  remains the drill-down for the dominant phase. No nesting/coupling needed.
- Additive logging only. No behavior change to the warm, transport, mode-branch, or shutdown paths.

## Decision

Add a small `StartupTimer` (`mark(name)` capturing `performance.now()`; a **pure** `formatStartupSummary(marks, mode)`),
place `mark()` calls at six boundaries in `runServer()` and each mode function, and emit one `STARTUP COMPLETE` INFO
line in **both** stdio and HTTP modes, **always-on** (even when warming is disabled — the `warm` slice then shows `0`).
The cache warmer's existing per-category line is the drill-down for the dominant phase.

## Phases (derived from `src/index.ts` `runServer()`)

| Phase      | Boundary                                                    | A spike here means                                                           |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `load`     | process start (`timeOrigin`) → first `mark()` at entrypoint | Cold `node_modules` FS read after `npm ci` + Node bootstrap                  |
| `init`     | entry → `CacheManager` + `PermissionChecker` constructed    | Usually ≈0; flags a config/env surprise                                      |
| `perms`    | `checkPermissions()` start→end                              | macOS Automation/Apple-Events TCC re-eval after file changes                 |
| `warm`     | `cacheWarmer.warmCache()` start→end                         | Dominant cost; scales with DB size (drill-down already logged by the warmer) |
| `register` | `registerTools` + prompt registration start→end             | Tool/prompt registration (~113ms; stdio-only — renders `0` in HTTP)          |
| `ready`    | transport `connect()` (stdio) / HTTP listener up (HTTP)     | Final handshake readiness                                                    |

**Output (one INFO line, both modes):**

```
STARTUP COMPLETE 31280ms  load 8210 · init 4 · perms 140 · warm 22600 · register 113 · ready 213  [stdio]
```

Per-phase values in ms; they sum to `total` within rounding; mode tag (`[stdio]`/`[http]`) at the end.

## Scope

In scope:

- **New module** `src/utils/startup-timer.ts`:
  - `class StartupTimer` with `mark(phase: StartupPhase): void` recording `performance.now()` keyed by phase name (first
    `mark` establishes the `load` value from its own `performance.now()`).
  - Pure `formatStartupSummary(marks, mode): string` — deterministic, no clock/IO access; computes per-phase deltas +
    total from recorded marks; renders the line above.
- **Wiring in `src/index.ts`**: instantiate the timer at the top of the entrypoint; `mark()` at the six boundaries; emit
  the formatted line via the existing `logger` (`server` channel, INFO) after the final `ready` mark in **both**
  `runStdioServer` and `runHttpServer`.
- Correct the now-stale `// (non-blocking)` comments in this region as an in-region drive-by: the one at
  `src/index.ts:78` (the awaited/blocking cache warm) and the analogous one at `src/index.ts:62` (the awaited permission
  check) — both are documentation-accuracy only, no behavior change.

Out of scope:

- Any change to warm/transport/shutdown behavior or ordering.
- Nesting the warmer's per-category breakdown into the summary line (it already exists adjacent; folding it in would
  couple the timer to the warmer — explicitly rejected as approach B).
- A generic arbitrary-`mark` registry (rejected as approach C: unbounded output, weak contract, non-deterministic to
  test).
- Splitting `load` into Node-bootstrap vs import-graph sub-slices (YAGNI; one `load` slice answers the operator
  question).
- Persisting/exporting timings anywhere beyond the existing logger.

## Testing

- **Unit (pure formatter, the contract):** `formatStartupSummary` with synthetic marks → exact expected string;
  per-phase deltas correct; phases sum to `total` within rounding; `[stdio]` vs `[http]` tag; graceful handling when a
  phase mark is missing (e.g., warm disabled → `warm 0`); ordering of phases stable regardless of `mark()` call order.
- **Integration:** on stdio startup the `STARTUP COMPLETE` line is emitted exactly once, `load` is present and non-zero,
  and the `mode` tag is `[stdio]`. (HTTP-mode emission asserted analogously where the existing harness permits;
  otherwise covered by the unit contract on the mode parameter plus a wiring assertion that `runHttpServer` calls the
  emit.)
- All existing gates green: `npm run build`, `npm run test:unit`, `npm run lint:strict`.

## Risks / non-goals

- **Risk:** a `mark()` placed on the wrong side of a boundary mis-attributes time. Mitigation: phases sum-to-total
  assertion in unit tests catches gross misattribution; boundary placement is reviewed against the `runServer()` control
  flow in the plan/code-review gates.
- **Risk:** `performance.timeOrigin` semantics differ from expectation, skewing `load`. Mitigation: `load` is defined
  operationally as "first `mark()`'s `performance.now()`"; the integration test asserts it is present and non-zero
  (sanity), not an exact value.
- **Non-goal:** reducing startup time. This is observability only; the fix for the 30s symptom is the operational
  pre-warm (`~/bin/of-mcp-redeploy`), not this ticket.

## Acceptance

- One `STARTUP COMPLETE` line per process start in both stdio and HTTP modes, always-on.
- Six phases present; values sum to `total` within rounding; correct mode tag. In HTTP mode `register` is expected to
  render `0` (lazy per-session registration occurs after `ready`); the sum-to-total contract still holds.
- `load` slice demonstrably non-zero and reflects bootstrap (sanity-checked in integration; larger immediately after
  `npm ci` in the field, not asserted in CI).
- `~/bin/of-mcp-redeploy` already greps for `STARTUP COMPLETE`; it lights up automatically once this lands (no script
  change required).
- Build / `test:unit` / `lint:strict` all green.
