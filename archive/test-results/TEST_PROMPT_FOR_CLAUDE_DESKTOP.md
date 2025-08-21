# OmniFocus MCP Server Comprehensive Test Suite

Please run through this complete test suite for the omnifocus-mcp server. Report any errors, unexpected behaviors, or performance issues you encounter.

## Setup Verification

First, verify the server is properly connected:
1. Check if you can see the omnifocus-mcp server in your available tools
2. List all available tools from the omnifocus-mcp server

## 1. Basic Task Operations

### 1.1 Create Tasks
- Create a simple task: "Test task from Claude Desktop"
- Create a task with due date: "Task with due date" due tomorrow at 3pm
- Create a task with tags: "Tagged task" with tags ["testing", "mcp"]
- Create a task with project: "Project task" in project "Inbox" (or any existing project)

### 1.2 List Tasks
- List all incomplete tasks (limit 10)
- List today's agenda
- List tasks with performance metrics (note the timing)
- List tasks with skipAnalysis=true and compare performance

### 1.3 Update Tasks
- Update the name of the first test task to "Updated test task"
- Add a note to a task
- Change the due date of a task
- Mark a task as complete

### 1.4 Batch Operations
- Create 3 tasks for batch testing
- Use batch_update_tasks to add a tag "batch-test" to all 3
- Use batch_complete_tasks to complete all 3
- Verify they are completed

## 2. Project Operations

### 2.1 List Projects
- List all active projects
- List projects with details
- Note any performance issues

### 2.2 Create and Update Projects
- Create a new project: "MCP Test Project"
- Update the project's note
- Add review interval (if supported)

## 3. Tag Operations

### 3.1 List Tags
- List all tags
- Get counts for each tag

### 3.2 Create Tags
- Create a new tag: "mcp-test-tag"
- Verify it appears in the tag list

## 4. Analytics

### 4.1 Productivity Analytics
- Get productivity analytics for the last 7 days
- Get productivity analytics for the last 30 days
- Note the performance and any timeout issues

### 4.2 Project Health
- Check project health metrics
- Identify any stale projects

### 4.3 Tag Analytics
- Get tag usage analytics
- Check most and least used tags

## 5. Export Operations

### 5.1 Export Tasks
- Export tasks to Markdown format
- Export tasks to CSV format
- Export today's agenda

### 5.2 Export Projects
- Export project list to Markdown
- Export project hierarchy

## 6. Advanced Queries

### 6.1 Date Range Queries
- Query tasks due this week
- Query tasks due in the next 30 days
- Query overdue tasks

### 6.2 Complex Filters
- List tasks with multiple criteria (e.g., specific project + tag + incomplete)
- Test filtering with string operators (_contains, _beginsWith)

## 7. GTD Workflow Prompts

### 7.1 Weekly Review
- Run the gtd_weekly_review prompt
- Follow through the entire workflow
- Note any issues or unclear steps

### 7.2 Process Inbox
- Run the gtd_process_inbox prompt
- Process at least 2-3 items
- Test all options (convert to project, add tags, defer, etc.)

## 8. Performance Testing

### 8.1 Large Data Sets
- List tasks with limit=100
- List tasks with limit=500 (if you have that many)
- Note response times

### 8.2 Cache Performance
- List tasks twice in a row - second should be faster (cache hit)
- Update a task
- List tasks again - should reflect the update (cache invalidation)

## 9. Error Handling

### 9.1 Invalid Operations
- Try to update a non-existent task ID
- Try to create a task with invalid date format
- Try to assign a non-existent tag

### 9.2 Edge Cases
- Create a task with very long name (>500 characters)
- Create a task with special characters and emojis
- Try operations when OmniFocus might be closed

## 10. Integration Features

### 10.1 Recurring Tasks
- List tasks and check if recurring task information is shown
- Toggle skipAnalysis and verify the difference

### 10.2 Task Counts
- Get task counts by various criteria
- Verify counts match listed tasks

## Reporting

Please report:
1. **Errors**: Full error messages and stack traces
2. **Performance**: Operations taking >5 seconds
3. **Unexpected Behavior**: Results that don't match expectations
4. **Missing Features**: Tools or options that don't work as documented
5. **Success Rate**: Which operations worked perfectly

## Quick Summary Test

If you're short on time, run this minimal test set:
1. Create a task with name "Quick test task"
2. List today's agenda
3. Update the task to add a note
4. Complete the task
5. Get productivity analytics for last 7 days
6. Export today's completed tasks

Please provide detailed feedback on any issues encountered, including:
- Exact error messages
- Tool names and parameters used
- Expected vs actual behavior
- Performance metrics where relevant