# OmniFocus MCP v2.1.0 API Reference (15 Consolidated Tools)

## Task Operations (2 tools)

### tasks - Query/Search Tasks
**Parameters:** `mode*` `limit*:"25"` `details*:"false"` `search?` `project?` `tags[]?` `completed:"false"` `dueBy?` `daysAhead:"7"`
- **Modes:** all | search | overdue | today | upcoming | available | blocked | flagged
- **Returns:** Summary insights first, then task data
- **Performance:** <1 second for most queries

### manage_task - Create/Update/Complete/Delete Tasks
**Parameters:** `operation*` + task-specific params
- **Operations:**
  - `create`: `name*` `flagged:"false"` `sequential:"false"` `note?` `projectId?` `parentTaskId?` `dueDate?` `deferDate?` `estimatedMinutes?` `tags[]?` `repeatRule?`
  - `update`: `taskId*` + any create params (all optional)
  - `complete`: `taskId*` `completionDate?`
  - `delete`: `taskId*`
- **Date Format:** "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" (due→5pm, defer→8am)
- **Special:** projectId:null → inbox, clearDueDate:true → remove date

## Project Operations (1 tool)

### projects - All Project Operations
**Parameters:** `operation*` `limit*` `details*` + operation-specific params
- **Operations:**
  - `list`: `status?` `folder?` `needsReview?`
  - `create`: `name*` `note?` `folder?` `dueDate?` `reviewInterval?` `tags[]?` `flagged?`
  - `update`: `projectId*` + any create params
  - `complete`: `projectId*` `completionDate?`
  - `delete`: `projectId*`
  - `review`: List projects needing review
  - `active`: List only active projects
  - `stats`: Project statistics

## Organization (3 tools)

### folders - All Folder Operations
**Parameters:** `operation*` + operation-specific params
- **Operations:**
  - `list`: `includeProjects?` `includeSubfolders?`
  - `get`: `folderId*` or `folderName*`
  - `search`: `searchQuery*`
  - `projects`: `folderId*` - Get projects in folder
  - `create`: `name*` `parentFolderId?`
  - `update`: `folderId*` `name*`
  - `delete`: `folderId*`
  - `move`: `folderId*` `parentFolderId*`
  - `duplicate`: `folderId*` `duplicateName?`
  - `set_status`: `folderId*` `status*` `includeContents?`

### tags - All Tag Operations
**Parameters:** `operation*` + operation-specific params
- **Operations:**
  - `list`: `sortBy:"name"` `includeEmpty:"true"` `includeUsageStats:"false"` `includeTaskCounts:"false"` `fastMode:"true"` `namesOnly:"false"`
  - `active`: No params - returns tags with incomplete tasks
  - `manage`: `action*` `tagName*` `newName?` `targetTag?` `parentTagName?` `parentTagId?`
    - Actions: create | rename | delete | merge | nest | unparent | reparent
- **Performance:** namesOnly (fastest) > fastMode > full stats

### manage_reviews - Project Review Operations
**Parameters:** `operation*` + operation-specific params
- **Operations:**
  - `list`: Projects needing review
  - `mark_reviewed`: `projectId*` `reviewDate?`
  - `set_schedule`: `projectId*` `reviewInterval*` `nextReviewDate?`
  - `clear_schedule`: `projectId*`

## Analytics (5 tools - kept separate for clarity)

### productivity_stats - GTD Health Metrics
**Parameters:** `period*` `includeProjectStats*` `includeTagStats*`
- **Period:** today | week | month | quarter | year
- **Returns:** Summary insights first, then detailed metrics

### task_velocity - Completion Trends
**Parameters:** `days*` `groupBy*` `includeWeekends*`
- **GroupBy:** day | week | project | tag
- **Returns:** Velocity trends and predictions

### analyze_overdue - Bottleneck Analysis
**Parameters:** `includeRecentlyCompleted*` `groupBy*` `limit*`
- **GroupBy:** project | age | priority
- **Returns:** Overdue patterns and bottlenecks

### analyze_patterns - Database Pattern Analysis
**Parameters:** `patterns*[]` `options*`
- **Patterns:** duplicates | dormant_projects | tag_audit | deadline_health | waiting_for | estimation_bias | next_actions | review_gaps | all
- **Returns:** Pattern analysis results and database health insights

### workflow_analysis - Deep Workflow Analysis  
**Parameters:** `analysisDepth*` `focusAreas*[]` `includeRawData*` `maxInsights*`
- **Depth:** quick | standard | deep
- **Focus Areas:** productivity | workload | project_health | time_patterns | bottlenecks | opportunities
- **Returns:** Workflow health insights and recommendations

## Utilities (4 tools)

### export - All Export Operations
**Parameters:** `type*` `format*:"json"` + type-specific params
- **Types:**
  - `tasks`: `filter?` `fields[]?`
  - `projects`: `includeStats?`
  - `all`: `outputDirectory*` `includeCompleted?` `includeProjectStats?`
- **Formats:** json | csv | markdown

### recurring_tasks - Recurring Task Analysis
**Parameters:** `operation*` `activeOnly:"true"` `includeCompleted:"false"` `includeDropped:"false"`
- **Operations:**
  - `analyze`: `includeHistory?` `sortBy?` - Detailed task analysis
  - `patterns`: Frequency statistics

### perspectives - Perspective Operations
**Parameters:** `operation*` + operation-specific params
- **Operations:**
  - `list`: `includeFilterRules?` `sortBy?`
  - `query`: `perspectiveName*` `limit?` `includeDetails?`

### system - System Operations
**Parameters:** `operation*` `testScript?`
- **Operations:**
  - `version`: Get version information
  - `diagnostics`: Run diagnostics tests

---

## Key Improvements in v2.0.0

1. **Consolidated from 22 to 14 tools** (36% reduction)
2. **Consistent operation-based patterns** across all tools
3. **Clear tool naming** (verbs for actions, nouns for queries)
4. **Summary-first responses** for better UX
5. **Performance optimized** (<1 second for 95% of operations)

## Migration from v1

| Old Tools (v1) | New Tool (v2) | Operation |
|---------------|---------------|-----------|
| create_task | manage_task | operation: 'create' |
| update_task | manage_task | operation: 'update' |
| complete_task | manage_task | operation: 'complete' |
| delete_task | manage_task | operation: 'delete' |
| export_tasks | export | type: 'tasks' |
| export_projects | export | type: 'projects' |
| bulk_export | export | type: 'all' |
| analyze_recurring_tasks | recurring_tasks | operation: 'analyze' |
| get_recurring_patterns | recurring_tasks | operation: 'patterns' |
| manage_folder | folders | operation: 'create/update/delete/etc' |
| query_folders | folders | operation: 'list/get/search' |

## Quick Examples

```javascript
// Create a task
manage_task({ operation: 'create', name: 'Review Q4 goals', dueDate: '2024-12-31' })

// Get today's agenda
tasks({ mode: 'today', details: true })

// Export all data
export({ type: 'all', format: 'json', outputDirectory: '/backup' })

// List all folders
folders({ operation: 'list', includeProjects: true })

// Analyze overdue tasks
analyze_overdue({ includeRecentlyCompleted: true, groupBy: 'project' })
```