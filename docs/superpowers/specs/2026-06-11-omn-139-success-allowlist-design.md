# OMN-139: Invert script-output detection to a success allow-list

**Status:** Approved design, pre-plan **Ticket:** [OMN-139](https://linear.app/omnifocus-mcp/issue/OMN-139) **Date:**
2026-06-11

**Decomposition (Kip, 2026-06-11):** this spec covers a four-ticket arc. OMN-139 (this ticket) lands the inversion with
top-level-strict schemas and mechanical error-semantics preservation; OMN-158 deepens schemas to leaf-strict; OMN-159
canonicalizes the error surface (B2, drops `'Legacy script error'`); OMN-160 unifies success shapes (low priority). Each
decision lands as its own attributable diff — see §5.

## 1. Problem

OmniJS/JXA errors propagate as stringified JSON inside a _successful_ `osascript` exit. The detection chain recognizes a
deny-list of known error shapes; any shape not on the list returns as success with the error text as payload. A client
gets a confident wrong answer and the failure log records nothing (the no-silent-failures class, cf. OMN-137).

The chain has **three stacked fail-open defaults**, not one:

| Layer               | Location (stable anchor)                                                   | Fail-open behavior                                                                                      |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `executeInternal`   | `src/omnifocus/OmniAutomation.ts` (grep `Might be a simple string result`) | Non-JSON output without braces resolves as a plain-string success                                       |
| `executeJson`       | `src/omnifocus/OmniAutomation.ts` (grep `executeJson`)                     | Recognizes only legacy `{error: true}`; without a schema, everything else returns `createScriptSuccess` |
| `BaseTool.execJson` | `src/tools/base.ts` (grep `Default: wrap as success`)                      | Own deny-list helpers, then wraps unmatched values as success                                           |

**The bug class is live today, not hypothetical.** The modern envelope error `{ok: false, error: {...}, v}` (our own
format, `JxaEnvelopeSchema` in `src/utils/safe-io.ts`) passes through `executeJson` as success: it has an `error` key,
but `error !== true`, so the legacy check misses it, and `isLegacyScriptError` downstream misses it too.

## 2. Audit data (2026-06-11)

Full call-site audit of the execution seam:

| File                      | Sites | Dominant shape family                                                                                                                   |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `OmniFocusWriteTool.ts`   | 15    | AST mutation envelope `{ok, v, data, error}`                                                                                            |
| `OmniFocusReadTool.ts`    | 13    | AST query envelope (items key + `offset`/`mode`) + legacy templates; some dynamic                                                       |
| `OmniFocusAnalyzeTool.ts` | 14    | Analytics v3 envelope `{ok, v, data}`; review scripts `{success: boolean, ...}`; 5 sites have TS type params with **no** runtime schema |
| `version-detection.ts`    | 1     | Already passes `VersionResponseSchema` — the only fail-closed site today                                                                |

Totals: **43 call sites, 42 without schemas, ~6 top-level shape families.** `executeTyped` (the envelope-decoding
sibling) has **zero** call sites.

## 3. Design

### 3.1 Core inversion — `executeJson` requires a success schema

Signature change: `executeJson<T>(script: string, schema: z.ZodSchema<T>)`. The schema parameter becomes **required**;
the TypeScript signature is the forcing function that proves no call site was missed (compile error, not runtime
surprise).

Detection order inside `executeJson`:

1. **Known error shapes first** (so callers get the script's own message, not a generic validation failure):
   - legacy `{error: true, ...}` → message from `message` field
   - modern envelope `{ok: false, error: {message, ...}, v}` → message from `error.message`
   - `{success: false, ...}` → message from `message`/`error` field
2. **Success schema validation.** Pass → `createScriptSuccess(validated)`.
3. **Anything else → `createScriptError`** with a stable context string (`'Unrecognized script output shape'`) and the
   raw output preserved in `details`, truncated to 2000 characters. This is the fails-closed default: a future OmniFocus
   error shape fails validation and surfaces loudly instead of succeeding silently.

Consequences that fall out for free:

- The `executeInternal` plain-string fallback closes: a bare `Error: AppleEvent timed out` string fails object-schema
  validation. (A script that legitimately returns a string declares `z.string()`.)
- `null` results (empty script output) fail object schemas → error. This matches `BaseTool.execJson`, which already
  treats null as `NULL_RESULT`; semantics align instead of diverging.

### 3.2 Schema strictness — top-level closed-world in this ticket; leaf-strict end state in OMN-158

In **this ticket**, family schemas validate the **top-level structure closed-world**: `.strict()` top-level objects that
require the discriminating keys (`ok`, `success`, the items key, …) AND reject unexpected top-level keys. Leaf contents
stay lenient for now (`.passthrough()` on row objects, `z.unknown()` for `data` payload internals).

Closed-world at the top level is load-bearing, not stylistic: a hybrid output like
`{tasks: [...], error: "iteration aborted at item 50"}` validates as clean success under open-world (the bug class in
miniature); closed-world fails it loudly. Top-level key sets are small and stable because we author every script.

**Family schemas model the success branch only; error branches are 3.1 step 1's job.** The envelope families are
discriminated unions (`JxaEnvelopeSchema`: success carries `data`, never `error`), so success schema and error
interception partition cleanly. Never write `error: z.unknown().optional()` into a strict success schema — that
partially reopens the hybrid-output hole closed-world exists to close. **Discriminating keys are literals**
(`ok: z.literal(true)`, `success: z.literal(true)`), never `z.boolean()` — a broad type there would let
`{success: false, ...}` validate as success if it shares top-level keys with the success branch; 3.1's error-first
ordering and this rule are mutually redundant guards, each covering the other's failure mode (spec-walkthrough finding,
2026-06-11).

**End state (decision record, Kip 2026-06-11): fully strict including leaves — §3.2 Option 2.** That lands as
[OMN-158](https://linear.app/omnifocus-mcp/issue/OMN-158) so schema-precision regressions are attributable separately
from detection changes. OMN-158 carries the leaf field inventory (read from script source), the optionality audit
(`JSON.stringify` drops `undefined`, so wrong `.optional()` calls are the main false-positive vector), and the
maintenance invariant it buys: any future change to a script's output shape must touch its schema in lockstep, enforced
loudly at runtime.

Schemas live in a new module near the seam they guard: `src/omnifocus/script-response-schemas.ts` (sibling of
`script-result-types.ts`). One exported schema (or schema factory, for the items-key-parameterized query family) per
family.

**Dual-schema rule check:** these are _response_ schemas. The CLAUDE.md dual-schema rule (Zod ⇄ `inputSchema` override)
governs MCP-advertised _input_ schemas only; nothing here touches tool `inputSchema` or descriptions. No MCP
advertisement changes.

### 3.3 Call-site migration — 43 sites, no opt-outs

`BaseTool.execJson` gains a required schema parameter and threads it to `executeJson`. Every call site declares its
family schema. Rules:

- The five analyze sites with TS type params but no schemas get real schemas matching their declared top-level types.
  The declared type becomes true by construction.
- The audit's ~5 dynamic/ambiguous sites get resolved by reading the script source during implementation; genuinely
  conditional shapes get union schemas.
- **No site may opt out.** One schema-less escape hatch reopens the class — same lesson as the OMN-128 guard-bypass
  closure (any new mutation route must register or the class reopens).
- **Forcing-function blind spot (reviewer finding):** `BaseTool.execJson` invokes `executeJson` through a structural
  cast (`omni as { executeJson?: ... }`, grep `executeJson?:` in `src/tools/base.ts`) that erases the real signature —
  the required parameter will NOT produce a compile error at that one site. It is rewritten anyway under 3.5, but the
  plan must treat that rewrite (and the `omni.execute` mock-fallback branch behind the cast) as a deliberate task, not
  rely on the compiler to flag it.

### 3.4 Error-semantics preservation at migrated call sites (this ticket); canonicalization in OMN-159

Intercepting known error shapes in `executeJson` (3.1 step 1) changes where some callers see errors. Example: if a
write-tool call site currently receives `{ok: false, ...}` wrapped as _success_ and inspects `data.ok` itself, after
inversion it receives a `ScriptError` instead. The implementation plan must map, per call site, how envelope errors
currently reach the caller and migrate that caller's handling — **in this ticket, the same error must still produce the
same (or better) user-visible result.** Wire-observable strings are preserved verbatim here: the `'Legacy script error'`
context string is matched by MCP clients (`src/tools/base.ts` comment near `LegacyScriptError`) and does not change in
this PR.

**End state (decision record, Kip 2026-06-11): §3.4 Option B2 — full canonicalization, no grandfathered strings.** That
lands as [OMN-159](https://linear.app/omnifocus-mcp/issue/OMN-159): all script errors normalized into the canonical
`ScriptResult` error with one documented context vocabulary, `'Legacy script error'` dropped (accepted breaking change),
and internal matchers (failure-log tooling, the weekly diagnose-failures job) checked and updated. Mechanical
preservation in this ticket is what makes OMN-159 the single attributable diff for the error-surface change.

One interception moves between layers and needs an explicit contract: `{success: false}` shapes are caught today in
`base.ts` (`checkObjectForError` emits the script's own `context` field; `isLegacyScriptError` emits
`'Legacy script error'`). Post-inversion, `executeJson` intercepts them instead and must preserve the same precedence:
use the script's own `context` field when present, else `'Legacy script error'`. The unit suite pins both context
strings.

### 3.5 `BaseTool.execJson` simplification

After inversion, `executeJson` returns a fully-resolved `ScriptResult` in all cases, so `execJson` stops second-guessing
it. Remove the now-redundant shape-sniffing: `isRawSuccessResponse`, `checkObjectForError`, `parseStringResult`, the
nested `isLegacyScriptError` re-check, and the `// Default: wrap as success` fallthrough. Before deleting exported
helpers, grep for external usages (tests import some of them). The `omni.execute` fallback branch (for mocks that lack
`executeJson`) follows the same rule: validate via the provided schema or fail.

### 3.6 Delete `executeTyped` (rider — decision record, Kip 2026-06-11: v1 §7 residual 1a)

`executeTyped` has zero call sites and the inversion makes it fully redundant — and leaving a second, schema-optional
execution path open contradicts the no-opt-outs rule (3.3). Delete it in this ticket: the method, the mock references in
`tests/support/setup-unit.ts`, **and `normalizeToEnvelope`** (reviewer finding: `executeTyped` is its only consumer, so
it orphans the moment the method goes). `JxaEnvelopeSchema` stays — 3.1 step 1 reuses its `ok: false` branch
**detect-only** (no unwrapping of success envelopes, per the Alternative-C rejection in §8). Grep for any other
references before deleting (the ts-prune cascade rule: boundary deletions can unmask further orphans — note them, do not
chase them in this PR).

## 4. Testing

| Layer                 | Cases                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — `executeJson`  | The ticket's required case: an unrecognized error shape (e.g. `{failure: {code: 9, reason: "..."}}`) must NOT return success. Plus: each known error shape → error with extracted message; valid family payload → success; top-level-drifted payload → error with raw text in details; bare error string → error; null → error. |
| Unit — family schemas | Per family: representative success payload passes; payload missing the discriminating top-level key fails; payload with an unexpected EXTRA top-level key fails (closed-world — the hybrid `{tasks: [...], error: "..."}` case).                                                                                                |
| Unit — existing       | `OmniAutomation.test.ts` and tool tests that mock `executeJson` updated for the required-schema signature.                                                                                                                                                                                                                      |
| Integration           | Full live suite (`npm run test:integration`, run_in_background per the orphan-class rule) as the regression gate — the real protection against a too-strict schema breaking a working read.                                                                                                                                     |

Test discipline per repo norms: behavioral assertions at the executed seam, not string emission; mutation-verify on the
new detection logic (revert → red → restore).

## 5. Sequencing — the four-ticket arc

| Ticket                                                    | Scope                                                                                                                                                      | Depends on               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **OMN-139** (this spec's implementation)                  | Inversion: required schema, fail-closed detection, top-level closed-world family schemas, mechanical error-semantics preservation, `executeTyped` deletion | —                        |
| [OMN-158](https://linear.app/omnifocus-mcp/issue/OMN-158) | Leaf-strict schemas (full field inventories, optionality audit)                                                                                            | OMN-139                  |
| [OMN-159](https://linear.app/omnifocus-mcp/issue/OMN-159) | Canonical error surface, B2 (drop `'Legacy script error'`, update internal matchers)                                                                       | OMN-139                  |
| [OMN-160](https://linear.app/omnifocus-mcp/issue/OMN-160) | Unify success-output shapes across families (low priority)                                                                                                 | OMN-139; ideally 158/159 |

OMN-158 and OMN-159 are independent of each other. The decomposition exists for attribution: each behavioral change
lands where a regression can be blamed on exactly one cause.

Within OMN-139: one PR if reviewable; if it balloons, slice by tool file (write → read → analyze), OMN-128 style. The
signature change (3.1) lands **last or simultaneously** — it is the compile-time proof of full coverage, so it cannot
precede the call-site migration.

## 6. Risks

| Risk                                                                                                | Mitigation                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A wrong schema converts a working read's silent success into a loud failure of a _correct_ response | Top-level-only strictness; full integration suite pre-merge; error preserves raw output (2000 chars) so a false positive is a one-line schema fix. A loud false positive is recoverable; the current silent false negative is invisible. |
| Caller-visible error-path changes (3.4)                                                             | Per-call-site error-flow mapping in the plan; wire-observable strings preserved verbatim.                                                                                                                                                |
| Missed call site                                                                                    | Impossible by construction — required parameter = compile error.                                                                                                                                                                         |
| Mock-based unit tests mask seam behavior                                                            | Integration suite + mutation-verify; reviewer checks the "driven the way the real caller drives it" rule.                                                                                                                                |

## 7. Non-goals (for this ticket — most former non-goals became tickets, see §5)

- **Leaf-level payload validation** → now [OMN-158](https://linear.app/omnifocus-mcp/issue/OMN-158), not a non-goal.
- **Error-surface canonicalization** → now [OMN-159](https://linear.app/omnifocus-mcp/issue/OMN-159).
- **Unifying success-output families** → now [OMN-160](https://linear.app/omnifocus-mcp/issue/OMN-160).
- **`executeViaUrlScheme` / `executeBatch`** remain out of scope entirely. Different seams; `executeBatch` wraps
  `execute` (not `executeJson`) and has no JSON-shape contract.

## 8. Alternatives considered

| Alternative                                                                                                                        | Why not                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B) Conservative error-smell heuristic** (truthy `error` key, `message`+`stack`, `Error:`-prefixed strings) at the existing seams | Fails open for shapes with no error signal at all; keeps three layers of shape-sniffing alive. Was the ticket's minimum-viable fallback; superseded by the audit showing full inversion is ~6 family schemas, not an OMN-128-scale migration. Kip explicitly chose the stable interface over the smaller diff (2026-06-11).        |
| **C) Centralize detection in `normalizeToEnvelope`**                                                                               | Same behavior as B routed through one function; needs a detect-only mode because `executeJson` must not unwrap success envelopes (mutation launcher comment warns callers depend on raw shapes, grep `double-wrap under` in `src/contracts/ast/mutation-script-builder.ts`). More refactor surface for the same fail-open residue. |
| **Central allow-list registry** (one union schema checked inside `executeJson`)                                                    | A new central list that must be extended per script — rots like the deny-list did, just loudly. Per-call-site schemas put the declaration next to the script that produces the shape and make the TS type parameter load-bearing.                                                                                                  |

### Decision log (section-by-section review with Kip, 2026-06-11)

| Decision           | Chosen                                                                                                         | Rejected                                                                                    | Why                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| §3.2 strictness    | Option 2: fully strict incl. leaves, staged via OMN-158; closed-world top level in this ticket                 | Top-level-only end state; typed-but-open leaves                                             | Stable interface worth the audit cost; partial leaf validation invites false confidence |
| §3.4 error surface | Option B2: full canonicalization via OMN-159, no grandfathered strings; mechanical preservation in this ticket | A: permanent preservation; B1: grandfather `'Legacy script error'`; C: minimal preservation | One clean vocabulary; breaking change accepted knowingly with internal matchers updated |
| v1 §7 residual 1   | 1a: delete `executeTyped` in this ticket                                                                       | 1b: separate cleanup ticket                                                                 | A second schema-optional execution path contradicts no-opt-outs                         |
| v1 §7 residual 2   | 2b: file OMN-160 now                                                                                           | 2a: defer indefinitely                                                                      | Decomposition makes the follow-up cheap to file while context is fresh                  |
