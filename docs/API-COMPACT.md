# OmniFocus MCP Tools (Ultra-Compact)

## Syntax: tool(req*,opt?:"default") []=array

### Query
- tasks(mode*,limit*:25,details*:false,search?,project?,tags[]?,completed?:false,dueBy?,daysAhead?:7) modes:all|search|overdue|today|upcoming|available|blocked|flagged
- projects(operation*,limit*,details*,...) ops:list|create|update|complete|delete|review|active
- query_perspective(perspectiveName*,limit*,includeDetails*)

### CRUD  
- create_task(name*,flagged*:false,sequential*:false,note?,projectId?,parentTaskId?,dueDate?,deferDate?,estimatedMinutes?,tags[]?,repeatRule?)
- update_task(taskId*,+any_create_params) projectId:null=inbox
- complete_task(taskId*,completionDate?)
- delete_task(taskId*)

### Analytics
- productivity_stats/task_velocity/analyze_overdue(period*,various_grouping_params*)
- get_productivity_stats/get_task_velocity/analyze_overdue_tasks (simplified versions)

### Tags
- list_tags(6params*) namesOnly=fastest
- get_active_tags() no-params,fast
- manage_tags(action*,tagName*,conditionals?)

### Mgmt
- manage_folder/query_folders/manage_reviews/batch_task_operations

### Export
- export_tasks/export_projects(format*:json|csv|markdown,filters?)
- bulk_export(outputDirectory*,format*,includes*)

### Util
- analyze_recurring_tasks/get_recurring_patterns(activeOnly*:true,includes*)
- list_perspectives/get_version_info/run_diagnostics

## Notes
- All params→strings via MCP
- Summary returned first  
- null/""/​"null"→inbox
- Dates:"YYYY-MM-DD HH:mm"|"YYYY-MM-DD"(due→5pm,defer→8am)
- RepeatRule:{unit,steps,method,weekdays[]?,positions?}