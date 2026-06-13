# OMN-159: Canonical script-error surface (B2)

**Status:** Approved direction (decision record: Kip, 2026-06-11 §3.4 Option B2; + two design calls 2026-06-13, below)
**Ticket:** [OMN-159](https://linear.app/omnifocus-mcp/issue/OMN-159) **Date:** 2026-06-13 **Parent:**
`docs/superpowers/specs/2026-06-11-omn-139-success-allowlist-design.md` · **Depends on:** OMN-139 (shipped), independent
of OMN-158 (shipped #97 `1273d4b`)

## 1. Problem

Script errors reach the wire through an ad-hoc `context`-string vocabulary, and **returned** `ScriptError`s are
invisible to the failure log + miscounted as successes in metrics.

Two coupled defects:

1. **Vocabulary B2 (the ticket's headline):** the wire-observable `context` strings are inconsistent and one —
   `'Legacy script error'` — is documented as a client-matchable contract (`src/omnifocus/script-result-types.ts`, the
   wire-contract comment). The parent decision (§3.4 B2) is full canonicalization with NO grandfathered strings: drop
   `'Legacy script error'`, normalize the rest into one small documented vocabulary, no per-script vocabulary leaking to
   the wire.
2. **Failure-log + metrics gap (rider, 2026-06-12):** `logToolFailure` fires only on the **thrown** path
   (`handleExecuteError` in `src/tools/base.ts`); `execute()` stamps `success: true` for any **returned** value
   (`base.ts`, the post-`executeValidated` metrics block). So a returned `ScriptError` — including the
   `'Unrecognized script output shape'` fail-closed class OMN-139 added (the one signal the allow-list exists to
   produce) — never lands in the tool-failures JSONL the weekly diagnose-failures job reads, and is counted as a success
   in metrics. This is the no-silent-failures rule (cf. OMN-137) applied to the error-surface.

**Premise drift vs ticket text (verified against current main `1273d4b`):** the `'Legacy script error'` string and the
wire-contract comment live in `src/omnifocus/script-result-types.ts` (`detectKnownErrorShape`), NOT `src/tools/base.ts`
as the ticket says (OMN-139 centralized it). And **no internal matcher anywhere in `src/` or `scripts/` string-matches
the context vocabulary** — the diagnose-failures pipeline (`src/diagnostics/`) keys on normalized `errorMessage` +
`inputShape` + `tool` + `errorType`, never `context`. So dropping the string breaks no internal code; the only internal
surface is the unit tests that pin the strings, and the external MCP-client contract (→ CHANGELOG).

## 2. Design decisions (Kip, 2026-06-13)

- **Vocabulary granularity: preserve current distinctions (~5-6 buckets), drop only the `'Legacy script error'` label.**
  Keep the meaningful error classes distinct; clean the labels; document each as the wire contract.
- **Failure-log routing: ALL returned `ScriptError`s.** Every returned `success:false` (fail-closed shape-drift, error
  envelopes, execution errors) logs to the diagnose-failures JSONL and counts as a failure in metrics — not just the
  fail-closed class. Maximum signal for the weekly job; the failure log stops being a lower bound for returned errors.

## 3. Canonical vocabulary

A single exported, documented constant map (e.g. `SCRIPT_ERROR_CONTEXT` in `script-result-types.ts`) pins the wire
strings; unit tests assert against it. **Seven** live context strings are emitted today across THREE modules
(`script-result-types.ts`, `OmniAutomation.ts`, AND `base.ts` — the spec-review found two `base.ts` sites the first
draft missed); the closed-vocabulary test must introspect all three modules, not just the seam.

| Canonical context (wire string)            | Replaces                            | Source                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Script error envelope`                    | (unchanged)                         | modern `{ok:false, error:{message}}` envelope (`script-result-types.ts`)                                                                                                                                                                                                                                                                                       |
| `Script reported an error`                 | **`Legacy script error` (dropped)** | legacy `{error:true,...}` dialect AND `{success:false}` without its own `context` (`script-result-types.ts`)                                                                                                                                                                                                                                                   |
| `Unrecognized script output shape`         | (unchanged)                         | fail-closed: matched no dialect, failed success schema (OMN-139) (`OmniAutomation.ts`)                                                                                                                                                                                                                                                                         |
| `Script execution error`                   | `OmniAutomation execution error`    | `OmniAutomationError` (timeout / spawn / osascript failure) — drops the internal class name leaking (`OmniAutomation.ts`)                                                                                                                                                                                                                                      |
| `Unexpected error during script execution` | (unchanged)                         | generic catch in `executeJson` (`OmniAutomation.ts`)                                                                                                                                                                                                                                                                                                           |
| `Script returned null or undefined`        | (unchanged)                         | `base.ts` execJson null/empty result. **Carries `error: 'NULL_RESULT'` — that `error` value is LOAD-BEARING** (`OmniFocusAnalyzeTool` branches on `result.error === 'NULL_RESULT'`; `clustering.ts` IGNORE_SET keys on `categorization.errorType === 'NULL_RESULT'`). Canonicalize the context label only; preserve the `error: 'NULL_RESULT'` value verbatim. |
| `Script execution exception`               | (unchanged)                         | `base.ts` execJson try/catch (mock-fallback / thrown-inside-execJson path)                                                                                                                                                                                                                                                                                     |

**Bucket arithmetic (reconciling §2's "preserve ~5-6"):** 8 distinct context strings are emitted today; dropping the
literal `Legacy script error` and folding `{success:false}`-with-own-context into `Script reported an error` leaves **7
canonical wire contexts**. That honors "preserve distinctions" — every meaningful error class keeps its own wire
context; only the redundant legacy/success pair merges and only the `Legacy script error` label is dropped.

**Per-script `context` no longer leaks to the wire.** Today `detectKnownErrorShape` preserves a `{success:false}`
script's own `context` field as the wire context (§3.4 precedence). B2 removes that: a `{success:false}` error
canonicalizes to `Script reported an error`, and **the script's own context/message is preserved in `details`** (no
information loss — it moves off the context-string contract into the diagnostic payload). This is the one behavioral
change beyond the renames: it's what "no per-script vocabulary leaking to the wire" means. **This deliberately
supersedes the parent §3.4 mechanical-preservation precedence** ("use the script's own `context` when present, else
`'Legacy script error'`") — that rule was OMN-139's preserve-semantics stopgap; B2 is where it's replaced. Verified no
downstream consumer reads the script's own `context` (consumers read `result.error`/`result.details`; the circuit
breaker substring-matches `result.context` only for connectivity keywords that script context never populated), so the
move breaks nothing.

Rules: contexts are the ONLY values `context` may take (closed vocabulary, asserted by a test that greps every
`createScriptError` call site / introspects the constant). `error` (message) stays free-form and script-derived;
`details` carries the script's own context + raw payload.

## 4. Failure-log + metrics routing

**Logging point: `BaseTool.execJson`** (`src/tools/base.ts`), where the `ScriptResult` is still visible as
`success:false` before it is converted to a tool response. When `executeJson` returns a `ScriptError`:

1. `logToolFailure(...)` it to the JSONL (reuse the existing writer + the `failureLogSuppression()` gate so tests/CI
   don't write), with the canonical `context` and the existing categorization.
2. Record a **failure** metric for it.

**Coverage caveat — `execJson` is NOT the only `executeJson` caller (spec-review Critical).** The OMN-139-era structural
cast (`omni as { executeJson?: ... }`) is GONE — `base.ts` now calls `this.omniAutomation.executeJson(...)` directly
(typed). But `src/omnifocus/version-detection.ts` calls `executeJson` DIRECTLY, bypassing `BaseTool.execJson`. That site
is **explicitly scoped OUT** of routing: it is startup version-detection, not a tool execution, and it has a deliberate
safe fallback (a returned error means "couldn't detect version" → graceful default, not a user-facing tool failure). The
plan documents this carve-out rather than letting "single point sees everything" stand unqualified; if a future non-tool
`executeJson` caller appears it must make the same explicit in-or-out decision (same discipline as the no-opt-outs
rule).

**Double-count avoidance (the load-bearing constraint — spec-review Important).** `execute()` records one `success:true`
metric per call on the returned path, and by the time control reaches that metrics block the `ScriptError` has ALREADY
been transformed into a tool-specific `StandardResponseV2` (`isError:true`, at tool-varying nesting) — so `execute()`
cannot recover the `ScriptError` by inspecting its return value, and a plain instance flag would race (tool instances
are reused across concurrent requests). Committed direction (the plan resolves the exact mechanism as its FIRST task,
and it MUST NOT rely on the optional `correlationId`):

- The returned-error log + failure metric is recorded ONCE, at `execJson`.
- `execute()`'s returned-path `success:true` metric must be SUPPRESSED for that call. Mechanism must be
  **execution-scoped, not an instance flag** — candidate approaches for the plan to choose: (i) `AsyncLocalStorage`
  carrying a per-execution "outcome already recorded" context; (ii) refactor so error responses carry a uniform,
  known-location `isError` marker that `execute()` reads to decide success-vs-failure (removes the side channel entirely
  but touches every tool's error-response shape); (iii) `execJson` returns an outcome the tool propagates to `execute()`
  through the call's return value. Whichever: exactly ONE log + ONE metric per returned error, and the thrown path
  (`handleExecuteError`) must not double-log a returned-then-rethrown error.
- **Partial-success is NOT an error:** bulk ops (`BulkDeleteResultSchema`) return `success:true` with a per-item
  `errors[]` array (OMN-144 — script-level success; zero-deletion failure is surfaced as a tool-level envelope, not a
  `ScriptError`). Verified: the bulk handler routes a ScriptError into the returned `success:true` envelope's
  `errors[]`. Only `ScriptResult.success===false` routes to the failure log; no `success:true`-with-errors path is swept
  in.

## 5. Internal matcher + test updates

- **Pipeline:** no `context`-string matcher exists in `src/diagnostics/` (verified) — no change needed there. The new
  returned-error entries flow through the SAME normalized fingerprint (errorMessage/inputShape/tool), so the
  diagnose-failures clustering Just Works on the newly-logged class. (Memory: project_diagnose_failures_scheduled,
  project_failure_log_real_signal — update the latter: returned errors are no longer a silent gap.)
- **Tests:** update the unit tests pinning the old strings (`tests/unit/omnifocus/script-result-types.test.ts`,
  `tests/unit/omnifocus/OmniAutomation.test.ts`, and any `base.ts` test pinning the NULL_RESULT / exception contexts) to
  the canonical vocabulary; add tests asserting (a) the closed vocabulary — introspect/grep `createScriptError`
  emissions across ALL THREE emitting modules (`script-result-types.ts`, `OmniAutomation.ts`, `base.ts`), so no stray
  string ships; (b) `{success:false}`-with-own-context canonicalizes to `Script reported an error` with the script
  context preserved in `details`; (c) the `NULL_RESULT` `error` value survives the context rename (the consumer +
  IGNORE_SET still match); (d) a returned `ScriptError` produces exactly one JSONL entry + one failure metric (no
  double-count, partial-success bulk stays success). The closed-vocabulary test lives wherever it can import the
  `SCRIPT_ERROR_CONTEXT` constant and scan the three modules — not solely against the seam.

## 6. Testing

| Layer             | Cases                                                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — vocabulary | Closed-vocabulary assertion; each dialect → its canonical context; `{success:false}` context preservation in details; `'Legacy script error'` / `'OmniAutomation execution error'` no longer emitted anywhere.                                                                           |
| Unit — routing    | Returned `ScriptError` → one `logToolFailure` JSONL write (mock the writer) + one failure metric; thrown error → still one (no double-log); bulk partial-success → success, no failure log. Mutation-verify the metrics fix (revert → returned error counts as success again → restore). |
| Integration       | Force a known error live (e.g. a script that returns `{ok:false}`), assert the canonical shape + that an entry lands in the JSONL (respecting suppression). Full live suite as regression gate (run_in_background, npm not bun, never kill — OMN-143).                                   |

## 7. CHANGELOG (breaking)

Knowing, accepted breaking change to wire-observable error `context` strings: `'Legacy script error'` →
`'Script reported an error'`; `'OmniAutomation execution error'` → `'Script execution error'`; `{success:false}` scripts
no longer surface their own context string on the wire (preserved in `details`). MCP clients matching on the old strings
must update. Note the failure-log/metrics fix (returned errors are now logged + counted).

## 8. Non-goals

- Success-shape unification (OMN-160).
- Changing detection ORDER or which inputs are errors vs successes (OMN-139 settled that; this only renames/normalizes
  the context + routes the logging). Outcomes are unchanged except the §3 `{success:false}` context-to-details move.
- `executeViaUrlScheme` / `executeBatch` (different seams, out of scope per parent).

## 9. Risks

| Risk                                                                                | Mitigation                                                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Double-counting a returned-then-thrown error (two logs / success+failure metrics)   | §4 single-point design + per-path mapping in the plan; mutation-verify the metric.                                      |
| Sweeping bulk partial-success into the failure log                                  | Only `success===false` routes; explicit test.                                                                           |
| A `createScriptError` call site missed in the rename → stray old string on the wire | Closed-vocabulary test greps/introspects every emission.                                                                |
| Failure-log volume increase (all returned errors now logged)                        | Intended (Kip's call); suppression gate still applies in tests/CI; diagnose-failures clustering dedupes by fingerprint. |
