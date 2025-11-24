# QueryCompiler TaskFilter Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform `FilterValue` (API schema) to `TaskFilter` (contracts) inside QueryCompiler to catch property name mismatches at compile time.

**Architecture:** QueryCompiler gains a `transformFilters()` method that converts the Zod-validated API input into the internal TaskFilter type. This creates a single translation point with compile-time type safety. Logical operators (OR/NOT) are flattened with logging for future analysis.

**Tech Stack:** TypeScript, Vitest, Zod schemas, existing contracts in `src/contracts/`

**Design Doc:** `docs/plans/2025-11-24-querycompiler-taskfilter-integration.md`

---

## Task 1: Add Status Transformation Tests

**Files:**
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Write failing tests for status transformation**

```typescript
describe('transformFilters', () => {
  describe('status transformation', () => {
    it('transforms status: completed to completed: true', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({ status: 'completed' });
      expect(result.completed).toBe(true);
    });

    it('transforms status: active to completed: false', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({ status: 'active' });
      expect(result.completed).toBe(false);
    });

    it('leaves completed undefined when status not specified', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({});
      expect(result.completed).toBeUndefined();
    });

    it('transforms status: dropped to completed: undefined (passthrough)', () => {
      const compiler = new QueryCompiler();
      const result = compiler.transformFilters({ status: 'dropped' });
      // dropped is a separate status, not completion-related
      expect(result.completed).toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: FAIL with "transformFilters is not a function" or similar

**Step 3: Commit failing tests**

```bash
git add tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "test: add failing tests for status transformation in QueryCompiler"
```

---

## Task 2: Implement Status Transformation

**Files:**
- Modify: `src/tools/unified/compilers/QueryCompiler.ts`

**Step 1: Add TaskFilter import and transformFilters method**

Add import at top of file:
```typescript
import type { TaskFilter } from '../../../contracts/filters.js';
```

Add method to QueryCompiler class:
```typescript
/**
 * Transform FilterValue (API schema) to TaskFilter (internal contract)
 * This is the single translation point for filter property names.
 */
transformFilters(input: QueryFilter): TaskFilter {
  const result: TaskFilter = {};

  // Status transformation
  if (input.status === 'completed') {
    result.completed = true;
  } else if (input.status === 'active') {
    result.completed = false;
  }
  // 'dropped' and 'on_hold' don't map to completion status

  return result;
}
```

**Step 2: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: All 4 new tests PASS

**Step 3: Commit implementation**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "feat: add status transformation in QueryCompiler.transformFilters()"
```

---

## Task 3: Add Tag Transformation Tests

**Files:**
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Write failing tests for tag transformation**

Add to the `transformFilters` describe block:
```typescript
describe('tag transformation', () => {
  it('transforms tags.any to tags + tagsOperator: OR', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      tags: { any: ['urgent', 'home'] }
    });
    expect(result.tags).toEqual(['urgent', 'home']);
    expect(result.tagsOperator).toBe('OR');
  });

  it('transforms tags.all to tags + tagsOperator: AND', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      tags: { all: ['work', 'priority'] }
    });
    expect(result.tags).toEqual(['work', 'priority']);
    expect(result.tagsOperator).toBe('AND');
  });

  it('transforms tags.none to tags + tagsOperator: NOT_IN', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      tags: { none: ['waiting'] }
    });
    expect(result.tags).toEqual(['waiting']);
    expect(result.tagsOperator).toBe('NOT_IN');
  });

  it('handles empty tags object', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({ tags: {} });
    expect(result.tags).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: FAIL - tags not being transformed

**Step 3: Commit failing tests**

```bash
git add tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "test: add failing tests for tag transformation"
```

---

## Task 4: Implement Tag Transformation

**Files:**
- Modify: `src/tools/unified/compilers/QueryCompiler.ts`

**Step 1: Add tag transformation to transformFilters method**

Add after status transformation:
```typescript
// Tag transformation
if (input.tags) {
  const tagFilter = input.tags as { any?: string[]; all?: string[]; none?: string[] };
  if (tagFilter.any && tagFilter.any.length > 0) {
    result.tags = tagFilter.any;
    result.tagsOperator = 'OR';
  } else if (tagFilter.all && tagFilter.all.length > 0) {
    result.tags = tagFilter.all;
    result.tagsOperator = 'AND';
  } else if (tagFilter.none && tagFilter.none.length > 0) {
    result.tags = tagFilter.none;
    result.tagsOperator = 'NOT_IN';
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: All tag tests PASS

**Step 3: Commit implementation**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "feat: add tag transformation in QueryCompiler.transformFilters()"
```

---

## Task 5: Add Date Transformation Tests

**Files:**
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Write failing tests for date transformation**

```typescript
describe('date transformation', () => {
  it('transforms dueDate.before to dueBefore', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      dueDate: { before: '2025-12-31' }
    });
    expect(result.dueBefore).toBe('2025-12-31');
  });

  it('transforms dueDate.after to dueAfter', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      dueDate: { after: '2025-01-01' }
    });
    expect(result.dueAfter).toBe('2025-01-01');
  });

  it('transforms dueDate.between to dueAfter + dueBefore + operator', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      dueDate: { between: ['2025-01-01', '2025-01-31'] }
    });
    expect(result.dueAfter).toBe('2025-01-01');
    expect(result.dueBefore).toBe('2025-01-31');
    expect(result.dueDateOperator).toBe('BETWEEN');
  });

  it('transforms deferDate.before to deferBefore', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      deferDate: { before: '2025-06-01' }
    });
    expect(result.deferBefore).toBe('2025-06-01');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: FAIL

**Step 3: Commit failing tests**

```bash
git add tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "test: add failing tests for date transformation"
```

---

## Task 6: Implement Date Transformation

**Files:**
- Modify: `src/tools/unified/compilers/QueryCompiler.ts`

**Step 1: Add date transformation to transformFilters method**

Add after tag transformation:
```typescript
// Date transformation helper
const transformDateFilter = (
  dateFilter: { before?: string; after?: string; between?: [string, string] } | undefined,
  beforeKey: 'dueBefore' | 'deferBefore',
  afterKey: 'dueAfter' | 'deferAfter',
  operatorKey?: 'dueDateOperator'
) => {
  if (!dateFilter) return;

  if ('before' in dateFilter && dateFilter.before) {
    (result as Record<string, unknown>)[beforeKey] = dateFilter.before;
  }
  if ('after' in dateFilter && dateFilter.after) {
    (result as Record<string, unknown>)[afterKey] = dateFilter.after;
  }
  if ('between' in dateFilter && dateFilter.between) {
    (result as Record<string, unknown>)[afterKey] = dateFilter.between[0];
    (result as Record<string, unknown>)[beforeKey] = dateFilter.between[1];
    if (operatorKey) {
      (result as Record<string, unknown>)[operatorKey] = 'BETWEEN';
    }
  }
};

// Due date transformation
transformDateFilter(
  input.dueDate as { before?: string; after?: string; between?: [string, string] },
  'dueBefore',
  'dueAfter',
  'dueDateOperator'
);

// Defer date transformation
transformDateFilter(
  input.deferDate as { before?: string; after?: string; between?: [string, string] },
  'deferBefore',
  'deferAfter'
);
```

**Step 2: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: All date tests PASS

**Step 3: Commit implementation**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "feat: add date transformation in QueryCompiler.transformFilters()"
```

---

## Task 7: Add Text and Boolean Transformation Tests

**Files:**
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Write failing tests**

```typescript
describe('text transformation', () => {
  it('transforms text.contains to text + textOperator: CONTAINS', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      text: { contains: 'search term' }
    });
    expect(result.text).toBe('search term');
    expect(result.textOperator).toBe('CONTAINS');
  });

  it('transforms text.matches to text + textOperator: MATCHES', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({
      text: { matches: 'exact' }
    });
    expect(result.text).toBe('exact');
    expect(result.textOperator).toBe('MATCHES');
  });
});

describe('boolean passthrough', () => {
  it('passes through flagged', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({ flagged: true });
    expect(result.flagged).toBe(true);
  });

  it('passes through available', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({ available: true });
    expect(result.available).toBe(true);
  });

  it('passes through blocked', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({ blocked: false });
    expect(result.blocked).toBe(false);
  });
});

describe('project/inbox transformation', () => {
  it('transforms project: null to inInbox: true', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({ project: null });
    expect(result.inInbox).toBe(true);
  });

  it('transforms project ID to projectId', () => {
    const compiler = new QueryCompiler();
    const result = compiler.transformFilters({ project: 'abc123' });
    expect(result.projectId).toBe('abc123');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: FAIL

**Step 3: Commit failing tests**

```bash
git add tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "test: add failing tests for text, boolean, and project transformation"
```

---

## Task 8: Implement Text and Boolean Transformation

**Files:**
- Modify: `src/tools/unified/compilers/QueryCompiler.ts`

**Step 1: Add remaining transformations**

Add after date transformation:
```typescript
// Text transformation
if (input.text) {
  const textFilter = input.text as { contains?: string; matches?: string };
  if ('contains' in textFilter && textFilter.contains) {
    result.text = textFilter.contains;
    result.textOperator = 'CONTAINS';
  } else if ('matches' in textFilter && textFilter.matches) {
    result.text = textFilter.matches;
    result.textOperator = 'MATCHES';
  }
}

// Boolean passthrough
if (input.flagged !== undefined) {
  result.flagged = input.flagged;
}
if (input.available !== undefined) {
  result.available = input.available;
}
if (input.blocked !== undefined) {
  result.blocked = input.blocked;
}
if (input.inInbox !== undefined) {
  result.inInbox = input.inInbox;
}

// Project transformation
if (input.project === null) {
  result.inInbox = true;
} else if (typeof input.project === 'string') {
  result.projectId = input.project;
}

// ID passthrough
if (input.id) {
  result.id = input.id;
}
```

**Step 2: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: All tests PASS

**Step 3: Commit implementation**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "feat: add text, boolean, and project transformation"
```

---

## Task 9: Add Logical Operator Logging Tests

**Files:**
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Write tests for OR/NOT logging**

```typescript
describe('logical operator handling', () => {
  it('logs warning for OR operator and uses first condition', () => {
    const compiler = new QueryCompiler();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = compiler.transformFilters({
      OR: [{ status: 'active' }, { flagged: true }]
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OR operator not yet supported')
    );
    // Should use first condition
    expect(result.completed).toBe(false);

    warnSpy.mockRestore();
  });

  it('flattens AND operator by merging conditions', () => {
    const compiler = new QueryCompiler();

    const result = compiler.transformFilters({
      AND: [{ status: 'active' }, { flagged: true }]
    });

    expect(result.completed).toBe(false);
    expect(result.flagged).toBe(true);
  });

  it('transforms simple NOT status to inverse', () => {
    const compiler = new QueryCompiler();

    const result = compiler.transformFilters({
      NOT: { status: 'completed' }
    });

    expect(result.completed).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: FAIL

**Step 3: Commit failing tests**

```bash
git add tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "test: add failing tests for logical operator handling"
```

---

## Task 10: Implement Logical Operator Handling

**Files:**
- Modify: `src/tools/unified/compilers/QueryCompiler.ts`

**Step 1: Add logical operator handling at start of transformFilters**

Add at the beginning of transformFilters, before other transformations:
```typescript
// Handle logical operators
if (input.AND && Array.isArray(input.AND)) {
  // Merge all conditions
  for (const condition of input.AND) {
    const transformed = this.transformFilters(condition as QueryFilter);
    Object.assign(result, transformed);
  }
  return result;
}

if (input.OR && Array.isArray(input.OR)) {
  // Log warning and use first condition only
  console.warn(
    '[QueryCompiler] OR operator not yet supported - using first condition only. ' +
    'If you need OR logic, please open an issue with your use case.'
  );
  if (input.OR.length > 0) {
    return this.transformFilters(input.OR[0] as QueryFilter);
  }
  return result;
}

if (input.NOT) {
  // Handle simple NOT cases
  const notFilter = input.NOT as QueryFilter;
  if (notFilter.status === 'completed') {
    result.completed = false;
  } else if (notFilter.status === 'active') {
    result.completed = true;
  } else {
    console.warn(
      '[QueryCompiler] Complex NOT operator simplified. Original: ' +
      JSON.stringify(notFilter)
    );
  }
  return result;
}
```

**Step 2: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: All tests PASS

**Step 3: Commit implementation**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "feat: add logical operator handling with logging"
```

---

## Task 11: Update CompiledQuery Type and compile() Method

**Files:**
- Modify: `src/tools/unified/compilers/QueryCompiler.ts`

**Step 1: Update CompiledQuery interface**

Change the filters type in CompiledQuery:
```typescript
import type { TaskFilter } from '../../../contracts/filters.js';

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  mode?: 'all' | 'inbox' | 'search' | 'overdue' | 'today' | 'upcoming' | 'available' | 'blocked' | 'flagged' | 'smart_suggest';
  filters: TaskFilter;  // Changed from QueryFilter
  fields?: string[];
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
  details?: boolean;
  fastSearch?: boolean;
  daysAhead?: number;
  countOnly?: boolean;
}
```

**Step 2: Update compile() to use transformFilters**

```typescript
compile(input: ReadInput): CompiledQuery {
  const { query } = input;

  // Transform filters from API schema to internal contract
  const filters: TaskFilter = query.filters
    ? this.transformFilters(query.filters)
    : {};

  return {
    type: query.type,
    mode: query.mode || 'all',
    filters,
    fields: query.fields,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
    details: query.details,
    fastSearch: query.fastSearch,
    daysAhead: query.daysAhead,
    countOnly: query.countOnly,
  };
}
```

**Step 3: Run all tests to verify nothing broke**

Run: `npm run test:unit`
Expected: All 727+ tests PASS

**Step 4: Commit integration**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts
git commit -m "feat: integrate transformFilters into compile() method"
```

---

## Task 12: Run Full Test Suite and Fix Any Issues

**Files:**
- Various (depending on what breaks)

**Step 1: Run full test suite**

Run: `npm run build && npm run test:unit`
Expected: All tests pass

**Step 2: If any tests fail, analyze and fix**

Common issues:
- Type errors from code expecting FilterValue properties
- Existing tests expecting old filter structure

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors from TaskFilter integration"
```

---

## Task 13: Add Integration Test for End-to-End Flow

**Files:**
- Modify: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Add integration test**

```typescript
describe('compile() integration', () => {
  it('transforms complex filter through compile()', () => {
    const compiler = new QueryCompiler();
    const result = compiler.compile({
      query: {
        type: 'tasks',
        filters: {
          status: 'active',
          tags: { any: ['urgent', 'home'] },
          dueDate: { before: '2025-12-31' },
          flagged: true,
        },
        limit: 10,
      },
    });

    expect(result.filters.completed).toBe(false);
    expect(result.filters.tags).toEqual(['urgent', 'home']);
    expect(result.filters.tagsOperator).toBe('OR');
    expect(result.filters.dueBefore).toBe('2025-12-31');
    expect(result.filters.flagged).toBe(true);
    expect(result.limit).toBe(10);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "test: add integration test for compile() with transformFilters"
```

---

## Task 14: Update Documentation

**Files:**
- Modify: `docs/dev/PATTERNS.md`

**Step 1: Add Complex Filter Operators section**

Add to PATTERNS.md:
```markdown
## Complex Filter Operators

The unified API supports logical operators (AND, OR, NOT) in filters, but with limitations:

### Supported
- `AND: [...]` - Merged into single filter (all conditions must match)
- `NOT: { status: 'completed' }` - Simple negation (status only)

### Logged but Flattened
- `OR: [...]` - Uses first condition only, logs warning
- Complex `NOT` - Best-effort simplification, logs warning

### Analyzing Rejections

Run the analysis script to see if users need full support:
```bash
npx ts-node scripts/analyze-filter-rejections.ts ~/.config/claude-code/mcp.log
```

If >50 OR rejections/month, consider implementing full OR support.
```

**Step 2: Commit documentation**

```bash
git add docs/dev/PATTERNS.md
git commit -m "docs: add Complex Filter Operators section to PATTERNS.md"
```

---

## Task 15: Final Verification and Merge Preparation

**Step 1: Run full test suite one more time**

```bash
npm run build && npm test
```
Expected: All tests pass

**Step 2: Review all commits**

```bash
git log --oneline main..HEAD
```

**Step 3: Push branch**

```bash
git push -u origin feature/querycompiler-taskfilter-integration
```

**Step 4: Create PR or merge to main**

Use finishing-a-development-branch skill for final decision.

---

## Summary

This plan implements the QueryCompiler → TaskFilter transformation in 15 incremental tasks:

1. Status transformation tests
2. Status transformation implementation
3. Tag transformation tests
4. Tag transformation implementation
5. Date transformation tests
6. Date transformation implementation
7. Text/boolean/project tests
8. Text/boolean/project implementation
9. Logical operator tests
10. Logical operator implementation
11. CompiledQuery type update
12. Full test suite verification
13. Integration test
14. Documentation update
15. Final verification

Each task follows TDD: write failing test → verify fail → implement → verify pass → commit.
