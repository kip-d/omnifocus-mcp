# Natural-language to tool-call mapping

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

## Mapping natural language to tool calls

Step 1 (the information / action / insight split) stays in `SKILL.md`; this is the step-2 lookup table.

| User Says                                    | Intent                 | Tool Call                                                                                |
| -------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| "What's in my inbox?"                        | List unprocessed       | `omnifocus_read` mode: `"inbox"` (or filters: `{ project: null }`)                       |
| "What's on my plate today?"                  | Today's work           | `omnifocus_read` mode: `"today"`                                                         |
| "What am I overdue on?"                      | Past due (dueDate)     | `omnifocus_read` mode: `"overdue"`                                                       |
| "What's in my Forecast Past / past planned?" | Overdue ∪ past-planned | `omnifocus_read` mode: `"forecast_past"` (dueDate OR plannedDate past, excludes blocked) |
| "What should I work on?"                     | Smart suggestions      | `omnifocus_read` mode: `"smart_suggest"`                                                 |
| "Show me quick wins"                         | Fast tasks             | `omnifocus_read` mode: `"available"`, filters: `{ estimatedMinutes: { lessThan: 30 } }`  |
| "How many tasks do I have?"                  | Count only             | `omnifocus_read` with `countOnly: true` (33x faster)                                     |
| "What's blocked?"                            | Waiting items          | `omnifocus_read` mode: `"blocked"`                                                       |
| "Show flagged items"                         | High priority          | `omnifocus_read` mode: `"flagged"`                                                       |
| "Tasks due this week"                        | Date range             | `omnifocus_read` filters: `{ dueDate: { between: [start, end] } }`                       |
| "Tasks tagged @office"                       | By context             | `omnifocus_read` filters: `{ tags: { any: ["@office"] } }`                               |
| "Add task..."                                | Create                 | `omnifocus_write` operation: `"create"`                                                  |
| "Complete/finish..."                         | Mark done              | `omnifocus_write` operation: `"complete"`                                                |
| "Delete/remove..."                           | Delete                 | `omnifocus_write` operation: `"delete"`                                                  |
| "Move task to..."                            | Update                 | `omnifocus_write` operation: `"update"`                                                  |
| "Search for..."                              | Text search            | `omnifocus_read` mode: `"search"`, filters: `{ text: { contains: "..." } }`              |
| "Export my tasks"                            | Use the OmniFocus app  | Not an MCP capability — see `references/advanced-queries.md`                             |
| "What did I plan for today?"                 | Planned date           | `omnifocus_read` filters: `{ plannedDate: { between: [today, today] } }`                 |
| "Create a tag..."                            | Tag management         | `omnifocus_write` operation: `"tag_manage"`, action: `"create"`                          |
| "Rename/merge/nest tag..."                   | Tag management         | `omnifocus_write` operation: `"tag_manage"`, action: `"rename"/"merge"/"nest"`           |
| "Delete these 5 tasks"                       | Bulk delete            | `omnifocus_write` operation: `"bulk_delete"`, ids: `[...]`                               |
| "Make this repeat weekly"                    | Recurring              | `omnifocus_write` operation: `"update"`, changes: `{ repetitionRule: {...} }`            |
| "Am I behind?"                               | Overdue analysis       | `omnifocus_analyze` type: `"overdue_analysis"`                                           |
| "Weekly stats"                               | Productivity           | `omnifocus_analyze` type: `"productivity_stats"`                                         |
| "How fast am I completing?"                  | Velocity trends        | `omnifocus_analyze` type: `"task_velocity"`                                              |
| "Show me patterns"                           | Database patterns      | `omnifocus_analyze` type: `"pattern_analysis"`                                           |
| "Analyze my workflow"                        | Deep analysis          | `omnifocus_analyze` type: `"workflow_analysis"`                                          |
| "Show recurring tasks"                       | Repeat patterns        | `omnifocus_analyze` type: `"recurring_tasks"`                                            |
| "What needs review?"                         | Project reviews        | `omnifocus_analyze` type: `"manage_reviews"`                                             |
| "Parse my meeting notes"                     | Extract actions        | `omnifocus_analyze` type: `"parse_meeting_notes"`                                        |
| "Show my perspectives"                       | List views             | `omnifocus_read` type: `"perspectives"`                                                  |
| "Show my folders"                            | List folders           | `omnifocus_read` type: `"folders"`                                                       |
| "Create subtask under X"                     | Subtask                | `omnifocus_write` with `parentTaskId`                                                    |
| "Preview this batch"                         | Dry run                | `omnifocus_write` with `dryRun: "true"`                                                  |
| "What did I complete?"                       | Completed tasks        | `omnifocus_read` filters: `{ status: "completed" }` + `completionDate`                   |
| "How many inbox items?"                      | Inbox count            | `omnifocus_read` mode: `"inbox"`, `countOnly: true`                                      |

---
