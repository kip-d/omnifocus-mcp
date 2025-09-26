# OmniFocus MCP API Reference v2.1.0

This document provides comprehensive documentation for all 15 tools in the OmniFocus MCP server v2.1.0 (Self-Contained Architecture).

## Table of Contents

1. [Task Operations](#task-operations)
   - [tasks](#tasks) - Query tasks with various modes
   - [manage_task](#manage_task) - Unified task CRUD operations
2. [Project Management](#project-management)
   - [projects](#projects) - Manage and query projects
3. [Organization Tools](#organization-tools)
   - [folders](#folders) - Folder management and hierarchy
   - [tags](#tags) - Comprehensive tag management with hierarchy
   - [manage_reviews](#manage_reviews) - Project review management
4. [Analytics & Insights](#analytics--insights)
   - [productivity_stats](#productivity_stats) - Comprehensive productivity metrics
   - [task_velocity](#task_velocity) - Task completion velocity analysis
   - [analyze_overdue](#analyze_overdue) - Overdue task patterns
   - [workflow_analysis](#workflow_analysis) - Deep workflow health analysis
   - [analyze_patterns](#analyze_patterns) - System pattern detection
5. [Utilities](#utilities)
   - [export](#export) - Unified export functionality
   - [recurring_tasks](#recurring_tasks) - Recurring task analysis
   - [perspectives](#perspectives) - Perspective management
   - [system](#system) - System information and diagnostics

---

## Task Operations

### tasks

Query OmniFocus tasks with various modes and filters. Returns a summary first for quick answers, then detailed task data.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | **Yes** | Query mode (see modes below) |
| `limit` | string | **Yes** | Maximum tasks to return (default: "25") |
| `details` | string | **Yes** | Include full details (default: "false") |
| `fastSearch` | string | **Yes** | Fast search mode for performance (default: "true") |
| `fields` | string[] | No | Select specific fields to return for performance optimization |
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

#### Available Fields (for performance optimization)

When using the `fields` parameter, you can select specific fields to return:
- **`id`** - Task identifier
- **`name`** - Task title
- **`completed`** - Completion status
- **`flagged`** - Flagged status
- **`blocked`** - Blocked status
- **`available`** - Available status
- **`estimatedMinutes`** - Time estimate
- **`dueDate`** - Due date
- **`deferDate`** - Defer date
- **`completionDate`** - Completion date
- **`note`** - Task description
- **`projectId`** - Project identifier
- **`project`** - Project name
- **`tags`** - Associated tags

If `fields` is not specified, all fields are returned. Using field selection can significantly improve performance and reduce response size.

#### Example Requests

**Basic query:**
```json
{
  "mode": "overdue",
  "limit": "10",
  "details": "false",
  "fastSearch": "true"
}
```

**With field selection for performance:**
```json
{
  "mode": "today",
  "limit": "25",
  "details": "false",
  "fastSearch": "true",
  "fields": ["id", "name", "dueDate", "flagged", "project"]
}
```

---

### manage_task

Unified task management tool for all CRUD operations (Create, Read, Update, Delete).

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation: create/update/complete/delete |
| `taskId` | string | No* | Task ID (*required for update/complete/delete) |
| `name` | string | No* | Task name (*required for create) |
| `projectId` | string | **Yes** | Project ID (null/"" for inbox) |
| `dueDate` | string | **Yes** | Due date ("" if none) |
| `deferDate` | string | **Yes** | Defer date ("" if none) |
| `note` | string | No | Task description |
| `parentTaskId` | string | No | Parent task ID for subtasks |
| `flagged` | string | No | Flagged status ("true"/"false") |
| `sequential` | string | No | Sequential subtasks ("true"/"false") |
| `estimatedMinutes` | string | No | Time estimate in minutes |
| `tags` | string[] | No | Tags to assign |
| `repeatRule` | object | No | Recurrence rule (see below) |
| `completionDate` | string | No | Completion date (complete operation) |
| `minimalResponse` | string | No | Return minimal response for bulk ops |
| `clearDueDate` | boolean | No | Clear existing due date |
| `clearDeferDate` | boolean | No | Clear existing defer date |
| `clearEstimatedMinutes` | boolean | No | Clear existing estimate |
| `clearRepeatRule` | boolean | No | Remove existing repeat rule |

#### Operations

- **`create`** - Create new task (requires: name, projectId, dueDate, deferDate)
- **`update`** - Update existing task (requires: taskId, projectId, dueDate, deferDate)
- **`complete`** - Mark task completed (requires: taskId, projectId, dueDate, deferDate)
- **`delete`** - Delete task (requires: taskId, projectId, dueDate, deferDate)

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

#### Example Requests

**Create Task**:
```json
{
  "operation": "create",
  "name": "Weekly team meeting",
  "projectId": "abc123",
  "dueDate": "2025-03-15 14:00",
  "deferDate": "",
  "tags": ["meetings", "team"],
  "repeatRule": {
    "unit": "week",
    "steps": "1",
    "method": "fixed"
  }
}
```

**Update Task**:
```json
{
  "operation": "update",
  "taskId": "xyz789",
  "projectId": "",  // Move to inbox
  "dueDate": "2025-03-16",
  "deferDate": "",
  "tags": ["urgent", "work"],
  "minimalResponse": "true"  // For bulk operations
}
```

---

## Project Management

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
- **`stats`** - Get project statistics

---

## Organization Tools

### folders

Query and manage OmniFocus folders with full hierarchy support.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation to perform |
| `folderId` | string | No* | Folder ID (*required for specific operations) |
| `folderName` | string | No | Folder name (alternative to folderId) |
| `name` | string | No | New folder name (for create/update) |
| `parentFolderId` | string | No | Parent folder ID (for create/move) |
| `searchQuery` | string | No | Search query (for search operation) |
| `includeProjects` | boolean | No | Include projects in folders |
| `includeSubfolders` | boolean | No | Include subfolders |
| `status` | string | No | New status (for set_status operation) |
| `includeContents` | boolean | No | Apply to contents (for set_status) |
| `duplicateName` | string | No | Name for duplicated folder |

#### Operations

- **`list`** - List all folders
- **`get`** - Get specific folder details
- **`search`** - Search folders by name
- **`projects`** - Get projects in folder
- **`create`** - Create new folder
- **`update`** - Update folder name
- **`delete`** - Delete folder
- **`move`** - Move folder to new parent
- **`duplicate`** - Duplicate folder
- **`set_status`** - Change folder status

---

### tags

Comprehensive tag management with hierarchy support.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation: list/active/manage |
| `sortBy` | string | **Yes** | Sort order (name/count/usage) |
| `includeEmpty` | string | **Yes** | Include tags with no tasks |
| `includeUsageStats` | string | **Yes** | Calculate usage statistics |
| `includeTaskCounts` | string | **Yes** | Include task counts |
| `fastMode` | string | **Yes** | Skip hierarchy (faster) |
| `namesOnly` | string | **Yes** | Return only names (fastest) |
| `action` | string | No* | Management action (*required for manage) |
| `tagName` | string | No* | Tag name (*required for manage) |
| `newName` | string | No | New name (for rename) |
| `targetTag` | string | No | Target tag (for merge) |
| `parentTagName` | string | No | Parent tag name |
| `parentTagId` | string | No | Parent tag ID |

#### Operations

- **`list`** - List all tags with optional hierarchy
- **`active`** - Get only tags with incomplete tasks
- **`manage`** - Tag management operations

#### Management Actions

- **`create`** - Create new tag
- **`rename`** - Rename existing tag
- **`delete`** - Delete tag
- **`merge`** - Merge tags together
- **`nest`** - Make tag a child of another
- **`unparent`** - Remove tag from parent
- **`reparent`** - Change tag's parent

#### Performance Modes

- **`namesOnly="true"`** - Fastest (~130ms), returns only tag names
- **`fastMode="true"`** - Fast (~270ms), no hierarchy
- **Default** - Full details (~700ms), includes hierarchy

---

### manage_reviews

Consolidated tool for all project review operations. Essential for GTD weekly reviews.

#### Parameters

All parameters are optional as the tool handles different review operations internally.

#### Operations

- List projects needing review
- Mark projects as reviewed
- Set/clear review schedules
- Update review intervals

---

## Analytics & Insights

### productivity_stats

Generate comprehensive productivity statistics and GTD health metrics.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | **Yes** | Time period (today/week/month/quarter/year) |
| `includeProjectStats` | string | **Yes** | Include project-level statistics |
| `includeTagStats` | string | **Yes** | Include tag-level statistics |

Returns summary insights first, then detailed statistics.

---

### task_velocity

Analyze task completion velocity and predict workload capacity.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `days` | string | **Yes** | Number of days to analyze |
| `groupBy` | string | **Yes** | How to group data (day/week/project/tag) |
| `includeWeekends` | string | **Yes** | Include weekend days |

Returns key velocity metrics first, then detailed trends.

---

### analyze_overdue

Analyze overdue tasks for patterns and bottlenecks.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeRecentlyCompleted` | string | **Yes** | Include tasks completed after due date |
| `groupBy` | string | **Yes** | How to group (project/age/priority) |
| `limit` | string | **Yes** | Maximum tasks to analyze |

Returns summary with key findings first, then detailed analysis.

---

### workflow_analysis

Deep analysis of OmniFocus workflow health and system efficiency.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `analysisDepth` | string | **Yes** | Analysis depth (quick/standard/deep) |
| `focusAreas` | string | **Yes** | Specific areas to focus analysis on |
| `includeRawData` | string | **Yes** | Include raw data for LLM exploration |
| `maxInsights` | string | **Yes** | Maximum number of insights to generate |

Returns actionable insights about workflow patterns, momentum, bottlenecks, and system optimization.

---

### analyze_patterns

Analyze patterns across entire OmniFocus database for insights and improvements.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patterns` | string[] | **Yes** | Which patterns to analyze (see below) |
| `options` | string | **Yes** | Options object with threshold settings |

#### Available Patterns

- **`duplicates`** - Find duplicate task names
- **`dormant_projects`** - Identify inactive projects
- **`tag_audit`** - Audit tag usage patterns
- **`deadline_health`** - Check realistic due dates
- **`waiting_for`** - Find "waiting for" patterns
- **`estimation_bias`** - Detect estimation accuracy
- **`next_actions`** - Audit next actions
- **`review_gaps`** - Find review gaps
- **`all`** - Run all pattern analyses

---

## Utilities

### export

Unified export functionality for all OmniFocus data types.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | **Yes** | What to export (tasks/projects/all) |
| `format` | string | **Yes** | Export format (json/csv/markdown) |
| `filter` | object | No | Filter criteria (for tasks) |
| `fields` | string[] | No | Fields to include (for tasks) |
| `includeCompleted` | boolean | No | Include completed items |
| `includeStats` | boolean | No | Include statistics (for projects) |
| `includeProjectStats` | boolean | No | Include project statistics (for all) |
| `outputDirectory` | string | No* | Directory to save files (*required for type="all") |

#### Export Types

- **`tasks`** - Export filtered tasks
- **`projects`** - Export all projects
- **`all`** - Complete database backup to directory

#### Available Fields (for tasks)

- `id`, `name`, `note`, `project`, `tags`
- `deferDate`, `dueDate`, `completed`, `completionDate`
- `flagged`, `estimated`, `created`, `createdDate`, `modified`, `modifiedDate`

---

### recurring_tasks

Analyze recurring tasks and patterns.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation (analyze/patterns) |
| `activeOnly` | string | **Yes** | Only active tasks (default: "true") |
| `includeCompleted` | string | **Yes** | Include completed tasks |
| `includeDropped` | string | **Yes** | Include dropped tasks |
| `includeHistory` | boolean | No | Include completion history (analyze) |
| `sortBy` | string | No | Sort order (nextDue/frequency/name) |

#### Operations

- **`analyze`** - Detailed task-by-task analysis with next due dates
- **`patterns`** - Frequency statistics and common recurrence patterns

---

### perspectives

Manage OmniFocus perspectives and query their contents.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation (list/query) |
| `perspectiveName` | string | No* | Perspective name (*required for query) |
| `limit` | string | **Yes** | Maximum tasks to return (query) |
| `includeDetails` | string | **Yes** | Include task details (query) |
| `includeFilterRules` | string | **Yes** | Include filter rules (list) |
| `sortBy` | string | **Yes** | Sort order (list) |

#### Operations

- **`list`** - List all available perspectives
- **`query`** - Get tasks from specific perspective

---

### system

System utilities for version information and diagnostics.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | **Yes** | Operation (version/diagnostics) |
| `testScript` | string | **Yes** | Optional custom script for diagnostics |

#### Operations

- **`version`** - Get MCP server version information
- **`diagnostics`** - Test OmniFocus connection and performance

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
  "tool": "manage_task",
  "arguments": {
    "operation": "create",
    "name": "Prepare quarterly report",
    "projectId": "abc123",
    "dueDate": "2025-03-31 17:00",
    "deferDate": "2025-03-25 09:00",
    "flagged": "true",
    "estimatedMinutes": "120",
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
  "tool": "manage_task",
  "arguments": {
    "operation": "update",
    "taskId": "xyz789",
    "projectId": "",  // Empty string moves to inbox
    "dueDate": "",
    "deferDate": ""
  }
}
```

### 5. Export for External Analysis

```json
{
  "tool": "export",
  "arguments": {
    "type": "tasks",
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
2. **Use `tags` operation="active"** instead of operation="list" for GTD workflows
3. **Set reasonable limits** - default is 25, which is fast
4. **Use `namesOnly: "true"`** for tags when you just need tag names
5. **Use `minimalResponse: "true"`** for bulk task operations
6. **Cache results** - many tools have built-in caching (30s-1hr TTL)

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
5. **Moving to inbox** - Set projectId to empty string "" or null
6. **Tags during creation** - Fully supported in v2.0.0
7. **Repeat rules** - Full support for complex patterns
8. **Performance modes** - Choose based on need (fast vs detailed)
9. **Unified operations** - All CRUD operations consolidated into single tools

---

*Generated for OmniFocus MCP v2.0.0*
*Last updated: 2025-09-02*