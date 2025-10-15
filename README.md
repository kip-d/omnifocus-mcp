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

**For End Users:**
- 📘 **[Getting Started Guide](docs/GETTING_STARTED.md)** - Your first conversation with Claude + natural language examples
- 🔧 **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Fix common issues
- 📋 **[Manual Templates](prompts/README.md)** - Copy/paste prompts for testing workflows

**For Developers:**
- 💻 **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - API examples, tool call formats, integration patterns
- 🏗️ **[Architecture Documentation](docs/ARCHITECTURE.md)** - Technical implementation details
- 🧪 **[Testing Framework](docs/REAL_LLM_TESTING.md)** - Real LLM integration testing with Ollama
- 🗺️ **[Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md)** - Completed features and future plans

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

### MCP Client Setup

**Claude Desktop:**
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/absolute/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

**Claude Code:**
Add to your VS Code settings (`.vscode/settings.json` or User Settings):
```json
{
  "claudeCode.mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/absolute/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

**ChatGPT Desktop:**
Local stdio MCP servers are not yet supported. ChatGPT Desktop currently only supports remote MCP servers. Configuration instructions will be added once local server support is available.

**Other MCP Clients with Local Server Support:**
- **Cursor**: Configure via Settings > MCP or create `.cursor/mcp.json`
- **Windsurf**: Configure via MCP settings
- **Cline** (VS Code extension): `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Zed**: Configure via MCP settings

All clients use the same basic configuration structure:
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/absolute/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

Refer to your client's documentation for specific configuration format and file location.

## Documentation

**For End Users:**
- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) - Your first conversation and natural language examples
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) - Common issues and solutions

**For Developers:**
- [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) - Complete tool reference with JSON examples
- [`docs/API-REFERENCE-V2.md`](docs/API-REFERENCE-V2.md) - Detailed API specification

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
| **Manual Templates** ([`/prompts/`](prompts/)) | Beginners, customization, offline use | Copy/paste entire prompt into your AI assistant |
| **MCP Prompts** ([`/src/prompts/`](src/prompts/)) | Advanced users, integrated workflows | Ask your assistant to "use the [prompt_name] prompt" |
- **Reference Guides**: Quick reference, troubleshooting, best practices

**Accessing MCP Prompts:**
- Claude Desktop: "+" button → "Add from omnifocus"
- Claude Code: Access via natural language ("use the gtd_process_inbox prompt")
- Other clients: See your client's documentation for MCP prompt access

**📖 Comprehensive Documentation:**
- **[User Prompts Guide](./prompts/README.md)** - Ready-to-use prompts for testing and daily workflows
- **[Technical Prompts Reference](./src/prompts/README.md)** - Programmatic prompt architecture and development
- **[Testing & Validation Prompts](./prompts/)** - Complete test suites and verification workflows

## Usage

### For End Users: Just Talk Naturally

Once set up, simply open your AI assistant and ask questions in plain English:

- "What do I need to do today?"
- "Show me everything that's overdue"
- "Add 'Call dentist' to my inbox"
- "I just finished a meeting, here are my notes..." *(captures tasks automatically)*
- "Help me plan my afternoon"

**See the [Getting Started Guide](docs/GETTING_STARTED.md) for your first conversation and more examples.**

### For Developers: Programmatic Access

If you're integrating this server into your own tools, see the [Developer Guide](docs/DEVELOPER_GUIDE.md) for:
- JSON tool call formats
- API parameter reference
- Return value schemas
- Testing patterns
- Integration examples

## Available Tools

**Core Operations**:
- `tasks` - Query tasks with modes (today, overdue, search, flagged, etc.)
- `manage_task` - Create, update, complete, delete tasks
- `batch_create` - Create multiple projects and tasks in a single operation
- `parse_meeting_notes` - Extract action items from meeting notes, transcripts, or unstructured text
- `projects` - Project operations (list, create, update, stats)
- `folders` - Folder management and organization
- `tags` - Tag operations including hierarchy management

**Analytics**:
- `productivity_stats` - GTD metrics and completion statistics
- `task_velocity` - Completion trends and velocity analysis
- `analyze_overdue` - Bottleneck analysis for overdue items
- `workflow_analysis` - Deep workflow pattern analysis
- `analyze_patterns` - Database-wide pattern detection

**GTD Workflow Patterns** (via `analyze_patterns` tool):
- `review_gaps` - Find projects overdue for weekly review or never reviewed
- `next_actions` - Analyze task names for actionability (clear action verbs vs vague descriptions)
- `wip_limits` - Identify projects with too many available tasks (configurable threshold, default: 5)
- `due_date_bunching` - Detect workload imbalances and deadline clustering (configurable threshold, default: 8 tasks/day)

**Example:**
```bash
# Analyze GTD workflow health
echo '{"patterns": ["review_gaps", "next_actions", "wip_limits", "due_date_bunching"], "options": {"wipLimit": 5, "bunchingThreshold": 8}}' | mcp call analyze_patterns
```

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

## Testing

The project uses Vitest with separate unit and integration test suites:

### Unit Tests (Fast - ~15-20s)
```bash
npm run test:unit
```

Fast tests with no external dependencies. Use for rapid development cycles.

### Integration Tests (Thorough - ~20-25s)
```bash
npm run test:integration
```

End-to-end tests that require OmniFocus running on macOS. Tests actual MCP protocol and data persistence.

- **Protocol Tests**: MCP server initialization, tool discovery, error handling
- **Data Lifecycle Tests**: Task/project CRUD operations, tag-based tracking, cleanup verification

**Environment Variables:**
- `DISABLE_INTEGRATION_TESTS=true` - Skip integration tests entirely

### Complete Test Suite (~35-40s)
```bash
npm test
```

Runs both unit and integration tests.

## Additional Resources

### For Contributors & Advanced Users
- **[`/scripts/`](scripts/)** - Utility scripts and testing tools
- **[`/tests/`](tests/)** - Unit and integration test suites (740+ tests)
- **[Performance Benchmarks](docs/BENCHMARK_RESULTS.md)** - Real-world performance data
- **[Architecture Deep Dive](docs/ARCHITECTURE.md)** - JXA + Bridge implementation
- **[Lessons Learned](docs/LESSONS_LEARNED.md)** - Hard-won insights from development

### Archive
- **[Historical Documentation](.archive/)** - Preserved development artifacts and deprecated features

## License

MIT License - see LICENSE file
