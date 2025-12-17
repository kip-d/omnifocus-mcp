# OmniFocus MCP Quick Validation

**Instructions**: Run these tests in order. **STOP at first failure** and report using the template below.

## Test 1: System Health
```
Use system tool with operation: "version"
Use system tool with operation: "diagnostics"
```
**Pass**: Both return success with version info and healthy status.

## Test 2: Task Creation with Project (Unified API)
```
Create a task named "__TEST__ Project Assignment" in a project (not inbox).
Use omnifocus_write with: mutation.operation="create", mutation.target="task",
mutation.data.name="__TEST__ Project Assignment", mutation.data.project="<any_project_id>"
```
**Pass**: Task created with `inInbox: false` and correct project assignment.

## Test 3: Task Movement Between Projects
```
Move the test task to a DIFFERENT project using omnifocus_write update.
Use: mutation.operation="update", mutation.target="task", mutation.id="<task_id>",
mutation.changes.project="<different_project_id>"
```
**Pass**: Task moves to new project. Verify in OmniFocus UI.

## Test 4: Task Movement to Inbox
```
Move the test task to inbox using omnifocus_write update with project: null
Use: mutation.operation="update", mutation.target="task", mutation.id="<task_id>",
mutation.changes.project=null
```
**Pass**: Task moves to inbox (`inInbox: true`). Verify in OmniFocus UI.

## Test 5: Update Without Project Change (Regression Test)
```
Update ONLY the due date on a task that's in a project.
Use: mutation.operation="update", mutation.target="task", mutation.id="<task_id>",
mutation.changes.dueDate="2025-12-31"
```
**Pass**: Task stays in its project (NOT moved to inbox). `has_project_change: false`.

## Test 6: Cleanup
```
Delete the test task using omnifocus_write with operation="delete"
```
**Pass**: Task deleted successfully.

---

## Error Report Template

If ANY test fails, copy this template and fill in:

```
## OmniFocus MCP Error Report

**Failed Test**: [Test number and name]
**MCP Version**: [from system version call]

**Request** (exact JSON sent):
```json
{paste request}
```

**Response** (exact JSON received):
```json
{paste response}
```

**Expected**: [what should have happened]
**Actual**: [what actually happened]
**OmniFocus UI**: [did task appear correctly in OmniFocus?]
```

---

## Success Criteria

All 6 tests pass = validation complete. Key verifications:
- Tasks assigned to projects stay in projects
- Task movement (project-to-project, project-to-inbox) persists in OmniFocus UI
- Updates without project field don't move tasks to inbox
