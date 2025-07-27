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

For processing individual inbox items:

### For Each Inbox Item, Ask Yourself:

1. **Is it actionable?**
   - If NO → Delete it or move to reference
   - If YES → Continue

2. **Will it take less than 2 minutes?**
   - If YES → Do it now using complete_task
   - If NO → Continue

3. **Am I the right person?**
   - If NO → Delegate it (update task with "Waiting For" tag)
   - If YES → Continue

4. **Is it a project or single action?**
   - Single action → Move to appropriate project using update_task
   - Project → Create new project and define next action

### Example Commands:

```
# Delete non-actionable item
Delete task [taskId] using delete_task

# Quick 2-minute task
Mark task [taskId] as complete using complete_task

# Delegate task
Update task [taskId] with tags: ["@waiting-for", "delegated"]

# Move to project
Update task [taskId] with projectId: [targetProjectId]

# Create project for multi-step item
1. Create project using create_project with name: "Project Name"
2. Update original task to be in that project
3. Create additional next actions as needed
```

## Future Enhancement

Once Claude Desktop supports MCP Prompts, you'll be able to simply say:
- "Run my GTD weekly review"
- "Help me process my inbox"

And the server will guide you through these workflows automatically.