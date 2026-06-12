# OMN-139 Success Allow-List Inversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invert script-output detection in `OmniAutomation.executeJson` from an error deny-list to a success
allow-list: a required Zod schema per call site, fail-closed on anything that matches neither a known error shape nor
the success schema.

**Architecture:** A pure classifier (`detectKnownErrorShape`) intercepts the three known error dialects first; a
required success schema validates everything else; unmatched output becomes a loud `ScriptError` with raw output
preserved. Family schemas (closed-world top level, lenient leaves, **literal discriminators**) live in a new
`script-response-schemas.ts`. `BaseTool.execJson` threads the schema through and loses its shape-sniffing arsenal.
`executeTyped` + `normalizeToEnvelope` die (zero consumers post-inversion). The required-parameter signature flip lands
LAST as the compile-time coverage proof.

**Tech Stack:** TypeScript, Zod, Vitest. Spec: `docs/superpowers/specs/2026-06-11-omn-139-success-allowlist-design.md`
(READ IT FIRST — §3.1 detection order, §3.2 schema rules, §3.4 error-semantics preservation are normative).

**Worktree:** `/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-139`, branch `worktree-omn-139`. All commands run from
there.

---

## Non-negotiable constraints (from spec)

1. **Detection order:** known error shapes → success schema → fail closed. Never reorder.
2. **Discriminating keys are literals** (`z.literal(true)`), never `z.boolean()`.
3. **Success schemas model the success branch only** — no `error`/optional-error keys in them.
4. **Top-level closed-world** (`.strict()`); leaves lenient (`z.unknown()`, `.passthrough()`). Leaf-strict is OMN-158,
   NOT this ticket.
5. **Mechanical error-semantics preservation:** `'Legacy script error'` context string preserved verbatim; every
   caller's user-visible error result same or better. Canonicalization is OMN-159, NOT this ticket.
6. **No opt-outs:** every call site gets a real schema. `z.unknown()` as a whole-result schema is forbidden.
7. **This ticket is one PR.** Commit per task. Signature flip (Task 9) lands last.

## File map

| File                                                   | Action                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/omnifocus/script-result-types.ts`                 | Add `detectKnownErrorShape` + `truncateRawOutput`                        |
| `src/omnifocus/script-response-schemas.ts`             | **Create** — family schemas + factories                                  |
| `src/omnifocus/OmniAutomation.ts`                      | Rewrite `executeJson`; delete `executeTyped`                             |
| `src/tools/base.ts`                                    | Thread schema through `execJson`; delete sniffing helpers                |
| `src/tools/unified/OmniFocusWriteTool.ts`              | 15 call sites + schema imports                                           |
| `src/tools/unified/OmniFocusReadTool.ts`               | 13 call sites                                                            |
| `src/tools/unified/OmniFocusAnalyzeTool.ts`            | 14 call sites                                                            |
| `src/utils/safe-io.ts`                                 | Delete `normalizeToEnvelope` (keep `JxaEnvelopeSchema`, `safeStringify`) |
| `tests/unit/omnifocus/script-result-types.test.ts`     | **Create** — classifier tests                                            |
| `tests/unit/omnifocus/script-response-schemas.test.ts` | **Create** — family schema tests                                         |
| `tests/unit/omnifocus/OmniAutomation.test.ts`          | New detection-order cases; remove executeTyped refs                      |
| `tests/unit/tools/base-type-guards.test.ts`            | Shrink to surviving exports                                              |
| `tests/support/setup-unit.ts`                          | Update mocks (drop executeTyped; executeJson gains schema arg)           |

---

### Task 1: Known-error-shape classifier (`detectKnownErrorShape`)

**Files:**

- Modify: `src/omnifocus/script-result-types.ts`
- Create: `tests/unit/omnifocus/script-result-types.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { detectKnownErrorShape, truncateRawOutput } from '../../../src/omnifocus/script-result-types.js';

describe('detectKnownErrorShape', () => {
  it('detects legacy {error: true} with verbatim wire context', () => {
    const r = detectKnownErrorShape({ error: true, message: 'boom', details: 'ctx' });
    expect(r).toEqual({ success: false, error: 'boom', context: 'Legacy script error', details: 'ctx' });
  });

  it("detects legacy {error: 'true'} (stringified by the bridge)", () => {
    const r = detectKnownErrorShape({ error: 'true', message: 'boom' });
    expect(r?.success).toBe(false);
    expect(r?.context).toBe('Legacy script error');
  });

  it('detects the modern envelope error {ok: false, error: {message}, v}', () => {
    const r = detectKnownErrorShape({ ok: false, error: { message: 'bridge died' }, v: '3' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('bridge died');
  });

  it('detects {success: false} and prefers the script-supplied context field', () => {
    const r = detectKnownErrorShape({ success: false, message: 'no project', context: 'projects_for_review' });
    expect(r?.success).toBe(false);
    expect(r?.error).toBe('no project');
    expect(r?.context).toBe('projects_for_review'); // spec §3.4 precedence
  });

  it("falls back to 'Legacy script error' context for {success: false} without context", () => {
    const r = detectKnownErrorShape({ success: false, error: 'mark failed' });
    expect(r?.error).toBe('mark failed');
    expect(r?.context).toBe('Legacy script error');
  });

  it('returns null for success shapes and non-errors', () => {
    expect(detectKnownErrorShape({ ok: true, v: '3', data: {} })).toBeNull();
    expect(detectKnownErrorShape({ tasks: [] })).toBeNull();
    expect(detectKnownErrorShape({ error: false, count: 3 })).toBeNull();
    expect(detectKnownErrorShape('Error: timeout')).toBeNull(); // strings are NOT a known shape — schema handles them
    expect(detectKnownErrorShape(null)).toBeNull();
    expect(detectKnownErrorShape({ error: 'iteration aborted' })).toBeNull(); // error-as-string ≠ known shape; fails closed at schema step
  });
});

describe('truncateRawOutput', () => {
  it('truncates serialized output to 2000 chars with a marker', () => {
    const big = { blob: 'x'.repeat(5000) };
    const out = truncateRawOutput(big);
    expect(out.length).toBeLessThanOrEqual(2000 + '…[truncated]'.length);
    expect(out.endsWith('…[truncated]')).toBe(true);
  });
  it('passes short output through unchanged', () => {
    expect(truncateRawOutput({ a: 1 })).toBe('{"a":1}');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/omnifocus/script-result-types.test.ts` Expected: FAIL — `detectKnownErrorShape` is not
exported.

- [ ] **Step 3: Implement in `script-result-types.ts`**

```typescript
/**
 * Known error dialects intercepted BEFORE success-schema validation (OMN-139 §3.1 step 1).
 * Order of checks inside is irrelevant (the dialects' discriminators are disjoint);
 * the order of THIS function vs schema validation is load-bearing — see spec §3.2.
 * Returns null when the value matches no known error dialect.
 */
export function detectKnownErrorShape(value: unknown): ScriptError | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  // Modern envelope error: {ok: false, error: {message, ...}, v} (JxaEnvelopeSchema error branch)
  if (obj.ok === false) {
    const err = obj.error as Record<string, unknown> | undefined;
    const message = err && typeof err.message === 'string' ? err.message : 'Script reported an error envelope';
    return createScriptError(message, 'Script error envelope', value);
  }

  // Legacy: {error: true | 'true', message?, details?} — context string is wire-observable, preserve verbatim
  if (obj.error === true || obj.error === 'true') {
    const message = typeof obj.message === 'string' ? obj.message : 'Script execution failed';
    return createScriptError(message, 'Legacy script error', obj.details ?? 'No additional context');
  }

  // Review-script dialect: {success: false, ...} — script's own context wins (spec §3.4)
  if (obj.success === false) {
    const message =
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.error === 'string' && obj.error) ||
      'Script execution failed';
    const context = typeof obj.context === 'string' ? obj.context : 'Legacy script error';
    return createScriptError(message, context, obj.details ?? value);
  }

  return null;
}

/** Serialize raw script output for error details, truncated to keep responses bounded. */
export function truncateRawOutput(value: unknown, max = 2000): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}
```

- [ ] **Step 4: Run tests — PASS.** Run full unit suite (`npm run test:unit`) to confirm no collateral.
- [ ] **Step 5: Commit** — `feat(OMN-139): known-error-shape classifier with wire-context preservation`

---

### Task 2: Family schemas (`script-response-schemas.ts`)

**Files:**

- Create: `src/omnifocus/script-response-schemas.ts`
- Create: `tests/unit/omnifocus/script-response-schemas.test.ts`

- [ ] **Step 1: Write failing tests.** Cover, for EACH exported schema/factory: (a) representative success payload
      passes, (b) payload missing the discriminating key fails, (c) **closed-world: payload with an unexpected extra
      top-level key fails** (the hybrid `{tasks: [...], error: '...'}` case), (d) for unions, each variant passes.
      Representative payloads come from the audit appendix below — use real key sets.

```typescript
// Exemplar (repeat the pattern per schema):
import { describe, it, expect } from 'vitest';
import {
  V3EnvelopeSuccessSchema,
  listResultSchema,
  CountResultSchema,
} from '../../../src/omnifocus/script-response-schemas.js';

describe('V3EnvelopeSuccessSchema', () => {
  it('accepts {ok: true, v, data}', () => {
    expect(V3EnvelopeSuccessSchema.safeParse({ ok: true, v: '3', data: { x: 1 } }).success).toBe(true);
  });
  it('rejects ok: false (error branch is not ours to model)', () => {
    expect(V3EnvelopeSuccessSchema.safeParse({ ok: false, v: '3', error: { message: 'x' } }).success).toBe(false);
  });
  it('rejects hybrid success+error (closed world)', () => {
    expect(V3EnvelopeSuccessSchema.safeParse({ ok: true, v: '3', data: {}, error: 'partial' }).success).toBe(false);
  });
});

describe('listResultSchema', () => {
  const TasksSchema = listResultSchema(['tasks', 'items'], { metadata: true });
  it('accepts each items-key variant', () => {
    expect(TasksSchema.safeParse({ tasks: [], metadata: { total_matched: 0 } }).success).toBe(true);
    expect(TasksSchema.safeParse({ items: [] }).success).toBe(true);
  });
  it('rejects an unexpected sibling key (closed world)', () => {
    expect(TasksSchema.safeParse({ tasks: [], error: 'aborted at 50' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL (module missing).**
- [ ] **Step 3: Implement the module**

```typescript
import { z } from 'zod';

/**
 * OMN-139 family success schemas. Rules (spec §3.2 — normative):
 *  - SUCCESS BRANCH ONLY. Error branches are detectKnownErrorShape's job.
 *  - Discriminators are LITERALS (z.literal(true)), never z.boolean().
 *  - Top-level closed-world (.strict()); leaves lenient (z.unknown()). Leaf-strict = OMN-158.
 */

/** Analytics v3 + write-tool task create/update envelope: {ok: true, v, data}. */
export const V3EnvelopeSuccessSchema = z.object({ ok: z.literal(true), v: z.string(), data: z.unknown() }).strict();

/** AST envelope (tags, recurring): {ok: true, v: 'ast', <items key>, summary?, metadata?}. */
export function astEnvelopeSchema(itemsKey: 'items' | 'tasks') {
  return z
    .object({
      ok: z.literal(true),
      v: z.literal('ast'),
      [itemsKey]: z.array(z.unknown()),
      summary: z.unknown().optional(),
      metadata: z.unknown().optional(),
    })
    .strict();
}

/**
 * List/query results whose items key varies by script path (tasks|items, projects|items, …).
 * One strict variant per key, unioned. `extras` adds optional sibling keys present on some paths.
 */
export function listResultSchema(
  itemKeys: readonly string[],
  opts: { metadata?: boolean; extras?: Record<string, z.ZodTypeAny> } = {},
) {
  const variants = itemKeys.map((k) =>
    z
      .object({
        [k]: z.array(z.unknown()),
        ...(opts.metadata ? { metadata: z.unknown().optional() } : {}),
        ...(opts.extras ?? {}),
      })
      .strict(),
  );
  return variants.length === 1 ? variants[0] : z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

/**
 * countOnly result — WIRE shape from buildTaskCountScript (src/contracts/ast/script-builder.ts,
 * grep `task_count_omnijs`), NOT the caller's narrower TS cast in executeCountOnly. The caller
 * reads a subset; the schema must match what the script emits. Plan-review verified: only
 * `warning` is conditionally emitted; the rest are always present (optional here = safe, may
 * tighten to required during implementation if the suite agrees).
 */
export const CountResultSchema = z
  .object({
    count: z.number(),
    filters_applied: z.unknown().optional(),
    query_time_ms: z.unknown().optional(),
    optimization: z.unknown().optional(),
    filter_description: z.unknown().optional(),
    scanned: z.unknown().optional(),
    total_tasks: z.unknown().optional(),
    limited: z.unknown().optional(),
    warning: z.string().optional(),
  })
  .strict();

/**
 * Export results — WIRE shape: both export scripts ALWAYS emit `format`/`data`/`count`/`duration`;
 * task export adds `limited`/`message`/`debug` on various branches (csv-empty emits `message` without
 * `limited`; json emits all three); project-JSON adds `debug` (task export: script-builder.ts;
 * project export: src/omnifocus/scripts/export/export-projects.ts). Verify in source before tightening.
 */
export const ExportResultSchema = z
  .object({
    format: z.string(),
    data: z.unknown(),
    count: z.number(),
    duration: z.unknown(),
    limited: z.boolean().optional(),
    message: z.unknown().optional(),
    debug: z.unknown().optional(),
  })
  .strict();

/** Review-family success: {success: true, ...op keys}. Factory keeps the literal discriminator mandatory. */
export function reviewSuccessSchema(shape: Record<string, z.ZodTypeAny>) {
  return z.object({ success: z.literal(true), ...shape }).strict();
}

/**
 * Write-tool bare mutation results. Top-level keys enumerated from the audit
 * (docs/superpowers/plans/… appendix); values lenient. One per operation family.
 */
// Plan-review verification (2026-06-11): mutation output is NOT v3-wrapped at top level
// (wrapInLauncher returns the OmniJS payload raw; defs.ts create/update envelopes match the
// bare shape field-for-field). unwrapV3Envelope in the write tool is defensive legacy. So no
// V3EnvelopeSuccessSchema union member here — re-run the Task 5 grep to confirm before relying on it.
export const TaskWriteResultSchema = z
  .object({
    taskId: z.string(),
    name: z.string(),
    note: z.unknown().optional(),
    flagged: z.unknown().optional(),
    dueDate: z.unknown().optional(),
    deferDate: z.unknown().optional(),
    plannedDate: z.unknown().optional(),
    estimatedMinutes: z.unknown().optional(),
    tags: z.unknown().optional(),
    project: z.unknown().optional(),
    inInbox: z.unknown().optional(),
    warnings: z.unknown().optional(),
    created: z.literal(true).optional(),
    updated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.created === true || o.updated === true, { message: 'missing created/updated discriminator' });
// …continue per the call-site table in Task 5/6/7: CompleteResultSchema, DeleteResultSchema,
// BulkDeleteResultSchema, BatchCreateResultSchema, ProjectWriteResultSchema, FolderCreateResultSchema,
// TagMutationResultSchema (union over the 7 action shapes), RecurringPatternsSchema, SlimmedDataSchema, …
```

**Implementation note (HARD RULE, plan-review finding):** read the EMITTING SCRIPT SOURCE for **every** schema before
writing it — the schema code and tables in this plan are drafts, not ground truth. Three of this plan's own draft
schemas were initially transcribed from _caller-side TS casts_ and were wrong about the wire (countOnly, export,
folders) — the caller reads a subset of what scripts emit; closed-world schemas must match the emission. When a schema
test fails against a payload taken from real source, fix the schema, never loosen to whole-result `z.unknown()`.

- [ ] **Step 4: Run schema tests — PASS. Full unit suite — PASS.**
- [ ] **Step 5: Commit** — `feat(OMN-139): family success schemas (closed-world, literal discriminators)`

---

### Task 3: `executeJson` new detection (schema still optional — flip comes in Task 9)

**Files:**

- Modify: `src/omnifocus/OmniAutomation.ts` (`executeJson` body)
- Modify: `tests/unit/omnifocus/OmniAutomation.test.ts`

- [ ] **Step 1: Failing tests** (drive through the spawn-mock harness already in the file — emit stdout, close 0):
  - **The ticket's required case:** schema provided, output `{failure: {code: 9, reason: 'new shape'}}` → result
    `success: false`, context `'Unrecognized script output shape'`, details contain the raw text. MUST NOT be
    `success: true`.
  - `{ok: false, error: {message: 'x'}, v: '3'}` + any schema → error with message `'x'` (the live-hole regression
    test).
  - `{success: false, context: 'projects_for_review', message: 'm'}` + schema → error, context `'projects_for_review'`.
  - Valid payload for a sample schema → success with validated data.
  - Bare string output `Error: AppleEvent timed out` + object schema → error (string fallback closed).
  - Empty output (null) + object schema → error.
  - **No-schema path (temporary):** legacy `{error: true}` still detected; arbitrary object still succeeds (back-compat
    until Task 9 — pin it so removal in Task 9 is deliberate).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** New body order: `detectKnownErrorShape` first; then if `schema` present → `safeParse` →
      success or
      `createScriptError('Script output did not match the expected success shape', 'Unrecognized script output shape', { raw: truncateRawOutput(result), issues: validation.error.issues })`;
      if no schema (temporary) → legacy behavior (return `createScriptSuccess(result)`). Keep the existing catch-tail
      unchanged (totality).
- [ ] **Step 4: Run OmniAutomation tests + full unit suite — PASS.**
- [ ] **Step 5: Commit** — `feat(OMN-139): executeJson error-first detection + fail-closed schema path`

---

### Task 4: Thread schema through `BaseTool.execJson`

**Files:**

- Modify: `src/tools/base.ts`
- Modify: `tests/support/setup-unit.ts` (mock signature)

- [ ] **Step 1:** Change signature to `protected async execJson<T = unknown>(script: string, schema?: z.ZodSchema<T>)`
      (optional until Task 9). **Deliberately rewrite the structural-cast block** (spec §3.3 blind spot): delete the
      `as { executeJson?: ...; execute?: ... }` cast and the `omni.execute` fallback branch; call
      `this.omniAutomation.executeJson(script, schema)` directly. Keep the `res === null || res === undefined` →
      `NULL_RESULT` guard (mock safety). Keep all sniffing helpers FOR NOW (no-schema callers still exist until Tasks
      5–7 complete) — but when `schema` was passed, return `executeJson`'s result directly, skipping the sniffing.
- [ ] **Step 2:** Grep for tests mocking an omniAutomation that has `execute` but NOT `executeJson`:
      `grep -rn "execute:" tests/ --include="*.ts" | grep -v executeJson`. Fix each mock to provide `executeJson`.
      Update `tests/support/setup-unit.ts`.
- [ ] **Step 3:** `npm run build` + full unit suite — PASS.
- [ ] **Step 4: Commit** — `feat(OMN-139): execJson threads success schema; structural-cast fallback removed`

---

### Task 5: Migrate `OmniFocusWriteTool.ts` (15 sites)

**Files:** Modify `src/tools/unified/OmniFocusWriteTool.ts`; schemas added to `script-response-schemas.ts` as needed;
tests in existing write-tool unit files.

Per-site mapping (line numbers are pre-change anchors; re-grep before editing):

| Site (line)       | Method                        | Schema to pass                                                                                              |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 544               | handleTaskCreate              | `TaskWriteResultSchema`                                                                                     |
| 705               | handleTaskUpdate              | `TaskWriteResultSchema`                                                                                     |
| 868 / 1264        | complete task/project         | `CompleteResultSchema` (`{taskId\|projectId, name, completed: literal(true), completionDate}` union)        |
| 929 / 1298 / 2194 | delete task/project, rollback | `DeleteResultSchema`                                                                                        |
| 1034              | bulk delete                   | `BulkDeleteResultSchema` (`{deleted: array, errors: array, message}`)                                       |
| 1221 / 2011       | project create                | `ProjectWriteResultSchema`                                                                                  |
| 1353              | folder create                 | `FolderCreateResultSchema`                                                                                  |
| 1406              | project update direct         | `ProjectWriteResultSchema`                                                                                  |
| 1875              | batch fast-path               | `BatchCreateResultSchema` (`{results: array}`)                                                              |
| 2088              | batch task create             | `TaskWriteResultSchema`                                                                                     |
| 2302              | tag manage                    | `TagMutationResultSchema` (union over 7 action shapes — read `src/contracts/ast/mutation/defs.ts` for each) |

- [ ] **Step 1:** For each schema not yet defined, TDD it in `script-response-schemas.test.ts` (success passes / missing
      discriminator fails / extra key fails), reading the REAL shape from `src/contracts/ast/mutation/defs.ts` (grep the
      operation name). Verify the v3-wrap question for create/update empirically:
      `grep -n "ok: true" src/contracts/ast/mutation/defs.ts src/contracts/ast/mutation/emitter.ts` — if single
      mutations are NOT v3-wrapped at top level, drop `V3EnvelopeSuccessSchema` from the `TaskWriteResultSchema` union
      and note it in the commit message.
- [ ] **Step 2:** Add the schema argument at each site: `this.execJson(script, TaskWriteResultSchema)`. **Do not change
      any error-handling code** — `isScriptError` checks keep working (`detectKnownErrorShape` produces the same
      `ScriptError` they already consume; Pattern A/B/C per audit). `extractEmbeddedScriptError` stays untouched.
- [ ] **Step 3:** Full unit suite — PASS. Any failure here means a schema is wrong about a real shape: read the script
      source, fix the schema (never loosen to `z.unknown()` whole-result).
- [ ] **Step 4: Commit** — `feat(OMN-139): write-tool call sites pass success schemas (15/15)`

---

### Task 6: Migrate `OmniFocusReadTool.ts` (13 sites)

| Site (line) | Method                 | Schema                                                                                                                                                                                                                                                        |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 358 / 485   | task query / id lookup | `listResultSchema(['tasks','items'], {metadata: true})`                                                                                                                                                                                                       |
| 432         | countOnly              | `CountResultSchema`                                                                                                                                                                                                                                           |
| 539 / 676   | project lookup/query   | `listResultSchema(['projects','items'], {metadata: true})`                                                                                                                                                                                                    |
| 764 / 1184  | tags                   | `astEnvelopeSchema('items')`                                                                                                                                                                                                                                  |
| 799         | perspectives           | `listResultSchema(['items'], {extras: {summary: z.unknown().optional()}})` — script emits `items` only (plan-review verified; the caller's `perspectives \|\|` fallback is dead)                                                                              |
| 861         | folders                | Dedicated variant: `z.object({success: z.literal(true), folders: z.array(z.unknown()), metadata: z.unknown().optional()}).strict()` — the folders script emits a `success: true` sibling key (plan-review verified); plain `listResultSchema` would reject it |
| 954 / 1141  | task export            | `ExportResultSchema`                                                                                                                                                                                                                                          |
| 1049 / 1162 | project export         | `ExportResultSchema`                                                                                                                                                                                                                                          |

- [ ] **Step 1:** TDD any schema variants not yet covered (e.g. the project-by-id wrapped shape at 539 — the audit
      reports `{projects, count, mode, targetId}`; READ `src/contracts/ast/script-builder.ts` and add those keys as
      optional extras to the closed world, or a dedicated variant).
- [ ] **Step 2:** Add schema args; leave the `data.tasks || data.items` caller fallbacks untouched (mechanical
      preservation).
- [ ] **Step 3:** Full unit suite — PASS.
- [ ] **Step 4: Commit** — `feat(OMN-139): read-tool call sites pass success schemas (13/13)`

---

### Task 7: Migrate `OmniFocusAnalyzeTool.ts` (14 sites)

| Site (line)            | Method                                            | Schema                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 456 / 701 / 891 / 1939 | v3 analytics (stats, velocity, overdue, workflow) | `V3EnvelopeSuccessSchema`                                                                                                                                                                                                                |
| 1363                   | slimmed data (inline script)                      | `SlimmedDataSchema` = `z.object({tasks, projects, tags}).strict()` (arrays of unknown)                                                                                                                                                   |
| 2172                   | recurring analyze                                 | `astEnvelopeSchema('tasks')`                                                                                                                                                                                                             |
| 2239                   | recurring patterns                                | `RecurringPatternsSchema` = `{totalRecurring, patterns, byProject, mostCommon, duration, debug}` strict, values `z.unknown()` — READ `src/omnifocus/scripts/recurring/get-recurring-patterns.ts` to confirm keys + the formatError shape |
| 2592                   | project names                                     | `listResultSchema(['projects','items'], {metadata: true})`                                                                                                                                                                               |
| 2602                   | tag names                                         | `astEnvelopeSchema('items')`                                                                                                                                                                                                             |
| 2627                   | incomplete tasks                                  | `listResultSchema(['tasks','items'], {metadata: true})`                                                                                                                                                                                  |
| 3085                   | reviews list                                      | `reviewSuccessSchema({projects: z.array(z.unknown()), metadata: z.unknown().optional()})`                                                                                                                                                |
| 3202                   | mark reviewed                                     | `reviewSuccessSchema({project: z.unknown(), changes: z.unknown().optional(), message: z.unknown().optional()})`                                                                                                                          |
| 3246 / 3286            | set/clear schedule                                | `reviewSuccessSchema({results: z.unknown(), message: z.unknown().optional()})`                                                                                                                                                           |

- [ ] **Step 1:** TDD remaining schemas. The five typed sites (456/701/891/1939/3085): keep the TS type params and
      verify the schema's success branch is consistent with the declared type's top level.
- [ ] **Step 2:** Add schema args. **Behavior note for the PR description:** sites 456/891 previously let `{ok: false}`
      envelopes through as success (the live hole) — after this task they surface as `ScriptError`. The callers'
      existing `isScriptError` checks handle that path; their graceful-degradation returns (`[]`, empty Set at
      2592/2602/2627, zero-shape at 1363) MUST be preserved — verify each still returns its empty fallback on error.
- [ ] **Step 3:** Full unit suite — PASS.
- [ ] **Step 4: Commit** —
      `feat(OMN-139): analyze-tool call sites pass success schemas (14/14) — closes the live {ok:false} hole`

---

### Task 8: Delete `executeTyped` + `normalizeToEnvelope`; prune base.ts sniffing

**Files:** `src/omnifocus/OmniAutomation.ts`, `src/utils/safe-io.ts`, `src/tools/base.ts`,
`tests/support/setup-unit.ts`, `tests/unit/tools/base-type-guards.test.ts`

- [ ] **Step 1:** Delete `executeTyped` (OmniAutomation.ts) and its mocks in `tests/support/setup-unit.ts`. Delete
      `normalizeToEnvelope` + `isLegacyErrorShape` from `safe-io.ts` (KEEP `JxaEnvelopeSchema`, `JsonValueSchema`,
      `safeStringify`). Grep first: `grep -rn "executeTyped\|normalizeToEnvelope" src/ tests/` — fix every hit. Note
      (don't chase) any newly unmasked orphans.
- [ ] **Step 2:** In base.ts, delete `isRawSuccessResponse`, `checkObjectForError`, `parseStringResult`, the nested
      `isLegacyScriptError` re-check inside `execJson`, and `RawOmniFocusData` if now unused. KEEP
      `isLegacyScriptError`/`getLegacyErrorMessage` only if still imported elsewhere
      (`grep -rn "isLegacyScriptError\|getLegacyErrorMessage" src/ tests/`); otherwise delete and shrink
      `base-type-guards.test.ts` to surviving exports.
- [ ] **Step 2b (plan-review finding):** `tests/unit/tools/base.test.ts` (~lines 179–196, "should convert legacy error
      JSON strings into ScriptError results") pins the deleted `parseStringResult` behavior via a mock whose
      `executeJson` returns a raw JSON **string**. That mock violates the totality contract (real `executeJson` returns
      `ScriptResult`, never a string). Update the mock to return a proper `ScriptResult` and re-target the assertion, or
      delete the test as pinning removed behavior — state which in the commit message.
- [ ] **Step 2c:** Add a code comment on `JxaEnvelopeSchema` in `safe-io.ts`: it is superseded at runtime by
      `detectKnownErrorShape`'s hand-rolled superset check (which also catches _malformed_ `{ok: false}` envelopes the
      schema would reject) and retained as the envelope contract's type-level reference — there is no code dependency,
      so ts-prune WILL flag it after this ticket; that is expected, do not delete (spec §3.6).
- [ ] **Step 3:** `npm run build` + full unit suite — PASS.
- [ ] **Step 4: Commit** —
      `refactor(OMN-139): delete executeTyped/normalizeToEnvelope + base.ts shape-sniffing (totality makes them dead)`

---

### Task 9: The signature flip (compile-time coverage proof)

**Files:** `src/omnifocus/OmniAutomation.ts`, `src/tools/base.ts`, `src/omnifocus/version-detection.ts` (already passes
a schema — should be untouched)

- [ ] **Step 1:** Make `schema` REQUIRED in both `executeJson<T>(script, schema)` and `execJson<T>(script, schema)`.
      Delete the no-schema legacy branch in `executeJson` (and the Task 3 tests that pinned it — replace with a test
      asserting the new exhaustive behavior).
- [ ] **Step 2:** `npm run build`. Expected: **zero errors** if Tasks 5–7 covered every site. ANY compile error = a
      missed site; fix by adding the right family schema (never `z.unknown()`).
- [ ] **Step 3:** Mutation-verify the inversion: temporarily restore the **entire pre-OMN-139 `executeJson` body** (from
      `git show main:src/omnifocus/OmniAutomation.ts` — the `error === true` check + unconditional
      `createScriptSuccess`), run `npx vitest run tests/unit/omnifocus/OmniAutomation.test.ts` → BOTH the `{ok: false}`
      test AND the unknown-shape test MUST fail. (A classifier-only revert is insufficient — the fail-closed schema path
      would keep the unknown-shape test green; plan-review finding.) Restore the new body, confirm tests pass again, and
      state the mutation-verify result in the commit message.
- [ ] **Step 4:** Full unit suite — PASS.
- [ ] **Step 5: Commit** —
      `feat(OMN-139): executeJson/execJson schema parameter REQUIRED — allow-list inversion complete`

---

### Task 10: Integration gate + docs

- [ ] **Step 1:** `npm run build`, then run the live integration suite **via run_in_background** (orphan-class rule —
      never a killable foreground shell): `npm run test:integration`. Expected: pass counts consistent with current
      main. ANY new failure = a schema wrong about a real shape; fix the schema from the script source.
- [ ] **Step 2:** CHANGELOG entry: unknown script-output shapes now fail loudly (`'Unrecognized script output shape'` +
      raw excerpt) instead of returning success; `{ok: false}` envelope errors now surface correctly.
- [ ] **Step 3:** Check `tests/unit/docs/claude-md-paths.test.ts` still passes (spec/plan reference stable anchors
      only).
- [ ] **Step 4: Commit** — `docs(OMN-139): changelog + integration gate green`

---

## Appendix: audit shape reference (2026-06-11)

Authoritative per-site shapes live in the three audit reports summarized in Tasks 5–7 tables. Where this plan and the
script source disagree, **the script source wins** — update the schema AND this plan. Key verified facts: write tool =
AST builders only (no legacy templates); `unwrapV3Envelope` (write tool, lines 63–71) unwraps `{ok: true, v: '3', data}`
for task create/update only; read tool has 5 dual-key dynamic sites (handled via `listResultSchema` unions); analyze
tool speaks three dialects (v3 envelope, `'ast'` envelope, review `{success}`), and sites 456/891 are where the live
`{ok: false}` hole bites today.
