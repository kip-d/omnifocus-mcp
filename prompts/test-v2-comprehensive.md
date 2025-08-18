# Comprehensive V2 Tools Test for Claude Desktop

This prompt tests all major V2 tool functionality to ensure your OmniFocus MCP server is working correctly.

## Test Sequence

Please run through these tests in order and report the results:

### 1. Basic Query Test
Show me my tasks for today. Include any overdue tasks and flagged items.

### 2. Search Test
Search for any tasks containing the word "email" or "meeting" in their names.

### 3. Project Overview
List my active projects and show me which ones need review.

### 4. Create and Manage Task Test
1. Create a new task called "Test V2 Integration {{timestamp}}" with:
   - Due date: tomorrow at 5pm
   - Tags: test, v2-verify
   - Note: "Created to test V2 tools integration"
   - Flag it as important

2. Then update the task to:
   - Add an estimated duration of 30 minutes
   - Change the note to "Updated successfully via V2"

3. Finally, mark it as complete

### 5. Recurring Task Test
Create a recurring task called "Weekly V2 Test {{timestamp}}" that:
- Repeats every Monday and Friday
- Has a due time of 9:00 AM
- Is flagged

### 6. Task Reparenting Test
1. Create a parent task called "V2 Parent Task {{timestamp}}"
2. Create a child task under it called "V2 Child Task"
3. Move the child task to the inbox (remove parent)

### 7. Productivity Analysis
Show me my productivity statistics for this week, including:
- Task completion velocity
- Any overdue task patterns
- Overall GTD health metrics

### 8. Project Management Test
1. Create a new project called "V2 Test Project {{timestamp}}"
2. Set it to review every 7 days
3. Add a task to this project
4. Mark the project as complete

### 9. Tag Management Test
1. List all my active tags (tags with incomplete tasks)
2. Create a new tag called "v2-test-{{timestamp}}"
3. Show me all tasks with the "test" tag if it exists

### 10. Perspective Query Test (if you have custom perspectives)
Show me the tasks from my "Today" perspective or any custom perspective you have.

### 11. Export Test
Export my flagged tasks to Markdown format.

### 12. Batch Operations Test
If you found multiple tasks in step 2 (search test), mark the first 2 as complete using batch operations.

## Expected Results

Each test should complete successfully. Report:
- ✅ Which operations succeeded
- ❌ Any operations that failed (with error messages)
- 🔍 Any unexpected behaviors
- ⏱️ Any operations that seem unusually slow

## Quick Diagnostic Commands

If any tests fail, try these diagnostic commands:

1. "Show me the version info of the OmniFocus MCP server"
2. "Run diagnostics on the OmniFocus connection"
3. "List all available tools"

## Notes
- Replace {{timestamp}} with the current timestamp when creating items
- All V2 tools should respond with a summary section first
- Tags should be assigned during task creation (not requiring a separate update)
- Repeat rules should work immediately
- Task reparenting should work via the update_task tool

This comprehensive test covers:
- ✅ All CRUD operations (Create, Read, Update, Delete)
- ✅ Advanced features (recurring tasks, reparenting, perspectives)
- ✅ Analytics and productivity tools
- ✅ Project and tag management
- ✅ Export functionality
- ✅ Batch operations

If all tests pass, your V2 tools are working perfectly!