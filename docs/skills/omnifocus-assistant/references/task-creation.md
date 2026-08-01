# Task creation best practices

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

## Naming Rules

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

## When to Create Projects

Create a project when:

- Multiple steps required
- Outcome has a clear definition of "done"
- Tasks have dependencies

Single task when:

- One clear action
- No dependencies
- Can be done in one sitting

## Enriching Tasks

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

## Suggesting Time Estimates

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

## Batch Creation

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

## Batch Mixed Operations

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

## Subtasks

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

## Tag Operations

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

## Repetition Rules

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
