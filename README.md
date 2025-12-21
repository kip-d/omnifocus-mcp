# OmniFocus MCP Server

A Model Context Protocol (MCP) server that provides programmatic access to OmniFocus task management via Claude Desktop
and other MCP clients.

> **Personal Project Notice**: This is a hobby project designed for my specific OmniFocus workflow automation needs.
> It's MIT licensed and you're welcome to use or adapt it, but no support or maintenance is guaranteed.

## Features

- **Task Operations**: Create, update, complete, delete tasks with full property support
- **Project Management**: Create and manage projects with folders, sequential/parallel modes
- **GTD Analytics**: Productivity insights, workflow analysis, and bottleneck detection
- **Tag Management**: Complete tag operations including hierarchy and bulk operations
- **Perspective Access**: Query any OmniFocus perspective programmatically
- **Data Export**: Export data in JSON, CSV, or Markdown formats
- **Performance**: Optimized queries handle 2000+ tasks in under 1 second
- **Remote Access**: Optional HTTP transport for cross-platform access via Tailscale

## 🧭 Navigation Guide

**For End Users:**

- 📘 **[Getting Started Guide](docs/user/GETTING_STARTED.md)** - Your first conversation with Claude + natural language
  examples
- 🔧 **[Troubleshooting](docs/user/TROUBLESHOOTING.md)** - Fix common issues
- 📋 **[Manual Templates](prompts/README.md)** - Copy/paste prompts for testing workflows
- 🤖 **[Smart Capture](docs/user/SMART_CAPTURE.md)** - Parse meeting notes into tasks

**For Developers:**

- 🗺️ **[Documentation Map](docs/DOCS_MAP.md)** - Complete index of all 85+ documentation files
- 💻 **[Developer Guide](docs/dev/DEVELOPER_GUIDE.md)** - API examples, tool call formats, integration patterns
- 🏗️ **[Architecture Documentation](docs/dev/ARCHITECTURE.md)** - Technical implementation details (START HERE)
- 📖 **[API Reference](docs/api/README.md)** - Three versions optimized for different use cases
- 🧪 **[Testing Framework](docs/operational/REAL_LLM_TESTING.md)** - Real LLM integration testing with Ollama
- 📚 **[Patterns & Solutions](docs/dev/PATTERNS.md)** - Quick symptom lookup and common solutions

## Quick Start

### Prerequisites

- OmniFocus 4.7+ on macOS (released August 2025)
- Node.js 18+

### Installation

```bash
git clone https://github.com/yourusername/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### MCP Client Setup

#### Local (stdio) - Default

For clients running on the same Mac as OmniFocus:

**Claude Desktop:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

**Claude Code:** Add to your VS Code settings (`.vscode/settings.json` or User Settings):

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

**ChatGPT Desktop:** Local stdio MCP servers are not yet supported. ChatGPT Desktop currently only supports remote MCP
servers. Configuration instructions will be added once local server support is available.

**Other MCP Clients with Local Server Support:**

- **Cursor**: Configure via Settings > MCP or create `.cursor/mcp.json`
- **Windsurf**: Configure via MCP settings
- **Cline** (VS Code extension):
  `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
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

#### Remote (HTTP) - Cross-Platform Access

For accessing OmniFocus from another machine (Windows, Linux, or another Mac):

**1. Start the server in HTTP mode on your Mac:**

```bash
node dist/index.js --http --port 3000
```

**2. Configure your remote MCP client:**

```json
{
  "mcpServers": {
    "omnifocus": {
      "url": "http://your-mac-hostname:3000/mcp"
    }
  }
}
```

**With Tailscale (recommended for remote access):**

```json
{
  "mcpServers": {
    "omnifocus": {
      "url": "http://your-mac.tailnet-name.ts.net:3000/mcp"
    }
  }
}
```

See **[HTTP Transport Guide](docs/user/HTTP-TRANSPORT.md)** for authentication, service configuration, and troubleshooting.

## Documentation

**For End Users:**

- [`docs/user/GETTING_STARTED.md`](docs/user/GETTING_STARTED.md) - Your first conversation and natural language examples
- [`docs/user/TROUBLESHOOTING.md`](docs/user/TROUBLESHOOTING.md) - Common issues and solutions
- [`docs/user/README.md`](docs/user/README.md) - Complete user documentation index

**For Developers:**

- [`docs/dev/DEVELOPER_GUIDE.md`](docs/dev/DEVELOPER_GUIDE.md) - Complete tool reference with JSON examples
- [`docs/api/API-REFERENCE-V2.md`](docs/api/API-REFERENCE-V2.md) - Detailed API specification
- [`docs/dev/README.md`](docs/dev/README.md) - Complete developer documentation index
- [`docs/api/README.md`](docs/api/README.md) - Explanation of the three API reference versions

## Built-in Prompts

Nine pre-built prompts for common workflows:

- **GTD Workflows**: Inbox processing, weekly review, methodology guide

**📚 Prompt Documentation:**

- **[Manual Templates](prompts/README.md)** - Copy/paste prompts for testing and workflows
- **[Programmatic Prompts](src/prompts/README.md)** - Built-in MCP prompts (TypeScript-based)
- **[Prompt Discovery CLI](docs/PROMPT_DISCOVERY.md)** - `npm run prompts:list` command for unified prompt discovery

### Two Ways to Use Prompts

| Approach                                          | Best For                              | Usage                                                |
| ------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| **Manual Templates** ([`/prompts/`](prompts/))    | Beginners, customization, offline use | Copy/paste entire prompt into your AI assistant      |
| **MCP Prompts** ([`/src/prompts/`](src/prompts/)) | Advanced users, integrated workflows  | Ask your assistant to "use the [prompt_name] prompt" |

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
- "I just finished a meeting, here are my notes..." _(captures tasks automatically)_
- "Help me plan my afternoon"

**See the [Getting Started Guide](docs/user/GETTING_STARTED.md) for your first conversation and more examples.**

### For Developers: Programmatic Access

If you're integrating this server into your own tools, see the [Developer Guide](docs/dev/DEVELOPER_GUIDE.md) for:

- JSON tool call formats
- API parameter reference
- Return value schemas
- Testing patterns
- Integration examples

## Available Tools

**18 Total Tools** providing complete OmniFocus automation:

### Core Operations (7)

- **`tasks`** - Query tasks with modes (today, overdue, search, flagged, available, blocked, etc.)
- **`manage_task`** - Create, update, complete, delete tasks with full property support
- **`batch_create`** - Create multiple projects and tasks in hierarchies with atomic operations
- **`parse_meeting_notes`** - Extract action items from meeting notes, transcripts, or unstructured text with AI
- **`projects`** - Project operations (list, create, update, delete, statistics)
- **`folders`** - Folder management and hierarchical organization
- **`tags`** - Complete tag operations including hierarchy, nesting, and bulk management

### Organization & Reviews (3)

- **`manage_reviews`** - Project review workflow and scheduling
- **`export`** - Data export in JSON, CSV, or Markdown formats
- **`recurring_tasks`** - Recurring task analysis and pattern detection

### Analytics (5)

- **`productivity_stats`** - GTD health metrics and completion statistics
- **`task_velocity`** - Completion trends and velocity analysis
- **`analyze_overdue`** - Bottleneck analysis for overdue and blocked items
- **`workflow_analysis`** - Deep workflow pattern analysis and insights
- **`analyze_patterns`** - Database-wide pattern detection with 10 analysis modes

### Pattern Analysis (via `analyze_patterns` tool)

- **`review_gaps`** - Find projects overdue for weekly review or never reviewed
- **`next_actions`** - Analyze task names for actionability (clear action verbs vs vague descriptions)
- **`wip_limits`** - Identify projects with too many available tasks (configurable threshold, default: 5)
- **`due_date_bunching`** - Detect workload imbalances and deadline clustering (configurable threshold, default: 8/day)
- Plus 6 additional analysis modes (duplicates, dormant_projects, tag_audit, deadline_health, waiting_for,
  estimation_bias)

**GTD Workflow Health Example:**

```bash
# Analyze complete GTD health
analyze_patterns({
  patterns: ["review_gaps", "next_actions", "wip_limits", "due_date_bunching"],
  options: { wipLimit: 5, bunchingThreshold: 8 }
})
```

### Utilities (3)

- **`perspectives`** - Query any OmniFocus perspective with rich formatting and metadata
- **`system`** - Version, diagnostics, and metrics information
- (Total: 18 tools)

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

See `/docs/user/TROUBLESHOOTING.md` for solutions.

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
- **[Performance Benchmarks](docs/dev/BENCHMARK_RESULTS.md)** - Real-world performance data across hardware
- **[Architecture Deep Dive](docs/dev/ARCHITECTURE.md)** - JXA + OmniJS Bridge implementation
- **[Lessons Learned](docs/dev/LESSONS_LEARNED.md)** - Hard-won insights from development
- **[Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md)** - Completed features and future direction

### Archive

- **[Historical Documentation](.archive/)** - Preserved development artifacts and deprecated features

## License

MIT License - see LICENSE file
