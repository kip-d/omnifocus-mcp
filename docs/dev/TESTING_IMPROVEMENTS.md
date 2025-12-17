# Testing Improvements - Lessons from v3.0.0 Bug Cycle

**Created:** 2025-11-10 **Context:** After shipping 5 critical bugs despite 662 passing tests

## Executive Summary

We shipped v3.0.0 with **5 critical bugs** that broke core functionality:

1. Text filter completely non-functional
2. Date range filter too broad
3. Date updates failing with JXA_CACHE_STALE
4. Tag operations failing
5. addTags/removeTags missing entirely

**Root cause:** Tests validated parameter conversion and implementation details, not actual behavior.

**Impact:** User testing found all bugs within hours - our test suite found zero.

---

## What Went Wrong

### Problem 1: Testing Implementation, Not Behavior

**Example from `advanced-filters.test.ts:251-269`:**

```typescript
it('should support BETWEEN operator for date range', async () => {
  const result = tool['processAdvancedFilters']({
    filters: {
      dueDate: {
        operator: 'BETWEEN',
        value: '2025-10-01',
        upperBound: '2025-10-07',
      },
    },
  });

  // ❌ Only tests parameter conversion!
  expect(result.dueBefore).toBeDefined();
  expect(result.dueAfter).toBeDefined();
  expect(result.dueDateOperator).toBe('BETWEEN');
});
```

**What this test verified:** The `processAdvancedFilters` method correctly transforms parameters.

**What it did NOT verify:**

- Whether `list-tasks-omnijs.ts` actually has date filter logic
- Whether date filtering works in OmniFocus
- Whether results are actually within the date range
- Whether the filter is even executed

**Result:** Bug #10 shipped - date range filter returned tasks BEFORE the range, AFTER the range, and with NO due date.
Test passed because it only checked parameter conversion.

---

### Problem 2: Static Code Analysis Instead of Execution Tests

**Example from `tag-operations.test.ts:6-12`:**

```typescript
it('should use OmniJS bridge for tag property access (v3)', () => {
  // ❌ Just searching for strings in source code!
  expect(LIST_TAGS_SCRIPT).toContain('evaluateJavascript');
  expect(LIST_TAGS_SCRIPT).toContain('flattenedTags.forEach');
  expect(LIST_TAGS_SCRIPT).toContain('tag.name');
});
```

**What this test verified:** Script source code contains certain strings.

**What it did NOT verify:**

- Whether addTags/removeTags operations exist
- Whether they actually modify tasks
- Whether they handle errors
- Whether they work with real OmniFocus data

**Result:** addTags/removeTags shipped completely missing from v3. Script didn't have the code at all, but tests only
checked for string presence, not actual functionality.

---

### Problem 3: No Result Validation

**Missing test pattern:**

```typescript
// ❌ THIS TEST DOESN'T EXIST IN OUR SUITE
it('should return only tasks within date range', async () => {
  const result = await sendMCPRequest({
    query: {
      type: 'tasks',
      filters: { dueDate: { between: ['2025-11-09', '2025-11-16'] } },
    },
  });

  const data = JSON.parse(result.content[0].text);

  // ✅ Validate EVERY result
  data.tasks.forEach((task) => {
    expect(task.dueDate >= '2025-11-09').toBe(true);
    expect(task.dueDate <= '2025-11-16').toBe(true);
  });

  // ✅ Validate no tasks without due dates
  const tasksWithoutDates = data.tasks.filter((t) => !t.dueDate);
  expect(tasksWithoutDates.length).toBe(0);
});
```

**Current test coverage:**

- ✅ Parameter conversion (tool layer)
- ✅ Script source code analysis (string matching)
- ❌ Actual OmniFocus execution
- ❌ Result validation
- ❌ End-to-end workflows

---

## Test Quality Metrics

### Current State (Before Improvements)

| Test Type                         | Count    | Validates Behavior | Caught Bugs         |
| --------------------------------- | -------- | ------------------ | ------------------- |
| Unit tests (parameter conversion) | ~400     | ❌ No              | 0/5                 |
| Unit tests (string matching)      | ~50      | ❌ No              | 0/5                 |
| Integration tests (basic)         | ~200     | ⚠️ Partial         | 0/5                 |
| Result validation tests           | 0        | N/A                | N/A                 |
| Update operation tests            | 0        | N/A                | N/A                 |
| **Total**                         | **~650** | **❌**             | **0/5 bugs caught** |

### Target State (After Improvements)

| Test Type                                  | Target Count | Validates Behavior   | Expected Coverage          |
| ------------------------------------------ | ------------ | -------------------- | -------------------------- |
| Unit tests (schema validation)             | ~200         | ✅ Yes (for schemas) | Parameter validation       |
| Integration tests (execution + validation) | ~300         | ✅ Yes               | All user-facing operations |
| Result validation tests                    | ~100         | ✅ Yes               | All filter types           |
| Update operation tests                     | ~50          | ✅ Yes               | All update operations      |
| End-to-end workflow tests                  | ~20          | ✅ Yes               | Critical user paths        |
| **Total**                                  | **~670**     | **✅**               | **100% user-facing ops**   |

---

## Immediate Action Items

### Priority 1: Add Result Validation Tests (CRITICAL)

Create integration tests that validate actual behavior, not parameter conversion.

**File:** `tests/integration/validation/filter-results.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient } from '../helpers/mcp-test-client.js';

describe('Filter Result Validation', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it('text filter returns ONLY matching tasks', async () => {
    const searchTerm = 'meeting';

    const result = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_read',
        arguments: {
          query: {
            type: 'tasks',
            filters: { text: { contains: searchTerm } },
            limit: 100,
          },
        },
      },
    });

    const data = JSON.parse(result.content[0].text);

    // ✅ Validate response structure
    expect(data.success).toBe(true);
    expect(Array.isArray(data.tasks)).toBe(true);
    expect(data.tasks.length).toBeGreaterThan(0);

    // ✅ Validate EVERY result matches filter
    data.tasks.forEach((task, index) => {
      const matchesFilter =
        task.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.note?.toLowerCase().includes(searchTerm.toLowerCase());

      expect(matchesFilter).toBe(true);
      // If this fails, show which task and why
      if (!matchesFilter) {
        console.error(`Task ${index} doesn't match filter:`, {
          id: task.id,
          name: task.name,
          note: task.note?.substring(0, 50),
        });
      }
    });
  });

  it('date range filter returns ONLY tasks in range', async () => {
    const startDate = '2025-11-09';
    const endDate = '2025-11-16';

    const result = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_read',
        arguments: {
          query: {
            type: 'tasks',
            filters: { dueDate: { between: [startDate, endDate] } },
            limit: 100,
          },
        },
      },
    });

    const data = JSON.parse(result.content[0].text);

    // ✅ Validate EVERY result is in range
    data.tasks.forEach((task, index) => {
      expect(task.dueDate).toBeDefined();

      const taskDate = task.dueDate.split('T')[0]; // Get YYYY-MM-DD
      const isInRange = taskDate >= startDate && taskDate <= endDate;

      expect(isInRange).toBe(true);
      // If this fails, show which task and date
      if (!isInRange) {
        console.error(`Task ${index} outside date range:`, {
          id: task.id,
          name: task.name,
          dueDate: task.dueDate,
          expected: `${startDate} to ${endDate}`,
        });
      }
    });

    // ✅ Validate no tasks without due dates
    const tasksWithoutDates = data.tasks.filter((t) => !t.dueDate);
    expect(tasksWithoutDates.length).toBe(0);
  });

  it('tag filter (any) returns ONLY tasks with specified tags', async () => {
    const requiredTags = ['Personal'];

    const result = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_read',
        arguments: {
          query: {
            type: 'tasks',
            filters: { tags: { any: requiredTags } },
            fields: ['id', 'name', 'tags'],
            limit: 100,
          },
        },
      },
    });

    const data = JSON.parse(result.content[0].text);

    // ✅ Validate EVERY result has at least one required tag
    data.tasks.forEach((task, index) => {
      expect(Array.isArray(task.tags)).toBe(true);

      const hasRequiredTag = task.tags.some((tag) => requiredTags.includes(tag));

      expect(hasRequiredTag).toBe(true);
      // If this fails, show which task and tags
      if (!hasRequiredTag) {
        console.error(`Task ${index} missing required tags:`, {
          id: task.id,
          name: task.name,
          actualTags: task.tags,
          requiredTags: requiredTags,
        });
      }
    });
  });

  it('combined filters work correctly together', async () => {
    // Test text + date range + tag filters simultaneously
    const result = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_read',
        arguments: {
          query: {
            type: 'tasks',
            filters: {
              text: { contains: 'review' },
              dueDate: { between: ['2025-11-01', '2025-12-31'] },
              tags: { any: ['Work'] },
            },
            limit: 100,
          },
        },
      },
    });

    const data = JSON.parse(result.content[0].text);

    // ✅ Validate EVERY result matches ALL filters
    data.tasks.forEach((task) => {
      // Text filter
      const matchesText = task.name?.toLowerCase().includes('review') || task.note?.toLowerCase().includes('review');
      expect(matchesText).toBe(true);

      // Date range filter
      const taskDate = task.dueDate?.split('T')[0];
      expect(taskDate >= '2025-11-01' && taskDate <= '2025-12-31').toBe(true);

      // Tag filter
      expect(task.tags?.includes('Work')).toBe(true);
    });
  });
});
```

---

### Priority 2: Add Update Operation Tests (CRITICAL)

Test that update operations actually modify tasks and persist changes.

**File:** `tests/integration/validation/update-operations.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient } from '../helpers/mcp-test-client.js';

describe('Update Operations Validation', () => {
  let client: MCPTestClient;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.connect();
  });

  afterAll(async () => {
    // Cleanup: Delete all created tasks
    for (const taskId of createdTaskIds) {
      try {
        await client.sendRequest({
          method: 'tools/call',
          params: {
            name: 'omnifocus_write',
            arguments: {
              mutation: {
                operation: 'delete',
                target: 'task',
                id: taskId,
              },
            },
          },
        });
      } catch (err) {
        console.warn(`Failed to cleanup task ${taskId}:`, err);
      }
    }
    await client.disconnect();
  });

  async function createTask(name: string, properties = {}) {
    const result = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'create',
            target: 'task',
            data: { name, ...properties },
          },
        },
      },
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);

    const taskId = data.task.id;
    createdTaskIds.push(taskId);
    return taskId;
  }

  async function readTask(taskId: string) {
    const result = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_read',
        arguments: {
          query: {
            type: 'tasks',
            filters: { id: taskId },
          },
        },
      },
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.tasks.length).toBe(1);
    return data.tasks[0];
  }

  it('should update dueDate and persist change', async () => {
    // 1. Create task without due date
    const taskId = await createTask('Test update dueDate');

    // 2. Update due date
    const updateResult = await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { dueDate: '2025-12-25' },
          },
        },
      },
    });

    const updateData = JSON.parse(updateResult.content[0].text);
    expect(updateData.success).toBe(true);

    // 3. ✅ Read task back - VERIFY CHANGE PERSISTED
    const task = await readTask(taskId);
    expect(task.dueDate).toBeDefined();
    expect(task.dueDate.split('T')[0]).toBe('2025-12-25');
  });

  it('should update deferDate and persist change', async () => {
    const taskId = await createTask('Test update deferDate');

    await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { deferDate: '2025-12-20' },
          },
        },
      },
    });

    // ✅ Verify change persisted
    const task = await readTask(taskId);
    expect(task.deferDate).toBeDefined();
    expect(task.deferDate.split('T')[0]).toBe('2025-12-20');
  });

  it('should update plannedDate and persist change', async () => {
    const taskId = await createTask('Test update plannedDate');

    await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { plannedDate: '2025-12-18' },
          },
        },
      },
    });

    // ✅ Verify change persisted
    const task = await readTask(taskId);
    expect(task.plannedDate).toBeDefined();
    expect(task.plannedDate.split('T')[0]).toBe('2025-12-18');
  });

  it('should support tags (full replacement)', async () => {
    // Create task with initial tags
    const taskId = await createTask('Test tags replacement', {
      tags: ['initial1', 'initial2'],
    });

    // Replace tags
    await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { tags: ['replaced1', 'replaced2', 'replaced3'] },
          },
        },
      },
    });

    // ✅ Verify tags replaced (not merged)
    const task = await readTask(taskId);
    expect(task.tags).toEqual(['replaced1', 'replaced2', 'replaced3']);
    expect(task.tags).not.toContain('initial1');
    expect(task.tags).not.toContain('initial2');
  });

  it('should support addTags (append to existing)', async () => {
    // Create task with initial tags
    const taskId = await createTask('Test addTags', {
      tags: ['existing1', 'existing2'],
    });

    // Add more tags
    await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { addTags: ['new1', 'new2'] },
          },
        },
      },
    });

    // ✅ Verify tags appended (not replaced)
    const task = await readTask(taskId);
    expect(task.tags).toContain('existing1');
    expect(task.tags).toContain('existing2');
    expect(task.tags).toContain('new1');
    expect(task.tags).toContain('new2');
    expect(task.tags.length).toBe(4);
  });

  it('should support removeTags (filter out specified)', async () => {
    // Create task with multiple tags
    const taskId = await createTask('Test removeTags', {
      tags: ['keep1', 'remove1', 'keep2', 'remove2'],
    });

    // Remove specific tags
    await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { removeTags: ['remove1', 'remove2'] },
          },
        },
      },
    });

    // ✅ Verify specified tags removed, others kept
    const task = await readTask(taskId);
    expect(task.tags).toContain('keep1');
    expect(task.tags).toContain('keep2');
    expect(task.tags).not.toContain('remove1');
    expect(task.tags).not.toContain('remove2');
    expect(task.tags.length).toBe(2);
  });

  it('should handle addTags with deduplication', async () => {
    const taskId = await createTask('Test addTags dedup', {
      tags: ['existing'],
    });

    // Try to add tags that already exist
    await client.sendRequest({
      method: 'tools/call',
      params: {
        name: 'omnifocus_write',
        arguments: {
          mutation: {
            operation: 'update',
            target: 'task',
            id: taskId,
            changes: { addTags: ['existing', 'new'] },
          },
        },
      },
    });

    // ✅ Verify no duplicates created
    const task = await readTask(taskId);
    expect(task.tags.filter((t) => t === 'existing').length).toBe(1);
    expect(task.tags).toContain('new');
  });
});
```

---

### Priority 3: Replace String Matching Tests

**Remove static analysis tests, add execution tests.**

**BEFORE (❌ Bad):**

```typescript
it('should use OmniJS bridge', () => {
  expect(LIST_TAGS_SCRIPT).toContain('evaluateJavascript');
});
```

**AFTER (✅ Good):**

```typescript
it('should list tags successfully', async () => {
  const result = await client.sendRequest({
    method: 'tools/call',
    params: { name: 'tags', arguments: {} },
  });

  const data = JSON.parse(result.content[0].text);
  expect(data.ok).toBe(true);
  expect(data.v).toBe('3');
  expect(Array.isArray(data.tags)).toBe(true);

  data.tags.forEach((tag) => {
    expect(tag.id).toBeDefined();
    expect(tag.name).toBeDefined();
    expect(typeof tag.name).toBe('string');
  });
});
```

---

## Testing Strategy Going Forward

### Test Pyramid

1. **Unit Tests (30%)** - Schema validation and utilities
   - Parameter validation (Zod schemas)
   - Type conversions
   - Error handling helpers
   - **DO NOT:** Mock OmniFocus, test string matching

2. **Integration Tests (60%)** - Actual OmniFocus execution
   - Full MCP protocol calls
   - Result validation (EVERY result, not just success flag)
   - Update operations (create → update → read-back → verify)
   - **MUST:** Execute actual operations, validate behavior

3. **End-to-End Tests (10%)** - Critical workflows
   - Smoke tests before release
   - Multi-operation workflows
   - Performance benchmarks

### Critical Testing Rule

**VALIDATE RESULTS, NOT PARAMETERS**

❌ **WRONG - Parameter Testing:**

```typescript
it('should support date range filter', () => {
  const result = tool.processFilters({...});
  expect(result.dueAfter).toBeDefined(); // ← Only tests parameter conversion!
});
```

✅ **CORRECT - Result Validation:**

```typescript
it('should return only tasks in date range', async () => {
  const result = await executeQuery({...});
  result.tasks.forEach(task => {
    expect(task.dueDate >= start && task.dueDate <= end).toBe(true);
  });
});
```

### Required Tests Before Shipping Features

Every new feature MUST have:

1. ✅ Schema validation test (unit)
2. ✅ Happy path integration test with result validation
3. ✅ Error case integration test
4. ✅ Regression test if fixing a bug
5. ✅ Update operation test (create → update → read-back → verify → cleanup)

### Code Review Checklist

Before approving PR, verify:

- [ ] All new operations have result validation tests
- [ ] No tests use string matching on source code
- [ ] Integration tests actually execute OmniFocus operations
- [ ] Update operations include read-back verification
- [ ] Error cases are tested
- [ ] Tests validate EVERY result in response, not just success flag

---

## Implementation Plan

### Week 1: Critical Gap Closure

- [ ] Create `tests/integration/validation/` directory
- [ ] Implement filter result validation tests (text, date range, tags)
- [ ] Implement update operation tests (dates, tags, addTags, removeTags)
- [ ] Run against current codebase to establish baseline

### Week 2: Test Replacement

- [ ] Audit existing tests for parameter-only validation
- [ ] Replace or supplement with result validation
- [ ] Remove string matching tests
- [ ] Add execution tests for scripts

### Week 3: Automation & CI

- [ ] Add pre-commit hook to require validation tests for new features
- [ ] Update CI to fail if result validation coverage drops
- [ ] Create test coverage reports highlighting validation gaps
- [ ] Document testing patterns in CONTRIBUTING.md

---

## Success Metrics

### Before Improvements

- Tests: 662 passing
- Bugs caught: 0/5 (0%)
- User testing caught: 5/5 (100%)
- Time to discover bugs: Minutes (user testing)

### After Improvements (Target)

- Tests: ~670 passing
- Bugs caught: 5/5 (100%) - with result validation
- User testing caught: 0/5 (0%) - bugs prevented
- Time to discover bugs: Seconds (CI failure)

---

## Lessons Learned

1. **High test count ≠ high test quality**
   - 662 tests passed while shipping critical bugs
   - Tests validated implementation details, not behavior

2. **Unit tests have limits**
   - Can't catch script logic bugs
   - Can't validate OmniFocus integration
   - Must be supplemented with integration tests

3. **String matching tests are worthless**
   - addTags/removeTags shipped missing despite passing tests
   - Tests checked for strings, not functionality

4. **Result validation is essential**
   - Every filter must validate every result
   - Every update must read back and verify change
   - No assumptions - verify actual behavior

5. **Integration tests must execute**
   - Don't test parameter conversion
   - Don't test string presence
   - Execute operations and validate results

---

## Related Documents

- `/docs/dev/PATTERNS.md` - Common debugging patterns
- `/docs/dev/TESTING_TOOLS.md` - Testing tool reference
- `/docs/dev/LESSONS_LEARNED.md` - General development lessons

---

**Document Owner:** Development Team **Last Updated:** 2025-11-10 **Review Frequency:** After each bug discovery
