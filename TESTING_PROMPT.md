# OmniFocus MCP Test Suite - EXECUTE NOW

**INSTRUCTION:** Execute this test suite immediately. Do not ask clarifying questions. Start with Step 1 below and
proceed through each test sequentially, reporting results as you go.

---

## Step 1: Version Check (START HERE)

**ACTION:** Call the system tool with `operation: "version"` to get version info.

**Report:** State the version number (e.g., "Testing OmniFocus MCP v3.0.0, build xyz")

**Then immediately proceed to Step 2.**

---

## Step 2: Generate Test Session ID

**ACTION:** Generate a unique test tag using today's date and time: `@mcp-test-YYYYMMDD-HHMM`

Example: `@mcp-test-20251123-1430`

**Report:** "Using test tag: @mcp-test-YYYYMMDD-HHMM" (with actual values)

**Then immediately proceed to Step 3.**

---

## Step 3: Diagnostic Check

**ACTION:** Call the system tool with `operation: "diagnostics"` to verify OmniFocus connection.

**If health = "healthy":** Report "Diagnostics passed" and proceed to Core Tests. **If health = "degraded":** Report
which tests failed and STOP - do not continue testing.

---

## Reference: Date Handling

You must convert natural language dates to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` format before calling tools. This is
handled automatically - just note it in your mental model.

---

## Core Tests (Execute All Sequentially)

**IMPORTANT:** Include your test tag (from Step 2) on ALL created items for cleanup.

---

### Test 4: Read Operations

**4a. Query today's tasks:**

- ACTION: Query tasks with mode "today"
- REPORT: Number of tasks returned, sample task names

**4b. Query overdue tasks:**

- ACTION: Query tasks with mode "overdue"
- REPORT: Number of overdue tasks, or "none overdue"

**4c. List projects:**

- ACTION: Query projects with limit 5
- REPORT: Number returned, sample project names

**PASS/FAIL:** All three queries returned data without errors

---

### Test 5: Create Task

**ACTION:** Create a task with these properties:

- name: "Test Task Alpha"
- tags: [your-test-tag, "urgent"]
- dueDate: tomorrow's date in YYYY-MM-DD format
- note: "Created by MCP test suite"

**REPORT:**

- Success/failure
- Task ID returned
- Any errors

**PASS/FAIL:** Task created with ID returned

---

### Test 6: Create Project

**ACTION:** Create a project with:

- name: "Test Project Beta"
- tags: [your-test-tag]

**REPORT:**

- Success/failure
- Project ID returned (should start with project identifier, not task)
- Any errors

**PASS/FAIL:** Project created with project ID (not task ID)

---

### Test 7: Update Task

**ACTION:** Update "Test Task Alpha" (use ID from Test 5):

- Add note text: "Updated by test suite"
- Change dueDate to day after tomorrow

**REPORT:** Success/failure, updated fields confirmed

**PASS/FAIL:** Task updated successfully

---

### Test 8: Tag Filtering (BEFORE completion!)

**ACTION:** Query all **active** tasks with your test tag

**REPORT:**

- Number of tasks found
- Task names returned

**PASS/FAIL:** Returns "Test Task Alpha" (still active at this point)

**NOTE:** This test must run BEFORE Test 9 (complete) because completed tasks are excluded by default.

---

### Test 9: Complete Task

**ACTION:** Mark "Test Task Alpha" as complete (use ID from Test 5)

**REPORT:**

- Success/failure
- Completion time (should be < 10 seconds)

**PASS/FAIL:** Task completed in reasonable time

---

### Test 10: Analytics

**ACTION:** Run productivity_stats analysis with groupBy: "week"

**REPORT:**

- Success/failure
- Key metrics returned (completed count, etc.)

**PASS/FAIL:** Analytics returned data without errors

---

## Cleanup (Execute After All Tests)

### Test 11: Delete Test Data

**ACTION:**

1. Query all tasks with your test tag
2. Delete each test task found
3. Delete "Test Project Beta" project

**REPORT:**

- Number of items deleted
- Any deletion errors

**PASS/FAIL:** All test data cleaned up

---

### Test 12: Verify Cleanup

**ACTION:** Query tasks with your test tag again

**REPORT:** Should return 0 tasks

**PASS/FAIL:** No test data remains

---

## Final Report

After completing all tests, provide a summary:

```
## Test Results Summary

**Version Tested:** [from Step 1]
**Test Tag Used:** [from Step 2]

| Test | Result | Notes |
|------|--------|-------|
| 1. Version Check | PASS/FAIL | |
| 2. Test Tag | PASS/FAIL | |
| 3. Diagnostics | PASS/FAIL | |
| 4. Read Operations | PASS/FAIL | |
| 5. Create Task | PASS/FAIL | |
| 6. Create Project | PASS/FAIL | |
| 7. Update Task | PASS/FAIL | |
| 8. Tag Filtering | PASS/FAIL | Must run before completion |
| 9. Complete Task | PASS/FAIL | Time: Xs |
| 10. Analytics | PASS/FAIL | |
| 11. Cleanup | PASS/FAIL | |
| 12. Verify Cleanup | PASS/FAIL | |

**Issues Found:** [List any failures with details]
```

---

## Known Issues (Reference Only)

If a test fails, check if it matches these known behaviors:

1. **Tags may not appear in OmniFocus UI immediately** - Refresh or wait 1-2 seconds
2. **Dates must be YYYY-MM-DD format** - You handle the conversion
3. **Completed tasks excluded by default** - Tag/status queries exclude completed tasks unless explicitly requested with
   `status: "completed"` filter

---

## BEGIN TESTING NOW

**Start with Step 1: Version Check**
