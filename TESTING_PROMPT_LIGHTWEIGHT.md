# OmniFocus MCP Lightweight Test Suite

**Purpose:** Quick confidence check for OmniFocus MCP v3.0+ unified API
**Time:** ~5-10 minutes unattended
**When to use:** After changes, before releases, periodic validation

---

## Output Instructions

**CRITICAL:** Follow these output rules strictly:

✅ **DO OUTPUT:**
- One-line test result: `✅ Test N: description` or `❌ Test N: description - ERROR`
- Brief summary (e.g., "3 tasks found", "task created")
- Failures: Full details (tool call, response, analysis)

❌ **DO NOT OUTPUT:**
- Explanatory commentary between tests
- Full JSON for successful tests
- Field-by-field validation details
- Philosophical musings or analysis (save for failures)

**Token Budget:** Success = ~8-12k tokens | With failures = ~15-20k tokens

---

## Pre-Flight: Automated Test Validation

**Before manual testing, verify automated tests pass:**

1. **Smoke Tests** (21 seconds):
   ```bash
   npm run test:smoke
   ```
   ✅ If passing: Proceed to manual tests below
   ❌ If failing: STOP - Fix automated tests first

2. **Optional: Full Integration** (6 minutes):
   ```bash
   npm run test:integration
   ```
   ✅ Gives highest confidence before manual testing

**Why this matters:** If automated tests fail, manual testing won't add value.

---

## Manual Tests: Real-World Scenarios

**Instructions:**
1. Execute each test sequentially
2. Use test tag: `@mcp-test-[YYYYMMDD-HHMM]` (e.g., `@mcp-test-20251124-1430`)
3. Report results in one-line format
4. If test fails: Include full details + root cause analysis

---

### Test 1: System Health

**ACTION:** `system({operation: "diagnostics"})`

**EXPECT:** `health: "healthy"`, all checks pass

**REPORT:** `✅ Test 1: System healthy` or `❌ Test 1: System degraded - [specific failure]`

---

### Test 2: Query Today's Tasks

**ACTION:** `omnifocus_read({query: {type: "tasks", mode: "today", limit: 10}})`

**EXPECT:** Returns tasks or empty array, no errors

**REPORT:** `✅ Test 2: Found N tasks due today`

---

### Test 3: Create Task with Tags

**ACTION:**
```json
omnifocus_write({
  mutation: {
    operation: "create",
    target: "task",
    data: {
      name: "Lightweight Test Task",
      tags: ["[your-test-tag]", "urgent"],
      dueDate: "[tomorrow YYYY-MM-DD]",
      note: "Created by lightweight test suite"
    }
  }
})
```

**EXPECT:** Returns `success: true`, `taskId` present

**REPORT:** `✅ Test 3: Created task [taskId]`

**SAVE:** Task ID for later tests

---

### Test 4: Query By Tag Filter

**ACTION:**
```json
omnifocus_read({
  query: {
    type: "tasks",
    filters: {tags: {any: ["[your-test-tag]"]}},
    limit: 5
  }
})
```

**EXPECT:** Returns the task from Test 3

**REPORT:** `✅ Test 4: Tag filter found N tasks` or `❌ Test 4: Expected to find task from Test 3`

---

### Test 5: Update Task (Add Flag)

**ACTION:**
```json
omnifocus_write({
  mutation: {
    operation: "update",
    target: "task",
    id: "[taskId-from-test-3]",
    changes: {flagged: true}
  }
})
```

**EXPECT:** Returns `success: true`

**REPORT:** `✅ Test 5: Updated task (flagged)`

---

### Test 6: Create Project with Task

**ACTION:**
```json
omnifocus_write({
  mutation: {
    operation: "create",
    target: "project",
    data: {
      name: "Lightweight Test Project",
      tags: ["[your-test-tag]"],
      note: "Test project for validation"
    }
  }
})
```

**EXPECT:** Returns `success: true`, `projectId` present

**REPORT:** `✅ Test 6: Created project [projectId]`

**SAVE:** Project ID for cleanup

---

### Test 7: Productivity Stats

**ACTION:**
```json
omnifocus_analyze({
  analysis: {
    type: "productivity_stats",
    scope: {
      dateRange: {
        start: "[7-days-ago YYYY-MM-DD]",
        end: "[today YYYY-MM-DD]"
      }
    }
  }
})
```

**EXPECT:** Returns stats with `totalTasks`, `completedTasks` counts

**REPORT:** `✅ Test 7: Stats - N total, M completed`

---

### Test 8: Complete Task

**ACTION:**
```json
omnifocus_write({
  mutation: {
    operation: "complete",
    target: "task",
    id: "[taskId-from-test-3]"
  }
})
```

**EXPECT:** Returns `success: true`

**REPORT:** `✅ Test 8: Completed task`

---

### Test 9: Cleanup Test Data

**ACTION:** Delete task and project created in this test run

9a. Delete task:
```json
omnifocus_write({
  mutation: {
    operation: "delete",
    target: "task",
    id: "[taskId-from-test-3]"
  }
})
```

9b. Delete project:
```json
omnifocus_write({
  mutation: {
    operation: "delete",
    target: "project",
    id: "[projectId-from-test-6]"
  }
})
```

**EXPECT:** Both return `success: true`

**REPORT:** `✅ Test 9: Cleanup complete (2 items deleted)`

---

### Test 10: Verify Cleanup

**ACTION:** Query for test tag to confirm no orphaned test data

```json
omnifocus_read({
  query: {
    type: "tasks",
    filters: {tags: {any: ["[your-test-tag]"]}},
    limit: 10
  }
})
```

**EXPECT:** Empty results (or only pre-existing items not from this test run)

**REPORT:** `✅ Test 10: Verified cleanup - no test items remain` or `⚠️ Test 10: Found N orphaned items`

---

## Final Report Format

**At the end, provide:**

```
LIGHTWEIGHT TEST RESULTS
========================
Total: 10 tests
Passed: N
Failed: M
Time: ~X minutes

[If failures: Include detailed analysis here]

Status: ✅ ALL PASS or ❌ FAILURES DETECTED
```

---

## Troubleshooting Failed Tests

**If any test fails:**

1. **Include full details:**
   - Exact tool call JSON
   - Complete response
   - Error messages
   - Root cause analysis

2. **Check these common issues:**
   - Date format (must be `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`)
   - Tag syntax (array of strings)
   - ID references (saved from previous tests)
   - OmniFocus permissions

3. **Next steps:**
   - Run `npm run test:integration` to identify if issue is systemic
   - Check logs: Look for ERROR/WARN in tool output
   - File locations: Check `src/tools/unified/` for unified tools

---

## Comparison: Manual vs Automated Testing

| Testing Method | Time | Coverage | When to Use |
|----------------|------|----------|-------------|
| **Smoke Tests** | 21s | Critical path | Pre-commit, quick sanity |
| **Lightweight Manual** | 5-10min | Real-world scenarios | Before releases |
| **Integration Tests** | 6min | Comprehensive | CI, major changes |
| **Full Manual (TESTING_PROMPT.md)** | 15-20min | Detailed validation | New features, debugging |

---

## Notes

- This prompt designed for v3.0.0+ unified API (4 tools)
- Archived prompts (31 tools) are in `.archive/testing-prompts/`
- Automated tests provide stronger guarantees than manual testing
- Manual testing validates user-facing scenarios and Claude Desktop integration
