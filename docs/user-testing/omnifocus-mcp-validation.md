# OmniFocus MCP Quick Validation

**Instructions**: Run tests in order. **STOP at first failure** and report using template at bottom.

---

## Part A: System Health

### A1. Version

```
system tool, operation: "version"
```

**Pass**: Returns version (e.g., 3.0.0) and build info.

### A2. Diagnostics

```
system tool, operation: "diagnostics"
```

**Pass**: Returns `health: "healthy"` with test results.

---

## Part B: Read Operations (omnifocus_read)

### B1. Query Today's Tasks

```
omnifocus_read: query.type="tasks", query.mode="today", query.limit=5
```

**Pass**: Returns tasks due soon or flagged. May be empty if none due.

### B2. Query Flagged Tasks

```
omnifocus_read: query.type="tasks", query.mode="flagged", query.limit=5
```

**Pass**: Returns flagged tasks (or empty array if none).

### B3. Query Inbox

```
omnifocus_read: query.type="tasks", query.filters.inInbox=true, query.limit=5
```

**Pass**: Returns inbox tasks with `inInbox: true`.

### B4. Query Projects

```
omnifocus_read: query.type="projects", query.limit=5
```

**Pass**: Returns project list with id, name, status.

### B5. Query Tags

```
omnifocus_read: query.type="tags", query.limit=10
```

**Pass**: Returns tag list with id, name.

### B6. Search Tasks

```
omnifocus_read: query.type="tasks", query.mode="search",
query.filters.text.contains="<common_word>", query.limit=5
```

**Pass**: Returns matching tasks (use a word you know exists).

---

## Part C: Write Operations (omnifocus_write)

### C1. Create Task in Project

```
omnifocus_write: mutation.operation="create", mutation.target="task",
mutation.data.name="__TEST__ Validation Task",
mutation.data.project="<any_project_id>", mutation.data.flagged=true
```

**Pass**: Task created with `inInbox: false`, flagged, in correct project.

### C2. Update Task (Move to Different Project)

```
omnifocus_write: mutation.operation="update", mutation.target="task",
mutation.id="<task_id_from_C1>", mutation.changes.project="<different_project_id>"
```

**Pass**: Task moves to new project. Verify in OmniFocus UI.

### C3. Update Task (Move to Inbox)

```
omnifocus_write: mutation.operation="update", mutation.target="task",
mutation.id="<task_id_from_C1>", mutation.changes.project=null
```

**Pass**: Task in inbox (`inInbox: true`). Verify in OmniFocus UI.

### C4. Update Task (Change Field Only - Regression Test)

```
omnifocus_write: mutation.operation="update", mutation.target="task",
mutation.id="<task_id_from_C1>", mutation.changes.dueDate="2025-12-31"
```

**Pass**: Task stays in inbox, `has_project_change: false`. Only dueDate changed.

### C5. Complete Task

```
omnifocus_write: mutation.operation="complete", mutation.target="task",
mutation.id="<task_id_from_C1>"
```

**Pass**: Task marked complete.

### C6. Delete Task

```
omnifocus_write: mutation.operation="delete", mutation.target="task",
mutation.id="<task_id_from_C1>"
```

**Pass**: Task deleted successfully.

---

## Part D: Analysis Operations (omnifocus_analyze)

### D1. Productivity Stats

```
omnifocus_analyze: analysis.type="productivity_stats",
analysis.params.groupBy="week"
```

**Pass**: Returns stats with completedInPeriod, summary data.

### D2. Overdue Analysis

```
omnifocus_analyze: analysis.type="overdue_analysis"
```

**Pass**: Returns overdue task analysis (may show 0 if none overdue).

---

## Part E: Optional Extended Tests

### E1. Create Project (if time permits)

```
omnifocus_write: mutation.operation="create", mutation.target="project",
mutation.data.name="__TEST__ Validation Project"
```

**Pass**: Project created. **Remember to delete after.**

### E2. Query Perspectives

```
omnifocus_read: query.type="perspectives", query.limit=5
```

**Pass**: Returns perspective list.

---

## Success Summary

| Part | Tests | Focus                     |
| ---- | ----- | ------------------------- |
| A    | 2     | System health             |
| B    | 6     | Read/query operations     |
| C    | 6     | Write/mutation operations |
| D    | 2     | Analysis operations       |
| E    | 2     | Optional extended         |

**Minimum validation**: Parts A-D (16 tests) **Full validation**: Parts A-E (18 tests)

---

## Error Report Template

**STOP at first failure.** Copy and fill in:

````
## OmniFocus MCP Error Report

**Failed Test**: [e.g., C2. Update Task Move]
**MCP Version**: [from A1]

**Request**:
```json
{paste exact request}
````

**Response**:

```json
{paste exact response}
```

**Expected**: [what should happen] **Actual**: [what happened] **OmniFocus UI**: [did change appear in OmniFocus?]

```

---

## Quick Reference: Test IDs to Track

During testing, note these IDs:
- Task ID from C1: _______________
- Project ID used: _______________
- Second project ID: _______________
```
