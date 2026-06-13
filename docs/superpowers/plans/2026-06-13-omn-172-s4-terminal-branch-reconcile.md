# OMN-172 (S4): terminal-state OR-branch reject + metadata reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject (with steering) tasks queries whose OR branch requests a terminal state the base will exclude (F8 + the
`completed` sibling), and reconcile `filter_description` with `filters_applied` so no filter key silently reads "all
tasks" (F10).

**Architecture:** A new contradiction check in `QueryCompiler.compile()` (tasks variant only) throws a `z.ZodError`
before codegen — covering list + count + tasks-modes at one chokepoint, with the right VALIDATION_ERROR surface, leaving
the script-builders byte-identical. F10 backfills the missing `describeFilterForScript` branches and adds a
`satisfies`-backed forcing-function test that compile-errors when a future filter key is neither described nor
explicitly exempted.

**Tech Stack:** TypeScript, Zod, Vitest. Spec:
`docs/superpowers/specs/2026-06-13-omn-172-s4-terminal-branch-reconcile-design.md`.

**Baseline:** worktree off `origin/main` @ `7b52908`.

---

## File Structure

| File                                                                       | Responsibility                                       | Change                                                |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `src/tools/unified/compilers/QueryCompiler.ts`                             | Compile-time contradiction check on tasks orBranches | Modify — add private method + call in tasks variant   |
| `src/tools/unified/compilers/task-key-disposition.ts`                      | Rejection message constants                          | Modify — add 2 steering constants                     |
| `src/contracts/ast/script-builder.ts`                                      | `describeFilterForScript` backfill                   | Modify — add missing describe branches                |
| `src/contracts/ast/filter-generator.ts`                                    | `describeProjectFilter` `id` backfill                | Modify — describe `id`                                |
| `tests/unit/tools/unified/compilers/terminal-branch-contradiction.test.ts` | F8 + completed reject matrix                         | Create (conventional home of `QueryCompiler.test.ts`) |
| `tests/unit/contracts/ast/describe-filter-coverage.test.ts`                | F10 forcing-function + per-key coverage              | Create                                                |
| `docs/spec/read-filters.md`                                                | §6 drift rows                                        | Modify                                                |
| `src/tools/unified/OmniFocusReadTool.ts`                                   | inputSchema description note (dual-schema rule)      | Modify                                                |

---

## Task 1: F8 + `completed` sibling — reject unsatisfiable terminal OR branches

**Files:**

- Modify: `src/tools/unified/compilers/task-key-disposition.ts` (add message constants)
- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (add check + call)
- Test: `tests/unit/tools/unified/compilers/terminal-branch-contradiction.test.ts` (create — sibling of
  `QueryCompiler.test.ts`; note the **5**-level `../` import depth)

**Rule (spec §3.1):** reject branch `i` ⇔
`(filters.dropped !== true && branch[i].dropped === true) || (filters.completed !== true && branch[i].completed === true)`.
`includeCompleted` is export-only, so the tasks-side rule needs no `includeCompleted` input.

- [ ] **Step 1: Write the failing test file**

```ts
// tests/unit/tools/unified/compilers/terminal-branch-contradiction.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { QueryCompiler } from '../../../../../src/tools/unified/compilers/QueryCompiler.js';

const compiler = new QueryCompiler();
const compileTasks = (filters: unknown) => compiler.compile({ query: { type: 'tasks', filters } } as never);

describe('OMN-172 F8: unsatisfiable terminal OR-branch rejection', () => {
  it('rejects {OR:[{status:dropped},{flagged:true}]} naming OR[0] + the top-level fix', () => {
    try {
      compileTasks({ OR: [{ status: 'dropped' }, { flagged: true }] });
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      const issue = (e as z.ZodError).issues[0];
      expect(issue.path).toEqual(['query', 'filters', 'OR', 0, 'dropped']);
      expect(issue.message).toMatch(/dropped/i);
      expect(issue.message).toMatch(/top level/i);
    }
  });

  it('rejects {OR:[{status:completed},{flagged:true}]} symmetrically (the completed sibling)', () => {
    try {
      compileTasks({ OR: [{ status: 'completed' }, { flagged: true }] });
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      const issue = (e as z.ZodError).issues[0];
      expect(issue.path).toEqual(['query', 'filters', 'OR', 0, 'completed']);
      expect(issue.message).toMatch(/completed/i);
    }
  });

  it('rejects explicit top-level dropped:false + branch dropped:true (still exclusion)', () => {
    expect(() => compileTasks({ dropped: false, OR: [{ status: 'dropped' }, { flagged: true }] })).toThrow(z.ZodError);
  });

  it('ACCEPTS top-level dropped:true + branch dropped:true (base lifts the exclusion)', () => {
    const c = compileTasks({ dropped: true, OR: [{ status: 'dropped' }, { flagged: true }] });
    expect(c.type).toBe('tasks');
  });

  it('ACCEPTS top-level completed:true + branch completed:true', () => {
    const c = compileTasks({ completed: true, OR: [{ status: 'completed' }, { flagged: true }] });
    expect(c.type).toBe('tasks');
  });

  it('ACCEPTS {OR:[{dropped:false},{flagged:true}]} (branch consistent with default)', () => {
    const c = compileTasks({ OR: [{ dropped: false }, { flagged: true }] });
    expect(c.type).toBe('tasks');
  });

  it('ACCEPTS {OR:[{flagged:true},{available:true}]} (no terminal request)', () => {
    const c = compileTasks({ OR: [{ flagged: true }, { available: true }] });
    expect(c.type).toBe('tasks');
  });

  it('rejects identically on the countOnly variant (same compile path)', () => {
    expect(() =>
      compiler.compile({
        query: { type: 'tasks', countOnly: true, filters: { OR: [{ status: 'dropped' }, { flagged: true }] } },
      } as never),
    ).toThrow(z.ZodError);
  });

  it('rejects the second branch when the first is satisfiable (scans all branches)', () => {
    try {
      compileTasks({ OR: [{ flagged: true }, { status: 'dropped' }] });
      throw new Error('expected rejection');
    } catch (e) {
      expect((e as z.ZodError).issues[0].path).toEqual(['query', 'filters', 'OR', 1, 'dropped']);
    }
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run tests/unit/tools/compilers/terminal-branch-contradiction.test.ts` Expected: FAIL — accept-cases
pass but the reject-cases throw `Error('expected rejection')` / don't throw ZodError (the contradiction check doesn't
exist yet).

- [ ] **Step 3: Add steering message builders** in `src/tools/unified/compilers/task-key-disposition.ts` (after the
      existing `ON_HOLD_TASKS_REJECTION` constant):

```ts
// OMN-172 (S4): a terminal status inside an OR branch is unsatisfiable because
// tasks queries exclude that terminal state at the base by default and an OR
// branch cannot re-include it (the base AND-composes over the OR node).
// Worded in compiled terms: at the check site status:'dropped' has already
// collapsed to dropped:true (see spec §3.3).
export const terminalBranchRejection = (branchIndex: number, state: 'dropped' | 'completed'): string =>
  `OR[${branchIndex}] requires ${state} tasks (status:'${state}' / ${state}:true), but tasks queries exclude ` +
  `${state} tasks by default and an OR branch cannot re-include them. To include ${state} tasks, set ` +
  `status:'${state}' (or ${state}:true) at the top level of filters instead of inside an OR branch, or remove the branch.`;
```

- [ ] **Step 4: Add the check method** to `QueryCompiler` in `src/tools/unified/compilers/QueryCompiler.ts`. Import the
      helper at the top (`import { ..., terminalBranchRejection } from './task-key-disposition.js';`). Add a private
      method near `transformFilters`:

```ts
  /**
   * OMN-172 (S4): reject an OR branch that requests a terminal state (dropped/completed)
   * the base will exclude, making the branch unsatisfiable. includeCompleted is
   * export-only, so for tasks the base excludes a terminal state iff the top-level
   * filter does not pin it to true. See spec §3.
   */
  private assertSatisfiableTerminalBranches(filters: NormalizedTaskFilter): void {
    const branches = filters.orBranches;
    if (!branches || branches.length === 0) return;
    const STATES = ['dropped', 'completed'] as const;
    branches.forEach((branch, i) => {
      for (const state of STATES) {
        const baseExcludes = filters[state] !== true; // export-only includeCompleted ⇒ tasks always default-exclude
        if (baseExcludes && branch[state] === true) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters', 'OR', i, state],
              message: terminalBranchRejection(i, state),
            },
          ]);
        }
      }
    });
  }
```

- [ ] **Step 5: Call it** in `compile()`, tasks variant only, after `const filters = normalizeFilter(raw);` and before
      the `if (query.type === 'tasks')` return block (so it does NOT run for export):

```ts
        const filters = normalizeFilter(raw);
        if (query.type === 'tasks') {
          this.assertSatisfiableTerminalBranches(filters); // OMN-172 S4
          return {
            ...base,
            type: 'tasks',
            // ...unchanged
```

- [ ] **Step 6: Run the test — verify it passes**

Run: `npx vitest run tests/unit/tools/compilers/terminal-branch-contradiction.test.ts` Expected: PASS (all cases).

- [ ] **Step 7: Build (the `satisfies`/type surface)**

Run: `npm run build` Expected: clean (no TS errors).

- [ ] **Step 8: Commit**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts src/tools/unified/compilers/task-key-disposition.ts tests/unit/tools/unified/compilers/terminal-branch-contradiction.test.ts
git commit -m "feat(OMN-172): reject unsatisfiable terminal OR-branches with steering (F8 + completed sibling)"
```

---

## Task 2: F10 — backfill `describeFilterForScript` + forcing-function coverage test

**Files:**

- Modify: `src/contracts/ast/script-builder.ts` (`describeFilterForScript`, after `describeDueDateRange`)
- Modify: `src/contracts/ast/filter-generator.ts` (`describeProjectFilter` — describe `id`)
- Test: `tests/unit/contracts/ast/describe-filter-coverage.test.ts` (create)

**Backfill set (spec §4.1, verified against `TaskFilter`):** `deferDate` range, `completionDate` range, `plannedDate`
range, `added` range, `estimatedMinutes*`, `tagStatusValid`, `parentTaskId`. (`project` is EXEMPT — always rewritten to
`projectId`.)

- [ ] **Step 1: Write the failing coverage test**

```ts
// tests/unit/contracts/ast/describe-filter-coverage.test.ts
import { describe, it, expect } from 'vitest';
import type { NormalizedTaskFilter } from '../../../../src/contracts/filters.js';
// describeFilterForScript is not exported yet — export it in Step 3.
import { describeFilterForScript } from '../../../../src/contracts/ast/script-builder.js';

// Forcing function: every key of NormalizedTaskFilter is classified. Adding a new
// filter key makes this `satisfies` fail to compile until described-or-exempted.
type Coverage = 'described' | 'exempt';
const KEY_COVERAGE = {
  // identity / status
  id: 'described',
  completed: 'described',
  dropped: 'described',
  hasRepetitionRule: 'described',
  // tags / text / name
  tags: 'described',
  tagsOperator: 'exempt',
  text: 'described',
  textOperator: 'exempt',
  search: 'described',
  name: 'described',
  nameOperator: 'exempt',
  // dates
  dueAfter: 'described',
  dueBefore: 'described',
  dueDateOperator: 'exempt',
  deferAfter: 'described',
  deferBefore: 'described',
  deferDateOperator: 'exempt',
  plannedAfter: 'described',
  plannedBefore: 'described',
  plannedDateOperator: 'exempt',
  completionAfter: 'described',
  completionBefore: 'described',
  completionDateOperator: 'exempt',
  addedAfter: 'described',
  addedBefore: 'described',
  addedDateOperator: 'exempt',
  // numeric
  estimatedMinutesEquals: 'described',
  estimatedMinutesLessThan: 'described',
  estimatedMinutesGreaterThan: 'described',
  // booleans
  flagged: 'described',
  blocked: 'described',
  available: 'described',
  inInbox: 'described',
  tagStatusValid: 'described',
  // project / parent
  projectId: 'described',
  project: 'exempt',
  parentTaskId: 'described',
  // structural / internal — EXEMPT
  todayMode: 'exempt',
  dueSoonDays: 'exempt',
  fastSearch: 'exempt',
  projectStatus: 'exempt',
  folder: 'exempt',
  folderTopLevel: 'exempt',
  limit: 'exempt',
  offset: 'exempt',
  mode: 'exempt',
  orBranches: 'exempt',
  __normalized__: 'exempt',
} satisfies Record<keyof NormalizedTaskFilter, Coverage>;

// Representative single-key value per DESCRIBED key (range keys grouped under one bullet).
const SAMPLE: Partial<Record<keyof NormalizedTaskFilter, NormalizedTaskFilter>> = {
  id: { id: 'abc' } as NormalizedTaskFilter,
  completed: { completed: true } as NormalizedTaskFilter,
  dropped: { dropped: true } as NormalizedTaskFilter,
  hasRepetitionRule: { hasRepetitionRule: true } as NormalizedTaskFilter,
  tags: { tags: ['x'] } as NormalizedTaskFilter,
  text: { text: 'foo' } as NormalizedTaskFilter,
  search: { search: 'foo' } as NormalizedTaskFilter,
  name: { name: 'foo' } as NormalizedTaskFilter,
  dueBefore: { dueBefore: '2026-01-01' } as NormalizedTaskFilter,
  deferBefore: { deferBefore: '2026-01-01' } as NormalizedTaskFilter,
  plannedBefore: { plannedBefore: '2026-01-01' } as NormalizedTaskFilter,
  completionBefore: { completionBefore: '2026-01-01' } as NormalizedTaskFilter,
  addedBefore: { addedBefore: '2026-01-01' } as NormalizedTaskFilter,
  estimatedMinutesLessThan: { estimatedMinutesLessThan: 30 } as NormalizedTaskFilter,
  flagged: { flagged: true } as NormalizedTaskFilter,
  blocked: { blocked: true } as NormalizedTaskFilter,
  available: { available: true } as NormalizedTaskFilter,
  inInbox: { inInbox: true } as NormalizedTaskFilter,
  tagStatusValid: { tagStatusValid: true } as NormalizedTaskFilter,
  projectId: { projectId: 'p1' } as NormalizedTaskFilter,
  parentTaskId: { parentTaskId: 't1' } as NormalizedTaskFilter,
};

describe('OMN-172 F10: describeFilterForScript key coverage', () => {
  for (const [key, cov] of Object.entries(KEY_COVERAGE)) {
    if (cov !== 'described') continue;
    const sample = SAMPLE[key as keyof NormalizedTaskFilter];
    it(`describes ${key} (not "all tasks")`, () => {
      expect(sample, `add a SAMPLE entry for described key ${key}`).toBeDefined();
      expect(describeFilterForScript(sample!)).not.toBe('all tasks');
    });
  }
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run tests/unit/contracts/ast/describe-filter-coverage.test.ts` Expected: FAIL —
`describeFilterForScript` is not exported (import error) and/or the date-range / estimate / tagStatusValid /
parentTaskId cases return "all tasks".

- [ ] **Step 3: Export + backfill** in `src/contracts/ast/script-builder.ts`. Change `function describeFilterForScript`
      to `export function describeFilterForScript`. Generalize the date-range helper and add the missing branches.
      Replace the single `describeDueDateRange` usage with a data-driven loop:

```ts
// Replace describeDueDateRange with a generic range describer.
const DATE_RANGE_DESCRIPTORS: Array<{ label: string; after: keyof TaskFilter; before: keyof TaskFilter }> = [
  { label: 'due', after: 'dueAfter', before: 'dueBefore' },
  { label: 'defer', after: 'deferAfter', before: 'deferBefore' },
  { label: 'planned', after: 'plannedAfter', before: 'plannedBefore' },
  { label: 'completion', after: 'completionAfter', before: 'completionBefore' },
  { label: 'added', after: 'addedAfter', before: 'addedBefore' },
];

function describeDateRange(
  filter: TaskFilter,
  label: string,
  after: keyof TaskFilter,
  before: keyof TaskFilter,
): string | undefined {
  const a = filter[after] as string | undefined;
  const b = filter[before] as string | undefined;
  if (!a && !b) return undefined;
  if (a && b) return `${label}: ${a} to ${b}`;
  if (b) return `${label} before: ${b}`;
  return `${label} after: ${a}`;
}
```

Then inside `describeFilterForScript`, after the boolean-descriptor loop and before the final return, replace the lone
`describeDueDateRange` call with:

```ts
for (const { label, after, before } of DATE_RANGE_DESCRIPTORS) {
  const d = describeDateRange(filter, label, after, before);
  if (d) conditions.push(d);
}

// OMN-49 estimated minutes
if (filter.estimatedMinutesEquals !== undefined) conditions.push(`estimate = ${filter.estimatedMinutesEquals}m`);
if (filter.estimatedMinutesLessThan !== undefined) conditions.push(`estimate < ${filter.estimatedMinutesLessThan}m`);
if (filter.estimatedMinutesGreaterThan !== undefined)
  conditions.push(`estimate > ${filter.estimatedMinutesGreaterThan}m`);

if (filter.tagStatusValid !== undefined)
  conditions.push(filter.tagStatusValid ? 'tag status valid' : 'tag status invalid');
if (filter.parentTaskId) conditions.push(`parent: ${filter.parentTaskId}`);
```

(Keep the existing `tags`/`text`/`name`/`projectId`/`id` blocks. Delete the now-unused `describeDueDateRange` function —
its `due` case is covered by the loop.)

- [ ] **Step 4: Run the coverage test — verify it passes**

Run: `npx vitest run tests/unit/contracts/ast/describe-filter-coverage.test.ts` Expected: PASS.

- [ ] **Step 5: Add `describeProjectFilter` `id` + parity** in `src/contracts/ast/filter-generator.ts`. Add, alongside
      the other conditions in `describeProjectFilter`:

```ts
if (filter.id) conditions.push(`id: ${filter.id}`);
```

Add a small parity test to the same coverage test file (project side), asserting
`describeProjectFilter({ id: 'p1' } as never)` is not `'all projects'` (use the actual empty-default string the function
returns — read it).

- [ ] **Step 6: Run full unit suite — verify nothing regressed (golden scripts byte-identical)**

Run: `npm run test:unit` Expected: PASS. Pay attention to any golden-script or `describeFilterForScript` snapshot test —
satisfiable filters must be unaffected. If a snapshot pins the OLD "all tasks" for a now-described filter, that is a
CORRECT update (the old behavior was the F10 bug); update the snapshot and note it.

- [ ] **Step 7: Commit**

```bash
git add src/contracts/ast/script-builder.ts src/contracts/ast/filter-generator.ts tests/unit/contracts/ast/describe-filter-coverage.test.ts
git commit -m "feat(OMN-172): reconcile filter_description with filters_applied (F10) + forcing-function coverage"
```

---

## Task 3: Docs + inputSchema description (dual-schema rule)

**Files:**

- Modify: `docs/spec/read-filters.md` (§6 drift rows)
- Modify: `src/tools/unified/OmniFocusReadTool.ts` (inputSchema description — note the OR-branch terminal rejection)

- [ ] **Step 1: Add drift rows** to `docs/spec/read-filters.md` **§8 Drift register** (NOT §6 — the drift table with
      `D17`–`D21` RESOLVED rows is in §8; plan-review B2). Add two new rows `D22` (F8 terminal-state OR-branch
      contradiction → reject-with-steering, S4) and `D23` (F10 description/applied reconciliation → forcing-function
      coverage, S4), mirroring the D17–D21 RESOLVED format.

- [ ] **Step 2: Update the inputSchema/description** in `src/tools/unified/OmniFocusReadTool.ts` — the `OR` filter
      description is near `OmniFocusReadTool.ts:264` (`logic: { OR: [...] }`). Add one compact sentence: a terminal
      `status` (`dropped`/`completed`) inside an OR branch is rejected with steering toward the top-level form. Keep it
      compact per the dual-schema sizing rule.

- [ ] **Step 3: Verify CLAUDE.md path guard + build**

Run: `npm run build && npx vitest run tests/unit/docs/claude-md-paths.test.ts` Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/spec/read-filters.md src/tools/unified/OmniFocusReadTool.ts
git commit -m "docs(OMN-172): record F8/F10 drift resolution + OR-branch terminal reject note"
```

---

## Final verification (before PR)

- [ ] `npm run build` — clean
- [ ] `npm run test:unit` — green (NOT concurrent with integration — guard-test flake, OMN-143)
- [ ] `npm run test:integration` — `run_in_background`, npm not bun, NEVER kill (OMN-143); add/confirm one C18-shape
      live rejection of `{type:'tasks', filters:{OR:[{status:'dropped'},{flagged:true}]}}` → InvalidParams + steering
- [ ] `npm run conformance` — vs same-day main control (OMN-168), llama3.1:8b + qwen2.5:7b; new reject must not regress
      the bar (the inputSchema description gained one sentence; prove advertisement near-invariance first, then run)
- [ ] Final code-review subagent → SAFE/Approved gate
- [ ] PR to `kip-d/omnifocus-mcp`; `gh pr merge --squash --auto` (never `--admin`)
- [ ] Hand off: Kip redeploys (`~/omnifocus-mcp`) + live-verifies (probe: `{OR:[{status:'dropped'},{flagged:true}]}` →
      steering reject, not silent-empty; a `deferBefore` filter shows a `filter_description` naming it)

## Notes for the implementer

- **Do NOT touch** `buildFilteredTasksScript` / `buildInboxScript` / count-script `effectiveFilter` or `completionCheck`
  logic — the reject happens pre-codegen; satisfiable filters must compile byte-identically (golden pins guard this).
- The `__normalized__` brand key IS a `keyof NormalizedTaskFilter` (it's a string-literal const, `filters.ts`); it must
  appear in `KEY_COVERAGE` as `exempt` or the `satisfies` won't compile.
- `transformStatus` collapses `status:'dropped'`→`dropped:true` and `status:'completed'`→`completed:true` before the
  check sees the branch — the check reads `branch.dropped`/`branch.completed`, never `branch.status`.
- **FOOTGUN (plan-review N3):** there are TWO describe functions. Task 2 touches **`describeFilterForScript`** (in
  `src/contracts/ast/script-builder.ts`) and `describeProjectFilter`. Do NOT touch `describeFilter` (in
  `src/contracts/ast/filter-generator.ts`) — it's a different function with different wording (`due before X`, no colon)
  and its own tests. `describeProjectFilter`'s empty-default string is `'all projects'` (`filter-generator.ts:411`).
