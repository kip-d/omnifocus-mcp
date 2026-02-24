---
name: omnifocus-assistant
description: Use when user asks about tasks, projects, OmniFocus, GTD, productivity, or task management
---

# OmniFocus Assistant

> **Brain + Hands Architecture**: This skill provides the "brain" (methodology, intent interpretation, guidance). The
> OmniFocus MCP server provides the "hands" (tool execution). Use both together.

## Intent Recognition

### Step 1: Information or Action?

```
User wants information → omnifocus_read (read-only)
User wants to change something → omnifocus_write (creates/updates/deletes)
User wants insights → omnifocus_analyze
User wants GTD guidance → Provide advice (no tool call needed)
```

### Step 2: Map Natural Language to Tool Calls

| User Says                    | Intent            | Tool Call                                                                               |
| ---------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| "What's in my inbox?"        | List unprocessed  | `omnifocus_read` mode: `"inbox"` (or filters: `{ project: null }`)                      |
| "What's on my plate today?"  | Today's work      | `omnifocus_read` mode: `"today"`                                                        |
| "What am I overdue on?"      | Past due          | `omnifocus_read` mode: `"overdue"`                                                      |
| "What should I work on?"     | Smart suggestions | `omnifocus_read` mode: `"smart_suggest"`                                                |
| "Show me quick wins"         | Fast tasks        | `omnifocus_read` mode: `"available"`, filters: `{ estimatedMinutes: { lessThan: 30 } }` |
| "How many tasks do I have?"  | Count only        | `omnifocus_read` with `countOnly: true` (33x faster)                                    |
| "What's blocked?"            | Waiting items     | `omnifocus_read` mode: `"blocked"`                                                      |
| "Show flagged items"         | High priority     | `omnifocus_read` mode: `"flagged"`                                                      |
| "Tasks due this week"        | Date range        | `omnifocus_read` filters: `{ dueDate: { between: [start, end] } }`                      |
| "Tasks tagged @office"       | By context        | `omnifocus_read` filters: `{ tags: { any: ["@office"] } }`                              |
| "Add task..."                | Create            | `omnifocus_write` operation: `"create"`                                                 |
| "Complete/finish..."         | Mark done         | `omnifocus_write` operation: `"complete"`                                               |
| "Delete/remove..."           | Delete            | `omnifocus_write` operation: `"delete"`                                                 |
| "Move task to..."            | Update            | `omnifocus_write` operation: `"update"`                                                 |
| "Search for..."              | Text search       | `omnifocus_read` mode: `"search"`, filters: `{ text: { contains: "..." } }`             |
| "Export my tasks"            | Bulk export       | `omnifocus_read` type: `"export"`, exportType: `"tasks"`, format: `"markdown"`          |
| "What did I plan for today?" | Planned date      | `omnifocus_read` filters: `{ plannedDate: { between: [today, today] } }`                |
| "Create a tag..."            | Tag management    | `omnifocus_write` operation: `"tag_manage"`, action: `"create"`                         |
| "Rename/merge/nest tag..."   | Tag management    | `omnifocus_write` operation: `"tag_manage"`, action: `"rename"/"merge"/"nest"`          |
| "Delete these 5 tasks"       | Bulk delete       | `omnifocus_write` operation: `"bulk_delete"`, ids: `[...]`                              |
| "Make this repeat weekly"    | Recurring         | `omnifocus_write` operation: `"update"`, changes: `{ repetitionRule: {...} }`           |
| "Am I behind?"               | Overdue analysis  | `omnifocus_analyze` type: `"overdue_analysis"`                                          |
| "Weekly stats"               | Productivity      | `omnifocus_analyze` type: `"productivity_stats"`                                        |
| "How fast am I completing?"  | Velocity trends   | `omnifocus_analyze` type: `"task_velocity"`                                             |
| "Show me patterns"           | Database patterns | `omnifocus_analyze` type: `"pattern_analysis"`                                          |
| "Analyze my workflow"        | Deep analysis     | `omnifocus_analyze` type: `"workflow_analysis"`                                         |
| "Show recurring tasks"       | Repeat patterns   | `omnifocus_analyze` type: `"recurring_tasks"`                                           |
| "What needs review?"         | Project reviews   | `omnifocus_analyze` type: `"manage_reviews"`                                            |
| "Parse my meeting notes"     | Extract actions   | `omnifocus_analyze` type: `"parse_meeting_notes"`                                       |
| "Show my perspectives"       | List views        | `omnifocus_read` type: `"perspectives"`                                                 |
| "Show my folders"            | List folders      | `omnifocus_read` type: `"folders"`                                                      |
| "Create subtask under X"     | Subtask           | `omnifocus_write` with `parentTaskId`                                                   |
| "Preview this batch"         | Dry run           | `omnifocus_write` with `dryRun: "true"`                                                 |
| "What did I complete?"       | Completed tasks   | `omnifocus_read` filters: `{ status: "completed" }` + `completionDate`                  |
| "How many inbox items?"      | Inbox count       | `omnifocus_read` mode: `"inbox"`, `countOnly: true`                                     |

---

## Date Conversion (Critical)

**You must convert natural language dates to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` before tool calls.**

The MCP tools reject natural language. Calculate dates based on today's date.

### Conversion Table

| User Says                | Convert To            | Notes                      |
| ------------------------ | --------------------- | -------------------------- |
| "today"                  | Current date          | Calculate from system date |
| "tomorrow"               | Today + 1             |                            |
| "yesterday"              | Today - 1             |                            |
| "Monday" / "next Monday" | Next occurrence       | Calculate from today       |
| "this Friday"            | Current week's Friday |                            |
| "next week"              | Today + 7 days        |                            |
| "in 3 days"              | Today + 3             |                            |
| "end of week"            | Current Friday        |                            |
| "end of month"           | Last day of month     |                            |
| "by Friday"              | Due date = Friday     | Use as `dueDate`           |
| "after Monday"           | Defer date = Monday   | Use as `deferDate`         |
| "starting Tuesday"       | Defer date = Tuesday  | Use as `deferDate`         |

### Time Defaults (When Only Date Given)

- **Due dates**: 5:00 PM (end of business)
- **Defer dates**: 8:00 AM (start of day)
- **Completion dates**: 12:00 PM (noon)

---

## GTD Methodology Guide

### The Five Stages

| Stage        | GTD Purpose                        | OmniFocus Action                |
| ------------ | ---------------------------------- | ------------------------------- |
| **Capture**  | Empty your head                    | Add to inbox, no organizing     |
| **Clarify**  | Actionable? < 2 min? Who?          | Process inbox workflow          |
| **Organize** | Project, context, dates            | Assign project, tags, defer/due |
| **Review**   | Keep system current                | Weekly review workflow          |
| **Engage**   | Context → time → energy → priority | Context tag filters             |

### Defer Date vs Due Date

| Defer Date                                 | Due Date                  |
| ------------------------------------------ | ------------------------- |
| When task becomes visible                  | Hard deadline             |
| "I want to work on this, but not until..." | "This MUST be done by..." |
| Hides task until relevant                  | Shows urgency             |
| Default: 8:00 AM                           | Default: 5:00 PM          |

### Recommended Context Tags

**Location**: `@computer`, `@phone`, `@office`, `@home`, `@errands`, `@anywhere`

**Energy**: `@high-energy`, `@low-energy`, `@deep-work`

**Time**: `@15min`, `@30min`, `@1hour`

**People**: `@waiting-for`, `@agenda-{person}`, `@delegated-to-{person}`

**Priority**: `@urgent`, `@important`, `@someday`

### Someday/Maybe Management

Tag with `@someday`, place in an on-hold project, defer far in the future. Review during weekly review — activate or
drop items that no longer resonate.

### Waiting-For Tracking

Tag `@waiting-for`, note who/what/when, defer 3–7 days for follow-up. Review during weekly review.

```
User: "I emailed John about the budget, waiting on his reply"
→ Create task: "Follow up with John re: budget"
  tags: ["@waiting-for"], deferDate: "{3 days from now}"
  note: "Emailed John on {today}, waiting for budget approval"
```

### Reference Material

Not everything captured is actionable. Non-actionable reference material belongs in **Obsidian**, not OmniFocus.

| Belongs in OmniFocus           | Belongs in Obsidian                           |
| ------------------------------ | --------------------------------------------- |
| Actions, projects, commitments | Meeting notes, research, articles             |
| Waiting-for items              | Project support material                      |
| Someday/maybe (actionable)     | Idea-stage someday/maybe (not yet actionable) |

Cross-link using `obsidian://open?file=Path%2FTo%2FNote` in OmniFocus task notes.

---

## Workflow: Process Inbox

When user says "process my inbox" or "help me with inbox":

```
1. Fetch: omnifocus_read({ query: { type: "tasks", mode: "inbox", limit: 10 } })
2. Clarify each: actionable? → < 2 min (do now) → delegate (@waiting-for) → one action or project?
3. Execute: omnifocus_write to move, update, or complete/create
4. Offer time estimates after batch (see Suggesting Time Estimates below)
5. Repeat until inbox empty
```

Alternative: `eisenhower_matrix_inbox` MCP prompt for Eisenhower matrix approach.

---

## Workflow: Weekly Review

Execute in sequence — each step: run the MCP call, act on results:

**1. Empty inbox** — Process before anything else
`omnifocus_read({ query: { type: "tasks", mode: "inbox", countOnly: true } })`

**2. Review completed** — Acknowledge progress
`omnifocus_read({ query: { type: "tasks", filters: { status: "completed", completionDate: { after: "{7 days ago}" } }, limit: 50 } })`

**3. Overdue** — Reschedule, delegate, or drop every item
`omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 50 } })`

**4. Active projects** — Each needs at least one next action
`omnifocus_read({ query: { type: "projects", filters: { status: "active" } } })`

**5. On-hold projects** — Reactivate, drop, or keep waiting?
`omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } })`

**6. Waiting-for** — Follow up on anything stale
`omnifocus_read({ query: { type: "tasks", filters: { tags: { any: ["@waiting-for"] } }, limit: 50 } })`

**7. Someday/maybe** — Activate or delete what no longer resonates
`omnifocus_read({ query: { type: "tasks", filters: { tags: { any: ["@someday"] } }, limit: 50 } })`

**8. Upcoming week** — Check overcommitment, spread bunched deadlines
`omnifocus_read({ query: { type: "tasks", mode: "upcoming", daysAhead: 7 } })`

**9. Ensure next actions** — Every active project needs one
`omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })`

**10. Get creative** — New projects? Stuck items? Someday/maybe to activate? Ask the user.

**11. Productivity check**
`omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } })`

---

## Workflow: Daily Planning

When user asks "what should I focus on today" or "help me plan my day":

```
1. Show today's work:
   omnifocus_read({ query: { type: "tasks", mode: "today", limit: 20 } })

2. Check for overdue (needs attention):
   omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 10 } })

3. Smart suggestions:
   omnifocus_read({ query: { type: "tasks", mode: "smart_suggest", limit: 5 } })
```

Summarize: "You have X tasks due today, Y overdue. Here are top priorities..."

---

## Workflow: Engage (Choosing What to Do)

Apply GTD's four criteria in order — each narrows the list:

**1. Context** — What's available where you are now? `filters: { tags: { any: ["@computer"] } }` (or @phone, @office,
etc.)

**2. Time** — Short window (quick wins) vs long (deep work): `filters: { estimatedMinutes: { lessThan: 15 } }` or
`filters: { tags: { any: ["@deep-work"] } }`

**3. Energy** — Match task type to current energy: `filters: { tags: { any: ["@high-energy"] } }` or `["@low-energy"]`

**4. Priority** — Of what remains, flagged first, then overdue:
`omnifocus_read({ query: { type: "tasks", mode: "flagged", limit: 10 } })`

Guide the user progressively through these until they have a short list.

---

## Task Creation Best Practices

### Naming Rules

**Start with action verb:**

- ✅ "Call client about proposal"
- ❌ "Client proposal"
- ✅ "Write quarterly report"
- ❌ "Quarterly report"

**Be specific:**

- ✅ "Email John@acme.com to confirm budget"
- ❌ "Send email"

**One action per task:**

- ❌ "Research, decide, and order supplies" (3 tasks!)
- ✅ Break into project with sequential tasks

### When to Create Projects

Create a project when:

- Multiple steps required
- Outcome has a clear definition of "done"
- Tasks have dependencies

Single task when:

- One clear action
- No dependencies
- Can be done in one sitting

### Enriching Tasks

**Estimated minutes** — enables time-based filtering ("show me quick wins") and capacity planning:

```javascript
{ mutation: { operation: "create", target: "task", data: {
  name: "Review pull request", estimatedMinutes: "15", tags: ["@computer"]
} } }
```

**Planned date** — when you intend to work on it (separate from due date):

```javascript
{ mutation: { operation: "update", target: "task", id: "...", changes: {
  plannedDate: "{next Tuesday}"
} } }
```

| Field              | Purpose                         | Example                 |
| ------------------ | ------------------------------- | ----------------------- |
| `estimatedMinutes` | How long the task takes         | `"15"`, `"60"`, `"120"` |
| `plannedDate`      | When you intend to do it        | `"{tomorrow}"`          |
| `deferDate`        | When the task becomes visible   | `"{next Monday}"`       |
| `dueDate`          | Hard deadline (only real ones!) | `"{end of month}"`      |

### Suggesting Time Estimates

After creating tasks or a project, **proactively offer time estimates** as a batch. Don't ask during capture (that slows
it down). Instead, create the tasks first, then present estimates for confirmation.

**The pattern:** Create tasks first, then present a batch estimate table (task + suggested minutes + project total) for
confirmation.

**Verb-based heuristics** (starting points, not gospel):

| Task verb/type        | Default estimate | Rationale                  |
| --------------------- | ---------------- | -------------------------- |
| Call, email, text     | 15 min           | Communication is bounded   |
| Review, read          | 15-30 min        | Depends on material length |
| Write, draft          | 30-60 min        | Creative work takes longer |
| Research, investigate | 30-60 min        | Open-ended, cap it         |
| Order, purchase       | 5 min            | Transactional              |
| Schedule, book        | 5-15 min         | Quick coordination         |
| Build, implement      | 60-120 min       | Substantial work           |
| Update, fix           | 15-30 min        | Incremental change         |
| Meet, discuss         | 30 min           | Default meeting length     |

**Rules:**

- **Always present as a batch** — one confirmation for all estimates, not one per task
- **Include the project total** — this is the real value (capacity planning)
- **User can skip** — "No thanks" is fine, don't insist
- **Don't retroactively estimate old tasks** — only offer for tasks just created in this interaction
- **Use round numbers** — 5, 15, 30, 60, 120. False precision (e.g., "23 min") is worse than rounding

**Applying estimates after confirmation:**

```javascript
// Batch update with estimates
omnifocus_write({
  mutation: {
    operation: 'batch',
    target: 'task',
    operations: [
      { operation: 'update', target: 'task', id: 'task1id', changes: { estimatedMinutes: '15' } },
      { operation: 'update', target: 'task', id: 'task2id', changes: { estimatedMinutes: '30' } },
      { operation: 'update', target: 'task', id: 'task3id', changes: { estimatedMinutes: '60' } },
    ],
  },
});
```

### Batch Creation

When user mentions multiple related items, use batch operation:

```javascript
omnifocus_write({
  mutation: {
    operation: 'batch',
    target: 'task',
    operations: [
      { operation: 'create', target: 'project', data: { name: 'Project Name', tempId: 'proj1' } },
      { operation: 'create', target: 'task', data: { name: 'First action', parentTempId: 'proj1' } },
      { operation: 'create', target: 'task', data: { name: 'Second action', parentTempId: 'proj1' } },
    ],
  },
});
```

**Known limitation:** When batch-creating tasks with a `project` field (assigning to an existing project by name), the
project field may not be applied. Use `parentTempId` to reference a project created in the same batch, or create tasks
individually when assigning to existing projects.

### Batch Mixed Operations

Batch supports create + update + complete + delete in a single call:

```javascript
omnifocus_write({
  mutation: {
    operation: 'batch',
    target: 'task',
    operations: [
      { operation: 'create', target: 'task', data: { name: 'New task', tempId: 'new1' } },
      { operation: 'update', target: 'task', id: 'existingId', changes: { flagged: true } },
      { operation: 'complete', target: 'task', id: 'doneId' },
      { operation: 'delete', target: 'task', id: 'removeId' },
    ],
    dryRun: 'true', // Preview without executing
    stopOnError: 'true', // Halt on first failure
    createSequentially: 'true', // Respect dependencies between creates
  },
});
```

Remove `dryRun` to execute for real. Use `atomicOperation: 'true'` for all-or-nothing execution.

### Subtasks

Use `parentTaskId` to create or move tasks as subtasks:

```javascript
// Create a subtask under an existing task
{ mutation: { operation: "create", target: "task", data: {
  name: "Subtask name", parentTaskId: "parentId"
} } }

// Move an existing task under a different parent
{ mutation: { operation: "update", target: "task", id: "...", changes: {
  parentTaskId: "newParentId"
} } }

// Move subtask to project root (remove from parent)
{ mutation: { operation: "update", target: "task", id: "...", changes: {
  parentTaskId: null
} } }
```

### Tag Operations

**Nested hierarchy syntax** — create tag paths in any mutation:

```javascript
// Tags use " : " separator for nesting. Missing parents are created automatically.
{ mutation: { operation: "create", target: "task", data: {
  name: "Review budget", tags: ["Work : Finance : Quarterly"]
}}}
// Creates: Work → Finance → Quarterly, assigns "Quarterly" to the task
```

**Tag management** — create, rename, merge, and reorganize tags:

| Action     | What it does                          | Key params             |
| ---------- | ------------------------------------- | ---------------------- |
| `create`   | New tag (supports nested path syntax) | `tagName`              |
| `rename`   | Rename existing tag                   | `tagName`, `newName`   |
| `delete`   | Remove tag permanently                | `tagName`              |
| `merge`    | Merge source tag into target          | `tagName`, `targetTag` |
| `nest`     | Move tag under a parent               | `tagName`, `parentTag` |
| `unnest`   | Move tag to root level                | `tagName`              |
| `reparent` | Move tag to a different parent        | `tagName`, `parentTag` |

```javascript
// Example: merge duplicate tags
{ mutation: { operation: "tag_manage", action: "merge", tagName: "@office", targetTag: "@work" } }
```

**Updating tags on existing tasks:**

| Method       | Behavior                          |
| ------------ | --------------------------------- |
| `tags`       | **Replace** all tags              |
| `addTags`    | Add to existing, preserve current |
| `removeTags` | Remove specific, preserve others  |

### Repetition Rules

When users want recurring tasks, set `repetitionRule` on create or update:

```javascript
{ mutation: { operation: "create", target: "task", data: {
  name: "Weekly review",
  dueDate: "{next Friday}",
  repetitionRule: {
    frequency: "weekly",       // minutely, hourly, daily, weekly, monthly, yearly
    interval: "1",             // every N frequency units
    method: "fixed",           // fixed, due-after-completion, defer-after-completion
    scheduleType: "regularly"  // regularly, from-completion, none
  }
}}}
```

| User Says                | frequency | method                 |
| ------------------------ | --------- | ---------------------- |
| "Every week"             | `weekly`  | `fixed`                |
| "2 weeks after I finish" | `weekly`  | `due-after-completion` |
| "Every month on the 1st" | `monthly` | `fixed`                |
| "Daily"                  | `daily`   | `fixed`                |

To **remove** a repeat rule: `{ changes: { clearRepeatRule: true } }`

**Project review interval** — set the review cycle for a project:

```javascript
{ mutation: { operation: "update", target: "project", id: "...", changes: { reviewInterval: "7" } } }
```

---

## Advanced Queries

### Sort and Pagination

```javascript
// Sort by due date ascending, then by name
{ query: { type: "tasks", sort: [
  { field: "dueDate", direction: "asc" },
  { field: "name", direction: "asc" }
], limit: 25, offset: 0 } }
```

**Sortable fields:** `dueDate`, `deferDate`, `plannedDate`, `name`, `flagged`, `estimatedMinutes`, `added`, `modified`,
`completionDate`

**Sort-before-limit:** When both `sort` and `limit` are specified, the server collects all matching tasks, sorts them,
then applies the limit. This guarantees correct top-N results (e.g., "10 most overdue" works as expected).

**Pagination metadata:** When sort + limit are used, the response metadata includes `total_matched` — the number of
tasks that matched before the limit was applied. Use this to know if there are more results to page through.

### Logical Operators

Combine filters with `AND`, `OR`, `NOT` for complex queries:

```javascript
// Flagged OR due this week
{ query: { type: "tasks", filters: {
  OR: [
    { flagged: true },
    { dueDate: { between: ["{Monday}", "{Friday}"] } }
  ]
} } }

// Available but NOT tagged @waiting-for
{ query: { type: "tasks", filters: {
  AND: [
    { available: true },
    { NOT: { tags: { any: ["@waiting-for"] } } }
  ]
} } }
```

### Planned Date

Planned dates are distinct from due/defer — they represent when you **intend** to work on something:

```javascript
// What did I plan for today?
{ query: { type: "tasks", filters: { plannedDate: { between: ["{today}", "{today}"] } } } }
```

### Search Mode

```javascript
// Full search (names + notes)
{ query: { type: "tasks", mode: "search", filters: { text: { contains: "budget" } } } }

// Fast search (names only, better performance)
{ query: { type: "tasks", mode: "search", filters: { text: { contains: "budget" } }, fastSearch: true } }
```

### Export

Bulk export for backup or reporting:

```javascript
// Export all tasks as markdown
{ query: { type: "export", exportType: "tasks", format: "markdown" } }

// Export projects with stats as JSON
{ query: { type: "export", exportType: "projects", format: "json", includeStats: true } }

// Export specific fields as CSV
{ query: { type: "export", exportType: "tasks", format: "csv",
  exportFields: ["name", "project", "dueDate", "tags", "completed"] } }
```

**Formats:** `json`, `csv`, `markdown` | **Types:** `tasks`, `projects`, `all`

### Project Queries

Project queries support their own `fields` parameter for field projection:

```javascript
// Get active projects with specific fields
{ query: { type: "projects", filters: { status: "active" },
  fields: ["id", "name", "status", "folder", "nextReviewDate"] } }
```

**Project fields:** `id`, `name`, `status`, `flagged`, `note`, `dueDate`, `deferDate`, `completedDate`, `folder`,
`folderPath`, `folderId`, `sequential`, `lastReviewDate`, `nextReviewDate`, `defaultSingletonActionHolder`

### Perspectives and Folders

```javascript
// List all perspectives
omnifocus_read({ query: { type: 'perspectives' } });

// List all folders
omnifocus_read({ query: { type: 'folders' } });
```

### Filter Reference

| Filter    | Type       | Purpose                                                                      |
| --------- | ---------- | ---------------------------------------------------------------------------- |
| `id`      | string     | Exact task ID lookup                                                         |
| `inInbox` | boolean    | Explicitly filter inbox tasks                                                |
| `name`    | TextFilter | Filter by task/project name (separate from `text` which also searches notes) |

---

## Interpreting Results

### Productivity Stats

**Note:** `completionRate` is returned as a decimal (e.g., 0.75 = 75%). Health score varies 0-100 based on overdue
count, inbox size, and completion rate.

| Metric          | Healthy Range | Concern                   |
| --------------- | ------------- | ------------------------- |
| Completion rate | 0.70-0.90     | < 0.50 backlog growing    |
| Inbox count     | 0-10          | > 20 needs processing     |
| Overdue count   | 0-5           | > 10 system trust eroding |
| Available tasks | 10-30         | > 50 overwhelming         |

### Analysis Types Reference

| Type                  | Best for                                  | Performance   |
| --------------------- | ----------------------------------------- | ------------- |
| `productivity_stats`  | GTD health metrics, completion rates      | Fast          |
| `task_velocity`       | Completion trends over time (day/week/mo) | Fast          |
| `overdue_analysis`    | Bottleneck identification                 | Fast          |
| `pattern_analysis`    | Database-wide patterns, stale items       | 5-10s (1000+) |
| `workflow_analysis`   | Deep workflow assessment                  | 3-5s          |
| `recurring_tasks`     | Repeat task patterns and frequencies      | Fast          |
| `parse_meeting_notes` | Extract action items from text            | Fast          |
| `manage_reviews`      | Project review scheduling                 | Fast          |

All analysis types accept an optional `scope` with `dateRange`, `tags`, `projects`, `includeCompleted`, and
`includeDropped`.

### Pattern Analysis

**Stale projects** (no changes 30+ days):

- Review intention during weekly review
- Options: reactivate, drop, or move to someday/maybe

**Vague tasks** ("Think about X", "Consider Y"):

- Needs clarification: what's the physical next action?

**Bunched deadlines**:

- Spread out to avoid overwhelm
- May indicate reactive planning

---

## Clarifying Questions

Ask when user request is ambiguous:

| Missing  | Ask                                                         |
| -------- | ----------------------------------------------------------- |
| Deadline | "When does this need to be done?" or default to no deadline |
| Context  | "Where will you do this? @computer, @phone, @errands?"      |
| Scope    | "Is this one task or multiple steps?"                       |
| Project  | "Which project does this belong to?" or add to inbox        |

**But don't over-ask.** For simple captures, just add to inbox:

- "Add task to call Bob" → Create in inbox, no questions needed

---

## Anti-Patterns to Avoid

**Don't:**

- Use natural language dates in tool calls (convert first!)
- Use ISO-8601 with Z suffix (`2025-03-15T17:00:00Z`) — use `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`
- Fetch all tasks then filter client-side (use server filters, sort, and logical operators)
- Create compound tasks (break them up)
- Complete or delete tasks without confirmation
- Over-engineer simple captures
- Guess project/folder names — verify with `omnifocus_read` first

**Do:**

- Infer intent from context
- Use `countOnly: true` for "how many" questions (33x faster)
- Batch related operations with `tempId`/`parentTempId`
- Use `tag_manage` for reorganizing tag hierarchy (merge, nest, reparent)
- Use nested tag path syntax (`"Parent : Child"`) to create hierarchies on the fly
- Ask before destructive actions (delete, bulk_delete)
- Default to inbox when project unclear
- Use `sort` and `offset` for paginated browsing

---

## Quick Reference: Patterns Not Covered Above

These patterns supplement the intent mapping table and workflow sections.

```javascript
// Move task to inbox
{ mutation: { operation: "update", target: "task", id: "...", changes: { project: null } } }

// Clear a date or field
{ mutation: { operation: "update", target: "task", id: "...", changes: { clearDueDate: true } } }
// Also: clearDeferDate, clearPlannedDate, clearEstimatedMinutes, clearRepeatRule

// Complete with backdated date
{ mutation: { operation: "complete", target: "task", id: "...", completionDate: "{past date}" } }

// Bulk delete (confirm with user first!)
{ mutation: { operation: "bulk_delete", target: "task", ids: ["id1", "id2", "id3"] } }

// Reduce response size on mutations
{ mutation: { operation: "create", target: "task", data: { name: "Quick task" }, minimalResponse: true } }
// Also works on update and complete operations
```

---

## System Diagnostics

```javascript
// Test OmniFocus connection
system({ operation: 'diagnostics' });

// Server version info
system({ operation: 'version' });

// Cache statistics
system({ operation: 'cache', cacheAction: 'stats' });
```

---

## Remember

**You are the brain. The MCP server is the hands.**

- Interpret what the user really wants
- Convert dates before calling tools
- Apply GTD principles naturally
- Provide meaningful summaries of results
- Guide through workflows when appropriate

The goal: make task management feel like talking to a knowledgeable assistant, not operating software.
