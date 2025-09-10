# OmniFocus MCP v2.1.0 Quick Reference (LLM-Optimized)

**15 Consolidated Tools** | **95% Performance Improvements** | **Type-Safe V2 Architecture**

## Task Operations (2 tools)

**tasks** `mode*` `limit*:"25"` `details*:"false"` `search?` `project?` `tags[]?` `completed:"false"` `dueBy?` `daysAhead:"7"`
- Modes: all|search|overdue|today|upcoming|available|blocked|flagged
- Returns: summary→insights, then data

**manage_task** `operation*` `taskId?` `name?` `note?` `projectId?` `parentTaskId?` `dueDate?` `deferDate?` `flagged?` `estimatedMinutes?` `tags[]?` `sequential?` `repeatRule?` `completionDate?` `minimalResponse?` `clear*?`
- Ops: create(name*)|update(taskId*)|complete(taskId*)|delete(taskId*)
- Dates: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" (due→5pm, defer→8am)
- Clear: clearDueDate|clearDeferDate|clearEstimatedMinutes|clearRepeatRule

## Projects (1 tool)

**projects** `operation*` `limit*` `details*` `status?` `folder?` `needsReview?` `projectId?` `name?` `note?` `dueDate?` `reviewInterval?` `tags[]?` `flagged?` `completionDate?`
- Ops: list|create(name*)|update(projectId*)|complete(projectId*)|delete(projectId*)|review|active|stats

## Organization (3 tools)

**folders** `operation*` `folderId?` `folderName?` `name?` `parentFolderId?` `searchQuery?` `includeProjects?` `includeSubfolders?` `status?` `includeContents?` `duplicateName?`
- Ops: list|get|search(searchQuery*)|projects|create(name*)|update(folderId*,name*)|delete(folderId*)|move(folderId*,parentFolderId*)|duplicate(folderId*)|set_status(folderId*,status*)

**tags** `operation*` `sortBy:"name"` `includeEmpty:"true"` `includeUsageStats:"false"` `includeTaskCounts:"false"` `fastMode:"true"` `namesOnly:"false"` `action?` `tagName?` `newName?` `targetTag?` `parentTagName?` `parentTagId?`
- Ops: list|active|manage(action*,tagName*)
- Actions: create|rename(newName*)|delete|merge(targetTag*)|nest|unparent|reparent

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

**perspectives** `operation*` `perspectiveName?` `limit?` `includeDetails?` `includeFilterRules?` `sortBy?`
- Ops: list|query(perspectiveName*)

**system** `operation*` `testScript?`
- Ops: version|diagnostics

---

## Key Patterns (v2.1.0 Consolidated Architecture)

- **Operation-based routing**: Most tools use `operation` parameter for multiple functions
- **Tool consolidation**: 15 tools (reduced from 22) for 30% better context efficiency
- **Summary-first**: Analytics return insights before data
- **Dates**: YYYY-MM-DD gets smart defaults (due→5pm, defer→8am)  
- **Performance**: fastMode/namesOnly for speed, consolidated tools reduce overhead
- **Minimal response**: Set minimalResponse:true for bulk ops

## Migration from v2.0 to v2.1.0

- **No breaking changes**: All existing tool calls work identically
- **Same 15 tools**: Tool count remains the same, but internal consolidation improves performance
- **Enhanced error handling**: Better error messages with operation context
- **Improved caching**: More efficient caching across consolidated operations

## Migration from v1 (Historical)

Old: create_task → New: manage_task(operation:'create')
Old: export_tasks → New: export(type:'tasks')
Old: analyze_recurring_tasks → New: recurring_tasks(operation:'analyze')

## Architecture Benefits

- **Reduced context usage**: 30% fewer tools means more efficient LLM conversations
- **Consistent patterns**: Operation-based routing provides predictable interface
- **Better performance**: Consolidated tools reduce initialization overhead
- **Maintainable**: Single tool handles related operations with shared validation