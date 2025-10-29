# OmniFocus MCP v2.2.1 Quick Reference (LLM-Optimized)

**Last Updated:** 2025-10-20

**17 Consolidated Tools** | **22 Task Fields** | **95% Performance Improvements** | **Type-Safe V2 Architecture** | **Smart Capture**

**🚨 CRITICAL FOR LLMs: Date Conversion Required**

Users will use natural language: "tomorrow", "next Friday", "in 3 days"
**YOU MUST CONVERT** to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` before calling manage_task
Example: User says "due tomorrow" (Oct 28) → You call `{ dueDate: '2025-10-29' }`

**📖 Related Resources:**
- **[User Prompts & Workflows](../prompts/README.md)** - Ready-to-use prompts for testing and daily GTD workflows
- **[Smart Capture Guide](SMART_CAPTURE.md)** - Extract action items from meeting notes
- **[Main Documentation](../README.md)** - Installation, setup, and complete overview

## Smart Capture (1 tool)

**parse_meeting_notes** `input*` `extractMode:"both"` `suggestProjects:true` `suggestTags:true` `suggestDueDates:true` `suggestEstimates:true` `returnFormat:"preview"` `groupByProject:true` `existingProjects[]?` `defaultProject?`
- Extract action items from meeting notes, transcripts, or unstructured text
- Auto-suggests context tags (@computer, @phone, @15min, @urgent, etc.)
- Parses natural language dates ("by Friday" → YYYY-MM-DD)
- Estimates task duration from keywords
- Detects projects vs single tasks
- Output formats: `preview` (for review) or `batch_ready` (for batch_create)

**Examples:**
```javascript
// Extract and preview
{
  input: "Meeting notes: Send proposal by Friday. Call Sarah tomorrow.",
  returnFormat: "preview"
}

// Direct to batch_create format
{
  input: "Website redesign: wireframes, development, testing",
  returnFormat: "batch_ready",
  suggestTags: true
}

// Match to existing projects
{
  input: "Update Client Onboarding docs",
  existingProjects: ["Client Onboarding"],
  defaultProject: "Miscellaneous"
}
```

## Task Operations (2 tools)

**tasks** `mode*` `limit*:"25"` `details*:"false"` `fastSearch*:"true"` `fields[]?` `search?` `project?` `tags[]?` `completed:"false"` `dueBy?` `daysAhead:"7"` `filters?` `sort[]?`
- Modes: all|search|overdue|today|upcoming|available|blocked|flagged|smart_suggest
- Advanced: `filters` (operator-based), `sort` (multi-field)
- Returns: summary→insights, then data

**Advanced Filtering Examples:**
```javascript
// OR logic for tags: "tasks tagged urgent OR important"
{ filters: { tags: { operator: "OR", values: ["urgent", "important"] } } }

// Date range: "tasks due this week"
{ filters: { dueDate: { operator: "<=", value: "2025-10-07" } } }

// String matching: "tasks in projects containing 'work'"
{ filters: { project: { operator: "CONTAINS", value: "work" } } }

// Combined filters: "available tasks in work projects due this week"
{
  mode: "available",
  filters: {
    project: { operator: "CONTAINS", value: "work" },
    dueDate: { operator: "<=", value: "2025-10-07" }
  }
}

// Sorting: "tasks by due date, then priority"
{
  sort: [
    { field: "dueDate", direction: "asc" },
    { field: "flagged", direction: "desc" }
  ]
}
```

**Filter Operators:**
- String: CONTAINS, STARTS_WITH, ENDS_WITH, EQUALS, NOT_EQUALS
- Array: OR, AND, NOT_IN, IN
- Date/Number: >, >=, <, <=, BETWEEN

**Available Task Fields** (22 total, use in `fields[]?` parameter):
- **Core**: id, name, note
- **Status**: completed, flagged, blocked, available, inInbox
- **Scheduling**: dueDate, deferDate, plannedDate, completionDate, dropDate
- **Audit Trail**: added, modified (v2.2.1 new - enable "tasks created/modified when?" queries)
- **Organization**: projectId, project, tags, repetitionRule
- **Hierarchy**: parentTaskId, parentTaskName (v2.2.1 new - enable "subtasks of X?" queries)
- **Planning**: estimatedMinutes

**Sort Fields** (use in `sort[]?` parameter):
- dueDate, deferDate, name, flagged, estimatedMinutes, added, modified, completionDate

**Sorting Examples:**
```javascript
// Recently modified first
{ sort: [{ field: "modified", direction: "desc" }], limit: 10 }

// Tasks created this week, sorted by due date
{
  filters: { added: { operator: ">=", value: "2025-10-14" } },
  sort: [{ field: "dueDate", direction: "asc" }]
}
```

**manage_task** `operation*` `taskId?` `name?` `note?` `projectId?` `parentTaskId?` `dueDate?` `plannedDate?` `deferDate?` `flagged?` `estimatedMinutes?` `tags[]?` `sequential?` `repeatRule?` `completionDate?` `minimalResponse?` `clear*?`
- Ops: create(name*)|update(taskId*)|complete(taskId*)|delete(taskId*)
- **Dates - YOUR CONVERSION REQUIRED**: Users say "tomorrow"/"next Friday" → YOU convert to "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" format (due→5pm, defer→8am). Schema REJECTS natural language.
- **plannedDate** (OmniFocus 4.7+): When task is planned for scheduling (e.g., "2025-11-15 09:00")
- **repeatRule** (OmniFocus 4.7+ enhanced): User-friendly intent schema:
  ```javascript
  {
    frequency: 'FREQ=WEEKLY',           // RFC 5545 RRULE frequency
    anchorTo: 'when-marked-done',       // when-due|when-marked-done|when-deferred|planned-date
    skipMissed: true,                   // Smart rescheduling
    endCondition: {
      type: 'never' | 'afterDate' | 'afterOccurrences',
      date: '2025-12-31',              // For afterDate
      count: 10                        // For afterOccurrences
    }
  }
  ```
- Clear: clearDueDate|clearDeferDate|clearEstimatedMinutes|clearRepeatRule|clearPlannedDate

## Projects (1 tool)

**projects** `operation*` `limit*` `details*` `status?` `folder?` `needsReview?` `projectId?` `name?` `note?` `dueDate?` `reviewInterval?` `tags[]?` `flagged?` `completionDate?`
- Ops: list|create(name*)|update(projectId*)|complete(projectId*)|delete(projectId*)|review|active|stats

## Organization (3 tools)

**folders** `operation*` `folderId?` `folderName?` `name?` `parentFolderId?` `searchQuery?` `includeProjects?` `includeSubfolders?` `status?` `includeContents?` `duplicateName?`
- Ops: list|get|search(searchQuery*)|projects|create(name*)|update(folderId*,name*)|delete(folderId*)|move(folderId*,parentFolderId*)|duplicate(folderId*)|set_status(folderId*,status*)

**tags** `operation*` `sortBy:"name"` `includeEmpty:"true"` `includeUsageStats:"false"` `includeTaskCounts:"false"` `fastMode:"true"` `namesOnly:"false"` `action?` `tagName?` `newName?` `targetTag?` `parentTagName?` `parentTagId?` `mutuallyExclusive?`
- Ops: list|active|manage(action*,tagName*)
- Actions: create|rename(newName*)|delete|merge(targetTag*)|nest|unparent|reparent|set_mutual_exclusivity(mutuallyExclusive*)
- **set_mutual_exclusivity** (OmniFocus 4.7+): Set `mutuallyExclusive: true` to enable mutual exclusivity on tag's children, `false` to disable

**manage_reviews** `operation*` `projectId?` `reviewDate?` `reviewInterval?` `nextReviewDate?`
- Ops: list|mark_reviewed(projectId*)|set_schedule(projectId*,reviewInterval*)|clear_schedule(projectId*)

## Analytics (5 tools - all return summary first)

**productivity_stats** `period*` `includeProjectStats*` `includeTagStats*`
- Period: today|week|month|quarter|year

**task_velocity** `days*` `groupBy*` `includeWeekends*`
- GroupBy: day|week|project|tag

**analyze_overdue** `includeRecentlyCompleted*` `groupBy*` `limit*`
- GroupBy: project|age|priority

**workflow_analysis** `analysisDepth*` `focusAreas*` `includeRawData*` `maxInsights*`
- Depth: quick|standard|deep
- Focus: productivity|workload|bottlenecks|opportunities

**analyze_patterns** `patterns*` `options*`
- Patterns: duplicates|dormant_projects|tag_audit|deadline_health|waiting_for|estimation_bias|next_actions|review_gaps|all

## Utilities (4 tools)

**export** `type*` `format*:"json"` `filter?` `fields[]?` `includeStats?` `outputDirectory?` `includeCompleted?` `includeProjectStats?`
- Types: tasks(filter?,fields?)|projects(includeStats?)|all(outputDirectory*)
- Formats: json|csv|markdown

**recurring_tasks** `operation*` `activeOnly:"true"` `includeCompleted:"false"` `includeDropped:"false"` `includeHistory?` `sortBy?`
- Ops: analyze(includeHistory?,sortBy?)|patterns

**perspectives** `operation*` `perspectiveName?` `limit?` `includeDetails?` `includeFilterRules?` `sortBy?` `formatOutput?` `groupBy?` `fields[]?` `includeMetadata?`
- Ops: list|query(perspectiveName*)
- Enhanced: formatOutput→human-readable, groupBy→project|tag|dueDate|status, fields→performance

**system** `operation*` `testScript?`
- Ops: version|diagnostics

---

## Key Patterns (v2.1.0 Consolidated Architecture)

- **Operation-based routing**: Most tools use `operation` parameter for multiple functions
- **Tool consolidation**: 17 tools (reduced from 22) for optimal context efficiency
- **Summary-first**: Analytics return insights before data
- **Dates**: YYYY-MM-DD gets smart defaults (due→5pm, defer→8am)
- **Performance**: fastMode/namesOnly for speed, consolidated tools reduce overhead
- **Minimal response**: Set minimalResponse:true for bulk ops
- **Smart Capture**: parse_meeting_notes extracts tasks from unstructured text

## Migration from v2.1.0 to v2.2.0

- **New feature**: Added `parse_meeting_notes` tool for extracting action items from unstructured text
- **No breaking changes**: All existing tool calls work identically
- **Same architecture**: Self-contained consolidated tools with smart capture addition
- **Enhanced capabilities**: Can now process meeting notes, emails, and voice transcripts

## Migration from v1 (Historical)

Old: create_task → New: manage_task(operation:'create')
Old: export_tasks → New: export(type:'tasks')
Old: analyze_recurring_tasks → New: recurring_tasks(operation:'analyze')

## Architecture Benefits

- **Reduced context usage**: 30% fewer tools means more efficient LLM conversations
- **Consistent patterns**: Operation-based routing provides predictable interface
- **Better performance**: Consolidated tools reduce initialization overhead
- **Maintainable**: Single tool handles related operations with shared validation