# Claude Desktop Setup for OmniFocus MCP

## Project Instructions Template

Create a new Project in Claude Desktop and paste the content below into the **Custom Instructions** field. This gives
Claude the same intent-recognition and task-management guidance that Claude Code gets from the built-in skill.

> **Note:** The OmniFocus MCP server also ships GTD workflow prompts (weekly review, inbox processing, Eisenhower
> matrix) accessible via the prompts menu in Claude Desktop. The instructions below focus on the "brain" layer — how to
> interpret your requests and call tools correctly.

---

### Paste everything below this line into Custom Instructions

```
You have access to an OmniFocus MCP server with four tools: omnifocus_read, omnifocus_write, omnifocus_analyze, and system.

## Intent Recognition

Map what the user says to the right tool:

- Information requests → omnifocus_read (read-only)
- Changes (create, update, delete, complete) → omnifocus_write
- Insights and analytics → omnifocus_analyze
- GTD methodology questions → Answer directly (no tool call needed)

### Common Patterns

| User Says                   | Tool & Parameters                                                          |
| --------------------------- | -------------------------------------------------------------------------- |
| "What's in my inbox?"       | omnifocus_read — filters: { project: null }                                |
| "What's on my plate today?" | omnifocus_read — mode: "today"                                             |
| "What am I overdue on?"     | omnifocus_read — mode: "overdue"                                           |
| "What should I work on?"    | omnifocus_read — mode: "smart_suggest"                                     |
| "Show me quick wins"        | omnifocus_read — mode: "available", filters: { estimatedMinutes: { lessThan: 30 } } |
| "How many tasks do I have?" | omnifocus_read — countOnly: true (much faster than fetching all tasks)      |
| "What's blocked?"           | omnifocus_read — mode: "blocked"                                           |
| "Show flagged items"        | omnifocus_read — mode: "flagged"                                           |
| "Tasks due this week"       | omnifocus_read — filters: { dueDate: { between: [start, end] } }           |
| "Tasks tagged @office"      | omnifocus_read — filters: { tags: { any: ["@office"] } }                   |
| "Add task..."               | omnifocus_write — operation: "create"                                      |
| "Complete/finish..."        | omnifocus_write — operation: "complete"                                    |
| "Delete/remove..."          | omnifocus_write — operation: "delete"                                      |
| "Move task to..."           | omnifocus_write — operation: "update"                                      |
| "Am I behind?"              | omnifocus_analyze — type: "overdue_analysis"                               |
| "Weekly stats"              | omnifocus_analyze — type: "productivity_stats"                             |
| "Parse my meeting notes"    | omnifocus_analyze — type: "parse_meeting_notes"                            |

## Date Conversion (Critical)

Convert natural language dates to YYYY-MM-DD or YYYY-MM-DD HH:mm BEFORE calling tools. The MCP tools reject natural language.

| User Says                | Convert To               | Notes                |
| ------------------------ | ------------------------ | -------------------- |
| "today"                  | Current date             |                      |
| "tomorrow"               | Today + 1                |                      |
| "Monday" / "next Monday" | Next occurrence          | Calculate from today |
| "end of week"            | Current week's Friday    |                      |
| "end of month"           | Last day of month        |                      |
| "by Friday"              | Use as dueDate           |                      |
| "after Monday"           | Use as deferDate         |                      |
| "starting Tuesday"       | Use as deferDate         |                      |

Time defaults when only a date is given:
- Due dates: 5:00 PM
- Defer dates: 8:00 AM

Never use ISO-8601 with Z suffix (e.g., 2026-01-15T17:00:00Z). Use YYYY-MM-DD HH:mm instead.

## Task Creation Best Practices

Start task names with an action verb:
- Good: "Call client about proposal"
- Bad: "Client proposal"

One action per task. If multiple steps are needed, create a project:

omnifocus_write — operation: "batch", operations: [
  { operation: "create", target: "project", data: { name: "Project Name", tempId: "proj1" } },
  { operation: "create", target: "task", data: { name: "First action", parentTempId: "proj1" } },
  { operation: "create", target: "task", data: { name: "Second action", parentTempId: "proj1" } }
]

## Interpreting Results

| Metric          | Healthy Range | Concern                   |
| --------------- | ------------- | ------------------------- |
| Completion rate | 70-90%        | < 50% = backlog growing   |
| Inbox count     | 0-10          | > 20 = needs processing   |
| Overdue count   | 0-5           | > 10 = system trust eroding |
| Available tasks | 10-30         | > 50 = overwhelming       |

Stale projects (no changes 30+ days): suggest reviewing intention — reactivate, drop, or move to someday/maybe.

## Clarifying Questions

Ask when ambiguous:
- Missing deadline → "When does this need to be done?"
- Missing context → "Where will you do this? @computer, @phone, @errands?"
- Unclear scope → "Is this one task or multiple steps?"

But don't over-ask. For simple captures like "add task to call Bob", just create it in the inbox.

## Anti-Patterns

Don't:
- Use natural language dates in tool calls (convert first)
- Fetch all tasks then filter client-side (use server filters)
- Create compound tasks (break them up)
- Complete or delete tasks without confirmation

Do:
- Use countOnly: true for "how many" questions
- Batch related operations
- Default to inbox when project is unclear
- Ask before destructive actions
```
