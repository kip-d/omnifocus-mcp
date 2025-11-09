# OmniFocus MCP v2.0.0 Integration Test Suite

Please run this comprehensive test suite for the OmniFocus MCP server and report the results. For each test, note whether it PASSED or FAILED, include any error messages, and measure response times where applicable.

## Test Environment Setup

First, verify the MCP server is connected:
1. Can you see the OmniFocus MCP tools in your available tools?
2. What version does `get_version_info` report?

## 1. Basic Connectivity Tests

### Test 1.1: Version Check
```
Run: get_version_info
Expected: Should return version 2.0.0 with build info
```

### Test 1.2: Diagnostics
```
Run: run_diagnostics with testScript: "return 'test'"
Expected: Should complete successfully
```

## 2. Task Query Tests (V2 Tool)

### Test 2.1: Basic Task Query
```
Run: tasks with mode: "all", limit: 5, details: false
Expected: Should return summary and up to 5 tasks
Note response time: _____
```

### Test 2.2: Today's Tasks
```
Run: tasks with mode: "today", limit: 10, details: false
Expected: Should return tasks due within 3 days or flagged
Note response time: _____
```

### Test 2.3: Search Tasks
```
Run: tasks with mode: "search", search: "test", limit: 5
Expected: Should return tasks matching "test" in name/notes
Note response time: _____
```

### Test 2.4: Overdue Tasks
```
Run: tasks with mode: "overdue", limit: 10
Expected: Should return tasks past their due date
Note response time: _____
```

## 3. Project Operations Tests (V2 Tool)

### Test 3.1: List Projects
```
Run: projects with operation: "list", limit: 5, details: false
Expected: Should return project summary and list
Note response time: _____
```

### Test 3.2: Project Creation
```
Run: projects with operation: "create", name: "MCP Test Project " + current timestamp
Expected: Should create project and return its ID
Save project ID: _____
```

### Test 3.3: Project Update
```
Run: projects with operation: "update", projectId: [saved ID], note: "Updated via MCP test"
Expected: Should update the project successfully
```

### Test 3.4: Project Deletion
```
Run: projects with operation: "delete", projectId: [saved ID]
Expected: Should delete the project
```

## 4. Task CRUD Operations

### Test 4.1: Create Task with Tags
```
Run: create_task with:
  name: "MCP Test Task " + current timestamp
  tags: ["test", "mcp"] 
  dueDate: tomorrow's date in YYYY-MM-DD format
  flagged: true
Expected: Should create task WITH tags assigned
Save task ID: _____
CRITICAL: Verify tags were actually assigned
```

### Test 4.2: Update Task
```
Run: update_task with:
  taskId: [saved ID]
  name: "Updated MCP Test Task"
  note: "Updated via MCP"
Expected: Should update successfully
```

### Test 4.3: Complete Task
```
Run: complete_task with taskId: [saved ID]
Expected: Should mark task as completed
```

### Test 4.4: Create and Delete Task
```
Run: create_task with name: "Task to Delete"
Save ID, then:
Run: delete_task with taskId: [saved ID]
Expected: Should create then delete successfully
```

## 5. Advanced Features Tests

### Test 5.1: Recurring Task
```
Run: create_task with:
  name: "Weekly Recurring Test"
  repeatRule: {
    unit: "week",
    steps: 1,
    method: "fixed",
    weekdays: ["monday", "wednesday", "friday"]
  }
Expected: Should create recurring task
Save ID: _____
Then delete it: delete_task with taskId: [saved ID]
```

### Test 5.2: Task with Parent
```
First create parent:
Run: create_task with name: "Parent Task", sequential: true
Save parent ID: _____

Then create subtask:
Run: create_task with:
  name: "Subtask"
  parentTaskId: [parent ID]
Expected: Should create task as subtask

Clean up: delete both tasks
```

### Test 5.3: Export Tasks
```
Run: export_tasks with format: "json", filter: {limit: 3}
Expected: Should return JSON data for 3 tasks
```

## 6. Performance Tests

### Test 6.1: Large Query Performance
```
Run: tasks with mode: "all", limit: 100, details: false, skipAnalysis: true
Measure time: _____
Expected: Should complete in under 2 seconds
```

### Test 6.2: Tag Operations
```
Run: tags with operation: "list", namesOnly: true
Measure time: _____
Expected: Should return quickly (under 500ms)
```

## 7. Error Handling Tests

### Test 7.1: Invalid Task ID
```
Run: update_task with taskId: "invalid_id_xyz", name: "Test"
Expected: Should return clear error message
```

### Test 7.2: Invalid Parameters
```
Run: tasks with mode: "invalid_mode"
Expected: Should return validation error with valid options
```

### Test 7.3: Missing Required Field
```
Run: create_task with {} (empty parameters)
Expected: Should return error stating "name" is required
```

## 8. Analytics Tools

### Test 8.1: Productivity Stats
```
Run: productivity_stats with period: "week"
Expected: Should return GTD metrics summary
```

### Test 8.2: Task Velocity
```
Run: task_velocity with days: 7, groupBy: "day"
Expected: Should return completion velocity data
```

## Test Results Summary

Please provide:

1. **Overall Success Rate**: ___/30 tests passed

2. **Performance Summary**:
   - Fastest query: _____ ms
   - Slowest query: _____ ms
   - Average response time: _____ ms

3. **Critical Issues Found**:
   - List any tests that failed
   - Include full error messages
   - Note any timeout issues

4. **Tag Assignment Verification**:
   - Did Test 4.1 successfully assign tags during creation?
   - This is critical for v2.0.0 validation

5. **Unexpected Behaviors**:
   - Any warnings or unexpected responses
   - Any features that worked but seemed slow

6. **Script Errors** (if any):
   - Copy any JavaScript errors from the logs
   - Include any "Script execution failed" messages
   - Note any timeout errors

## Additional Checks

1. Check if any background errors appeared in Claude Desktop's logs
2. Verify the MCP server didn't crash during testing
3. Confirm OmniFocus didn't show any error dialogs

Please run all tests and provide the detailed results. For any failures, include:
- The exact input parameters used
- The complete error message
- Any relevant context about the failure

After running all tests, please provide a final assessment: Is v2.0.0 ready for production release based on these test results?