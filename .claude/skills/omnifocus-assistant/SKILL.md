---
name: omnifocus-assistant
description: Use when user asks about tasks, projects, OmniFocus, GTD, productivity, or task management
---

# OmniFocus Assistant

> **Brain + Hands Architecture**: This skill provides the "brain" (methodology, intent interpretation, guidance). The
> OmniFocus MCP server provides the "hands" (tool execution). Use both together.

## When to Use This Skill

Use when the user:

- Asks about tasks, projects, or OmniFocus
- Mentions GTD, productivity, or task management
- Wants to capture, organize, or review work
- Asks "what should I do" or "what's on my plate"
- Mentions meetings, deadlines, or commitments

---

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
| "What's in my inbox?"        | List unprocessed  | `omnifocus_read` filters: `{ project: null }`                                           |
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

---

## Date Conversion (Critical)

**You must convert natural language dates to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` before tool calls.**

The MCP tools reject natural language. Calculate dates based on today's date.

### Conversion Table

| User Says                | Convert To            | Notes                |
| ------------------------ | --------------------- | -------------------- |
| "today"                  | Current date          | `2026-01-16`         |
| "tomorrow"               | Today + 1             | `2026-01-17`         |
| "yesterday"              | Today - 1             | `2026-01-15`         |
| "Monday" / "next Monday" | Next occurrence       | Calculate from today |
| "this Friday"            | Current week's Friday |                      |
| "next week"              | Today + 7 days        |                      |
| "in 3 days"              | Today + 3             |                      |
| "end of week"            | Current Friday        |                      |
| "end of month"           | Last day of month     |                      |
| "by Friday"              | Due date = Friday     | Use as `dueDate`     |
| "after Monday"           | Defer date = Monday   | Use as `deferDate`   |
| "starting Tuesday"       | Defer date = Tuesday  | Use as `deferDate`   |

### Time Defaults (When Only Date Given)

- **Due dates**: 5:00 PM (end of business)
- **Defer dates**: 8:00 AM (start of day)
- **Completion dates**: 12:00 PM (noon)

### Example

```
User: "Create task to call Sarah, due tomorrow"
Today: 2026-01-16
Tomorrow: 2026-01-17

Tool call: omnifocus_write({
  mutation: {
    operation: "create",
    target: "task",
    data: { name: "Call Sarah", dueDate: "2026-01-17" }
  }
})
```

---

## GTD Methodology Guide

### The Five Stages

**1. CAPTURE** - Get it out of your head

- Everything goes to inbox first
- Don't organize while capturing
- Focus on emptying your mind

**2. CLARIFY** - What is it?

- Is it actionable?
  - NO → Delete, reference, or someday/maybe
  - YES → Continue
- What's the next physical action?
- Will it take < 2 minutes? Do it now.

**3. ORGANIZE** - Put it where it belongs

- **Project**: Multi-step outcome
- **Context tags**: Where/when/how (@computer, @phone, @office)
- **Defer date**: When it becomes available
- **Due date**: Hard deadline only

**4. REVIEW** - Keep it current

- Weekly review is essential
- Check all projects for next actions
- Process inbox to zero
- Review someday/maybe list

**5. ENGAGE** - Do the work

- Work from context, not random lists
- Match energy to task
- Trust your system

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

---

## Workflow: Process Inbox

When user says "process my inbox" or "help me with inbox":

```
1. Fetch inbox items: omnifocus_read({ query: { type: "tasks", filters: { project: null }, limit: 10 } })

2. For each item, guide through GTD clarify:
   a. "Is this actionable?"
      - NO → Offer to delete or defer to someday
      - YES → Continue

   b. "Will it take less than 2 minutes?"
      - YES → "Do it now, then I'll mark it complete"
      - NO → Continue

   c. "Is it one action or multiple steps?"
      - One action → Assign to project, add context tags
      - Multiple → Create project with next actions

3. Execute: omnifocus_write to move, update, or create project

4. Repeat until inbox empty
```

---

## Workflow: Weekly Review

When user asks for "weekly review":

### Step 1: Empty Inbox

```
omnifocus_read({ query: { type: "tasks", filters: { project: null }, countOnly: true } })
```

If count > 0, process inbox first.

### Step 2: Review Completed (Celebrate!)

```
omnifocus_read({
  query: {
    type: "tasks",
    filters: {
      completed: true,
      completionDate: { after: "YYYY-MM-DD" }  // 7 days ago
    },
    limit: 50
  }
})
```

### Step 3: Check Overdue

```
omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 50 } })
```

For each: reschedule or drop.

### Step 4: Review Projects

```
omnifocus_read({ query: { type: "projects", filters: { status: "active" } } })
```

Check each has at least one available next action.

### Step 5: Upcoming Week

```
omnifocus_read({
  query: {
    type: "tasks",
    mode: "upcoming",
    daysAhead: 7
  }
})
```

### Step 6: Productivity Check

```
omnifocus_analyze({
  analysis: {
    type: "productivity_stats",
    params: { groupBy: "week" }
  }
})
```

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
  dueDate: "2026-02-14",
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

### Logical Operators

Combine filters with `AND`, `OR`, `NOT` for complex queries:

```javascript
// Flagged OR due this week
{ query: { type: "tasks", filters: {
  OR: [
    { flagged: true },
    { dueDate: { between: ["2026-02-10", "2026-02-14"] } }
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
{ query: { type: "tasks", filters: { plannedDate: { between: ["2026-02-11", "2026-02-11"] } } } }
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

---

## Interpreting Results

### Productivity Stats

| Metric          | Healthy Range | Concern                   |
| --------------- | ------------- | ------------------------- |
| Completion rate | 70-90%        | < 50% backlog growing     |
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
- Use `task.addTags()` or `task.tags =` directly — use `addTags`/`removeTags` in updates
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

## Quick Reference: Common Tool Patterns

### Count tasks (fast)

```javascript
{ query: { type: "tasks", filters: {...}, countOnly: true } }
```

### Create task

```javascript
{ mutation: { operation: "create", target: "task", data: { name: "...", dueDate: "YYYY-MM-DD" } } }
```

### Move to inbox

```javascript
{ mutation: { operation: "update", target: "task", id: "...", changes: { project: null } } }
```

### Add tags (preserve existing)

```javascript
{ mutation: { operation: "update", target: "task", id: "...", changes: { addTags: ["@urgent"] } } }
```

### Complete task

```javascript
{ mutation: { operation: "complete", target: "task", id: "..." } }
```

### Remove tags (preserve others)

```javascript
{ mutation: { operation: "update", target: "task", id: "...", changes: { removeTags: ["@waiting-for"] } } }
```

### Clear a date

```javascript
{ mutation: { operation: "update", target: "task", id: "...", changes: { clearDueDate: true } } }
// Also: clearDeferDate, clearPlannedDate, clearEstimatedMinutes, clearRepeatRule
```

### Complete with backdate

```javascript
{ mutation: { operation: "complete", target: "task", id: "...", completionDate: "2026-02-10" } }
```

### Bulk delete

```javascript
{ mutation: { operation: "bulk_delete", target: "task", ids: ["id1", "id2", "id3"] } }
```

### Search tasks

```javascript
{ query: { type: "tasks", mode: "search", filters: { text: { contains: "keyword" } } } }
```

### Manage tags

```javascript
// Create nested tag
{ mutation: { operation: "tag_manage", action: "create", tagName: "Work : Projects : Active" } }

// Merge duplicate
{ mutation: { operation: "tag_manage", action: "merge", tagName: "@office", targetTag: "@work" } }

// Reorganize
{ mutation: { operation: "tag_manage", action: "reparent", tagName: "Quarterly", parentTag: "Finance" } }
```

### Export tasks

```javascript
{ query: { type: "export", exportType: "tasks", format: "markdown" } }
```

### Sort results

```javascript
{ query: { type: "tasks", mode: "available", sort: [{ field: "dueDate", direction: "asc" }], limit: 20 } }
```

### Parse meeting notes

```javascript
{ analysis: { type: "parse_meeting_notes", params: { text: "..." } } }
```

### Analyze velocity

```javascript
{ analysis: { type: "task_velocity", params: { groupBy: "week" }, scope: { dateRange: { start: "2026-01-01", end: "2026-02-11" } } } }
```

### Project reviews

```javascript
{ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } }
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
