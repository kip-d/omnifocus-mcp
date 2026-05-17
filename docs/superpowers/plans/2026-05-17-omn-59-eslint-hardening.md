# OMN-59 ESLint Rule Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all four parts of OMN-59 — close the SystemTool annotation-text enforcement gap, rename 12 camelCase response-metadata keys to snake_case, document two rule assumptions, and flip the response-contract ESLint rules from `warn` to `error` with `lint:strict` green.

**Architecture:** Test-first. Lock the SystemTool gap fix with a RuleTester regression test (red→green), then make the minimal `eslint-rules/index.js` regex change, then the mechanical metadata-key rename, then the documenting comments + conditional regex tweak, then the `eslint.config.js` severity flip. Each task is independently verifiable via `npm run lint` / `npm run lint:strict` / `npm run test:unit`.

**Tech Stack:** TypeScript, ESLint 9 flat config, custom rules in `eslint-rules/index.js`, ESLint `RuleTester` wired into vitest (harness established by PR #7), `@typescript-eslint/parser`.

**Spec:** `docs/superpowers/specs/2026-05-17-omn-59-eslint-hardening-design.md`

---

## File Structure

| File | Responsibility | Action |
| ---- | -------------- | ------ |
| `tests/unit/eslint-rules/use-standard-response.test.ts` | RuleTester coverage for `use-standard-response`: SystemResponse-alias gap + StandardResponseV2 regression guard + valid case | Create |
| `eslint-rules/index.js` | `use-standard-response` (~line 72) and `use-handle-error` (~line 111) annotation-text gate; `export-zod-schema` inline-only comment (~line 189) | Modify |
| `src/tools/unified/OmniFocusAnalyzeTool.ts` | 12 camelCase metadata keys at 4 `createAnalyticsResponseV2` emit-sites | Modify |
| `eslint.config.js` | rule severities (lines 141–143, 154); double-gate comment (~line 150) | Modify |

---

## Task 1: Lock the SystemTool gap with a failing RuleTester test

**Files:**
- Create: `tests/unit/eslint-rules/use-standard-response.test.ts`
- Reference (mirror harness): `tests/unit/eslint-rules/metadata-snake-case.test.ts:1-21`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/eslint-rules/use-standard-response.test.ts`. Note the two differences from the metadata-snake-case test: (a) this rule reads `fn.returnType`, so `RuleTester` MUST use `@typescript-eslint/parser`; (b) the rule is filename-gated (`/tools/` + `*Tool.ts`), so every case MUST set `filename`.

```ts
import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import plugin from '../../../eslint-rules/index.js';

// Wire ESLint's RuleTester into vitest's runner (see metadata-snake-case.test.ts).
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rule = (plugin as { rules: Record<string, unknown> }).rules['use-standard-response'];
if (!rule) {
  throw new Error('use-standard-response rule not found on plugin export');
}

// This rule inspects TS return-type annotations (fn.returnType) — espree
// cannot parse those; the typescript-eslint parser is required or the rule
// silently never engages (vacuous green).
const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
});

// The rule is gated to files matching /tools/ AND ending in Tool.ts.
const FILENAME = 'src/tools/system/SystemTool.ts';

ruleTester.run('use-standard-response', rule as never, {
  valid: [
    {
      // SystemResponse-alias method that DOES use a builder — must not report,
      // and (post-fix) proves the rule engages on the alias without false-firing.
      filename: FILENAME,
      code: 'class T { async f(): Promise<SystemResponse> { return createSuccessResponseV2("op", {}); } }',
    },
  ],
  invalid: [
    {
      // GAP BEING CLOSED: SystemResponse is a type alias for StandardResponseV2.
      // The substring gate missed it, so this bare {success,data} return was
      // silently unchecked. Must report after the fix.
      filename: FILENAME,
      code: 'class T { async f(): Promise<SystemResponse> { return { success: true, data: {} }; } }',
      errors: [{ messageId: 'useStandardResponse' }],
    },
    {
      // REGRESSION GUARD: a StandardResponseV2-annotated method must STILL be
      // checked after the gate change. Locks against the trailing-\b class of
      // regression (would match SystemResponse but break StandardResponseV2).
      filename: FILENAME,
      code: 'class T { async f(): Promise<StandardResponseV2<Foo>> { return { success: true, data: {} }; } }',
      errors: [{ messageId: 'useStandardResponse' }],
    },
  ],
});
```

- [ ] **Step 2: Run the test to verify it fails (red)**

Run: `npx vitest run tests/unit/eslint-rules/use-standard-response.test.ts`
Expected: FAIL. The first `invalid` case (`Promise<SystemResponse>`) reports "Should have 1 error but had 0" — the current substring gate `annText.includes('StandardResponse')` skips the alias. (The `StandardResponseV2` regression-guard case already passes; the valid case already passes.)

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/eslint-rules/use-standard-response.test.ts
git commit -m "test(OMN-59): failing RuleTester case for use-standard-response SystemResponse-alias gap"
```

---

## Task 2: Fix the SystemTool annotation-text gap (#2)

**Files:**
- Modify: `eslint-rules/index.js:72` (`use-standard-response`) and `eslint-rules/index.js:111` (`use-handle-error`)

- [ ] **Step 1: Replace the gate in `use-standard-response` (line ~72)**

Current line (inside the `ReturnStatement` handler):
```js
            const annText = context.sourceCode.getText(fn.returnType);
            if (!annText.includes('StandardResponse')) return;
```
Replace the `if` line with:
```js
            // Response-contract type names whose presence in a method's
            // return-type annotation means the method produces a tool response
            // and is subject to this rule. `SystemResponse` (SystemTool.ts) is
            // a type alias for StandardResponseV2; matched explicitly because
            // the old substring check missed it. NO trailing \b — plain
            // `StandardResponse` must still match the longer `StandardResponseV2`
            // (no word boundary exists between `...Response` and `V2`); a
            // trailing \b would silently stop enforcing the ~8 methods annotated
            // StandardResponseV2<...> that are checked today.
            if (!/\b(StandardResponse|SystemResponse)/.test(annText)) return;
```

- [ ] **Step 2: Replace the identical gate in `use-handle-error` (line ~111)**

The `use-handle-error` rule has the same two lines inside its `CatchClause` handler:
```js
            const annText = context.sourceCode.getText(fn.returnType);
            if (!annText.includes('StandardResponse')) return;
```
Apply the same replacement (the same comment + `if (!/\b(StandardResponse|SystemResponse)/.test(annText)) return;`).

- [ ] **Step 3: Run the test to verify it passes (green)**

Run: `npx vitest run tests/unit/eslint-rules/use-standard-response.test.ts`
Expected: PASS (valid + both invalid cases).

- [ ] **Step 4: Verify no new violations surfaced (executeValidated conforms)**

Run: `npm run lint:strict 2>&1 | grep -oE "local-rules/[a-z-]+" | sort | uniq -c`
Expected: exactly `12 local-rules/metadata-snake-case` and nothing else. If any `use-standard-response` / `use-handle-error` lines appear, STOP — the spec's "executeValidated conforms" premise is violated; do not proceed, surface to the human.

- [ ] **Step 5: Commit**

```bash
git add eslint-rules/index.js
git commit -m "fix(OMN-59): use-standard-response/use-handle-error recognize the SystemResponse alias"
```

---

## Task 3: Rename the 12 metadata keys to snake_case (#1)

**Files:**
- Modify: `src/tools/unified/OmniFocusAnalyzeTool.ts` (4 `createAnalyticsResponseV2` metadata emit-sites: `productivity_stats` ~485; `task_velocity` cached ~671 and fresh ~729; `analyze_overdue` ~930)

- [ ] **Step 1: Rename keys at all 4 emit-sites**

In each `createAnalyticsResponseV2(...)` metadata object literal, rename ONLY the key (leave the value expression unchanged):

| camelCase key | → snake_case key |
| ------------- | ---------------- |
| `includeProjectStats` | `include_project_stats` |
| `includeTagStats` | `include_tag_stats` |
| `startDate` | `start_date` |
| `endDate` | `end_date` |
| `groupBy` | `group_by` |
| `includeWeekends` | `include_weekends` |
| `includeCompleted` | `include_completed` |

These are shorthand or `key: value` properties inside the metadata object. Examples of the exact edits:
- `includeProjectStats,` → `include_project_stats: includeProjectStats,`
- `includeTagStats,` → `include_tag_stats: includeTagStats,`
- `startDate: rangeStart,` → `start_date: rangeStart,`
- `endDate: rangeEnd,` → `end_date: rangeEnd,`
- `groupBy,` → `group_by: groupBy,`
- `includeWeekends,` → `include_weekends: includeWeekends,`
- `includeCompleted: includeRecentlyCompleted,` → `include_completed: includeRecentlyCompleted,`

Do NOT rename the local variables, input-parameter names, schema fields, or data-payload keys — only the metadata object keys at these 4 `createAnalyticsResponseV2` calls. Use `npm run lint` (Step 2) to confirm exactly the 12 expected warnings disappear.

- [ ] **Step 2: Verify the 12 warnings are gone**

Run: `npm run lint:strict 2>&1 | grep -c "local-rules/metadata-snake-case" || echo 0`
Expected: `0`.
Run: `npm run lint 2>&1 | grep -oE "[0-9]+ problems? \([0-9]+ errors?, [0-9]+ warnings?\)" | tail -1`
Expected: `0 problems (0 errors, 0 warnings)`.

- [ ] **Step 3: Verify no behavior/test regression**

Run: `npm run build` — Expected: exit 0.
Run: `npm run test:unit 2>&1 | grep -E "Test Files|Tests "` — Expected: all pass (count = prior 1877 baseline + the new `use-standard-response.test.ts` cases; no failures). If any analytics test fails asserting `metadata.<oldKey>`, that contradicts the spec's "no consumer" finding — STOP and surface.

- [ ] **Step 4: Commit**

```bash
git add src/tools/unified/OmniFocusAnalyzeTool.ts
git commit -m "fix(OMN-59): snake_case the 12 analytics response-metadata keys"
```

---

## Task 4: Minor hardening — documenting comments + conditional regex tweak (#3)

**Files:**
- Modify: `eslint-rules/index.js` (`export-zod-schema`, ~line 189)
- Modify: `eslint.config.js` (~line 150, the `src/tools/**/schemas/**` block)

- [ ] **Step 1: Document the `export-zod-schema` inline-only assumption**

In `eslint-rules/index.js`, immediately above the `export-zod-schema` filename gate (`if (!filename.includes('/schemas/') || !filename.endsWith('.ts')) return {};`), add:
```js
        // ASSUMPTION: detects only inline `export const XSchema = ...`. All
        // schema files use that form today; `export { XSchema }` / re-export
        // forms are intentionally not handled (YAGNI — no such file exists).
```

- [ ] **Step 2: Document the deliberate double-gate**

In `eslint.config.js`, inside the `{ files: ['src/tools/**/schemas/**/*.ts', ...] }` block (the one whose rules set `local-rules/export-zod-schema`), add a comment above the `files:` line:
```js
    // Double-gate is deliberate: this config glob scopes the rule to schema
    // dirs, and the rule body re-checks `filename.includes('/schemas/')` so it
    // stays correct if applied via a broader config. Keep both in sync.
```

- [ ] **Step 3: Conditional `metadata-snake-case` leading-capital tweak**

Locate the camelCase detection in `metadata-snake-case` (regex `/[a-z][A-Z]/` on metadata keys). Change the predicate so a key is flagged unless it matches strict snake_case `^[a-z0-9]+(_[a-z0-9]+)*$` (this also catches leading-capital keys like `HTTPStatus`).
Then run: `npm run lint:strict 2>&1 | grep -oE "local-rules/[a-z-]+" | sort | uniq -c`
- If output is empty (zero warnings): KEEP the tweak.
- If ANY warning appears: REVERT the predicate change (restore `/[a-z][A-Z]/`) and add a one-line code comment: `// Leading-capital keys (e.g. HTTPStatus) intentionally not flagged — tightening the predicate surfaced pre-existing keys; deferred to avoid blocking the warn→error flip (OMN-59).`

- [ ] **Step 4: Verify still clean**

Run: `npm run lint:strict 2>&1 | grep -oE "local-rules/[a-z-]+" | sort | uniq -c || echo "0 (clean)"`
Expected: `0 (clean)` (no local-rules warnings).
Run: `npx vitest run tests/unit/eslint-rules/` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add eslint-rules/index.js eslint.config.js
git commit -m "docs(OMN-59): document export-zod-schema + double-gate assumptions; metadata-snake-case predicate (conditional)"
```

---

## Task 5: Flip warn→error and restore lint:strict green (#4)

**Files:**
- Modify: `eslint.config.js:141`, `:142`, `:143`, `:154`

- [ ] **Step 1: Flip severities**

In `eslint.config.js`, change each `'warn'` to `'error'`:
- line 141: `'local-rules/use-standard-response': 'warn',` → `'error',`
- line 142: `'local-rules/use-handle-error': 'warn',` → `'error',`
- line 143: `'local-rules/metadata-snake-case': 'warn',` → `'error',`
- line 154: `'local-rules/export-zod-schema': 'warn',` → `'error',`

- [ ] **Step 2: Verify CI lint gate stays green (errors-only)**

Run: `npm run lint 2>&1 | grep -oE "[0-9]+ problems? \([0-9]+ errors?, [0-9]+ warnings?\)" | tail -1`
Expected: `0 problems (0 errors, 0 warnings)`. (CI gate is ≤50 errors; 0 is green.)

- [ ] **Step 3: Verify lint:strict restored to green**

Run: `npm run lint:strict; echo "exit=$?"`
Expected: `exit=0` (no warnings, no errors).

- [ ] **Step 4: Full verification**

Run: `npm run build` — Expected: exit 0.
Run: `npm run test:unit 2>&1 | grep -E "Test Files|Tests "` — Expected: all pass, no failures.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js
git commit -m "chore(OMN-59): flip response-contract local rules warn→error; lint:strict green"
```

---

## Task 6: Final verification gate

- [ ] **Step 1: Run the complete verification matrix**

```bash
npm run build
npm run test:unit
npm run lint
npm run lint:strict
npx vitest run tests/unit/eslint-rules/
```
Expected: build exit 0; all unit tests pass; `npm run lint` = 0 errors; `lint:strict` exit 0; eslint-rules tests green (incl. `use-standard-response.test.ts`).

- [ ] **Step 2: Confirm scope discipline**

`git diff main...HEAD --stat` should touch only: `tests/unit/eslint-rules/use-standard-response.test.ts`, `eslint-rules/index.js`, `src/tools/unified/OmniFocusAnalyzeTool.ts`, `eslint.config.js`, and the spec/plan docs. No input-parameter, schema, or data-payload renames. No OMN-54 work.

---

## Post-plan (project convention — handled at execution handoff, not a plan task)

PR to `kip-d/omnifocus-mcp` cross-referencing OMN-59; mandatory code-reviewer subagent gated on a SAFE verdict; `gh pr merge --squash --auto` (never `--admin`); then comment + close OMN-59 (all four parts delivered; note pointer `kCI0AtWNycZ` addressed) and clean up the worktree/branch.
