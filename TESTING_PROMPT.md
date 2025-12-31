# OmniFocus MCP Test Suite

**Version:** v3.0.0+ Unified API **Time:** ~10 minutes **Purpose:** Validate MCP server functionality with real
OmniFocus operations

---

## Output Format

**Follow these rules strictly:**

- Success: `✅ Test N: description - brief result`
- Failure: `❌ Test N: description - ERROR` + full details
- No explanatory commentary between tests
- Save verbose output for failures only

---

## Pre-Flight Check

**Before manual testing, verify automated tests pass:**

```bash
npm run test:smoke      # 21 seconds - critical path
npm run test:integration  # 6 minutes - comprehensive (optional)
```

If automated tests fail, fix those first.

---

## Test Suite

### Test 1: Version Check

**ACTION:**

```json
system({operation: "version"})
```

**REPORT:** `✅ Test 1: OmniFocus MCP v3.x.x`

---

### Test 2: Generate Test Tag

**ACTION:** Generate unique tag using millisecond timestamp:

```
mcp-test-[Date.now()]-[random]
```

Example: `mcp-test-1735600000000-x7k`

**REPORT:** `✅ Test 2: Using tag [your-tag]`

**SAVE:** This tag for all created items

---

### Test 3: Diagnostics

**ACTION:**

```json
system({operation: "diagnostics"})
```

**EXPECT:** `health: "healthy"`

**REPORT:** `✅ Test 3: System healthy` or `❌ Test 3: [failure details] - STOP TESTING`

---

### Test 4: Query Today's Tasks

**ACTION:**

```json
omnifocus_read({
  query: {
    type: "tasks",
    mode: "today",
    limit: 10
  }
})
```

**REPORT:** `✅ Test 4: Found N tasks due today`

---

### Test 5: Query Projects

**ACTION:**

```json
omnifocus_read({
  query: {
    type: "projects",
    limit: 5
  }
})
```

**REPORT:** `✅ Test 5: Found N projects`

---

### Test 6: Create Task

**ACTION:**

```json
omnifocus_write({
  mutation: {
    operation: "create",
    target: "task",
    data: {
      name: "MCP Test Task",
      tags: ["[your-test-tag]", "urgent"],
      dueDate: "[tomorrow YYYY-MM-DD]",
      note: "Created by MCP test suite"
    }
  }
})
```

**EXPECT:** `success: true`, `taskId` present

**REPORT:** `✅ Test 6: Created task [taskId]`

**SAVE:** Task ID for later tests

---

### Test 7: Verify Task by ID

**ACTION:**

```json
omnifocus_read({
  query: {
    type: "tasks",
    filters: {id: "[taskId-from-test-6]"},
    fields: ["id", "name", "tags", "dueDate"]
  }
})
```

**EXPECT:** Task returned with correct name and tags

**REPORT:** `✅ Test 7: Verified task has correct properties`

---

### Test 8: Update Task

**ACTION:**

```json
omnifocus_write({
  mutation: {
    operation: "update",
    target: "task",
    id: "[taskId-from-test-6]",
    changes: {
      flagged: true,
      note: "Updated by MCP test suite"
    }
  }
})
```

**REPORT:** `✅ Test 8: Updated task (flagged, note added)`

---

### Test 9: Create Project

**ACTION:**

```json
omnifocus_write({
  mutation: {
    operation: "create",
    target: "project",
    data: {
      name: "MCP Test Project",
      tags: ["[your-test-tag]"]
    }
  }
})
```

**EXPECT:** `success: true`, `projectId` present

**REPORT:** `✅ Test 9: Created project [projectId]`

**SAVE:** Project ID for cleanup

---

### Test 10: Analytics

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

**REPORT:** `✅ Test 10: Stats - N total, M completed`

---

### Test 11: Complete Task

**ACTION:**

```json
omnifocus_write({
  mutation: {
    operation: "complete",
    target: "task",
    id: "[taskId-from-test-6]"
  }
})
```

**REPORT:** `✅ Test 11: Task completed`

---

### Test 12: Cleanup

**ACTION:** Delete test items by ID:

12a. Delete task:

```json
omnifocus_write({
  mutation: {
    operation: "delete",
    target: "task",
    id: "[taskId-from-test-6]"
  }
})
```

12b. Delete project:

```json
omnifocus_write({
  mutation: {
    operation: "delete",
    target: "project",
    id: "[projectId-from-test-9]"
  }
})
```

**REPORT:** `✅ Test 12: Cleanup complete (2 items deleted)`

---

### Test 13: Verify Cleanup

**ACTION:** Query for deleted IDs:

```json
omnifocus_read({query: {type: "tasks", filters: {id: "[taskId]"}}})
omnifocus_read({query: {type: "projects", filters: {id: "[projectId]"}}})
```

**EXPECT:** Both return empty results

**REPORT:** `✅ Test 13: Verified - no test data remains`

---

## Final Report

```
TEST RESULTS
============
Total: 13 tests
Passed: N
Failed: M

| Test | Result |
|------|--------|
| 1. Version | ✅/❌ |
| 2. Test Tag | ✅/❌ |
| 3. Diagnostics | ✅/❌ |
| 4. Query Today | ✅/❌ |
| 5. Query Projects | ✅/❌ |
| 6. Create Task | ✅/❌ |
| 7. Verify Task | ✅/❌ |
| 8. Update Task | ✅/❌ |
| 9. Create Project | ✅/❌ |
| 10. Analytics | ✅/❌ |
| 11. Complete Task | ✅/❌ |
| 12. Cleanup | ✅/❌ |
| 13. Verify Cleanup | ✅/❌ |

Status: ✅ ALL PASS or ❌ FAILURES DETECTED
```

---

## Troubleshooting

**Common issues:**

| Problem           | Cause                 | Fix                           |
| ----------------- | --------------------- | ----------------------------- |
| Date format error | Not YYYY-MM-DD        | Convert before calling        |
| Task not found    | Wrong ID reference    | Use ID from creation response |
| Tags missing      | Array syntax          | Use `["tag1", "tag2"]`        |
| Stale test data   | Previous run orphaned | Query by ID, not tag          |

**If failures occur:**

1. Include full tool call JSON
2. Include complete response
3. Run `npm run test:integration` to check if systemic
4. Check `src/tools/unified/` for implementation

---

## Testing Methods Comparison

| Method                     | Time  | When to Use       |
| -------------------------- | ----- | ----------------- |
| `npm run test:smoke`       | 21s   | Pre-commit        |
| This prompt                | 10min | Before releases   |
| `npm run test:integration` | 6min  | CI, major changes |
