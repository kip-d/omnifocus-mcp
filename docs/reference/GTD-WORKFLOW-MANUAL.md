# GTD Workflows with OmniFocus MCP Server

The MCP server includes built-in GTD workflow prompts that you can use with MCP clients.

**Using Built-in Prompts:**

- **Claude Desktop**: Click "+" button → "Add from omnifocus" → Select a GTD prompt
- **ChatGPT Desktop**: Check if your version supports MCP prompts
- **Manual workflow**: Follow the tool-based workflows below if your client doesn't support prompts yet

## Weekly Review Workflow

Here's how to conduct a GTD weekly review using the available tools:

### Step 1: Process Your Inbox

```
Show me my OmniFocus inbox
```

Uses `omnifocus_read` with `{ query: { type: "tasks", filters: { project: null } } }` (inbox = no project).

### Step 2: Review Completed Tasks

```
Show me all tasks completed in the last 7 days
```

Uses `omnifocus_read` with `{ query: { type: "tasks", filters: { status: "completed" }, limit: 100 } }`.

### Step 3: Identify Stale Projects

```
List all active projects with their task counts
```

Uses `omnifocus_read` with `{ query: { type: "projects", filters: { status: "active" } } }`. Projects with 0 available
tasks may be stale and need review.

### Step 4: Review Project Health

```
Show me the tasks in [project name]
```

Uses `omnifocus_read` with `{ query: { type: "tasks", filters: { project: "Project Name" } } }`.

### Step 5: Check Overdue Tasks

```
Show me all overdue tasks
```

Uses `omnifocus_analyze` with `{ analysis: { type: "overdue_analysis" } }`.

### Step 6: Review Upcoming Week

```
Show me tasks due in the next 7 days
```

Uses `omnifocus_read` with `{ query: { type: "tasks", mode: "upcoming" } }`.

### Step 7: Analyze Productivity

```
Show me my productivity stats
```

Uses `omnifocus_analyze` with `{ analysis: { type: "productivity_stats" } }`.

## Inbox Processing Workflow

### Using the GTD Inbox Processing Prompt

The server includes an enhanced `gtd_process_inbox` prompt that guides you through comprehensive inbox processing:

**Basic Usage:**

```
Use the gtd_process_inbox prompt to help me process my inbox
```

**With Options:**

```
Use gtd_process_inbox with:
- batch_size: 10 (process 10 items at once)
- auto_create_projects: true (automatically create projects for multi-step items)
- suggest_contexts: true (get context tag suggestions)
- quick_mode: false (use comprehensive guided mode)
```

**What the Prompt Does:**

1. **Retrieves inbox items** (oldest first, so nothing gets forgotten)
2. **Guides through GTD framework** for each item:
   - CLARIFY: Is it actionable?
   - DO IT NOW: Takes less than 2 minutes?
   - DELEGATE: Are you the right person?
   - ORGANIZE: Single action or project?
3. **Suggests context tags** based on content (@computer, @phone, @15min, etc.)
4. **Executes actions** (delete, complete, move, create projects)
5. **Provides summaries** after each batch
6. **Continues** until inbox is empty

**Quick Mode:** For rapid processing when you know what to do:

```
Use gtd_process_inbox with quick_mode: true and batch_size: 20
```

### Manual Processing (Without Prompt)

If you prefer manual control, you can process items yourself:

#### For Each Inbox Item, Ask Yourself:

1. **Is it actionable?**
   - If NO → Delete it or move to reference
   - If YES → Continue

2. **Will it take less than 2 minutes?**
   - If YES → Do it now, then complete the task via `omnifocus_write` (complete)
   - If NO → Continue

3. **Am I the right person?**
   - If NO → Delegate it (update task with "@waiting-for" tag)
   - If YES → Continue

4. **Is it a project or single action?**
   - Single action → Move to appropriate project via `omnifocus_write` (update)
   - Project → Use `omnifocus_write` batch to create project with next actions

#### Example Commands:

```
# Get inbox items
Show me my inbox items

# Delete non-actionable item
Delete task [taskId]

# Quick 2-minute task
Complete task [taskId]

# Delegate task
Update task [taskId] with tags: ["@waiting-for", "delegated-to-john"]

# Move to project with context
Update task [taskId] to project [projectName] with tags: ["@computer", "@15min"]

# Create project for multi-step item (batch operation)
Create a project "Project Name" with tasks:
  1. First action
  2. Second action
```

All write operations use `omnifocus_write` with the appropriate mutation.

### Recommended Context Tags

**Location Contexts:**

- `@computer`, `@phone`, `@office`, `@home`, `@errands`, `@anywhere`

**Energy Contexts:**

- `@high-energy`, `@low-energy`

**Time Contexts:**

- `@15min`, `@30min`, `@1hour`, `@deep-work`

**People Contexts:**

- `@waiting-for`, `@agenda-{person}`, `@delegated-to-{person}`

**Priority Contexts:**

- `@urgent`, `@important`, `@someday`
