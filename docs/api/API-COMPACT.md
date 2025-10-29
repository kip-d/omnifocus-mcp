# OmniFocus MCP v2.2.0 (17 Tools - Ultra-Compact)

**📖 More Resources:** [User Prompts & Workflows](../prompts/README.md) | [Full API Reference](./API-REFERENCE-LLM.md)

## Syntax: tool(req*,opt?:"default") []=array

### Tasks (4)
- tasks(mode*,limit*:25,details*:false,fastSearch*:true,fields[]?,search?,project?,tags[]?,completed?:false,dueBy?,daysAhead?:7) modes:all|search|overdue|today|upcoming|available|blocked|flagged
  - fields: id|name|completed|flagged|blocked|available|estimatedMinutes|dueDate|deferDate|plannedDate|completionDate|added|modified|dropDate|note|projectId|project|tags|repetitionRule|parentTaskId|parentTaskName|inInbox
- manage_task(operation*:create|update|complete|delete,taskId?,name?,plannedDate?,...all_task_fields)
- batch_create(items*[],createSequentially*:true,atomicOperation*:false,returnMapping*:true,stopOnError*:true)
- parse_meeting_notes(input*,extractMode*:both,suggestProjects*:true,suggestTags*:true,suggestDueDates*:true,suggestEstimates*:true,returnFormat*:preview,groupByProject*:true,existingProjects[]?,defaultProject?)

### Projects (1)
- projects(operation*:list|create|update|complete|delete|review|active|stats,limit*,details*,...)

### Organization (3)
- folders(operation*:list|get|search|projects|create|update|delete|move|duplicate|set_status,...)
- tags(operation*:list|active|manage,action?,tagName?,mutuallyExclusive?,...)
- manage_reviews(operation*:list|mark_reviewed|set_schedule|clear_schedule,projectId?,...)

### Analytics (5)
- productivity_stats(period*,includeProjectStats*,includeTagStats*)
- task_velocity(days*,groupBy*,includeWeekends*)
- analyze_overdue(includeRecentlyCompleted*,groupBy*,limit*)
- workflow_analysis(analysisDepth*,focusAreas*,includeRawData*,maxInsights*)
- analyze_patterns(patterns*,options*) patterns:duplicates|dormant_projects|tag_audit|deadline_health|waiting_for|estimation_bias|next_actions|review_gaps|all

### Utilities (4)
- export(type*:tasks|projects|all,format*:json,filter?,fields?,outputDirectory?)
- recurring_tasks(operation*:analyze|patterns,activeOnly*:true,includeCompleted*:false)
- perspectives(operation*:list|query,perspectiveName?,limit?,includeDetails?,formatOutput?,groupBy?:none|project|tag|dueDate|status,fields[]?,includeMetadata?)
- system(operation*:version|diagnostics,testScript?)

## Notes
- **v2.2.1**: 17 consolidated tools (15 core + 2 capture tools) + 22 task fields
- **v2.2.0 → v2.2.1**: Added Phase 1 & 2 fields (added, modified, dropDate, parentTaskId, parentTaskName, inInbox)
- **Smart Capture**: parse_meeting_notes extracts tasks from unstructured text (meeting notes, emails, transcripts)
- **Operation-based routing**: Most tools use `operation` parameter
- All params→strings via MCP
- Summary returned first
- null/""/​"null"→inbox
- **Dates**: Convert user's "tomorrow"→"YYYY-MM-DD", "next Friday"→"YYYY-MM-DD HH:mm" (due→5pm,defer→8am). Schema rejects natural language!
- RepeatRule(OmniFocus 4.7+ enhanced):{frequency,anchorTo,skipMissed,endCondition} or legacy:{unit,steps,method,weekdays[]?,positions?}
- **Performance**: Optimized for context efficiency with consolidated tools