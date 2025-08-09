# OmniFocus MCP Server

A Model Context Protocol (MCP) server for OmniFocus task management automation.

> **Personal Project Notice**: This is a hobby project I built for my own OmniFocus workflow automation. While it's MIT licensed and you're welcome to use or adapt it, please note that it's designed for my specific needs and workflows. If it happens to work for you too, that's wonderful but unexpected! No support or maintenance is guaranteed.

## Features

- Task management (create, update, complete, delete)
- Project and folder organization  
- Sequential/parallel support for both projects and tasks
- GTD analytics and productivity insights
- Tag management
- Data export (CSV, JSON, Markdown)
- Smart caching for performance

## Quick Start

### Prerequisites
- OmniFocus 4.6+ on macOS
- Node.js 18+

### Installation
```bash
git clone https://github.com/yourusername/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### Claude Desktop Setup
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

## Using MCP Prompts in Claude Desktop

This server includes 8 pre-built prompts for common GTD workflows and reference guides. To access them in Claude Desktop (v0.12.55+):

1. Click the **"+"** button (bottom-left of the input box)
2. Select **"Add from omnifocus"** from the menu
3. Choose from available prompts:
   - **GTD Workflows:**
     - `gtd_process_inbox` - Process inbox with 2-minute rule
     - `gtd_weekly_review` - Complete weekly review with stale project detection
     - `gtd_principles` - Core GTD methodology guide
   - **Reference Guides:**
     - `quick_reference` - Essential tips and emergency commands
     - `tool_discovery_guide` - All tools with performance characteristics
     - `common_patterns_guide` - Best practices and workflows
     - `troubleshooting_guide` - Common errors and solutions
     - `tag_performance_guide` - Optimize tag queries

These prompts provide guided conversations with pre-configured questions and responses tailored to specific workflows.

## Basic Usage

### List Tasks
```javascript
{
  "tool": "list_tasks",
  "arguments": {
    "completed": false,
    "limit": 50
  }
}
```

### Create Task
```javascript
{
  "tool": "create_task", 
  "arguments": {
    "name": "Review Q4 budget",
    "dueDate": "2024-01-15T17:00:00Z",
    "flagged": true
  }
}
```

### Create Sequential Project
```javascript
{
  "tool": "create_project",
  "arguments": {
    "name": "Website Redesign",
    "sequential": true,  // Tasks must be done in order
    "folder": "Work"
  }
}
```

### Create Action Group with Subtasks
```javascript
// Create parent task (action group)
{
  "tool": "create_task",
  "arguments": {
    "name": "Plan Party",
    "sequential": true,  // Subtasks must be done in order
    "projectId": "xyz789"
  }
}
// Returns: { taskId: "abc123" }

// Add subtasks
{
  "tool": "create_task",
  "arguments": {
    "name": "Make guest list",
    "parentTaskId": "abc123"  // Creates as subtask
  }
}
```

### Get Today's Agenda
```javascript
{
  "tool": "todays_agenda",
  "arguments": {
    "includeOverdue": true
  }
}
```

## Available Tools (44 Total)

### Consolidated Tools (Recommended for AI Agents)

**Task Queries**: `query_tasks` - Unified interface for all task querying (replaces 7 individual tools)  
**Folder Management**: `manage_folder` - Complete folder operations with operation parameter  
**Review Management**: `manage_reviews` - GTD review workflow management  
**Batch Operations**: `batch_task_operations` - Efficient multi-task operations

### Standard Tools

**Task CRUD**: `create_task`, `update_task`, `complete_task`, `delete_task`, `get_task_count`, `todays_agenda`

**Projects**: `list_projects`, `create_project`, `update_project`, `complete_project`, `delete_project`

**Analytics**: `productivity_stats`, `task_velocity`, `overdue_analysis`

**Tags**: `list_tags`, `get_active_tags`, `manage_tags`

**Export**: `export_tasks`, `export_projects`, `bulk_export`

### Legacy Tools (Deprecated but Functional)

**Individual Task Queries**: `list_tasks`, `next_actions`, `blocked_tasks`, `available_tasks`, `overdue_tasks`, `upcoming_tasks` *(use `query_tasks` instead)*

**Individual Folder Tools**: `create_folder`, `update_folder`, `delete_folder`, `move_folder` *(use `manage_folder` instead)*

**Individual Review Tools**: `projects_for_review`, `mark_project_reviewed`, `set_review_schedule` *(use `manage_reviews` instead)*

### Documentation

- `/docs/TOOLS.md` - Detailed tool documentation
- `/docs/TOOL_CONSOLIDATION.md` - Consolidation guide and migration help  
- `/docs/LLM_USAGE_GUIDE.md` - Best practices for AI agents

## Known Limitations

- **Tags**: Cannot be assigned during task creation (JXA limitation). Create task first, then update with tags.
- **Project Movement**: Moving tasks between projects may require recreation with new ID
- **Parent Task Assignment**: Cannot move existing tasks into action groups via `update_task` (JXA limitation). The OmniFocus JXA API does not support reassigning tasks to new parents after creation. Workaround: Create new subtasks directly under the action group using `create_task` with `parentTaskId`.
- **Performance**: Large queries (2000+ tasks) may be slow. Use `skipAnalysis: true` for faster queries.

See `/docs/TROUBLESHOOTING.md` for solutions.

## Documentation

- `/docs/TOOLS.md` - Detailed tool documentation
- `/docs/GTD-WORKFLOW-MANUAL.md` - GTD workflow guides
- `/docs/PERFORMANCE.md` - Performance optimization
- `/docs/PERMISSIONS.md` - macOS permissions setup

## License

MIT License - see LICENSE file