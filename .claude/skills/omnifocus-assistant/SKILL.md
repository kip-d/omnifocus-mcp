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

### Example

```
User: "Create task to call Sarah, due tomorrow"
Today is Wednesday → tomorrow = Thursday

Tool call: omnifocus_write({
  mutation: {
    operation: "create",
    target: "task",
    data: { name: "Call Sarah", dueDate: "{tomorrow as YYYY-MM-DD}" }
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

- Choose based on four criteria (in order): context, time available, energy, priority
- Work from context lists, not project lists
- Trust your system — if you did the review, the right task will surface

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

Someday/Maybe captures things you might want to do but aren't committed to now.

**Where to put items:**

- Tag with `@someday` and place in a "Someday / Maybe" single-action project (or use on-hold status)
- Use a defer date far in the future to keep them out of daily views

**Review cadence:**

- Review the full list during weekly review (Step 7 below)
- Ask: "Has anything changed? Am I ready to commit to this?"
- Activate by moving to a real project and defining a next action
- Delete items that no longer spark interest

### Waiting-For Tracking

When you delegate or are waiting on someone else:

1. **Create or update** the task with tag `@waiting-for`
2. **Add a note**: who you're waiting on, what you asked, when you asked
3. **Set a defer date** for follow-up (typically 3-7 days out)
4. **Review** all `@waiting-for` items during weekly review — follow up on anything stale

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

### Natural Planning Model

For new projects, apply GTD's five planning steps:

1. **Purpose & principles** — Why does this matter? What are the boundaries?
2. **Outcome visioning** — What does "done" look like? Be specific.
3. **Brainstorming** — What are all the things that need to happen? Don't filter.
4. **Organizing** — Group and sequence the brainstorm into a logical order.
5. **Next actions** — What's the very next physical action for each component?

Use this when creating projects with `omnifocus_write` batch operations: create the project, then add tasks in sequence.

---

## Workflow: Process Inbox

When user says "process my inbox" or "help me with inbox":

```
1. Fetch inbox items: omnifocus_read({ query: { type: "tasks", filters: { project: null }, limit: 10 } })

2. For each item, guide through GTD clarify:
   a. "Is this actionable?"
      - NO → Delete, file as reference (Obsidian), or tag @someday
      - YES → Continue

   b. "Will it take less than 2 minutes?"
      - YES → "Do it now, then I'll mark it complete"
      - NO → Continue

   c. "Am I the right person to do this?"
      - NO → Delegate: tag @waiting-for, note who/when, set follow-up defer date
      - YES → Continue

   d. "Is it one action or multiple steps?"
      - One action → Assign to project, add context tags
      - Multiple → Create project with next actions

3. Execute: omnifocus_write to move, update, or create project

4. Repeat until inbox empty
```

---

## Workflow: Weekly Review

When user asks for "weekly review":

### Step 1: Get Clear — Empty Inbox

```
omnifocus_read({ query: { type: "tasks", filters: { project: null }, countOnly: true } })
```

If count > 0, process inbox first (use the inbox processing workflow above).

### Step 2: Get Clear — Review Completed (Celebrate!)

```
omnifocus_read({
  query: {
    type: "tasks",
    filters: {
      completed: true,
      completionDate: { after: "{7 days ago}" }
    },
    limit: 50
  }
})
```

Acknowledge progress. This builds trust in the system.

### Step 3: Get Current — Check Overdue

```
omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 50 } })
```

For each: reschedule, delegate, or drop. Don't leave overdue items — they erode system trust.

### Step 4: Get Current — Review Active Projects

```
omnifocus_read({ query: { type: "projects", filters: { status: "active" } } })
```

Check each has at least one available next action. Projects without next actions are stuck.

### Step 5: Get Current — Review On-Hold Projects

```
omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } })
```

For each: Should it be reactivated? Dropped? Still waiting on something?

### Step 6: Get Current — Review Waiting-For Items

```
omnifocus_read({ query: { type: "tasks", filters: { tags: { any: ["@waiting-for"] } }, limit: 50 } })
```

Follow up on anything stale. Remove the tag and complete if resolved.

### Step 7: Get Current — Someday/Maybe Review

```
omnifocus_read({ query: { type: "tasks", filters: { tags: { any: ["@someday"] } }, limit: 50 } })
```

Ask: "Am I ready to commit to any of these?" Activate or delete items that no longer resonate.

### Step 8: Get Current — Calendar & Upcoming Week

```
omnifocus_read({ query: { type: "tasks", mode: "upcoming", daysAhead: 7 } })
```

Check for overcommitment. Spread bunched deadlines. Ensure due dates reflect real commitments.

### Step 9: Get Current — Ensure Next Actions

```
omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })
```

Every active project must have at least one clear next action. Define one for any that don't.

### Step 10: Get Creative

Ask the user:

- "Any new projects or ideas to capture?"
- "Any stuck project that needs brainstorming?"
- "Anything to activate from someday/maybe?"

This is the creative payoff of having a clear system — space to think about what's next.

### Step 11: Productivity Check

```
omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } })
```

Compare to last week. Celebrate improvements, identify patterns.

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

When the user asks "what should I work on?" or needs help picking a task, apply GTD's four criteria in order:

### 1. Context — What can you do right now?

```
omnifocus_read({ query: { type: "tasks", mode: "available", filters: { tags: { any: ["@computer"] } }, limit: 20 } })
```

### 2. Time Available — How much time before your next commitment?

```
// Short window: quick wins
omnifocus_read({ query: { type: "tasks", mode: "available", filters: {
  AND: [{ tags: { any: ["@computer"] } }, { estimatedMinutes: { lessThan: 15 } }]
}, limit: 10 } })

// Long window: deep work
omnifocus_read({ query: { type: "tasks", mode: "available", filters: {
  tags: { any: ["@deep-work"] }
}, limit: 10 } })
```

### 3. Energy — What matches your current energy level?

```
// Morning high-energy: tackle hard items
omnifocus_read({ query: { type: "tasks", mode: "available", filters: { tags: { any: ["@high-energy"] } }, limit: 10 } })

// Afternoon slump: routine tasks
omnifocus_read({ query: { type: "tasks", mode: "available", filters: { tags: { any: ["@low-energy"] } }, limit: 10 } })
```

### 4. Priority — Of the remaining options, what matters most?

```
// Flagged = highest priority
omnifocus_read({ query: { type: "tasks", mode: "flagged", limit: 10 } })

// Overdue = needs attention
omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 10 } })
```

Guide the user through these filters progressively until they have a clear short list.

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
