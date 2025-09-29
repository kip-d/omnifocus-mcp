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

## 🧭 Navigation Guide

**For New Users:**
1. **[Quick Start](#quick-start)** - Installation and setup
2. **[Manual Templates](prompts/README.md)** - Copy/paste prompts for testing
3. **[Built-in Prompts](#built-in-prompts)** - Overview of available workflows

**For Advanced Users:**
- **[Programmatic Prompts](src/prompts/README.md)** - TypeScript-based MCP prompts
- **[API Documentation](docs/API-REFERENCE-LLM.md)** - Complete tool reference
- **[Performance Benchmarks](docs/PERFORMANCE_EXPECTATIONS.md)** - Hardware requirements

**For Developers:**
- **[Architecture Documentation](docs/ARCHITECTURE.md)** - Technical implementation
- **[Testing Framework](docs/REAL_LLM_TESTING.md)** - AI model integration
- **[Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md)** - Future enhancements

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

**📚 Prompt Documentation:**
- **[Manual Templates](prompts/README.md)** - Copy/paste prompts for testing and workflows
- **[Programmatic Prompts](src/prompts/README.md)** - Built-in MCP prompts (TypeScript-based)
- **[Prompt Discovery CLI](docs/PROMPT_DISCOVERY.md)** - `npm run prompts:list` command for unified prompt discovery

### Two Ways to Use Prompts

| Approach | Best For | Usage |
|----------|----------|-------|
| **Manual Templates** ([`/prompts/`](prompts/)) | Beginners, customization, offline use | Copy/paste entire prompt into Claude |
| **MCP Prompts** ([`/src/prompts/`](src/prompts/)) | Advanced users, integrated workflows | Ask Claude to "use the [prompt_name] prompt" |
- **Reference Guides**: Quick reference, troubleshooting, best practices

Access via Claude Desktop: "+" button → "Add from omnifocus"

**📖 Comprehensive Documentation:**
- **[User Prompts Guide](./prompts/README.md)** - Ready-to-use prompts for testing and daily workflows
- **[Technical Prompts Reference](./src/prompts/README.md)** - Programmatic prompt architecture and development
- **[Testing & Validation Prompts](./prompts/)** - Complete test suites and verification workflows

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

### 📚 Core Documentation
- **[`/docs/`](docs/)** - Complete reference guides and API documentation
  - [`API-REFERENCE-LLM.md`](docs/API-REFERENCE-LLM.md) - AI-optimized API reference
  - [`TOOLS.md`](docs/TOOLS.md) - Complete tool reference with examples
  - [`TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) - Common issues and solutions
  - [`PERMISSIONS.md`](docs/PERMISSIONS.md) - macOS permissions setup

### 🧪 Testing & Utilities
- **[`/scripts/`](scripts/)** - Utility scripts and testing tools
- **[`/tests/`](tests/)** - Unit and integration test suites

### 📋 Ready-to-Use Prompts
- **[Manual Templates (`/prompts/`)](prompts/README.md)** - Copy/paste prompts for testing and workflows
- **[Programmatic MCP Prompts (`/src/prompts/`)](src/prompts/README.md)** - Built-in prompts (access via Claude "+" button or natural language)
- **[Cross-Reference Guide](#built-in-prompts)** - Compare manual vs programmatic approaches

### 📦 Archive
- **[`/.archive/`](.archive/)** - Historical files and development artifacts preserved for reference

## License

MIT License - see LICENSE file
