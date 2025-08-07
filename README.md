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

### Create Sequential Task (Action Group)
```javascript
{
  "tool": "create_task",
  "arguments": {
    "name": "Plan Party",
    "sequential": true,  // Subtasks must be done in order
    "projectId": "xyz789"
  }
}
// Note: Add subtasks manually in OmniFocus
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

## Available Tools

**Tasks**: `list_tasks`, `create_task`, `update_task`, `complete_task`, `delete_task`, `get_task_count`, `todays_agenda`

**Projects**: `list_projects`, `create_project`, `update_project`, `complete_project`, `delete_project`

**Analytics**: `productivity_stats`, `task_velocity`, `overdue_analysis`

**Tags**: `list_tags`, `get_active_tags`, `manage_tags`

**Export**: `export_tasks`, `export_projects`, `bulk_export`

**Date Queries**: `date_range_query`, `overdue_tasks`, `upcoming_tasks`

For detailed documentation, see `/docs/TOOLS.md`.

## Known Limitations

- **Tags**: Cannot be assigned during task creation (JXA limitation). Create task first, then update with tags.
- **Project Movement**: Moving tasks between projects may require recreation with new ID
- **Performance**: Large queries (2000+ tasks) may be slow. Use `skipAnalysis: true` for faster queries.

See `/docs/TROUBLESHOOTING.md` for solutions.

## Documentation

- `/docs/TOOLS.md` - Detailed tool documentation
- `/docs/GTD-WORKFLOW-MANUAL.md` - GTD workflow guides
- `/docs/PERFORMANCE.md` - Performance optimization
- `/docs/PERMISSIONS.md` - macOS permissions setup

## License

MIT License - see LICENSE file