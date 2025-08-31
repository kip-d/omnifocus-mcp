# OmniFocus MCP API Reference v2.0.0

This document provides comprehensive documentation for all available tools in the OmniFocus MCP server v2.0.0.

## Table of Contents

1. [Query Tools](#query-tools)
   - [tasks](#tasks) - Query tasks with various modes
   - [projects](#projects) - Manage and query projects
   - [query_perspective](#query_perspective) - Query perspective views
2. [CRUD Operations](#crud-operations)
   - [create_task](#create_task) - Create new tasks
   - [update_task](#update_task) - Update existing tasks
   - [complete_task](#complete_task) - Mark tasks as completed
   - [delete_task](#delete_task) - Delete tasks
3. [Analytics Tools](#analytics-tools)
   - [productivity_stats](#productivity_stats) - Comprehensive productivity metrics
   - [task_velocity](#task_velocity) - Task completion velocity analysis
   - [analyze_overdue](#analyze_overdue) - Overdue task patterns
   - [get_productivity_stats](#get_productivity_stats) - Simplified stats interface
   - [get_task_velocity](#get_task_velocity) - Simplified velocity interface
   - [analyze_overdue_tasks](#analyze_overdue_tasks) - Simplified overdue analysis
4. [Tag Management](#tag-management)
   - [list_tags](#list_tags) - List all tags/contexts
   - [get_active_tags](#get_active_tags) - Get only actionable tags
   - [manage_tags](#manage_tags) - Create, rename, delete tags
5. [Folder & Review Management](#folder--review-management)
   - [query_folders](#query_folders) - Query folder structure
   - [manage_folder](#manage_folder) - Folder operations
   - [manage_reviews](#manage_reviews) - Project review management
6. [Batch Operations](#batch-operations)
   - [batch_task_operations](#batch_task_operations) - Bulk task operations
7. [Export & Utility](#export--utility)
   - [export_tasks](#export_tasks) - Export tasks to various formats
   - [export_projects](#export_projects) - Export projects
   - [bulk_export](#bulk_export) - Export all data
   - [list_perspectives](#list_perspectives) - List available perspectives
   - [get_version_info](#get_version_info) - Server version information
   - [run_diagnostics](#run_diagnostics) - Diagnostic tools
8. [Recurring Task Analysis](#recurring-task-analysis)
   - [analyze_recurring_tasks](#analyze_recurring_tasks) - Analyze recurring patterns
   - [get_recurring_patterns](#get_recurring_patterns) - Get frequency statistics

---

## Query Tools

### tasks

Query OmniFocus tasks with various modes and filters. Returns a summary first for quick answers, then detailed task data.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | **Yes** | Query mode (see modes below) |
| `limit` | string | **Yes** | Maximum tasks to return (default: "25") |
| `details` | string | **Yes** | Include full details (default: "false") |
| `search` | string | No | Search text for task names (search mode only) |
| `project` | string | No | Filter by project name or ID |
| `tags` | string[] | No | Filter by tag names |
| `completed` | string | No | Include completed tasks (default: "false") |
| `dueBy` | string | No | Tasks due by date (e.g., "tomorrow", "2025-03-15") |
| `daysAhead` | string | No | Days to look ahead (upcoming mode, default: "7") |

#### Available Modes

- **`all`** - All tasks with optional filters
- **`search`** - Find tasks by text (requires `search` parameter)
- **`overdue`** - Tasks past their due date
- **`today`** - Tasks due within 3 days OR flagged
- **`upcoming`** - Tasks due in next N days (use `daysAhead`)
- **`available`** - Tasks ready to work on now (not blocked/deferred)
- **`blocked`** - Tasks waiting on other tasks
- **`flagged`** - High priority flagged tasks

#### Example Request

```json
{
  "mode": "overdue",
  "limit": "10",
  "details": "false"
}
```

#### Example Response

```json
{
  "success": true,
  "summary": {
    "total_count": 5,
    "returned_count": 5,
    "breakdown": {
      "overdue": 5,
      "flagged": 3
    },
    "key_insights": [
      "5 tasks overdue, oldest: 'Review Q4 goals' (10 days)",
      "Project X has 3 overdue tasks (potential bottleneck)"
    ]
  },
  "data": {
    "tasks": [...],
    "preview": [...]
  }
}
```

---

### projects

Manage OmniFocus projects with various operations. Returns summary with key insights.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation to perform (see below) |
| `limit` | string | **Yes** | Maximum projects to return |
| `details` | string | **Yes** | Include full project details |
| `status` | string | No | Filter by status (active/on-hold/done/dropped/all) |
| `folder` | string | No | Filter by folder name |
| `needsReview` | string | No | Only show projects needing review |
| `projectId` | string | No* | Project ID (*required for update/complete/delete) |
| `name` | string | No | Project name (for create/update) |
| `note` | string | No | Project description |
| `dueDate` | string | No | Due date (natural language supported) |
| `reviewInterval` | string | No | Review interval in days |
| `tags` | string[] | No | Tags to assign |
| `flagged` | string | No | Mark as flagged/important |

#### Operations

- **`list`** - Query projects
- **`create`** - Create new project
- **`update`** - Update existing project
- **`complete`** - Mark project as completed
- **`delete`** - Delete project
- **`review`** - List projects needing review
- **`active`** - List only active projects

#### Example Request

```json
{
  "operation": "active",
  "limit": "10",
  "details": "false"
}
```

---

### query_perspective

Query tasks from a specific OmniFocus perspective without changing the user's window.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `perspectiveName` | string | **Yes** | Name of the perspective (e.g., "Inbox", "Flagged") |
| `limit` | string | **Yes** | Maximum tasks to return |
| `includeDetails` | string | **Yes** | Include task details like notes and subtasks |

#### Example Request

```json
{
  "perspectiveName": "Inbox",
  "limit": "10",
  "includeDetails": "false"
}
```

---

## CRUD Operations

### create_task

Create a new task in OmniFocus with full support for projects, tags, dates, and recurrence.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | **Yes** | Task name |
| `flagged` | string | **Yes** | Whether the task is flagged ("true"/"false") |
| `sequential` | string | **Yes** | Subtasks sequential ("true") or parallel ("false") |
| `note` | string | No | Task description |
| `projectId` | string | No | Project ID to assign the task to |
| `parentTaskId` | string | No | Parent task ID for creating subtasks |
| `dueDate` | string | No | Due date (e.g., "2025-03-15" or "2025-03-15 14:30") |
| `deferDate` | string | No | Defer date |
| `estimatedMinutes` | number | No | Estimated duration in minutes |
| `tags` | string[] | No | Tags to assign (v2.0.0-beta.1+) |
| `repeatRule` | object | No | Recurrence rule (see below) |

#### Repeat Rule Structure

```json
{
  "unit": "week",           // minute/hour/day/week/month/year
  "steps": "1",             // Interval (every X units)
  "method": "fixed",        // fixed/start-after-completion/due-after-completion
  "weekdays": ["monday", "wednesday", "friday"],  // For weekly repeats
  "weekPosition": "1",      // For monthly (1st, 2nd, 3rd, 4th, "last")
  "weekday": "tuesday",     // For monthly positional (e.g., "1st Tuesday")
  "deferAnother": {         // Optional defer before due
    "unit": "day",
    "steps": 3
  }
}
```

#### Example Request

```json
{
  "name": "Weekly team meeting",
  "flagged": "false",
  "sequential": "false",
  "projectId": "abc123",
  "dueDate": "2025-03-15 14:00",
  "tags": ["meetings", "team"],
  "repeatRule": {
    "unit": "week",
    "steps": "1",
    "method": "fixed"
  }
}
```

---

### update_task

Update an existing task with support for moving between projects and parents.

**⚠️ CONTEXT OPTIMIZATION**: When updating 10+ tasks (e.g., bulk tag reorganization), ALWAYS set `minimalResponse=true` to reduce response size by ~95% and conserve LLM context window.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | **Yes** | ID of the task to update |
| `name` | string | No | New task name |
| `note` | string | No | New task note |
| `projectId` | string | No | New project ID (null/"" to move to inbox) |
| `parentTaskId` | string | No | Parent task ID (null for top-level) |
| `flagged` | boolean | No | New flagged status |
| `dueDate` | string | No | New due date |
| `clearDueDate` | boolean | No | Clear existing due date |
| `deferDate` | string | No | New defer date |
| `clearDeferDate` | boolean | No | Clear existing defer date |
| `estimatedMinutes` | number | No | New estimated duration |
| `clearEstimatedMinutes` | boolean | No | Clear existing estimate |
| `tags` | string[] | No | New tags (replaces all) |
| `sequential` | boolean | No | Sequential/parallel for subtasks |
| `repeatRule` | object | No | New repeat rule |
| `clearRepeatRule` | boolean | No | Remove existing repeat rule |
| **`minimalResponse`** | **boolean** | No | **⚡ Return only success/task_id/fields_updated. ESSENTIAL for bulk operations!** |

#### Example Requests

**Standard Update (single task)**:
```json
{
  "taskId": "xyz789",
  "name": "Updated task name",
  "projectId": null,  // Move to inbox
  "tags": ["urgent", "work"]
}
```

**Bulk Tag Reorganization (conserve context)**:
```json
{
  "taskId": "abc123",
  "tags": ["EVE", "PvP"],
  "minimalResponse": true  // ← Critical for bulk operations!
}
```

#### Response Size Comparison

**Standard Response** (~400 tokens):
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "xyz789",
      "name": "Updated task name",
      "note": "Full task details...",
      // ... 20+ additional fields
    }
  },
  "metadata": {
    "query_time_ms": 234,
    // ... performance metrics
  }
}
```

**Minimal Response** (~20 tokens - 95% reduction!):
```json
{
  "success": true,
  "task_id": "xyz789",
  "fields_updated": ["tags"],
  "operation": "update_task"
}
```

---

### complete_task

Mark a task as completed.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | **Yes** | ID of the task to complete |
| `completionDate` | string | No | Completion date (defaults to now) |

---

### delete_task

Permanently delete a task.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | **Yes** | ID of the task to delete |

---

## Analytics Tools

### productivity_stats

Generate comprehensive productivity statistics and GTD health metrics.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | **Yes** | Time period (today/week/month/quarter/year) |
| `includeProjectStats` | string | **Yes** | Include project-level statistics |
| `includeTagStats` | string | **Yes** | Include tag-level statistics |

---

### task_velocity

Analyze task completion velocity and predict workload capacity.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `days` | string | **Yes** | Number of days to analyze |
| `groupBy` | string | **Yes** | How to group data (project/tag/none) |
| `includeWeekends` | string | **Yes** | Include weekend days |

---

### analyze_overdue

Analyze overdue tasks for patterns and bottlenecks.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeRecentlyCompleted` | string | **Yes** | Include tasks completed after due date |
| `groupBy` | string | **Yes** | How to group (project/tag/duration) |
| `limit` | string | **Yes** | Maximum tasks to analyze |

---

## Tag Management

### list_tags

List all tags/contexts with various performance modes.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sortBy` | string | **Yes** | Sort order (name/count/usage) |
| `includeEmpty` | string | **Yes** | Include tags with no tasks |
| `includeUsageStats` | string | **Yes** | Calculate usage statistics |
| `includeTaskCounts` | string | **Yes** | Include task counts |
| `fastMode` | string | **Yes** | Skip hierarchy (faster) |
| `namesOnly` | string | **Yes** | Return only names (fastest) |

#### Performance Modes

- **`namesOnly=true`** - Fastest (~130ms), returns only tag names
- **`fastMode=true`** - Fast (~270ms), no hierarchy
- **Default** - Full details (~700ms), includes hierarchy

---

### get_active_tags

Get only tags with incomplete tasks. Much faster than list_tags for GTD workflows.

#### Parameters

None required.

#### Returns

Simple array of tag names that have actionable tasks.

---

### manage_tags

Create, rename, delete, or merge tags.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | **Yes** | Action (create/rename/delete/merge) |
| `tagName` | string | **Yes** | Tag name to operate on |
| `newName` | string | No* | New name (*required for rename) |
| `targetTag` | string | No* | Target tag (*required for merge) |

---

## Folder & Review Management

### query_folders

Query folder structure and contents.

Various operations for querying folders - consult tool schema for details.

### manage_folder

Folder management operations (create, update, delete, move, etc.).

Various operations for managing folders - consult tool schema for details.

### manage_reviews

Project review operations for GTD weekly reviews.

Supports listing projects for review, marking as reviewed, and managing review schedules.

---

## Batch Operations

### batch_task_operations

Perform bulk operations on multiple tasks.

Supports batch update, complete, and delete operations. Uses individual OmniFocus operations for reliability.

---

## Export & Utility

### export_tasks

Export tasks to JSON, CSV, or Markdown format.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | string | **Yes** | Export format (json/csv/markdown) |
| `filter` | object | No | Filter criteria (same as tasks tool) |
| `fields` | string[] | No | Fields to include in export |

#### Available Fields

- `id`, `name`, `note`, `project`, `tags`
- `deferDate`, `dueDate`, `completed`, `completionDate`
- `flagged`, `estimated`, `created`, `modified`

---

### export_projects

Export all projects to JSON or CSV.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | string | **Yes** | Export format (json/csv) |
| `includeStats` | string | **Yes** | Include task statistics |

---

### bulk_export

Export all OmniFocus data to files.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `outputDirectory` | string | **Yes** | Directory to save files |
| `format` | string | **Yes** | Export format (json/csv) |
| `includeCompleted` | string | **Yes** | Include completed tasks |
| `includeProjectStats` | string | **Yes** | Include project statistics |

Creates three files: tasks, projects, and tags exports.

---

### list_perspectives

List all available OmniFocus perspectives (built-in and custom).

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeFilterRules` | string | **Yes** | Include filter rules |
| `sortBy` | string | **Yes** | Sort order |

---

### get_version_info

Get MCP server version information.

#### Parameters

None required.

#### Returns

Version number, git commit hash, build timestamp, and environment details.

---

### run_diagnostics

Run diagnostics to identify OmniFocus connection issues.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `testScript` | string | **Yes** | Optional custom script to test |

---

## Recurring Task Analysis

### analyze_recurring_tasks

Analyze recurring tasks for patterns.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `activeOnly` | string | **Yes** | Only active tasks (default: "true") |
| `includeCompleted` | string | **Yes** | Include completed |
| `includeDropped` | string | **Yes** | Include dropped |
| `includeHistory` | string | **Yes** | Include completion history |
| `sortBy` | string | **Yes** | Sort order (nextDue/frequency/name) |

---

### get_recurring_patterns

Get recurring task frequency patterns and statistics.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `activeOnly` | string | **Yes** | Only active tasks |
| `includeCompleted` | string | **Yes** | Include completed |
| `includeDropped` | string | **Yes** | Include dropped |

---

## Common Use Cases

### 1. Daily Task Review

```json
// Get today's tasks
{
  "tool": "tasks",
  "arguments": {
    "mode": "today",
    "limit": "20",
    "details": "false"
  }
}
```

### 2. Weekly GTD Review

```json
// Get projects needing review
{
  "tool": "projects",
  "arguments": {
    "operation": "review",
    "limit": "10",
    "details": "true"
  }
}

// Check overdue tasks
{
  "tool": "analyze_overdue",
  "arguments": {
    "includeRecentlyCompleted": "false",
    "groupBy": "project",
    "limit": "50"
  }
}
```

### 3. Create Task with Full Details

```json
{
  "tool": "create_task",
  "arguments": {
    "name": "Prepare quarterly report",
    "flagged": "true",
    "sequential": "true",
    "projectId": "abc123",
    "dueDate": "2025-03-31 17:00",
    "deferDate": "2025-03-25 09:00",
    "estimatedMinutes": 120,
    "tags": ["reports", "q1"],
    "note": "Include revenue, costs, and projections",
    "repeatRule": {
      "unit": "month",
      "steps": "3",
      "method": "fixed"
    }
  }
}
```

### 4. Move Task to Inbox

```json
{
  "tool": "update_task",
  "arguments": {
    "taskId": "xyz789",
    "projectId": null  // or "" or "null" - all work
  }
}
```

### 5. Export for External Analysis

```json
{
  "tool": "export_tasks",
  "arguments": {
    "format": "csv",
    "filter": {
      "completed": "false",
      "project": "Q1 Goals"
    },
    "fields": ["name", "dueDate", "flagged", "tags"]
  }
}
```

---

## Performance Tips

1. **Use `details: "false"`** for faster queries when full details aren't needed
2. **Use `get_active_tags`** instead of `list_tags` for GTD workflows
3. **Set reasonable limits** - default is 25, which is fast
4. **Use `namesOnly: "true"`** for list_tags when you just need tag names
5. **Cache results** - many tools have built-in caching (30s-1hr TTL)

## Error Handling

All tools return consistent error formats:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "suggestion": "Helpful suggestion for fixing the issue"
  }
}
```

Common error codes:
- `PARAMETER_MISSING` - Required parameter not provided
- `INVALID_MODE` - Invalid mode specified
- `TASK_NOT_FOUND` - Task ID doesn't exist
- `PROJECT_NOT_FOUND` - Project ID doesn't exist
- `OMNIFOCUS_ERROR` - OmniFocus automation error

---

## Notes for LLM Assistants

1. **Always check the summary first** - It provides immediate insights without parsing all data
2. **Use preview data** for quick responses when full details aren't needed
3. **Parameters are strings** - Claude Desktop converts all parameters to strings
4. **Dates use local time** - Format: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD" (due dates default to 5pm, defer dates to 8am)
5. **Moving to inbox** - Set projectId to null, "", or "null"
6. **Tags during creation** - Supported in v2.0.0-beta.1+
7. **Repeat rules** - Full support for complex patterns
8. **Performance modes** - Choose based on need (fast vs detailed)

---

*Generated for OmniFocus MCP v2.0.0-beta.4*
*Last updated: 2025-08-18*