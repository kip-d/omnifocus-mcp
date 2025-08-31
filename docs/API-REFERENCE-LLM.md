# OmniFocus MCP API Quick Reference (LLM-Optimized)

## Core Query Tools

**tasks** `mode*` `limit*:"25"` `details*:"false"` `search?` `project?` `tags[]?` `completed:"false"` `dueBy?` `daysAhead:"7"`
- Modes: all|search|overdue|today|upcoming|available|blocked|flagged
- Returns: summary→insights, then data

**projects** `operation*` `limit*` `details*` `status?` `folder?` `needsReview?` `projectId?` `name?` `note?` `dueDate?` `reviewInterval?` `tags[]?` `flagged?`
- Ops: list|create|update|complete|delete|review|active

**query_perspective** `perspectiveName*` `limit*` `includeDetails*`
- Query perspective without changing window

## CRUD

**create_task** `name*` `flagged*:"false"` `sequential*:"false"` `note?` `projectId?` `parentTaskId?` `dueDate?` `deferDate?` `estimatedMinutes?` `tags[]?` `repeatRule?`
- repeatRule: {unit*,steps*,method*,weekdays[]?,weekPosition?,weekday?,deferAnother?}
- Dates: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD" (due→5pm, defer→8am)

**update_task** `taskId*` +all create_task params as optional
- projectId:null→inbox, clearDueDate:true→remove
- Tags replace all existing

**complete_task** `taskId*` `completionDate?:now`

**delete_task** `taskId*`

## Analytics (all return summary first)

**productivity_stats** `period*` `includeProjectStats*` `includeTagStats*`
**task_velocity** `days*` `groupBy*` `includeWeekends*`  
**analyze_overdue** `includeRecentlyCompleted*` `groupBy*` `limit*`

Simplified versions (same params but easier):
**get_productivity_stats** `period*:today|week|month|quarter|year` `groupBy*` `includeCompleted*`
**get_task_velocity** `period*` `projectId?` `tags[]?`
**analyze_overdue_tasks** = analyze_overdue

## Tags

**list_tags** `sortBy*` `includeEmpty*` `includeUsageStats*` `includeTaskCounts*` `fastMode*:"true"` `namesOnly*`
- Performance: namesOnly(130ms)>fastMode(270ms)>full(700ms)

**get_active_tags** - No params, returns actionable tags only (fast)

**manage_tags** `action*:create|rename|delete|merge` `tagName*` `newName?` `targetTag?`

## Folders/Reviews

**query_folders** - Various query ops
**manage_folder** - CRUD ops  
**manage_reviews** - Review workflow
**batch_task_operations** - Bulk ops

## Export

**export_tasks** `format*:json|csv|markdown` `filter?` `fields[]?`
**export_projects** `format*` `includeStats*`
**bulk_export** `outputDirectory*` `format*` `includeCompleted*` `includeProjectStats*`

## Recurring

**analyze_recurring_tasks** `activeOnly*:"true"` `includeCompleted*` `includeDropped*` `includeHistory*` `sortBy*`
**get_recurring_patterns** `activeOnly*` `includeCompleted*` `includeDropped*`

## Utility

**list_perspectives** `includeFilterRules*` `sortBy*`
**get_version_info** - No params
**run_diagnostics** `testScript*`

---

## Key Patterns

1. **String params**: Claude Desktop converts all to strings
2. **Required marked with \***, defaults shown after :
3. **Summary first**: All tools return summary→data structure  
4. **Inbox**: projectId:null|""|"null" all work
5. **Dates**: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD" (due→5pm, defer→8am default)
6. **Performance**: details:"false" for speed

## Common Flows

```
Daily: tasks(mode:today,limit:20)
Overdue: analyze_overdue(groupBy:project)
Create+tags: create_task(name,tags[],projectId)
Move→inbox: update_task(taskId,projectId:null)
Quick tags: get_active_tags()
```

## RepeatRule Structure
```
{unit:day|week|month|year, steps:1, method:fixed|start-after-completion|due-after-completion,
 weekdays:[monday,wednesday], weekPosition:1|2|3|4|last, weekday:tuesday}
```

*All params are strings via MCP bridge. Arrays stay arrays.*