# OMN-59 — ESLint rule hardening: clear 12 snake_case warnings, fix SystemTool annotation gap, flip warn→error

Date: 2026-05-17
Linear: OMN-59
Status: Design approved (2026-05-17), pending spec review

## Problem

Three coupled ESLint-rule issues block tightening the response-contract rules from advisory (`warn`) to
enforced (`error`):

1. **12 camelCase metadata keys.** `src/tools/unified/OmniFocusAnalyzeTool.ts` passes camelCase keys into
   the `createAnalyticsResponseV2` *metadata* envelope at 4 emit-sites across 3 analysis types
   (`productivity_stats`; `task_velocity` in both its cached and fresh paths; `analyze_overdue`). They sit
   beside already-snake_case
   metadata keys (`from_cache`, `query_time_ms` via `timer.toMetadata()`), so they are a genuine
   inconsistency, not an aged-out rule premise. PR #7 (`0683d6f`) added `createAnalyticsResponseV2` to the
   rule's `METADATA_ARG_INDEX`, which is what surfaced these 12 as warnings.
2. **SystemTool annotation-text gap.** `use-standard-response` and `use-handle-error` only enforce inside
   methods whose return-type annotation *text* contains the substring `StandardResponse`
   (`eslint-rules/index.js`). `SystemTool.executeValidated` is annotated `Promise<SystemResponse>` where
   `SystemResponse` is a type alias (`SystemTool.ts:87`) for `StandardResponseV2<...>`. The substring is
   absent, so both rules **silently skip the entire SystemTool dispatch method**.
3. **Rules stuck at `warn`.** Until #1 and #2 are resolved, `metadata-snake-case`,
   `use-standard-response`, and `use-handle-error` cannot be flipped to `error` and `lint:strict` cannot
   be restored to green.

## Investigated facts (basis for the design)

- The 12 keys are purely informational echo in the response *metadata* envelope. Verified: **no test and
  no internal code** reads them as response-metadata keys (grep across `tests/` and `src/` returns only
  input-parameter / schema / data-payload references, never `result.metadata.<key>` assertions).
- `executeValidated` (`SystemTool.ts:163`) returns only delegated method calls
  (`getVersion()/runDiagnostics()/getMetrics()/handleCacheOperation()`) plus one
  `createErrorResponseV2(...)` in the `default` branch, and has **no `catch` block**. Once the heuristic
  is widened it will be checked and **passes with zero new violations** — no SystemTool code change
  required.
- `npm run lint:strict` (all local rules, `--max-warnings=0`) on current `main` reports **exactly 12
  warnings, all `metadata-snake-case`, and nothing else**. After the rename + #2 fix, flipping the three
  rules to `error` yields **0 errors** → `lint:strict` green, CI green (CI gates on `npm run lint` error
  count ≤ 50; warnings excluded).

## Scope

In scope (full OMN-59):

1. Rename the 12 response-metadata keys to snake_case.
2. Fix the SystemTool annotation-text gap in the two rules.
3. Minor rule hardening (documented assumptions; conditional regex tweak).
4. Flip the rules `warn`→`error`; restore `lint:strict` to green.
5. Add a RuleTester regression test locking fix #2.

Out of scope (correctly):

- OMN-54 (the meta-check that rules with empty monitored sets should fail) — separate ticket.
- Any rename of *input-parameter* names or *data-payload* keys. Only response `metadata` keys change.
- Type-aware (`parserServices`) linting — not wired in this ESLint config; YAGNI given one alias.

## Design

### 1. Rename 12 metadata keys — `src/tools/unified/OmniFocusAnalyzeTool.ts`

Rename in the `createAnalyticsResponseV2` metadata objects at the 3 call-sites (`productivity_stats`
~485; `task_velocity` cached ~671 and fresh ~729; `analyze_overdue` ~930):

| camelCase (current)   | snake_case (new)         |
| --------------------- | ------------------------ |
| `includeProjectStats` | `include_project_stats`  |
| `includeTagStats`     | `include_tag_stats`      |
| `startDate`           | `start_date`             |
| `endDate`             | `end_date`               |
| `groupBy`             | `group_by`               |
| `includeWeekends`     | `include_weekends`       |
| `includeCompleted`    | `include_completed`      |

Only the metadata *key* changes; the value expression (e.g. `rangeStart`, `groupBy`, `includeWeekends`
local variables) is unchanged — `start_date: rangeStart`, `group_by: groupBy`, etc. This is the only
client-visible change and is confined to diagnostic response metadata.

### 2. Fix SystemTool annotation-text gap — `eslint-rules/index.js`

In both `use-standard-response` and `use-handle-error`, replace the brittle substring gate:

```js
if (!annText.includes('StandardResponse')) return;
```

with a named-response-contract-type regex:

```js
// Response-contract type names whose presence in a method's return-type
// annotation means the method produces a tool response and is subject to
// this rule. `SystemResponse` (SystemTool.ts) is a type alias for
// StandardResponseV2; matched explicitly because the substring check missed it.
// NOTE: NO trailing \b — `StandardResponse` must still match the longer
// `StandardResponseV2` (no word boundary exists between `...Response` and
// `V2`). A trailing \b would silently stop enforcing the ~8 methods annotated
// `StandardResponseV2<...>` that are checked today — the exact regression this
// fix must avoid.
const RESPONSE_CONTRACT_TYPES = /\b(StandardResponse|SystemResponse)/;
if (!RESPONSE_CONTRACT_TYPES.test(annText)) return;
```

The leading `\b` anchors to the type-name start (annotations read `Promise<StandardResponseV2<...>>` /
`Promise<SystemResponse>`, so the char before is `<`, a non-word char — boundary holds). **No trailing
`\b`**: `\bStandardResponse` matches `StandardResponse`, `StandardResponseV2`, and any future
`StandardResponseV3`; `\bSystemResponse` matches the alias. This preserves today's enforcement on all
`StandardResponseV2`-annotated methods and additionally closes the `SystemResponse` gap. Chosen over
type-aware `parserServices` because exactly one alias exists and typed linting is not configured (YAGNI,
low risk). The naming comment also discharges one #3 hardening item (documenting the gate's assumption).

### 3. Minor hardening

- **`export-zod-schema` inline-only assumption:** add a one-line comment in the rule stating it detects
  only inline `export const XSchema =` and that all 9 schema files use that form. No speculative
  `ExportSpecifier`/`ExportAllDeclaration` branch (YAGNI — "works today" per the ticket).
- **`eslint.config.js` ↔ rule double-gate:** add a one-line comment noting the deliberate double-gate
  between the config glob and the in-rule `filename.includes('/schemas/')` check.
- **`metadata-snake-case` leading-capital regex (`HTTPStatus`):** conditional. After steps 1–2, change
  the detection predicate and re-run `npm run lint:strict`. Ship the tweak **only if** the warning set is
  still exactly the expected zero (no unexpected new warnings). If it surfaces anything, do **not** ship
  the tweak; leave a one-line code comment recording the deferral and rationale (changing the detection
  predicate is the one change that could break the clean `warn`→`error` flip). This item must not gate
  the rest of OMN-59.

### 4. Flip warn→error — `eslint.config.js`

Change `local-rules/use-standard-response`, `local-rules/use-handle-error`,
`local-rules/metadata-snake-case` from `'warn'` to `'error'`. Also flip
`local-rules/export-zod-schema` to `'error'` for consistency (verified 0 warnings, so safe). Result:
`lint:strict` green; `npm run lint` 0 errors.

### 5. Regression test — `tests/unit/eslint-rules/`

Using the RuleTester→vitest harness merged in PR #7, add tests for the relevant rule
(`use-standard-response` and/or `use-handle-error`) covering **both**:

1. **The gap being closed:** the rule fires inside a method whose return type is an alias resolving to
   the response contract (the `Promise<SystemResponse>` shape) — red against the pre-fix substring gate,
   green after.
2. **The regression guard:** the rule still fires inside a method annotated
   `Promise<StandardResponseV2<...>>` — this locks specifically against the trailing-`\b` class of
   regression (a boundary bug that would match `SystemResponse` but break `StandardResponseV2`). A valid
   case (a properly-conforming method) should also be present so the suite is non-vacuous.

Co-locate with or extend the existing `tests/unit/eslint-rules/metadata-snake-case.test.ts` pattern
(separate rule → a sibling test file for the relevant rule).

## Verification

1. `npm run build` — exit 0.
2. `npm run test:unit` — expect 1877 → still green (rename touches no logic; no test asserts these
   metadata keys; the new RuleTester case adds to the count).
3. `npm run lint` — 0 errors.
4. `npm run lint:strict` — 0 warnings (green).
5. The eslint-rules RuleTester suite green, including the new #2 regression case.

## Risks and mitigations

| Risk | Mitigation |
| ---- | ---------- |
| A consumer relies on a camelCase metadata key | Verified none in tests/src; metadata is diagnostic, not contract-load-bearing. Accepted by the user as the chosen approach. |
| #3 regex tweak surfaces new warnings, breaking the flip | Made conditional and explicitly non-gating; ship only if `lint:strict` stays clean. |
| #2 heuristic widening surfaces real violations in SystemTool | Pre-verified: `executeValidated` conforms; zero new violations. |
| Future response-type alias reintroduces the gap | Regression test (step 5) + the documenting comment naming the gated types. |

## Linear

On completion: comment OMN-59 with the resolution and **close it** (all four parts delivered). The
follow-up pointer `kCI0AtWNycZ` referenced for item #2 can be noted as addressed.
