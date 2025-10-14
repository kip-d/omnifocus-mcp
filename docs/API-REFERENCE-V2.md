# OmniFocus MCP v2.2.0 API Reference (18 Tools)

## Task Operations (2 tools)

### tasks - Query/Search Tasks
**Parameters:** `mode*` `limit*:"25"` `details*:"false"` `fastSearch*:"true"` `fields[]?` `search?` `project?` `tags[]?` `completed:"false"` `dueBy?` `daysAhead:"7"`
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

## Batch Operations (1 tool)

### batch_create - Create Multiple Projects/Tasks in Single Operation
**Parameters:** `items*[]` `createSequentially:"true"` `atomicOperation:"false"` `returnMapping:"true"` `stopOnError:"true"`
- **Item Types:** project | task (with hierarchical relationships)
- **Key Features:**
  - Temporary IDs for cross-referencing (parentTempId)
  - Automatic dependency resolution
  - Single MCP call instead of 10+ sequential calls
  - Reduced context consumption for local LLMs
- **Returns:** Mapping of temporary IDs to real OmniFocus IDs
- **Documentation:** See [BATCH_OPERATIONS.md](./BATCH_OPERATIONS.md) for complete guide

## Smart Capture (1 tool)

### parse_meeting_notes - Extract Action Items from Text
**Parameters:** `text*` `mode:"extract"` `contextHints?` `defaultProject?` `defaultTags[]?` `returnFormat:"batch"`
- **Modes:**
  - `extract`: Parse text and return structured action items
  - `preview`: Show what would be created without creating
- **Input Types:** Meeting notes, transcripts, emails, unstructured text
- **Key Features:**
  - Automatic task extraction with context awareness
  - Date/time extraction from natural language
  - Project/tag inference from context
  - Output ready for batch_create tool
- **Returns:** Structured action items in batch-ready format
- **Documentation:** See [SMART_CAPTURE.md](./SMART_CAPTURE.md) for complete guide

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
**Parameters:** `analysisDepth*:"standard"` `focusAreas*:["productivity","workload","bottlenecks"]` `includeRawData*:"false"` `maxInsights*:"15"`
- **Purpose:** Analyzes GTD system efficiency and workflow health (not just completion metrics)
- **Analysis Depth:**
  - `quick` - Insights only (~5-10 seconds)
  - `standard` - Insights + key data (recommended, ~15-30 seconds)
  - `deep` - Insights + full dataset (~30-60 seconds)
- **Focus Areas:** (array, select any combination)
  - `productivity` - Task completion patterns and efficiency
  - `workload` - Current load and capacity analysis
  - `project_health` - Project status and progress
  - `time_patterns` - When you work and complete tasks
  - `bottlenecks` - What's blocking progress
  - `opportunities` - Areas for improvement
- **Options:**
  - `includeRawData` - Include raw task/project data for LLM exploration (increases token usage)
  - `maxInsights` - Maximum insights to generate (5-50, default: 15)
- **Returns:** Workflow health score, insights, patterns, recommendations, bottlenecks
- **Cache TTL:** 2 hours (deep analysis is computationally expensive)
- **Use Cases:** Weekly GTD reviews, workflow troubleshooting, system optimization
- **Example:**
  ```javascript
  {
    analysisDepth: "standard",
    focusAreas: ["productivity", "bottlenecks", "project_health"],
    maxInsights: 20
  }
  ```

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
  - `query`: `perspectiveName*` `limit?` `includeDetails?` `formatOutput?` `groupBy?` `fields[]?` `includeMetadata?`
    - **Enhanced Features:**
      - `formatOutput`: Return human-readable formatted text with checkboxes and visual indicators
      - `groupBy`: Organize results by `project|tag|dueDate|status`
      - `fields[]`: Select specific fields for performance optimization
      - `includeMetadata`: Include task statistics and summary information

### system - System Operations
**Parameters:** `operation*` `testScript?`
- **Operations:**
  - `version`: Get version information
  - `diagnostics`: Run diagnostics tests

---

## Key Improvements in v2.2.0

1. **18 consolidated tools** - Expanded from v2.1.0 with Smart Capture and Batch Operations
2. **100% Self-contained tools** - No delegation, direct implementation
3. **Consistent operation-based patterns** across all tools
3. **Clear tool naming** (verbs for actions, nouns for queries)
4. **Summary-first responses** for better UX
5. **Performance optimized** (<1 second for 95% of operations)
6. **Reduced maintenance** - Removed 11 obsolete individual tool files

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