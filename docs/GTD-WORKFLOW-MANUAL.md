# GTD Workflows with OmniFocus MCP Server

While the MCP server implements GTD workflow prompts, Claude Desktop does not yet support the MCP Prompts capability. Until Claude Desktop adds prompt support, you can manually implement these workflows using the available tools.

## Weekly Review Workflow

Here's how to conduct a GTD weekly review using the available tools:

### Step 1: Process Your Inbox
```
Please check my OmniFocus inbox using list_tasks with inInbox: true
```

### Step 2: Review Completed Tasks
```
Show me all tasks completed in the last 7 days using list_tasks with:
- completed: true
- limit: 100
- sortBy: completionDate
- sortOrder: desc
```

### Step 3: Identify Stale Projects
```
List all active projects and show their task counts using list_projects with:
- status: ["active"]
- includeTaskCounts: true
- sortBy: name

For each project with 0 available tasks, these might be stale and need review.
```

### Step 4: Review Project Health
```
For projects that seem stale, get more details using list_tasks with:
- projectId: [the project's ID]
- includeCompleted: false
- limit: 10

This helps determine if the project needs next actions defined.
```

### Step 5: Check Overdue Tasks
```
Show me all overdue tasks using get_overdue_tasks with limit: 50
```

### Step 6: Review Upcoming Week
```
Show me tasks for the next 7 days using get_upcoming_tasks with:
- days: 7
- includeToday: true
```

### Step 7: Analyze Productivity
```
Show me my productivity stats using get_productivity_stats
```

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

**Quick Mode:**
For rapid processing when you know what to do:
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
   - If YES → Do it now using manage_task (complete)
   - If NO → Continue

3. **Am I the right person?**
   - If NO → Delegate it (update task with "@waiting-for" tag)
   - If YES → Continue

4. **Is it a project or single action?**
   - Single action → Move to appropriate project using manage_task (update)
   - Project → Use batch_create to create project with next actions

#### Example Commands:

```
# Get inbox items
Show me my inbox items with: mode="inbox", limit=10

# Delete non-actionable item
Use manage_task to delete task [taskId]

# Quick 2-minute task
Use manage_task to complete task [taskId]

# Delegate task
Use manage_task to update task [taskId] with tags: ["@waiting-for", "delegated-to-john"]

# Move to project with context
Use manage_task to update task [taskId] with:
- projectId: [targetProjectId]
- tags: ["@computer", "@15min"]

# Create project for multi-step item (using batch_create)
Use batch_create with:
  items:
    - tempId: "proj1", type: "project", name: "Project Name"
    - tempId: "task1", parentTempId: "proj1", type: "task", name: "First action"
    - tempId: "task2", parentTempId: "proj1", type: "task", name: "Second action"
```

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