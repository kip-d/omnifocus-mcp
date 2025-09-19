# OmniFocus MCP Server

A Model Context Protocol (MCP) server that provides programmatic access to OmniFocus task management via Claude Desktop and other MCP clients.

> **Personal Project Notice**: This is a hobby project designed for my specific OmniFocus workflow automation needs. It's MIT licensed and you're welcome to use or adapt it, but no support or maintenance is guaranteed.


## Features

- **Task Operations**: Create, update, complete, delete tasks with full property support
- **Project Management**: Create and manage projects with folders, sequential/parallel modes
- **GTD Analytics**: Productivity insights, workflow analysis, and bottleneck detection
- **Tag Management**: Complete tag operations including hierarchy and bulk operations
- **Perspective Access**: Query any OmniFocus perspective programmatically
- **Data Export**: Export data in JSON, CSV, or Markdown formats
- **Performance**: Optimized queries handle 2000+ tasks in under 1 second

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

## API Documentation

For AI assistants and developers:
- [`docs/API-REFERENCE-LLM.md`](docs/API-REFERENCE-LLM.md) - Complete reference (~900 tokens)
- [`docs/API-COMPACT.md`](docs/API-COMPACT.md) - Essential commands (~400 tokens)

## Built-in Prompts

Nine pre-built prompts for common workflows:
- **GTD Workflows**: Inbox processing, weekly review, methodology guide
- **Reference Guides**: Quick reference, troubleshooting, best practices

Access via Claude Desktop: "+" button → "Add from omnifocus"

## Usage Examples

### Query Tasks
```javascript
// Get today's tasks
{ "tool": "tasks", "arguments": { "mode": "today" } }

// Search tasks
{ "tool": "tasks", "arguments": { "mode": "search", "query": "budget" } }
```

### Manage Tasks
```javascript
// Create task
{
  "tool": "manage_task",
  "arguments": {
    "operation": "create",
    "name": "Review Q4 budget",
    "dueDate": "2024-01-15 17:00",
    "tags": ["work", "urgent"]
  }
}

// Update task
{
  "tool": "manage_task",
  "arguments": {
    "operation": "update",
    "taskId": "abc123",
    "flagged": true
  }
}
```

### Project Operations
```javascript
// Create project
{
  "tool": "projects",
  "arguments": {
    "operation": "create",
    "name": "Website Redesign",
    "sequential": true,
    "folder": "Work"
  }
}
```

## Available Tools

**Core Operations**:
- `tasks` - Query tasks with modes (today, overdue, search, flagged, etc.)
- `manage_task` - Create, update, complete, delete tasks
- `projects` - Project operations (list, create, update, stats)
- `folders` - Folder management and organization
- `tags` - Tag operations including hierarchy management

**Analytics**:
- `productivity_stats` - GTD metrics and completion statistics
- `task_velocity` - Completion trends and velocity analysis
- `analyze_overdue` - Bottleneck analysis for overdue items
- `workflow_analysis` - Deep workflow pattern analysis
- `analyze_patterns` - Database-wide pattern detection

**Utilities**:
- `export` - Data export in multiple formats
- `perspectives` - Query OmniFocus perspectives
- `recurring_tasks` - Recurring task analysis
- `manage_reviews` - GTD review workflow
- `system` - Version and diagnostic info


## Recurring Tasks

Supports complex recurrence patterns:

```javascript
// Daily task
{
  "repeatRule": {
    "unit": "day",
    "steps": 1,
    "method": "fixed"
  }
}

// Weekly on specific days
{
  "repeatRule": {
    "unit": "week",
    "steps": 1,
    "weekdays": ["monday", "wednesday", "friday"]
  }
}

// Monthly position (2nd Tuesday)
{
  "repeatRule": {
    "unit": "month",
    "steps": 1,
    "weekPosition": "2",
    "weekday": "tuesday"
  }
}
```

## Limitations

- **Task Movement**: Moving tasks between projects may recreate task with new ID
- **Parent Assignment**: Cannot move existing tasks into action groups after creation
- **Sequential Blocking**: Inbox tasks don't show as blocked (requires project context)

See `/docs/TROUBLESHOOTING.md` for solutions.

## Documentation

- `/docs/TOOLS.md` - Complete tool reference
- `/docs/TROUBLESHOOTING.md` - Common issues and solutions
- `/docs/PERMISSIONS.md` - macOS permissions setup

## License

MIT License - see LICENSE file
