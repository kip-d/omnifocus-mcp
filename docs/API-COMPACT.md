# OmniFocus MCP v2.1.0 (15 Tools - Ultra-Compact)

## Syntax: tool(req*,opt?:"default") []=array

### Tasks (2)
- tasks(mode*,limit*:25,details*:false,search?,project?,tags[]?,completed?:false,dueBy?,daysAhead?:7) modes:all|search|overdue|today|upcoming|available|blocked|flagged
- manage_task(operation*:create|update|complete|delete,taskId?,name?,...all_task_fields)

### Projects (1)
- projects(operation*:list|create|update|complete|delete|review|active|stats,limit*,details*,...)

### Organization (3)
- folders(operation*:list|get|search|projects|create|update|delete|move|duplicate|set_status,...)
- tags(operation*:list|active|manage,action?,tagName?,...)
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
- perspectives(operation*:list|query,perspectiveName?,...)
- system(operation*:version|diagnostics,testScript?)

## Notes
- **v2.1.0**: 15 consolidated tools (reduced from 22 in v2.0)
- **Operation-based routing**: Most tools use `operation` parameter
- All params→strings via MCP
- Summary returned first  
- null/""/​"null"→inbox
- Dates:"YYYY-MM-DD HH:mm"|"YYYY-MM-DD"(due→5pm,defer→8am)
- RepeatRule:{unit,steps,method,weekdays[]?,positions?}
- **Performance**: 30% tool reduction for better context efficiency