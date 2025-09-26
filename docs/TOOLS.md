# OmniFocus MCP Tools Documentation

This document provides comprehensive documentation for all available tools in the OmniFocus MCP Server.

## 📢 Important: v2.1.0 Self-Contained Architecture

**This documentation reflects the v2.1.0 self-contained tool architecture.** All consolidated tools now directly implement their operations without delegation, providing better performance and maintainability.

## 🚀 Quick Tool Selection by Use Case

### Task Management
- **tasks**: Main workhorse. Use `details: false` for 30% speed boost
- **manage_task**: CRUD operations (create, update, complete, delete)
  - ✅ **Tags now work during creation** (v2.0.0+ fix)

### Performance-Optimized Queries  
- **tasks({ mode: 'today' })**: Faster than general queries for daily planning
- **tasks({ mode: 'overdue' })**: ~2x faster than filtering by date
- **tasks({ mode: 'upcoming' })**: Optimized for next N days view
- **tags({ operation: 'active' })**: Returns only tags with incomplete tasks (fast for GTD)

### Project Operations
- **projects**: All project operations (list, create, update, complete, delete, stats)
  - Use `includeStats: false` by default for speed

### Analytics (Cached 1 hour)
- **productivity_stats**: Period-based analysis (today|week|month|quarter|year)
- **task_velocity**: Completion patterns and throughput analysis
- **analyze_overdue**: Find bottlenecks by project/tag/age
- **workflow_analysis**: Deep workflow pattern analysis

### Tag Management  
- **tags**: 3 performance modes - `namesOnly` (130ms), `fastMode` (270ms), full (700ms)
- **tags({ operation: 'active' })**: Just tags with incomplete tasks
- Tag operations: create/rename/delete/merge/nest

### Bulk Operations
- **export**: JSON/CSV/Markdown with filters (tasks, projects, or complete backup)
- **recurring_tasks**: Analyze and manage recurring task patterns

### Common Performance Patterns

```javascript
// ✅ Fast daily overview
tasks({ mode: 'today', details: false, limit: 50 })

// ✅ Quick task creation with tags (now works!)
manage_task({ 
  operation: 'create',
  name: "Review report",
  tags: ["urgent", "work"],  // Works in v2.0.0+!
  projectId: "xyz789"
})

// ✅ Efficient tag dropdown
tags({ operation: 'list', namesOnly: true })  // ~130ms vs ~700ms

// ✅ GTD workflow - active tags only
tags({ operation: 'active' })  // Skip empty tags
```

---

## Available Tools (v2.1.0)

### tasks
**Self-contained task querying interface.** Direct implementation with 8 query modes.

**Parameters:**
- `mode` (string, required): Type of query to perform:
  - `"all"` - General purpose task listing with filters
  - `"search"` - Text search in task names and notes (requires `search`)
  - `"today"` - Today's tasks (optimized for daily planning)
  - `"blocked"` - Tasks waiting on prerequisites or dependencies
  - `"available"` - All currently workable tasks
  - `"overdue"` - Tasks past their due date
  - `"upcoming"` - Tasks due in next N days (use `daysAhead` parameter)
  - `"flagged"` - All flagged tasks

**Common Parameters (all modes):**
- `completed` (boolean): Filter by completion status (default: false)
- `limit` (number): Maximum tasks to return (default: 25)
- `details` (boolean): Include full task details (default: false for performance)
- `fastSearch` (boolean): Enable fast search mode for performance (default: true)
- `fields` (string[]): Select specific fields to return for performance optimization (optional)
- `project` (string): Filter by project ID
- `tags` (string[]): Filter by tags

**Mode-specific Parameters:**
- `search` (string): Required for "search" mode
- `daysAhead` (number): Days to look ahead for "upcoming" mode (default: 7)
- `dueBy` (string): Filter tasks due by specific date

**Examples:**

General task list:
```javascript
{
  "tool": "tasks",
  "arguments": {
    "mode": "all",
    "completed": false,
    "tags": ["work"],
    "limit": 50
  }
}
```

Search for tasks:
```javascript
{
  "tool": "tasks", 
  "arguments": {
    "mode": "search",
    "search": "budget review",
    "completed": false
  }
}
```

Today's tasks:
```javascript
{
  "tool": "tasks",
  "arguments": {
    "mode": "today",
    "details": true
  }
}
```

Performance-optimized query with field selection:
```javascript
{
  "tool": "tasks",
  "arguments": {
    "mode": "upcoming",
    "limit": 10,
    "fastSearch": true,
    "fields": ["id", "name", "dueDate", "flagged", "project"],
    "daysAhead": 7
  }
}
```

### folders
**Self-contained folder management interface.** Direct implementation of all folder operations.

**Parameters:**
- `operation` (string, required): Operation to perform:
  - `"create"` - Create new folder
  - `"update"` - Update folder properties  
  - `"delete"` - Delete folder (with optional content handling)
  - `"move"` - Move folder to new parent
  - `"set_status"` - Change folder status
  - `"duplicate"` - Duplicate folder (not yet implemented)

**Operation-specific Parameters:**

**Create operation:**
- `name` (string, required): Folder name
- `parent` (string): Parent folder ID
- `position` (string): "beginning", "end", "before", "after"
- `relativeToFolder` (string): Reference folder for position
- `status` (string): "active", "on_hold", "dropped", "done"

**Update operation:**
- `folderId` (string, required): Folder ID to update
- `name` (string): New name
- `status` (string): New status

**Delete operation:**
- `folderId` (string, required): Folder ID to delete
- `moveContentsTo` (string): Folder ID to move contents to
- `force` (boolean): Force deletion even if folder has contents

**Move operation:**
- `folderId` (string, required): Folder ID to move
- `parentId` (string): New parent folder ID
- `position` (string): Position in new parent
- `relativeToFolder` (string): Reference folder for position

**Examples:**

Create folder:
```javascript
{
  "tool": "folders",
  "arguments": {
    "operation": "create",
    "name": "New Project Area",
    "parentFolderId": "parentFolder123"
  }
}
```

Update folder:
```javascript
{
  "tool": "folders",
  "arguments": {
    "operation": "update", 
    "folderId": "folder123",
    "name": "Updated Name"
  }
}
```

### manage_reviews
**Unified review management for GTD workflows.** Handles project review scheduling and completion.

**Parameters:**
- `operation` (string, required): Review operation:
  - `"list_for_review"` - Get projects needing review
  - `"mark_reviewed"` - Mark project as reviewed  
  - `"set_schedule"` - Set review schedule for project

**Operation-specific Parameters:**

**List for review:**
- `overdue` (boolean): Include overdue reviews only
- `upcoming` (boolean): Include upcoming reviews
- `limit` (number): Maximum projects to return

**Mark reviewed:**
- `projectId` (string, required): Project to mark as reviewed
- `reviewDate` (string): Review completion date (defaults to now)

**Set schedule:**
- `projectId` (string, required): Project to schedule
- `reviewInterval` (string): "daily", "weekly", "monthly", "quarterly", "yearly"
- `nextReviewDate` (string): Specific next review date

### batch_task_operations
**Efficient batch operations on multiple tasks.**

**Parameters:**
- `operation` (string, required): Batch operation:
  - `"complete"` - Mark multiple tasks as completed
  - `"delete"` - Delete multiple tasks
  - `"update"` - Update multiple tasks with same changes

**Operation-specific Parameters:**
- `taskIds` (string[], required): Array of task IDs to operate on
- `updates` (object): For update operation, object with fields to change

**Example:**

Batch complete tasks:
```javascript
{
  "tool": "batch_task_operations",
  "arguments": {
    "operation": "complete",
    "taskIds": ["task1", "task2", "task3"]
  }
}
```

---

## Legacy Task Operations

> **⚠️ Deprecated:** Use [`tasks`](#tasks) instead for all task querying operations.

### list_tasks
**DEPRECATED:** Use `tasks` with `mode: "all"` instead.

*Advanced task filtering with smart caching.*

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
- `parentTaskId` (string): Parent task ID to create as subtask (for action groups)
- `flagged` (boolean): Flag status
- `dueDate` (string): Due date in ISO format
- `deferDate` (string): Defer date in ISO format
- `estimatedMinutes` (number): Time estimate
- `tags` (string[]): Tags to assign (requires separate update due to JXA limitation)
- `sequential` (boolean): Whether subtasks must be completed in order (default: false/parallel)

**Examples:**

Create a regular task:
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

Create an action group with subtasks:
```javascript
// First create the parent task
{
  "tool": "create_task",
  "arguments": {
    "name": "Plan Party",
    "sequential": true,  // Subtasks must be done in order
    "projectId": "abc123"
  }
}
// Returns: { taskId: "parentId123" }

// Then create subtasks
{
  "tool": "create_task",
  "arguments": {
    "name": "Make guest list",
    "parentTaskId": "parentId123"
  }
}

{
  "tool": "create_task",
  "arguments": {
    "name": "Send invitations",
    "parentTaskId": "parentId123"
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
- `parentTaskId` (string): Move to parent task (null to make top-level)
- `tags` (string[]): Update tags
- `estimatedMinutes` (number): Time estimate
- `sequential` (boolean): Whether subtasks must be completed in order

### complete_task
Mark a task as completed.

**Parameters:**
- `taskId` (string, required): Task ID to complete

### delete_task
Permanently delete a task.

**Parameters:**
- `taskId` (string, required): Task ID to delete

### get_task_count
**DEPRECATED:** Use `tasks` with `details: false` instead.

*Get count of tasks matching filters without returning task data.*

**Parameters:** Same as `list_tasks` except `limit`, `offset`, and `includeDetails`

### todays_agenda  
Get today's tasks with optimized defaults. *(Still recommended - no consolidation needed)*

**Parameters:**
- `includeOverdue` (boolean): Include overdue tasks (default: true)
- `includeFlagged` (boolean): Include flagged tasks
- `includeDetails` (boolean): Include full details (default: false)
- `limit` (number): Maximum tasks (default: 50)

---

## Legacy Folder Operations

> **⚠️ Deprecated:** Use [`folders`](#folders) instead for all folder operations.

### create_folder
**DEPRECATED:** Use `folders` with `operation: "create"` instead.

### update_folder  
**DEPRECATED:** Use `folders` with `operation: "update"` instead.

### delete_folder
**DEPRECATED:** Use `folders` with `operation: "delete"` instead.

### move_folder
**DEPRECATED:** Use `folders` with `operation: "move"` instead.

---

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
- `sequential` (boolean): Whether tasks must be completed in order (default: false/parallel)
- `completionDate` (string): For completed projects

### update_project
Update project properties.

**Parameters:**
- `projectId` (string, required): Project ID
- `updates` (object): Object containing properties to update
  - `name`, `note`, `status`, `flagged`, `dueDate`, `deferDate`, `folder`, `sequential`

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
**DEPRECATED:** Use `tasks` with appropriate filters instead.

*Query tasks by date ranges with operators.*

**Parameters:**
- `dateField` (string): "dueDate", "deferDate", "completionDate"
- `operator` (string): "equals", "before", "after", "between", "isNull", "isNotNull"
- `startDate` (string): Start date for query
- `endDate` (string): End date (for between operator)
- `includeCompleted` (boolean): Include completed tasks

### overdue_tasks
**DEPRECATED:** Use `tasks` with `mode: "overdue"` instead.

*Get all overdue tasks.*

**Parameters:**
- `includeDeferred` (boolean): Include deferred overdue
- `sortBy` (string): "dueDate", "project", "priority"

### upcoming_tasks
**DEPRECATED:** Use `tasks` with `mode: "upcoming"` instead.

*Get tasks due in next N days.*

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

---

## Legacy Review Operations

> **⚠️ Deprecated:** Use [`manage_reviews`](#manage_reviews) instead for all review operations.

### projects_for_review
**DEPRECATED:** Use `manage_reviews` with `operation: "list_for_review"` instead.

### mark_project_reviewed
**DEPRECATED:** Use `manage_reviews` with `operation: "mark_reviewed"` instead.

### set_review_schedule
**DEPRECATED:** Use `manage_reviews` with `operation: "set_schedule"` instead.

---

## System Tools

### get_version_info
Get OmniFocus and server version information.

**Parameters:** None

### run_diagnostics
Run comprehensive system diagnostics.

**Parameters:**
- `includePerformance` (boolean): Include performance metrics
- `includeCacheStats` (boolean): Include cache statistics

---

## Migration Quick Reference

### Consolidated Tool Mappings

| Legacy Tool | Consolidated Tool | Parameters |
|------------|-------------------|------------|
| `list_tasks` | `tasks` | `{ mode: "all", ...filters }` |
| `next_actions` | `tasks` | `{ mode: "available" }` |
| `blocked_tasks` | `tasks` | `{ mode: "blocked" }` |
| `available_tasks` | `tasks` | `{ mode: "available" }` |
| `overdue_tasks` | `tasks` | `{ mode: "overdue" }` |
| `upcoming_tasks` | `tasks` | `{ mode: "upcoming", daysAhead: N }` |
| `create_folder` | `folders` | `{ operation: "create", name: "..." }` |
| `update_folder` | `folders` | `{ operation: "update", folderId: "...", name: "..." }` |
| `delete_folder` | `folders` | `{ operation: "delete", folderId: "..." }` |
| `move_folder` | `folders` | `{ operation: "move", folderId: "...", parentFolderId: "..." }` |
| `projects_for_review` | `manage_reviews` | `{ operation: "list_for_review" }` |
| `mark_project_reviewed` | `manage_reviews` | `{ operation: "mark_reviewed", projectId: "..." }` |
| `set_review_schedule` | `manage_reviews` | `{ operation: "set_schedule", projectId: "...", reviewInterval: "..." }` |

For detailed examples and advanced usage, see [`TOOL_CONSOLIDATION.md`](TOOL_CONSOLIDATION.md) and [`LLM_USAGE_GUIDE.md`](LLM_USAGE_GUIDE.md).