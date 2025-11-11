# Test Coverage Gaps Analysis - v3.0.0

**Created:** 2025-11-10
**Context:** Identifying untested code before next User Testing session
**Goal:** Ship better code, not broken code

---

## Executive Summary

**Problem:** We keep shipping bugs that User Testing finds immediately but our 662 tests miss completely.

**Root Cause:** Tests validate parameters/schemas, not actual behavior.

**This Document:** Identifies v3.0.0 code that needs result validation tests BEFORE the next User Testing session.

---

## Critical Gaps (Must Fix Before User Testing)

### 1. **Combined Filters (No Tests)**

**Code:** `src/omnifocus/scripts/tasks/list-tasks-omnijs.ts`
**What it does:** Apply text + date + tag filters simultaneously
**Tests exist:** ❌ None
**User will try:** "Show me overdue tasks tagged 'urgent' with 'meeting' in the name"
**Will it work:** Unknown - no tests

**Required test:**
```typescript
it('should apply text + date + tag filters together', async () => {
  const result = await queryTasks({
    filters: {
      text: { contains: 'meeting' },
      dueDate: { lte: '2025-11-09' }, // Overdue
      tags: { any: ['urgent'] }
    }
  });

  // ✅ Validate EVERY result matches ALL filters
  result.tasks.forEach(task => {
    expect(task.name.includes('meeting') || task.note.includes('meeting')).toBe(true);
    expect(task.dueDate <= '2025-11-09').toBe(true);
    expect(task.tags.includes('urgent')).toBe(true);
  });
});
```

---

### 2. **Tag Filter Operators (Partial Tests)**

**Code:** `QueryTasksTool.ts` - tag filter operators (any, all, none)
**Tests exist:** ✅ Schema validation, ❌ Result validation
**User will try:**
- "Show tasks with ANY of these tags: urgent, important"
- "Show tasks with ALL of these tags: work, client"
- "Show tasks WITHOUT these tags: waiting, someday"

**Current test coverage:**
```typescript
// ❌ ONLY tests parameter conversion
it('should support OR operator for tag matching', async () => {
  const result = tool['processAdvancedFilters']({
    filters: { tags: { operator: 'OR', values: ['urgent', 'important'] } }
  });
  expect(result.tags).toEqual(['urgent', 'important']);
  expect(result.tagsOperator).toBe('OR');
});
```

**Missing:** Actual result validation!

**Required test:**
```typescript
it('should return tasks with ANY of specified tags', async () => {
  const result = await queryTasks({
    filters: { tags: { any: ['urgent', 'important'] } }
  });

  // ✅ Validate EVERY result has at least one tag
  result.tasks.forEach(task => {
    const hasAnyTag = task.tags.some(t =>
      ['urgent', 'important'].includes(t)
    );
    expect(hasAnyTag).toBe(true);
  });
});

it('should return tasks with ALL specified tags', async () => {
  const result = await queryTasks({
    filters: { tags: { all: ['work', 'client'] } }
  });

  // ✅ Validate EVERY result has ALL tags
  result.tasks.forEach(task => {
    expect(task.tags.includes('work')).toBe(true);
    expect(task.tags.includes('client')).toBe(true);
  });
});

it('should exclude tasks with specified tags', async () => {
  const result = await queryTasks({
    filters: { tags: { none: ['waiting', 'someday'] } }
  });

  // ✅ Validate NO result has excluded tags
  result.tasks.forEach(task => {
    expect(task.tags.includes('waiting')).toBe(false);
    expect(task.tags.includes('someday')).toBe(false);
  });
});
```

---

### 3. **Project Queries (Schema Only, No Result Validation)**

**Code:** `QueryCompiler.ts` - project queries
**Tests exist:** ✅ Schema, ❌ Result validation
**User will try:**
- "Show me all active projects"
- "Show projects with status 'on hold'"
- "Show projects in folder 'Work'"

**Current coverage:** Schema validation only

**Required tests:**
```typescript
it('should return only active projects when filtered', async () => {
  const result = await client.sendRequest({
    method: 'tools/call',
    params: {
      name: 'omnifocus_read',
      arguments: {
        query: {
          type: 'projects',
          filters: { status: 'active' }
        }
      }
    }
  });

  const data = JSON.parse(result.content[0].text);

  // ✅ Validate EVERY result
  expect(data.projects.length).toBeGreaterThan(0);
  data.projects.forEach(project => {
    expect(project.status).toBe('active');
  });
});

it('should filter projects by folder', async () => {
  // Create test project in specific folder first
  const folder = await createFolder('Test Folder');
  const project = await createProject('Test Project', { folder: folder.id });

  const result = await queryProjects({
    filters: { folder: folder.id }
  });

  // ✅ Validate all results are in folder
  result.projects.forEach(p => {
    expect(p.folderId).toBe(folder.id);
  });
});
```

---

### 4. **Bulk Operations (No Validation Tests)**

**Code:** `batch_create` in ManageTaskTool
**Tests exist:** ✅ Creates tasks, ❌ Validates all created correctly
**User will try:** "Create 10 tasks for my weekly review checklist"

**Current gap:** We test that batch_create runs, but don't validate:
- All tasks actually created
- All with correct properties
- Tags applied to all
- No silent failures

**Required test:**
```typescript
it('should create multiple tasks with all properties', async () => {
  const tasks = [
    { name: 'Task 1', tags: ['test'], dueDate: '2025-12-01' },
    { name: 'Task 2', tags: ['test'], dueDate: '2025-12-02' },
    { name: 'Task 3', tags: ['test'], dueDate: '2025-12-03' },
  ];

  const result = await batch_create({ tasks });

  expect(result.created.length).toBe(3);

  // ✅ Read back ALL tasks and validate
  for (let i = 0; i < tasks.length; i++) {
    const created = await readTask(result.created[i].id);
    expect(created.name).toBe(tasks[i].name);
    expect(created.tags).toContain('test');
    expect(created.dueDate.split('T')[0]).toBe(tasks[i].dueDate);
  }
});
```

---

### 5. **Analytics Tools (Zero Result Validation)**

**Code:** All analytics tools (productivity_stats, task_velocity, workflow_analysis, etc.)
**Tests exist:** ❌ None for result correctness
**User will try:**
- "Show my productivity for this week"
- "What's my task completion rate?"
- "Analyze my overdue patterns"

**Current state:** We have unit tests that mock data, zero integration tests that validate actual calculations.

**Required tests:**
```typescript
describe('Analytics Result Validation', () => {
  it('productivity_stats should calculate correctly', async () => {
    // 1. Create known test data
    const completedTask = await createTask('Completed', {
      tags: ['test-analytics'],
      completedDate: '2025-11-05'
    });

    const pendingTask = await createTask('Pending', {
      tags: ['test-analytics'],
      dueDate: '2025-11-15'
    });

    // 2. Query stats
    const result = await omnifocus_analyze({
      analysis: {
        type: 'productivity_stats',
        params: {
          period: 'week',
          startDate: '2025-11-01',
          endDate: '2025-11-08'
        }
      }
    });

    // 3. ✅ Validate calculations
    expect(result.data.completedTasks).toBeGreaterThanOrEqual(1);
    expect(result.data.totalTasks).toBeGreaterThanOrEqual(2);
    expect(result.data.completionRate).toBeGreaterThan(0);
    expect(result.data.completionRate).toBeLessThanOrEqual(1);

    // 4. Cleanup
    await deleteTask(completedTask.id);
    await deleteTask(pendingTask.id);
  });

  it('workflow_analysis should identify bottlenecks', async () => {
    // Test that workflow analysis returns valid insights
    const result = await omnifocus_analyze({
      analysis: {
        type: 'workflow_analysis',
        params: { analysisDepth: 'quick' }
      }
    });

    expect(Array.isArray(result.data.insights)).toBe(true);
    expect(result.data.recommendations).toBeDefined();
  });
});
```

---

### 6. **Update Operations Read-Back Validation (Missing)**

**Code:** All update operations in ManageTaskTool
**Tests exist:** ✅ Update succeeds, ❌ Change persisted
**Bug history:** Date updates, tag updates both shipped broken

**Pattern we're missing:**
```typescript
// ❌ CURRENT TESTS
it('should update task', async () => {
  const result = await updateTask(id, { dueDate: '2025-12-25' });
  expect(result.success).toBe(true); // ← Only checks success flag!
});

// ✅ REQUIRED TESTS
it('should update task and persist change', async () => {
  const taskId = await createTask('Test');

  // Update
  const updateResult = await updateTask(taskId, { dueDate: '2025-12-25' });
  expect(updateResult.success).toBe(true);

  // ✅ READ BACK and verify
  const task = await readTask(taskId);
  expect(task.dueDate.split('T')[0]).toBe('2025-12-25');

  // Cleanup
  await deleteTask(taskId);
});
```

**All update operations need this pattern:**
- ✅ dueDate
- ✅ deferDate
- ✅ plannedDate
- ✅ tags (replace)
- ✅ addTags (append)
- ✅ removeTags (filter)
- ✅ note
- ✅ flagged
- ✅ estimatedMinutes
- ✅ project (move)
- ✅ parentTask (hierarchy)

---

### 7. **Fields Parameter (No Validation)**

**Code:** `QueryTasksTool` - fields parameter for selective field retrieval
**Tests exist:** ✅ Parameter accepted, ❌ Only requested fields returned
**User will try:** "Show me just the IDs and names of my tasks, nothing else"

**Current gap:** We accept `fields: ['id', 'name']` but don't validate that ONLY those fields are returned.

**Required test:**
```typescript
it('should return only requested fields', async () => {
  const result = await queryTasks({
    filters: { mode: 'inbox' },
    fields: ['id', 'name'],
    limit: 5
  });

  // ✅ Validate no extra fields
  result.tasks.forEach(task => {
    const keys = Object.keys(task);
    expect(keys).toEqual(['id', 'name']);
    expect(task.dueDate).toBeUndefined();
    expect(task.tags).toBeUndefined();
    expect(task.project).toBeUndefined();
  });
});
```

---

### 8. **Sort Parameter (No Result Validation)**

**Code:** `QueryTasksTool` - sort parameter
**Tests exist:** ✅ Sort schema, ❌ Results actually sorted
**User will try:** "Show my tasks sorted by due date"

**Required test:**
```typescript
it('should sort results by due date ascending', async () => {
  const result = await queryTasks({
    filters: { mode: 'all' },
    sort: [{ field: 'dueDate', direction: 'asc' }],
    limit: 20
  });

  // ✅ Validate sort order
  for (let i = 1; i < result.tasks.length; i++) {
    const prev = result.tasks[i - 1].dueDate;
    const curr = result.tasks[i].dueDate;

    if (prev && curr) {
      expect(prev <= curr).toBe(true);
    }
  }
});

it('should sort by multiple fields', async () => {
  const result = await queryTasks({
    sort: [
      { field: 'flagged', direction: 'desc' },
      { field: 'dueDate', direction: 'asc' }
    ]
  });

  // ✅ Validate flagged tasks come first, then sorted by date
  let sawUnflagged = false;
  result.tasks.forEach((task, i) => {
    if (!task.flagged) {
      sawUnflagged = true;
    }
    if (sawUnflagged) {
      expect(task.flagged).toBe(false); // All remaining should be unflagged
    }
  });
});
```

---

## Test Coverage Summary

| Feature | Schema Tests | Execution Tests | Result Validation |
|---------|-------------|-----------------|-------------------|
| Text filters | ✅ | ✅ | ❌ **MISSING** |
| Date range filters | ✅ | ✅ | ❌ **MISSING** |
| Tag filters (any/all/none) | ✅ | ✅ | ❌ **MISSING** |
| Combined filters | ✅ | ❌ **MISSING** | ❌ **MISSING** |
| Project queries | ✅ | ✅ | ❌ **MISSING** |
| Folder queries | ✅ | ❌ **MISSING** | ❌ **MISSING** |
| Perspective queries | ✅ | ✅ | ❌ **MISSING** |
| Fields parameter | ✅ | ❌ **MISSING** | ❌ **MISSING** |
| Sort parameter | ✅ | ❌ **MISSING** | ❌ **MISSING** |
| Batch operations | ✅ | ✅ | ❌ **MISSING** |
| Update operations | ✅ | ✅ | ❌ **MISSING** |
| addTags/removeTags | ✅ | ✅ | ❌ **MISSING** |
| Analytics (all tools) | ✅ | ❌ **MISSING** | ❌ **MISSING** |

**Legend:**
- ✅ = Tests exist and validate
- ❌ **MISSING** = No tests or tests don't validate correctly

**Critical gaps:** 13 out of 13 features lack result validation

---

## Priority Matrix

### P0 - Must Fix Before Next User Testing (High Risk)

1. **Combined filters** - Complex, likely to break
2. **Update read-back validation** - History of bugs (5 bugs this cycle)
3. **Tag filter operators** - User will definitely try all, any, none
4. **Analytics calculations** - Complex logic, no validation

### P1 - Should Fix Before Release (Medium Risk)

5. **Sort parameter** - Common use case
6. **Fields parameter** - Performance optimization users expect
7. **Bulk operations validation** - Silent failures possible
8. **Project/folder queries** - Used in workflows

### P2 - Nice to Have (Lower Risk)

9. **Perspective queries** - Less common, but should work
10. **Error cases** - Document expected behavior

---

## Implementation Plan

### Step 1: Create Test File Structure (30 minutes)

```bash
tests/integration/validation/
├── filter-results.test.ts      # Text, date, tag filters
├── combined-filters.test.ts    # Multiple filters together
├── update-operations.test.ts   # All update ops with read-back
├── analytics-validation.test.ts # Stats calculations
├── sort-fields.test.ts         # Sort and fields parameters
└── bulk-operations.test.ts     # Batch create validation
```

### Step 2: Implement P0 Tests (2-3 hours)

Priority order:
1. Update read-back validation (prevents bugs #9-12 class)
2. Combined filters (complex, high risk)
3. Tag filter operators (user will try all variants)
4. Analytics validation (complex calculations)

### Step 3: Run Tests & Fix Issues (1-2 hours)

Execute tests, identify failures, fix bugs BEFORE User Testing sees them.

### Step 4: Document Results (30 minutes)

Create summary of:
- Tests added
- Bugs found and fixed
- Remaining known issues
- Confidence level for User Testing

---

## Expected Outcomes

### Before Implementation
- Test count: 662
- Result validation: 0%
- Bugs User Testing will find: 5-10 (based on pattern)

### After Implementation
- Test count: ~720
- Result validation: 80%+
- Bugs User Testing will find: 0-2 (hopefully)

### Time Investment
- Writing tests: 3-4 hours
- Running tests: 30 minutes
- Fixing bugs found: 1-3 hours
- **Total: 5-8 hours**

### Time Savings
- No back-and-forth with User Testing: Saves 2-4 days
- No emergency bug fixes: Saves 4-8 hours
- Higher confidence: Priceless

---

## Success Criteria

Before next User Testing session, we should have:

- [ ] All P0 tests implemented and passing
- [ ] All P1 tests implemented (passing or documented failures)
- [ ] Zero known bugs in tested features
- [ ] Test coverage report shows >80% result validation
- [ ] Documented any known limitations

**Ship quality, not quantity.**

---

## Related Documents

- `/docs/dev/TESTING_IMPROVEMENTS.md` - Testing strategy and patterns
- `/docs/dev/PATTERNS.md` - Common patterns and solutions
- `TESTING_PROMPT.md` - User Testing guide

---

**Next Action:** Implement P0 tests from this document before next User Testing session.
