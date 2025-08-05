# OmniFocus MCP Tools Documentation

This document provides comprehensive documentation for all available tools in the OmniFocus MCP Server.

## Task Operations

### list_tasks
Advanced task filtering with smart caching.

**Parameters:**
- `completed` (boolean): Filter by completion status
- `flagged` (boolean): Filter by flagged status
- `projectId` (string): Filter by project ID
- `tags` (string[]): Filter by tags
- `search` (string): Search in task names and notes
- `dueBefore` (string): Filter tasks due before date
- `dueAfter` (string): Filter tasks due after date
- `deferBefore` (string): Filter tasks deferred before date
- `deferAfter` (string): Filter tasks deferred after date
- `available` (boolean): Filter by availability
- `inInbox` (boolean): Filter inbox tasks only
- `limit` (number): Maximum tasks to return (default: 100, max: 1000)
- `offset` (number): Pagination offset
- `includeDetails` (boolean): Include full task details
- `skipAnalysis` (boolean): Skip recurring task analysis for ~30% faster queries

**Example:**
```javascript
{
  "tool": "list_tasks",
  "arguments": {
    "completed": false,
    "tags": ["work", "urgent"],
    "limit": 50,
    "skipAnalysis": true
  }
}
```

### create_task
Create new tasks in inbox or specific project.

**Parameters:**
- `name` (string, required): Task name
- `note` (string): Task note/description
- `projectId` (string): Project to assign task to
- `flagged` (boolean): Flag status
- `dueDate` (string): Due date in ISO format
- `deferDate` (string): Defer date in ISO format
- `estimatedMinutes` (number): Time estimate
- `tags` (string[]): Tags to assign (requires separate update due to JXA limitation)

**Example:**
```javascript
{
  "tool": "create_task",
  "arguments": {
    "name": "Review Q4 budget",
    "projectId": "jH8x2mKl9pQ",
    "dueDate": "2024-01-15T17:00:00Z",
    "flagged": true,
    "estimatedMinutes": 30
  }
}
```

### update_task
Update existing task properties.

**Parameters:**
- `taskId` (string, required): Task ID to update
- `name` (string): New name
- `note` (string): New note
- `flagged` (boolean): Flag status
- `dueDate` (string): Due date (null to clear)
- `deferDate` (string): Defer date (null to clear)
- `projectId` (string): Move to project (null for inbox)
- `tags` (string[]): Update tags
- `estimatedMinutes` (number): Time estimate

### complete_task
Mark a task as completed.

**Parameters:**
- `taskId` (string, required): Task ID to complete

### delete_task
Permanently delete a task.

**Parameters:**
- `taskId` (string, required): Task ID to delete

### get_task_count
Get count of tasks matching filters without returning task data.

**Parameters:** Same as `list_tasks` except `limit`, `offset`, and `includeDetails`

### todays_agenda
Get today's tasks with optimized defaults.

**Parameters:**
- `includeOverdue` (boolean): Include overdue tasks (default: true)
- `includeFlagged` (boolean): Include flagged tasks
- `includeDetails` (boolean): Include full details (default: false)
- `limit` (number): Maximum tasks (default: 50)

## Project Operations

### list_projects
List and filter projects with caching.

**Parameters:**
- `status` (string[]): Filter by status: "active", "onHold", "dropped", "done"
- `flagged` (boolean): Filter by flagged status
- `folder` (string): Filter by folder name
- `search` (string): Search in project names
- `includeDetails` (boolean): Include project details
- `limit` (number): Maximum projects
- `offset` (number): Pagination offset

### create_project
Create new project with optional folder.

**Parameters:**
- `name` (string, required): Project name
- `note` (string): Project description
- `folder` (string): Parent folder (creates if needed)
- `dueDate` (string): Due date
- `deferDate` (string): Defer date
- `flagged` (boolean): Flag status
- `completionDate` (string): For completed projects

### update_project
Update project properties.

**Parameters:**
- `projectId` (string, required): Project ID
- `updates` (object): Object containing properties to update
  - `name`, `note`, `status`, `flagged`, `dueDate`, `deferDate`, `folder`

### complete_project
Mark project as done.

**Parameters:**
- `projectId` (string, required): Project ID

### delete_project
Remove project permanently.

**Parameters:**
- `projectId` (string, required): Project ID

## Analytics Tools

### productivity_stats
Comprehensive productivity metrics.

**Parameters:**
- `period` (string): "day", "week", "month", "quarter", "year"
- `groupBy` (string): "project", "tag", "date"
- `includeArchived` (boolean): Include completed items

**Returns:** Completion rates, velocity metrics, time-based trends

### task_velocity
Task completion trend analysis.

**Parameters:**
- `period` (string): "daily", "weekly", "monthly"
- `lookback` (number): Days to analyze (default: 30)

### overdue_analysis
Analyze overdue task patterns.

**Parameters:**
- `groupBy` (string): "project", "tag", "age"
- `includeRecurring` (boolean): Include recurring tasks

## Tag Management

### list_tags
Get all tags with performance modes.

**Parameters:**
- `namesOnly` (boolean): Ultra-fast mode, returns only names (~130ms)
- `fastMode` (boolean): Fast mode, no hierarchy (~270ms)
- `includeEmpty` (boolean): Include unused tags
- `includeUsageStats` (boolean): Include usage counts (slow)
- `sortBy` (string): "name" or "usage"

### get_active_tags
Get only tags with incomplete tasks (optimized for GTD).

**Parameters:** None

### manage_tags
Create, rename, or delete tags.

**Parameters:**
- `operation` (string): "create", "rename", "delete"
- `tagName` (string): Tag name
- `newName` (string): For rename operation

## Export Tools

### export_tasks
Export tasks in various formats.

**Parameters:**
- `format` (string): "csv", "json", "markdown"
- `filter` (object): Same as list_tasks parameters
- `fields` (string[]): Fields to include
- `filename` (string): Output filename

### export_projects
Export project data.

**Parameters:**
- `format` (string): "csv", "json", "markdown"
- `includeTasks` (boolean): Include project tasks
- `filter` (object): Same as list_projects parameters

### bulk_export
Export all OmniFocus data.

**Parameters:**
- `format` (string): "json", "csv"
- `includeCompleted` (boolean): Include completed items
- `outputPath` (string): Directory for export files

## Date Range Queries

### date_range_query
Query tasks by date ranges with operators.

**Parameters:**
- `dateField` (string): "dueDate", "deferDate", "completionDate"
- `operator` (string): "equals", "before", "after", "between", "isNull", "isNotNull"
- `startDate` (string): Start date for query
- `endDate` (string): End date (for between operator)
- `includeCompleted` (boolean): Include completed tasks

### overdue_tasks
Get all overdue tasks.

**Parameters:**
- `includeDeferred` (boolean): Include deferred overdue
- `sortBy` (string): "dueDate", "project", "priority"

### upcoming_tasks
Get tasks due in next N days.

**Parameters:**
- `days` (number): Days to look ahead (default: 7)
- `includeToday` (boolean): Include today's tasks
- `excludeOverdue` (boolean): Exclude overdue tasks

## Recurring Task Analysis

### analyze_recurring_tasks
Analyze recurring task patterns.

**Parameters:**
- `includeCompleted` (boolean): Include completed instances
- `groupBy` (string): "pattern", "project", "frequency"

### get_recurring_patterns
Extract and analyze recurring rules.

**Parameters:**
- `sortBy` (string): "frequency", "nextDue", "overdue"

## System Tools

### get_version_info
Get OmniFocus and server version information.

**Parameters:** None

### run_diagnostics
Run comprehensive system diagnostics.

**Parameters:**
- `includePerformance` (boolean): Include performance metrics
- `includeCacheStats` (boolean): Include cache statistics