# OMN-151 + OMN-156 Logical-Operator Compile Honesty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No schema-valid filter input is ever silently dropped on the tasks or projects read path; unsupported/empty
logical composition rejects loudly with steering (never match-all).

**Architecture:** Three seams fixed: (1) `QueryCompiler.transformFilters` replaces its logical-operator early-return
with a conflict-checked AND-merge; (2) `buildAST` composes base conditions with `orBranches` instead of dropping them;
(3) projects filters compile to a typed `ProjectFilter` via a new `transformProjectFilters` (C-lite — input-vocabulary
rejects, exhaustive key disposition), and `handleProjectQuery`'s cherry-pick seam is deleted.

**Tech Stack:** TypeScript, Zod, Vitest. Spec:
`docs/superpowers/specs/2026-06-12-omn-151-156-logical-operator-honesty-design.md` (READ IT FIRST — §3 is normative for
this plan). Normative behavior spec: `docs/spec/read-filters.md`.

**Worktree:** `/Users/kip/src/omnifocus-mcp/.claude/worktrees/omn-151-156-logical-honesty` (branch
`worktree-omn-151-156-logical-honesty`). All commands run from this directory. Build with `npm run build` before
anything that executes dist. Unit tests: `npm run test:unit` (~2s). NEVER run `npm run test:integration` in a foreground
shell — background only (orphaned vitest kills live sessions; see memory `tooling_integration_run_orphan_class`).

**Error-surface invariant (all tasks):** every new reject is a `z.ZodError` thrown from compile-time code.
`BaseTool.execute` already converts any `ZodError` escaping `executeValidated` into failure-log `VALIDATION_ERROR` + MCP
`McpError(ErrorCode.InvalidParams)` with `validation_errors` (see `src/tools/base.ts`, the `error instanceof z.ZodError`
branch). Do NOT add new catch layers.

---

## File Structure

| File                                                                   | Action | Responsibility                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tools/unified/compilers/QueryCompiler.ts`                         | Modify | Tasks-side merge semantics; `CompiledQuery.projectFilter` field; projects branch in `compile()`                                                                                                                                      |
| `src/tools/unified/compilers/filter-merge.ts`                          | Create | `mergeConflictChecked`, `filterDeepEqual`, `INPUT_KEY_OF` reverse-map, `emptyOperatorError`; shared `STATUS_TO_PROJECT` + `extractTextCondition` (Task 5 pre-step — avoids the QueryCompiler↔transform-project-filters import cycle) |
| `src/tools/unified/compilers/transform-project-filters.ts`             | Create | `transformProjectFilters` + `PROJECT_KEY_DISPOSITION` (exhaustive)                                                                                                                                                                   |
| `src/contracts/ast/builder.ts`                                         | Modify | `buildAST` composes base conditions with orBranches                                                                                                                                                                                  |
| `src/tools/unified/OmniFocusReadTool.ts`                               | Modify | `handleProjectQuery` consumes `compiled.projectFilter`; cherry-pick deleted                                                                                                                                                          |
| `src/tools/unified/schemas/read-schema.ts`                             | Modify | Header comment rewrite (lines ~33-40)                                                                                                                                                                                                |
| `tests/unit/tools/unified/compilers/filter-merge.test.ts`              | Create | Merge/conflict/deep-equal unit tests                                                                                                                                                                                                 |
| `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`             | Modify | Rewrite pins; new OMN-151 describe                                                                                                                                                                                                   |
| `tests/unit/tools/unified/compilers/transform-project-filters.test.ts` | Create | Disposition matrix tests                                                                                                                                                                                                             |
| `tests/unit/contracts/ast/builder.test.ts`                             | Modify | orBranches composition tests                                                                                                                                                                                                         |
| `tests/unit/contracts/ast/filter-coverage.test.ts`                     | Modify | Rewrite empty-OR pin (line ~227)                                                                                                                                                                                                     |
| `tests/unit/tools/unified/OmniFocusReadTool.test.ts`                   | Modify | Projects handler tests against `projectFilter`                                                                                                                                                                                       |
| `tests/integration/projects-filter-rejection.test.ts`                  | Create | C18-shape rejection (model: `tests/integration/not-filter-rejection.test.ts`)                                                                                                                                                        |
| `docs/spec/read-filters.md`                                            | Modify | §3.6 rows, §6, drift register, C18                                                                                                                                                                                                   |
| `CHANGELOG.md`                                                         | Modify | `[Unreleased] > Fixed` entries                                                                                                                                                                                                       |

---

### Task 1: Extract `transformFlatFilter` (pure refactor, no behavior change)

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts`
- Test: existing `tests/unit/tools/unified/compilers/QueryCompiler.test.ts` (must stay green)

- [ ] **Step 1: Run the existing unit suite to capture the green baseline**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts` Expected: PASS (all).

- [ ] **Step 2: Extract the non-logical body of `transformFilters` into a private method**

In `QueryCompiler.ts`, create `private transformFlatFilter(input: FlatQueryFilter): TaskFilter` containing EVERYTHING
currently in `transformFilters` AFTER the `transformLogicalOperator` early-return block (the
`const result: TaskFilter = {}` through `return result`, including the `validateFilterProperties` warn).
`transformFilters` becomes:

```typescript
transformFilters(input: QueryFilter): TaskFilter {
  // Handle logical operators first — each returns early
  const logicalResult = this.transformLogicalOperator(input);
  if (logicalResult) return logicalResult;
  return this.transformFlatFilter(input as FlatQueryFilter);
}
```

Inside `transformLogicalOperator`, replace the two recursive `this.transformFilters(condition as FlatQueryFilter)` calls
(AND branch, OR branch) with `this.transformFlatFilter(condition as FlatQueryFilter)` — operator items are schema-flat,
so this is identity today.

- [ ] **Step 3: Run the suite — still green**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts` Expected: PASS, same count as
Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "refactor(OMN-151): extract transformFlatFilter from transformFilters (no behavior change)"
```

---

### Task 2: `filter-merge.ts` — conflict-checked merge utilities (TDD)

**Files:**

- Create: `src/tools/unified/compilers/filter-merge.ts`
- Create: `tests/unit/tools/unified/compilers/filter-merge.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  mergeConflictChecked,
  emptyOperatorError,
  filterDeepEqual,
} from '../../../../../src/tools/unified/compilers/filter-merge.js';

describe('filterDeepEqual', () => {
  it('scalars, arrays, nested objects', () => {
    expect(filterDeepEqual(true, true)).toBe(true);
    expect(filterDeepEqual(['active'], ['active'])).toBe(true);
    expect(filterDeepEqual(['active'], ['done'])).toBe(false);
    expect(filterDeepEqual(['a', 'b'], ['b', 'a'])).toBe(false); // order-sensitive: tag order is semantic input
    expect(filterDeepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(filterDeepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('mergeConflictChecked', () => {
  it('merges disjoint keys from multiple sources', () => {
    const merged = mergeConflictChecked([
      { origin: 'filters', filter: { flagged: true } },
      { origin: 'AND[0]', filter: { completed: false } },
    ]);
    expect(merged).toEqual({ flagged: true, completed: false });
  });

  it('deep-equal duplicate assignments merge silently', () => {
    const merged = mergeConflictChecked([
      { origin: 'filters', filter: { projectStatus: ['active'] } },
      { origin: 'AND[0]', filter: { projectStatus: ['active'] } },
    ]);
    expect(merged).toEqual({ projectStatus: ['active'] });
  });

  it('conflicting values throw ZodError naming the INPUT key and both values', () => {
    expect(() =>
      mergeConflictChecked([
        { origin: 'AND[0]', filter: { completed: false, projectStatus: ['active'] } },
        { origin: 'AND[1]', filter: { completed: true, projectStatus: ['done'] } },
      ]),
    ).toThrowError(z.ZodError);
    try {
      mergeConflictChecked([
        { origin: 'AND[0]', filter: { completed: false } },
        { origin: 'AND[1]', filter: { completed: true } },
      ]);
      expect.unreachable();
    } catch (e) {
      const issue = (e as z.ZodError).issues[0];
      expect(issue.path).toEqual(['query', 'filters']);
      // reverse-mapped vocabulary: internal `completed` names status/completed input keys
      expect(issue.message).toContain('status/completed');
      expect(issue.message).toContain('AND[0]');
      expect(issue.message).toContain('AND[1]');
      expect(issue.message).toContain('OR'); // steers to OR for alternatives
    }
  });

  it('undefined values never participate (no false conflicts)', () => {
    const merged = mergeConflictChecked([
      { origin: 'filters', filter: { flagged: undefined, name: 'x' } },
      { origin: 'AND[0]', filter: { flagged: true } },
    ]);
    expect(merged).toEqual({ name: 'x', flagged: true });
  });
});

describe('emptyOperatorError', () => {
  it('produces a ZodError at the operator path with steering', () => {
    const err = emptyOperatorError('OR');
    expect(err).toBeInstanceOf(z.ZodError);
    expect(err.issues[0].path).toEqual(['query', 'filters', 'OR']);
    expect(err.issues[0].message).toMatch(/supply at least one condition|omit the operator/i);
  });
});
```

- [ ] **Step 2: Run tests — fail (module not found)**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/filter-merge.test.ts` Expected: FAIL (cannot resolve
`filter-merge.js`).

- [ ] **Step 3: Implement `src/tools/unified/compilers/filter-merge.ts`**

```typescript
import { z } from 'zod';
import type { TaskFilter } from '../../../contracts/filters.js';

/**
 * OMN-151: reverse-map from internal TaskFilter keys to the input-schema
 * vocabulary, so conflict errors name the keys the caller actually sent.
 * Keys not listed map to themselves (identical in both vocabularies).
 */
const INPUT_KEY_OF: Record<string, string> = {
  completed: 'status/completed',
  projectStatus: 'status',
  dropped: 'status',
  dueBefore: 'dueDate',
  dueAfter: 'dueDate',
  dueDateOperator: 'dueDate',
  deferBefore: 'deferDate',
  deferAfter: 'deferDate',
  deferDateOperator: 'deferDate',
  plannedBefore: 'plannedDate',
  plannedAfter: 'plannedDate',
  plannedDateOperator: 'plannedDate',
  completionBefore: 'completionDate',
  completionAfter: 'completionDate',
  completionDateOperator: 'completionDate',
  addedBefore: 'added',
  addedAfter: 'added',
  addedDateOperator: 'added',
  estimatedMinutesEquals: 'estimatedMinutes',
  estimatedMinutesLessThan: 'estimatedMinutes',
  estimatedMinutesGreaterThan: 'estimatedMinutes',
  nameOperator: 'name',
  textOperator: 'text',
  tagsOperator: 'tags',
  orBranches: 'OR',
  folderTopLevel: 'folder',
};

export function inputKeyOf(internalKey: string): string {
  return INPUT_KEY_OF[internalKey] ?? internalKey;
}

/** Order-sensitive structural equality. Arrays/objects compare by shape; order matters (tag lists are semantic). */
export function filterDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => filterDeepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return (
      ak.length === bk.length &&
      ak.every((k) => filterDeepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

export interface MergeSource {
  /** Where the keys came from, for error messages: 'filters', 'AND[0]', 'NOT', … */
  origin: string;
  filter: TaskFilter;
}

/**
 * OMN-151: AND-merge transformed filter fragments. A key acquiring two
 * non-deep-equal values is a hard conflict — silently letting the last
 * write win produced wrong result sets (V2). ZodError rides the existing
 * BaseTool handler → VALIDATION_ERROR / InvalidParams.
 */
export function mergeConflictChecked(sources: MergeSource[]): TaskFilter {
  const result: Record<string, unknown> = {};
  const originOf: Record<string, string> = {};
  for (const { origin, filter } of sources) {
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (key in result) {
        if (!filterDeepEqual(result[key], value)) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['query', 'filters'],
              message:
                `Conflicting values for '${inputKeyOf(key)}' (from ${originOf[key]} and ${origin}): ` +
                `${JSON.stringify(result[key])} vs ${JSON.stringify(value)}. ` +
                'All filters AND-compose, so conflicting values are unsatisfiable or unrepresentable. ' +
                'Use OR for alternatives, or combine into a single condition.',
            },
          ]);
        }
        continue;
      }
      result[key] = value;
      originOf[key] = origin;
    }
  }
  return result as TaskFilter;
}

/** OMN-151: empty AND/OR arrays are caller bugs — reject, never compile to match-all (P3). */
export function emptyOperatorError(op: 'AND' | 'OR'): z.ZodError {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ['query', 'filters', op],
      message:
        `${op}: [] is empty. ` +
        (op === 'AND'
          ? 'A vacuous AND would match everything — almost certainly not intended. '
          : 'An OR with no alternatives matches nothing. ') +
        'Omit the operator, or supply at least one condition.',
    },
  ]);
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/filter-merge.test.ts` Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/unified/compilers/filter-merge.ts tests/unit/tools/unified/compilers/filter-merge.test.ts
git commit -m "feat(OMN-151): conflict-checked filter merge utilities with input-vocabulary errors"
```

---

### Task 3: `transformFilters` merge semantics — siblings, AND conflicts, empty operators, AND+OR (TDD)

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts`
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts` (new describe at end of `coverage gaps (OMN-33)`
  region is fine; ALSO rewrite the pin at line ~741 `describe('OR: [] short-circuits to {}')`)
- Modify: `tests/unit/contracts/ast/filter-coverage.test.ts` (rewrite pin at ~227
  `returns empty filter for empty OR array`)

- [ ] **Step 1: Write the new failing tests (new describe in QueryCompiler.test.ts)**

```typescript
describe('logical-operator compile honesty (OMN-151)', () => {
  // V1: siblings beside operators merge (AND semantics), never drop
  it('merges sibling keys beside NOT (V1)', () => {
    const result = compiler.transformFilters({ flagged: true, NOT: { status: 'completed' } });
    expect(result).toEqual({ flagged: true, completed: false });
  });

  it('merges sibling keys beside AND (V1)', () => {
    const result = compiler.transformFilters({ flagged: true, AND: [{ status: 'active' }] });
    expect(result).toEqual({ flagged: true, completed: false, projectStatus: ['active'] });
  });

  it('keeps sibling keys beside OR as base keys alongside orBranches (V1)', () => {
    const result = compiler.transformFilters({
      flagged: true,
      OR: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }],
    });
    expect(result.flagged).toBe(true);
    expect(result.orBranches).toHaveLength(2);
  });

  // V4: AND and OR together both apply
  it('applies AND and OR together — AND keys merge, OR becomes orBranches (V4)', () => {
    const result = compiler.transformFilters({
      AND: [{ flagged: true }],
      OR: [{ status: 'active' }, { status: 'completed' }],
    });
    expect(result.flagged).toBe(true);
    expect(result.orBranches).toHaveLength(2);
  });

  // V2: AND conflicts reject loudly
  it('rejects conflicting status across AND conditions (V2)', () => {
    expect(() => compiler.transformFilters({ AND: [{ status: 'active' }, { status: 'completed' }] })).toThrowError(
      z.ZodError,
    );
  });

  it('rejects two different name conditions under AND (unrepresentable)', () => {
    expect(() =>
      compiler.transformFilters({ AND: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }] }),
    ).toThrowError(z.ZodError);
  });

  it('allows complementary date bounds across AND conditions (different internal keys)', () => {
    const result = compiler.transformFilters({
      AND: [{ dueDate: { after: '2026-01-01' } }, { dueDate: { before: '2026-02-01' } }],
    });
    expect(result.dueAfter).toBe('2026-01-01');
    expect(result.dueBefore).toBe('2026-02-01');
  });

  it('rejects base-vs-NOT contradiction: completed:true with NOT completed (cross-source)', () => {
    expect(() => compiler.transformFilters({ completed: true, NOT: { status: 'completed' } })).toThrowError(z.ZodError);
  });

  it('OMN-72 intra-filter precedence still applies WITHIN one flat filter', () => {
    // status active + completed true in ONE flat filter: completed overrides — no conflict
    const result = compiler.transformFilters({ status: 'active', completed: true });
    expect(result.completed).toBe(true);
    expect(result.projectStatus).toEqual(['active']);
  });

  // V3 + empty AND: reject, never match-all
  it('rejects OR: [] (V3 — was match-all)', () => {
    expect(() => compiler.transformFilters({ OR: [] })).toThrowError(z.ZodError);
  });

  it('rejects AND: [] (was match-all via vacuous truth)', () => {
    expect(() => compiler.transformFilters({ AND: [] })).toThrowError(z.ZodError);
  });

  // OMN-131 contract preserved
  it('NOT non-status payloads still hard-reject (OMN-131 unchanged)', () => {
    expect(() => compiler.transformFilters({ NOT: { flagged: true } })).toThrowError(z.ZodError);
  });

  it('plain single-operator behavior unchanged: OR alone produces only orBranches', () => {
    const result = compiler.transformFilters({ OR: [{ flagged: true }, { inInbox: true }] });
    expect(result).toEqual({ orBranches: [{ flagged: true }, { inInbox: true }] });
  });
});
```

Add `import { z } from 'zod';` to the test file if absent (it is present already for OMN-131 tests — verify).

- [ ] **Step 2: Rewrite the two empty-OR pinning tests**

In `QueryCompiler.test.ts` ~741: replace the `describe('OR: [] short-circuits to {}')` block with:

```typescript
describe('OR: [] rejects (OMN-151; was match-all)', () => {
  it('throws a validation error instead of compiling to {}', () => {
    expect(() => compiler.transformFilters({ OR: [] })).toThrowError(z.ZodError);
  });
});
```

In `tests/unit/contracts/ast/filter-coverage.test.ts` ~227: replace `it('returns empty filter for empty OR array')` with
the same throw assertion (adjust to that file's compiler instance/imports).

- [ ] **Step 3: Check the AND-merge pin at line ~403**

`it('flattens AND operator by merging conditions')` — read it. If its conditions are non-conflicting, it stays green
(non-conflicting merge is preserved behavior); update its name/comment only if it asserts last-wins on a conflict.

- [ ] **Step 4: Run new tests — fail**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts` Expected: FAIL — the new describe
fails (siblings dropped, conflicts last-win, empties return {}).

- [ ] **Step 5: Implement the merge semantics in `QueryCompiler.ts`**

Replace `transformFilters` and DELETE `transformLogicalOperator` (its NOT logic moves to `transformNot`):

```typescript
import { mergeConflictChecked, emptyOperatorError, type MergeSource } from './filter-merge.js';

transformFilters(input: QueryFilter): TaskFilter {
  // OMN-151: base fields and logical operators AND-compose (spec P2). The old
  // early-return silently dropped sibling keys (V1) and the second operator (V4).
  const sources: MergeSource[] = [{ origin: 'filters', filter: this.transformFlatFilter(input as FlatQueryFilter) }];

  if (input.AND !== undefined && Array.isArray(input.AND)) {
    if (input.AND.length === 0) throw emptyOperatorError('AND');
    input.AND.forEach((condition, i) => {
      sources.push({ origin: `AND[${i}]`, filter: this.transformFlatFilter(condition as FlatQueryFilter) });
    });
  }

  if (input.NOT !== undefined) {
    sources.push({ origin: 'NOT', filter: this.transformNot(input.NOT as FlatQueryFilter) });
  }

  const merged = mergeConflictChecked(sources);

  if (input.OR !== undefined && Array.isArray(input.OR)) {
    if (input.OR.length === 0) throw emptyOperatorError('OR');
    merged.orBranches = input.OR.map((condition) => this.transformFlatFilter(condition as FlatQueryFilter));
  }

  return merged;
}

private transformNot(notFilter: FlatQueryFilter): TaskFilter {
  // OMN-131 contract, unchanged: exactly the two status payloads; everything
  // else hard-rejects (was silent match-all before 5b41534).
  if (Object.keys(notFilter).length === 1) {
    if (notFilter.status === 'completed') return { completed: false };
    if (notFilter.status === 'active') return { completed: true };
  }
  throw new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ['query', 'filters', 'NOT'],
      message:
        `Unsupported NOT filter: ${JSON.stringify(notFilter)}. ` +
        "NOT supports exactly { status: 'completed' } or { status: 'active' }. " +
        'Alternatives: tag exclusion → tags: { none: [...] }; ' +
        'flagged exclusion → flagged: false; ' +
        'otherwise express the condition directly without NOT.',
    },
  ]);
}
```

NOTE: `transformFlatFilter(input as FlatQueryFilter)` on the top-level input must IGNORE the `AND`/`OR`/`NOT` keys —
they are not in `filterFields`, but the `validateFilterProperties` safety net inside `transformFlatFilter` operates on
the OUTPUT TaskFilter, not the input, so no change is needed there. Verify no `console.warn` fires in the new tests.

- [ ] **Step 6: Run the full compiler suites — pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/ tests/unit/contracts/ast/filter-coverage.test.ts`
Expected: PASS (new describe green, rewritten pins green, pre-existing tests green).

- [ ] **Step 7: Run the WHOLE unit suite — surface collateral pins**

Run: `npm run test:unit` Expected: PASS, or a small set of failures that are pins of V1–V4 behavior elsewhere. Rewrite
each failing pin to assert the new behavior (same pattern as Step 2) — they are regression guards now. Anything failing
that is NOT a pin of the old behavior: STOP and report (do not contort the implementation).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(OMN-151): transformFilters AND-composes siblings and operators; conflicts and empty operators reject loudly"
```

---

### Task 4: `buildAST` — base conditions compose with orBranches (TDD)

**Files:**

- Modify: `src/contracts/ast/builder.ts`
- Modify: `tests/unit/contracts/ast/builder.test.ts`

- [ ] **Step 1: Write failing tests (builder.test.ts; follow that file's existing import/use pattern)**

```typescript
describe('orBranches composition (OMN-151 V5/V6)', () => {
  it('ANDs base conditions with the OR group instead of dropping them', () => {
    const ast = buildAST({
      flagged: true,
      completed: false,
      orBranches: [
        { name: 'a', nameOperator: 'CONTAINS' },
        { name: 'b', nameOperator: 'CONTAINS' },
      ],
    });
    const code = emitOmniJS(ast).predicate;
    expect(code).toContain('task.flagged === true');
    expect(code).toContain('task.completed === false');
    expect(code).toContain('||'); // the OR group survives
  });

  it('pure-OR filters emit identically to before (no base conditions)', () => {
    const ast = buildAST({ orBranches: [{ flagged: true }, { inInbox: true }] });
    const code = emitOmniJS(ast).predicate;
    expect(code).not.toContain('&&'); // nothing AND-composed around the OR
    expect(code).toContain('||');
  });

  it('single-branch OR with base keys still ANDs', () => {
    const ast = buildAST({ flagged: true, orBranches: [{ completed: false }] });
    const code = emitOmniJS(ast).predicate;
    expect(code).toContain('task.flagged === true');
    expect(code).toContain('task.completed === false');
  });
});
```

(Use that file's actual emitter import — if `emitOmniJS` isn't already used there, assert on AST node shape instead: top
node `and` containing an `or` node plus comparisons. Inspect the file's helpers before writing.)

- [ ] **Step 2: Run — fail** (base conditions currently dropped)

- [ ] **Step 3: Implement in `builder.ts`** — replace the orBranches early-return block:

```typescript
export function buildAST(filter: TaskFilter | NormalizedTaskFilter): FilterNode {
  const conditions: FilterNode[] = [];

  for (const def of FILTER_DEFS) {
    const node = def.build(filter);
    if (node) conditions.push(node);
  }

  // OMN-151: OR branches AND-compose with base conditions. The old early
  // return dropped every base key beside orBranches — including the keys
  // augmentFilterForMode adds, so mode:'flagged' + OR silently ignored the
  // mode (V6).
  if (filter.orBranches && filter.orBranches.length > 0) {
    const branchNodes = filter.orBranches.map((branch) => buildAST(branch));
    conditions.push(branchNodes.length === 1 ? branchNodes[0] : or(...branchNodes));
  }

  if (conditions.length === 0) return literal(true);
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}
```

- [ ] **Step 4: Run builder + script-builder + emitter suites — pass; fix any V5 pins**

Run: `npm run test:unit -- tests/unit/contracts/ast/` Expected: PASS. If a test pinned "orBranches ignores base keys,"
rewrite it as a composition assertion.

- [ ] **Step 5: Add the mode-interplay + OMN-157 interplay pins (script-builder level)**

In `tests/unit/contracts/ast/script-builder.test.ts` (follow its existing test style):

```typescript
describe('OR queries compose with defaults and modes (OMN-151 V6 / OMN-157)', () => {
  it('buildFilteredTasksScript with orBranches still applies the default dropped-exclusion', () => {
    const { script } = buildFilteredTasksScript({ orBranches: [{ flagged: true }, { inInbox: true }] });
    expect(script).toContain('dropped'); // OMN-157 default now survives beside OR
  });

  it('buildTaskCountScript with orBranches agrees (countOnly path, spec §3.2 / C15)', () => {
    const { script } = buildTaskCountScript({ orBranches: [{ flagged: true }, { inInbox: true }] });
    expect(script).toContain('dropped'); // same buildAST route — count predicate matches the row predicate
  });
});
```

And in `tests/unit/tools/unified/compilers/QueryCompiler.test.ts` (tasks-side acceptance pin from the spec §3.5 —
insurance against over-applying the projects-only reject):

```typescript
it('tasks: {completed:false, status:"dropped"} remains ACCEPTED (returns dropped semantics, no reject)', () => {
  const result = compiler.transformFilters({ status: 'dropped', completed: false });
  expect(result.dropped).toBe(true);
  expect(result.completed).toBe(false);
});
```

- [ ] **Step 6: Full unit suite green, commit**

```bash
npm run test:unit
git add -A
git commit -m "fix(OMN-151): buildAST composes base conditions with orBranches — modes and defaults apply to OR queries"
```

---

### Task 5: `transformProjectFilters` — typed projects compile with exhaustive disposition (TDD)

**Files:**

- Create: `src/tools/unified/compilers/transform-project-filters.ts`
- Create: `tests/unit/tools/unified/compilers/transform-project-filters.test.ts`
- Modify: `src/tools/unified/compilers/filter-merge.ts` (receives `STATUS_TO_PROJECT` + `extractTextCondition`)
- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (imports them from filter-merge)

Pre-step — IMPORTANT, avoids a circular import (QueryCompiler will import transformProjectFilters in Task 6, so
transform-project-filters must NOT import from QueryCompiler): move the shared helpers into `filter-merge.ts`, which
both modules import. Lift the `STATUS_TO_PROJECT` map out of `transformStatus` (QueryCompiler.ts) into an exported
module-level `export const STATUS_TO_PROJECT: Record<string, ProjectStatus>` in `filter-merge.ts` (same content; import
`ProjectStatus` type from `../../../contracts/filters.js`), update `transformStatus` to import it, and add the
contains/matches helper to `filter-merge.ts`:

```typescript
export function extractTextCondition(
  f: { contains?: string; matches?: string } | undefined,
): { value: string; operator: 'CONTAINS' | 'MATCHES' } | null {
  if (!f) return null;
  if ('contains' in f && f.contains) return { value: f.contains, operator: 'CONTAINS' };
  if ('matches' in f && f.matches) return { value: f.matches, operator: 'MATCHES' };
  return null;
}
```

Refactor `transformTextFilters` to use it (tests stay green — run the compiler suite after).

- [ ] **Step 1: Write failing tests** (`transform-project-filters.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { transformProjectFilters } from '../../../../../src/tools/unified/compilers/transform-project-filters.js';

const reject = (input: unknown) => expect(() => transformProjectFilters(input as never)).toThrowError(z.ZodError);
const msgOf = (input: unknown): string => {
  try {
    transformProjectFilters(input as never);
  } catch (e) {
    return (e as z.ZodError).issues.map((i) => i.message).join(' | ');
  }
  throw new Error('expected throw');
};

describe('transformProjectFilters — maps', () => {
  it('status maps through STATUS_TO_PROJECT', () => {
    expect(transformProjectFilters({ status: 'on_hold' })).toEqual({ status: ['onHold'] });
  });
  it('folder string → folderName; folder null → topLevelOnly', () => {
    expect(transformProjectFilters({ folder: 'Work' })).toEqual({ folderName: 'Work' });
    expect(transformProjectFilters({ folder: null })).toEqual({ topLevelOnly: true });
  });
  it('name/text map with operators', () => {
    expect(transformProjectFilters({ name: { matches: 'a|b' } })).toEqual({ name: 'a|b', nameOperator: 'MATCHES' });
    expect(transformProjectFilters({ text: { contains: 'x' } })).toEqual({ text: 'x', textOperator: 'CONTAINS' });
  });
  it('flagged maps (V7 — was silently dropped)', () => {
    expect(transformProjectFilters({ flagged: true })).toEqual({ flagged: true });
  });
  it('id alone maps', () => {
    expect(transformProjectFilters({ id: 'abc' })).toEqual({ id: 'abc' });
  });
});

describe('transformProjectFilters — completed mapping (decision record)', () => {
  it('completed:true → status [done]', () => {
    expect(transformProjectFilters({ completed: true })).toEqual({ status: ['done'] });
  });
  it('completed:false → status [active, onHold] — dropped EXCLUDED (GTD/parity reading)', () => {
    expect(transformProjectFilters({ completed: false })).toEqual({ status: ['active', 'onHold'] });
  });
  it('compatible status+completed intersect: {status:active, completed:false} → [active]', () => {
    expect(transformProjectFilters({ status: 'active', completed: false })).toEqual({ status: ['active'] });
  });
  it('disjoint status+completed reject: {completed:false, status:"dropped"} steers to status alone', () => {
    expect(msgOf({ completed: false, status: 'dropped' })).toMatch(/status: ?'dropped'|status:'dropped'/);
  });
  it('disjoint status+completed reject: {completed:true, status:"active"}', () => {
    reject({ completed: true, status: 'active' });
  });
});

describe('transformProjectFilters — id exclusivity', () => {
  it('id + any other filter key rejects with steering', () => {
    expect(msgOf({ id: 'abc', flagged: true })).toMatch(/exact lookup/i);
  });
  it('id inside AND with other conditions rejects (merge happens first)', () => {
    reject({ AND: [{ id: 'abc' }, { name: { contains: 'x' } }] });
  });
});

describe('transformProjectFilters — AND input-space merge', () => {
  it('merges supported keys across AND conditions and top level', () => {
    expect(transformProjectFilters({ flagged: true, AND: [{ status: 'active' }, { folder: 'Work' }] })).toEqual({
      flagged: true,
      status: ['active'],
      folderName: 'Work',
    });
  });
  it('AND: [] rejects', () => reject({ AND: [] }));
  it('same input key, different values across AND rejects', () => {
    reject({ AND: [{ folder: 'Work' }, { folder: 'Home' }] });
  });
  it('deep-equal duplicates merge silently', () => {
    expect(transformProjectFilters({ AND: [{ flagged: true }, { flagged: true }] })).toEqual({ flagged: true });
  });
});

describe('transformProjectFilters — rejects (P1/P3: never silently drop)', () => {
  it('OR rejects with steering naming working alternatives (OMN-156 / C18)', () => {
    const m = msgOf({ OR: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }] });
    expect(m).toMatch(/not supported on projects/i);
    expect(m).toMatch(/filters\.name|filters\.text|filters\.status/);
    expect(m).toMatch(/one query per alternative/i);
  });
  it('NOT rejects with steering', () => {
    expect(msgOf({ NOT: { status: 'completed' } })).toMatch(/not supported on projects/i);
  });
  it.each([
    ['tags', { tags: { any: ['x'] } }],
    ['dueDate', { dueDate: { before: '2026-01-01' } }],
    ['deferDate', { deferDate: { after: '2026-01-01' } }],
    ['plannedDate', { plannedDate: { before: '2026-01-01' } }],
    ['completionDate', { completionDate: { before: '2026-01-01' } }],
    ['added', { added: { after: '2026-01-01' } }],
    ['estimatedMinutes', { estimatedMinutes: { lessThan: 30 } }],
    ['project', { project: 'X' }],
    ['projectId', { projectId: 'abc' }],
    ['parentTaskId', { parentTaskId: 'abc' }],
    ['inInbox', { inInbox: true }],
    ['available', { available: true }],
    ['blocked', { blocked: false }],
  ])('unsupported key %s rejects naming the key', (key, input) => {
    expect(msgOf(input)).toContain(key);
  });
  it('multiple unsupported keys are all named in one error', () => {
    const m = msgOf({ tags: { any: ['x'] }, inInbox: true });
    expect(m).toContain('tags');
    expect(m).toContain('inInbox');
  });
  it('empty filters object compiles to empty ProjectFilter (bare browse unchanged)', () => {
    expect(transformProjectFilters({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run — fail (module not found)**

- [ ] **Step 3: Implement `transform-project-filters.ts`**

```typescript
import { z } from 'zod';
import type { FilterValue, FlatFilterValue } from '../schemas/read-schema.js';
import type { ProjectFilter, ProjectStatus } from '../../../contracts/filters.js';
import { STATUS_TO_PROJECT, extractTextCondition, filterDeepEqual, emptyOperatorError } from './filter-merge.js';

type ProjectInputKey = keyof FlatFilterValue | 'AND' | 'OR' | 'NOT';
type Disposition = 'map' | 'merge' | 'reject';

/**
 * OMN-156 (C-lite): every input-schema filter key has an explicit projects
 * disposition. `satisfies` makes a NEW schema field a compile error here until
 * someone decides its projects behavior — silent dropping is structurally
 * impossible (the MUTATION_DEFS registration pattern; spec P1).
 * Full per-query-type contracts: OMN-161.
 */
const PROJECT_KEY_DISPOSITION = {
  id: 'map',
  status: 'map',
  completed: 'map',
  flagged: 'map',
  folder: 'map',
  text: 'map',
  name: 'map',
  AND: 'merge',
  OR: 'reject',
  NOT: 'reject',
  tags: 'reject',
  project: 'reject',
  projectId: 'reject',
  parentTaskId: 'reject',
  dueDate: 'reject',
  deferDate: 'reject',
  plannedDate: 'reject',
  completionDate: 'reject',
  added: 'reject',
  available: 'reject',
  blocked: 'reject',
  inInbox: 'reject',
  estimatedMinutes: 'reject',
} as const satisfies Record<ProjectInputKey, Disposition>;

const SUPPORTED = 'Supported projects filters: status, completed, flagged, name, text, folder, id.';

function projectsError(path: Array<string | number>, message: string): z.ZodError {
  return new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['query', 'filters', ...path], message }]);
}

const COMPLETED_STATUS: Record<'true' | 'false', ProjectStatus[]> = {
  // Decision record (spec §3.3): completed:false is the GTD "still live?"
  // question — dropped is a terminal verdict, excluded for parity with the
  // tasks-side OMN-157 default. status:'dropped' is the explicit vocabulary.
  true: ['done'],
  false: ['active', 'onHold'],
};

export function transformProjectFilters(input: FilterValue): ProjectFilter {
  // 1. AND merges in INPUT space (then the merged input transforms below).
  const merged: Record<string, unknown> = {};
  const originOf: Record<string, string> = {};
  const mergeFrom = (origin: string, flat: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(flat)) {
      if (value === undefined) continue;
      if (key in merged) {
        if (!filterDeepEqual(merged[key], value)) {
          throw projectsError(
            [],
            `Conflicting values for '${key}' (from ${originOf[key]} and ${origin}): ` +
              `${JSON.stringify(merged[key])} vs ${JSON.stringify(value)}. Filters AND-compose. ${SUPPORTED}`,
          );
        }
        continue;
      }
      merged[key] = value;
      originOf[key] = origin;
    }
  };
  const { AND, OR, NOT, ...top } = input as Record<string, unknown> & FilterValue;
  mergeFrom('filters', top);
  if (AND !== undefined && Array.isArray(AND)) {
    if (AND.length === 0) throw emptyOperatorError('AND');
    (AND as FlatFilterValue[]).forEach((cond, i) => mergeFrom(`AND[${i}]`, cond as Record<string, unknown>));
  }

  // 2. OR / NOT: unsupported on projects — loud, with working alternatives (P3; OMN-131 pattern).
  if (OR !== undefined || NOT !== undefined) {
    const op = OR !== undefined ? 'OR' : 'NOT';
    throw projectsError(
      [op],
      `Logical operator ${op} is not supported on projects queries. ` +
        'Use a single filters.name / filters.text / filters.status condition, or run one query per alternative.',
    );
  }

  // 3. Reject every unsupported key, all named in one error.
  const offenders = Object.keys(merged).filter(
    (key) => (PROJECT_KEY_DISPOSITION as Record<string, Disposition>)[key] !== 'map',
  );
  if (offenders.length > 0) {
    throw projectsError(
      [],
      `Unsupported filter${offenders.length > 1 ? 's' : ''} on projects queries: ${offenders.join(', ')}. ${SUPPORTED}`,
    );
  }

  // 4. id is an exclusive fast path (spec §3.3): silently ignoring co-filters
  //    is the same drop class this module closes.
  const keys = Object.keys(merged);
  if (merged.id !== undefined && keys.length > 1) {
    throw projectsError(
      ['id'],
      `'id' is an exact lookup and cannot combine with other filters (got: ${keys.filter((k) => k !== 'id').join(', ')}). ` +
        'Remove the other filters, or drop id to search.',
    );
  }

  // 5. Map.
  const result: ProjectFilter = {};
  if (typeof merged.id === 'string') result.id = merged.id;
  if (typeof merged.flagged === 'boolean') result.flagged = merged.flagged;

  let statusSet: ProjectStatus[] | undefined;
  if (typeof merged.status === 'string') {
    const mapped = STATUS_TO_PROJECT[merged.status];
    if (mapped) statusSet = [mapped];
  }
  if (typeof merged.completed === 'boolean') {
    const completedSet = COMPLETED_STATUS[String(merged.completed) as 'true' | 'false'];
    if (statusSet) {
      const intersection = statusSet.filter((s) => completedSet.includes(s));
      if (intersection.length === 0) {
        throw projectsError(
          [],
          `'completed: ${merged.completed}' contradicts 'status: ${String(merged.status)}' on projects ` +
            `(completed:false means active/on-hold). For dropped projects use status:'dropped' alone; ` +
            `for done projects use status:'completed' or completed:true.`,
        );
      }
      statusSet = intersection;
    } else {
      statusSet = completedSet;
    }
  }
  if (statusSet) result.status = statusSet;

  if (merged.folder === null) {
    result.topLevelOnly = true;
  } else if (typeof merged.folder === 'string') {
    result.folderName = merged.folder;
  }

  const nameCond = extractTextCondition(merged.name as { contains?: string; matches?: string } | undefined);
  if (nameCond) {
    result.name = nameCond.value;
    result.nameOperator = nameCond.operator;
  }
  const textCond = extractTextCondition(merged.text as { contains?: string; matches?: string } | undefined);
  if (textCond) {
    result.text = textCond.value;
    result.textOperator = textCond.operator;
  }

  return result;
}
```

- [ ] **Step 4: Run — pass.** `npm run test:unit -- tests/unit/tools/unified/compilers/`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(OMN-156): transformProjectFilters — typed projects compile, exhaustive disposition, input-vocabulary rejects"
```

---

### Task 6: Wire `compile()` + `handleProjectQuery` consumes `projectFilter` (TDD)

**Files:**

- Modify: `src/tools/unified/compilers/QueryCompiler.ts` (`CompiledQuery.projectFilter`, projects branch in `compile()`)
- Modify: `src/tools/unified/OmniFocusReadTool.ts` (`handleProjectQuery`, `executeProjectIdLookup` call site)
- Modify: `tests/unit/tools/unified/OmniFocusReadTool.test.ts` and
  `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

- [ ] **Step 1: Failing compile() tests (QueryCompiler.test.ts)**

```typescript
describe('compile() projects branch (OMN-156 C-lite)', () => {
  it('populates projectFilter and leaves filters empty for projects queries', () => {
    const compiled = compiler.compile({
      query: { type: 'projects', filters: { flagged: true, status: 'active' } },
    } as never);
    expect(compiled.projectFilter).toEqual({ flagged: true, status: ['active'] });
    // compiled.filters is the empty normalized filter — nothing leaks through the old path
    expect(compiled.filters.flagged).toBeUndefined();
    expect(compiled.filters.projectStatus).toBeUndefined();
  });
  it('throws from compile() for OR on projects (reaches BaseTool as VALIDATION_ERROR)', () => {
    expect(() =>
      compiler.compile({ query: { type: 'projects', filters: { OR: [{ name: { contains: 'a' } }] } } } as never),
    ).toThrowError(z.ZodError);
  });
  it('tasks queries do NOT get a projectFilter', () => {
    const compiled = compiler.compile({ query: { type: 'tasks', filters: { flagged: true } } } as never);
    expect(compiled.projectFilter).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement the compile() branch**

In `CompiledQuery`, add `projectFilter?: ProjectFilter;` (import type). In `compile()`:

```typescript
// OMN-156 (C-lite): projects filters compile to a typed ProjectFilter in
// INPUT vocabulary. compiled.filters stays an empty normalized TaskFilter for
// projects — handleProjectQuery must consume ONLY projectFilter.
const isProjects = query.type === 'projects';
const projectFilter = isProjects ? transformProjectFilters(query.filters ?? {}) : undefined;
const rawFilters: TaskFilter = !isProjects && query.filters ? this.transformFilters(query.filters) : {};
```

(then `projectFilter` in the returned object; the existing `fastSearch` threading stays — it is gated on
`'fastSearch' in query`, which is false for projects.)

- [ ] **Step 3: Rewire `handleProjectQuery` (and run its unit tests RED→GREEN)**

In `OmniFocusReadTool.ts` `handleProjectQuery`:

```typescript
// OMN-156 (C-lite): the compiler emits a typed ProjectFilter; the old
// cherry-pick re-narrowing seam (silently dropped unmapped keys → match-all,
// D10) is deleted, not guarded.
const projectFilter: ProjectFilter = compiled.projectFilter ?? {};

if (projectFilter.id) {
  return this.executeProjectIdLookup(projectFilter.id, effectiveFields, timer);
}

const isNarrowLookup = Boolean(projectFilter.name || projectFilter.text || projectFilter.id);
```

DELETE: the whole `const projectFilter: ProjectFilter = {}` cherry-pick block (the `compiled.filters.projectStatus`,
`folderTopLevel`, `folder`, `search`, `text`, `name` ifs) and the old `compiled.filters.id` fast-path check. The
`compiled.filters.search` branch is dead code (the compiler never sets `search`) — verify with
`grep -n "result.search" src/tools/unified/compilers/QueryCompiler.ts` (expect no hits) and note it in the commit
message. Cache key construction (`{ ...projectFilter, limit, includeStats }`) is unchanged in shape.

Check other `compiled.filters` consumers on the projects path only:
`grep -n "compiled.filters" src/tools/unified/OmniFocusReadTool.ts` — task/export paths (lines ~165, ~986) stay
untouched.

- [ ] **Step 4: Update OmniFocusReadTool.test.ts projects tests**

Run: `npm run test:unit -- tests/unit/tools/unified/OmniFocusReadTool.test.ts` Any failing projects-query test that
constructed filters the old way: update to the new expectation (queries with supported filters behave identically;
queries with unsupported filters now throw). Add one new test:

```typescript
it('projects query with flagged filter reaches the script builder (was silently dropped, V7)', async () => {
  // follow the file's existing mock pattern for execJson / buildFilteredProjectsScript spies
});
```

- [ ] **Step 5: Full unit suite + build**

Run: `npm run test:unit && npm run build` Expected: PASS / clean compile.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(OMN-156): projects queries consume compiled.projectFilter — cherry-pick seam deleted"
```

---

### Task 7: Integration tests — C18-shape rejection + OR composition property

**Files:**

- Create: `tests/integration/projects-filter-rejection.test.ts` (MODEL: `tests/integration/not-filter-rejection.test.ts`
  — copy its client/setup/teardown pattern exactly)
- Modify (extend): the same new file covers the mode+OR property

- [ ] **Step 1: Write the tests**

Three cases, using the model file's MCP-client harness:

1. `projects + OR` → expect InvalidParams / VALIDATION_ERROR whose message matches `/not supported on projects/i` AND
   `/filters\.name/` (C18 shape: steering present, never 10 generic rows).
2. `projects + completed:false` → expect SUCCESS (was match-all; now compiles to status active/onHold). Assert every
   returned row has `status` ∈ {active, onHold} if the fixture returns rows (property assertion, fixture-independent).
3. `tasks + mode:'flagged' + OR of two name-contains` → expect SUCCESS and EVERY returned row has `flagged === true` (V6
   property assertion — fixture-independent; do not assert counts).

- [ ] **Step 2: Build, then run integration IN THE BACKGROUND**

```bash
npm run build
```

Then run with `run_in_background: true` (NEVER foreground — memory `tooling_integration_run_orphan_class`):
`npm run test:integration -- tests/integration/projects-filter-rejection.test.ts 2>&1 > /tmp/omn151-integ.log` Read the
log file when it completes. Expected: PASS (requires OmniFocus running; if the environment is wedged — probes hanging —
STOP and report rather than looping).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/projects-filter-rejection.test.ts
git commit -m "test(OMN-156): integration — projects OR rejects with steering; completed:false and mode+OR compose"
```

---

### Task 8: Docs — schema comment, tool description, behavior spec, CHANGELOG

**Files:**

- Modify: `src/tools/unified/schemas/read-schema.ts` (~lines 33-40)
- Modify: `src/tools/unified/OmniFocusReadTool.ts` (description string — audit)
- Modify: `docs/spec/read-filters.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Rewrite the stale schema header comment** (read-schema.ts ~33-40) to:

```typescript
// =============================================================================
// FILTER SCHEMAS (flat — no recursive nesting)
// =============================================================================
// QueryCompiler.transformFilters handles one level of AND/OR/NOT (OMN-151):
//   base fields + operators AND-compose; key conflicts and empty operator
//   arrays reject loudly (VALIDATION_ERROR)
//   OR: each branch compiles independently → orBranches (ANDed with base keys)
//   NOT: exactly {status:'completed'} / {status:'active'}; all else rejects (OMN-131)
// Projects queries: filters compile via transformProjectFilters — supported
// keys only (status/completed/flagged/name/text/folder/id); AND merges;
// OR/NOT and task-only keys reject with steering (OMN-156).
// The schema matches this capability. No z.lazy() needed.
```

- [ ] **Step 2: Audit the tool description + inputSchema** (CLAUDE.md dual-schema rule)

`grep -n "OR\|AND\|NOT" src/tools/unified/OmniFocusReadTool.ts` within the `description` string and `inputSchema`
getter. Update any claim contradicted by the new semantics; ADD one line to the description's projects guidance:
"Projects filters support status/completed/flagged/name/text/folder/id; logical operators are not supported on projects
queries." Also `grep -rn "OR" docs/skills/omnifocus-assistant/SKILL.md | head` — if it advertises OR on projects, fix;
otherwise leave.

- [ ] **Step 3: Update `docs/spec/read-filters.md`**

- §3.6 table: replace the `AND` row ("merges one level deep" → "explicit AND; merges conflict-checked — conflicting
  values reject (OMN-151)"); add rows: "(siblings) base fields beside operators AND-compose (OMN-151; previously
  silently dropped)" and "`AND: []` / `OR: []` reject (OMN-151; empty OR previously compiled to match-all)".
- §4 (modes): note modes compose with OR since OMN-151 (V6 fix).
- §6 (projects): add the supported-filter list, the `completed`→status mapping with the decision-record cross-ref, the
  id-exclusive fast-path rule, and "logical operators reject with steering".
- §8 drift register: D10 → RESOLVED (OMN-156, this PR); add D15 (compiler sibling/AND/empty-OR drops, OMN-151) and D16
  (buildAST orBranches base-key drop incl. mode+OR, OMN-151) as RESOLVED rows with this PR's ticket refs.
- §9 C18: mark shipped shape = "steering validation error".

- [ ] **Step 4: CHANGELOG entries** (`[Unreleased] > Fixed`, follow the existing OMN-139/141 entry style): one entry for
      OMN-151 (siblings/AND-conflicts/empty-operators/mode+OR composition), one for OMN-156 (projects filters
      typed-compile; OR and unsupported keys reject; flagged/completed now effective).

- [ ] **Step 5: Unit suite (guards CLAUDE.md path refs + docs), commit**

```bash
npm run test:unit
git add -A
git commit -m "docs(OMN-151/156): schema comment, tool description, read-filters spec rows, CHANGELOG"
```

---

### Task 9: Full gates

- [ ] **Step 1:** `npm run build` — clean.
- [ ] **Step 2:** `npm run test:unit` — all pass.
- [ ] **Step 3:** FULL `npm run test:integration` in the background (same logging pattern as Task 7); read the log.
      Pre-existing failures unrelated to filters: report, don't fix here.
- [ ] **Step 4:** Conformance (local-model bar): check Ollama with
      `curl -s --max-time 2 http://localhost:11434/api/tags >/dev/null && echo UP || echo DOWN`. If UP:
      `npm run conformance` and compare against the published bar; a regression on a new reject means the steering
      message needs improving — fix the message, not the reject. If DOWN: note "conformance not run (Ollama down)" in
      the PR body.
- [ ] **Step 5:** Commit any stragglers; push branch; report results.

---

## Out of scope (do NOT do)

- Implementing OR/NOT evaluation on projects (OMN-161).
- Touching tags/folders/perspectives/export filter handling (audit only — if their handlers also cherry-pick compiled
  filters, note findings in the final report for OMN-161; change nothing).
- The analyze tool's separate ProjectFilter construction.
- Tasks-side id-exclusivity (noted for OMN-161).
- Cache honesty re-verification (sequenced after this PR per OMN-156 acceptance).
