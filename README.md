# OmniFocus MCP Server

A Model Context Protocol (MCP) server that connects OmniFocus to Claude Desktop, Claude Code, and other MCP clients.

> **Personal Project Notice**: A hobby project for my workflow automation. MIT licensed -- use or adapt freely, but
> provided as-is.

## Features

- **Task Operations** -- Create, update, complete, delete tasks with full property support
- **Project Management** -- Create and manage projects with folders, sequential/parallel modes
- **Tag Management** -- Manage tags with hierarchy, nesting, merging, and bulk operations
- **GTD Analytics** -- Analyze productivity, workflows, and bottlenecks
- **Perspective Access** -- Query any OmniFocus perspective programmatically
- **Data Export** -- Export in JSON, CSV, or Markdown
- **Performance** -- Query 2000+ tasks in under 1 second
- **Remote Access** -- Optional HTTP transport for cross-platform access via Tailscale

## Quick Start

### Prerequisites

- macOS with OmniFocus 4.7+
- Node.js 18+

### Installation

```bash
git clone https://github.com/kip-d/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### Client Configuration

#### Claude Desktop

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

#### Claude Code

```bash
claude mcp add omnifocus -- node /absolute/path/to/omnifocus-mcp/dist/index.js
```

Or add to `~/.claude/settings.json`:

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

**Optional: Install the GTD skill** for enhanced intent recognition, date conversion, and workflow guidance:

```bash
ln -s /absolute/path/to/omnifocus-mcp/docs/skills/omnifocus-assistant ~/.claude/skills/omnifocus-assistant
```

The MCP server works without the skill, but the skill teaches Claude _when_ to use each tool and how to apply GTD
methodology. See [Claude Desktop Setup](docs/claude-desktop-setup.md) for the Claude Desktop equivalent.

#### Other MCP Clients

Cursor, Windsurf, Cline, and Zed all support local stdio MCP servers. Use the same command and args structure; refer to
each client's documentation for the configuration file location.

#### Remote (HTTP)

For accessing OmniFocus from another machine:

**1. Start the server in HTTP mode on your Mac:**

```bash
node dist/index.js --http --port 3000
```

**2. Configure your remote client:**

Claude Code (native HTTP support):

```bash
claude mcp add omnifocus --transport http http://your-mac-ip:3000/mcp
```

Claude Desktop (requires mcp-remote bridge):

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://your-mac-ip:3000/mcp"]
    }
  }
}
```

See the [HTTP Transport Guide](docs/user/HTTP-TRANSPORT.md) for Tailscale setup, authentication, and troubleshooting.

## Usage

### Natural Language

Once configured, talk to your assistant naturally:

- "What do I need to do today?"
- "Show me everything that's overdue"
- "Add 'Call dentist' to my inbox"
- "I just finished a meeting, here are my notes..."
- "Help me plan my afternoon"

See the [Getting Started Guide](docs/user/GETTING_STARTED.md) for more examples.

### Available Tools (v3.0.0 Unified API)

Four tools provide complete OmniFocus automation:

| Tool                | Purpose     | Operations                                                 |
| ------------------- | ----------- | ---------------------------------------------------------- |
| `omnifocus_read`    | Query data  | Tasks, projects, tags, perspectives, folders, export       |
| `omnifocus_write`   | Modify data | Create, update, complete, delete, batch, tag management    |
| `omnifocus_analyze` | Analytics   | Productivity stats, velocity, patterns, workflows, reviews |
| `system`            | Diagnostics | Version info, performance metrics, cache stats             |

### Query Examples

```javascript
// Today's tasks (due within 3 days OR flagged)
{ query: { type: "tasks", mode: "today" } }

// Overdue items
{ query: { type: "tasks", mode: "overdue" } }

// Flagged tasks
{ query: { type: "tasks", mode: "flagged" } }

// Count active tasks (33x faster than full query)
{ query: { type: "tasks", filters: { status: "active" }, countOnly: true } }

// Tasks by tag and due date
{ query: { type: "tasks", filters: { tags: { any: ["work"] }, dueDate: { before: "2026-03-01" } } } }

// Export to JSON
{ query: { type: "export", exportType: "tasks", format: "json" } }
```

### Write Examples

```javascript
// Create task
{ mutation: { operation: "create", target: "task",
    data: { name: "Call dentist", dueDate: "2026-02-14" } } }

// Complete task
{ mutation: { operation: "complete", target: "task", id: "taskId" } }

// Create subtask
{ mutation: { operation: "create", target: "task",
    data: { name: "Subtask", parentTaskId: "parentId" } } }

// Batch operations
{ mutation: { operation: "batch", target: "task", operations: [...] } }

// Tag management (nested tags use " : " path syntax)
{ mutation: { operation: "tag_manage", action: "create", tagName: "Work : Meetings" } }
```

### Analysis Examples

```javascript
// Productivity stats
{ analysis: { type: "productivity_stats", params: { groupBy: "week" } } }

// Pattern analysis
{ analysis: { type: "pattern_analysis", params: { insights: ["review_gaps", "wip_limits"] } } }

// Parse meeting notes into tasks
{ analysis: { type: "parse_meeting_notes", params: { text: "Meeting notes here..." } } }
```

### Recurring Tasks

Set `repetitionRule` when creating or updating tasks:

```javascript
// Daily (fixed schedule)
{ mutation: { operation: "create", target: "task", data: {
    name: "Daily standup",
    repetitionRule: { frequency: "daily", interval: 1, method: "fixed" }
} } }

// Weekly on Mon/Wed/Fri (1=Mon, 7=Sun)
{ mutation: { operation: "create", target: "task", data: {
    name: "Exercise",
    repetitionRule: { frequency: "weekly", interval: 1, daysOfWeek: [1, 3, 5] }
} } }

// Monthly, repeat from completion date
{ mutation: { operation: "create", target: "task", data: {
    name: "Review finances",
    repetitionRule: { frequency: "monthly", interval: 1, method: "defer-after-completion" }
} } }
```

| Field        | Type                                                      | Description                    |
| ------------ | --------------------------------------------------------- | ------------------------------ |
| `frequency`  | `daily`, `weekly`, `monthly`, `yearly`                    | Recurrence period (required)   |
| `interval`   | number                                                    | Every Nth period (default: 1)  |
| `daysOfWeek` | number[] (1-7)                                            | Days for weekly recurrence     |
| `method`     | `fixed`, `due-after-completion`, `defer-after-completion` | Schedule method                |
| `endDate`    | `YYYY-MM-DD`                                              | Stop recurring after this date |

## Built-in Prompts

Five MCP prompts for GTD workflows:

| Prompt                    | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `gtd_principles`          | GTD methodology guide                         |
| `gtd_weekly_review`       | Guided weekly review with stale project check |
| `gtd_process_inbox`       | Process inbox items in batches                |
| `eisenhower_matrix_inbox` | Prioritize by urgency and importance          |
| `quick_reference`         | Tool usage reference                          |

Access in Claude Desktop via the "+" button, or in Claude Code by asking to "use the gtd_weekly_review prompt."

See [Manual Templates](prompts/README.md) for copy/paste prompts and
[Prompt Discovery](docs/operational/PROMPT_DISCOVERY.md) for `npm run prompts:list`.

## Documentation

| Audience   | Document                                        | Purpose                              |
| ---------- | ----------------------------------------------- | ------------------------------------ |
| Users      | [Getting Started](docs/user/GETTING_STARTED.md) | First conversation, natural language |
| Users      | [Troubleshooting](docs/user/TROUBLESHOOTING.md) | Common issues and solutions          |
| Users      | [Smart Capture](docs/user/SMART_CAPTURE.md)     | Parse meeting notes into tasks       |
| Users      | [HTTP Transport](docs/user/HTTP-TRANSPORT.md)   | Remote access setup                  |
| Developers | [Developer Guide](docs/dev/DEVELOPER_GUIDE.md)  | API examples, tool call formats      |
| Developers | [Architecture](docs/dev/ARCHITECTURE.md)        | JXA + OmniJS Bridge internals        |
| Developers | [API Reference](docs/api/README.md)             | API reference versions               |
| Developers | [Patterns and Solutions](docs/dev/PATTERNS.md)  | Symptom lookup, common fixes         |
| Developers | [Documentation Map](docs/DOCS_MAP.md)           | Index of 90+ documentation files     |

## Testing

| Suite       | Command                    | Tests           | Time     |
| ----------- | -------------------------- | --------------- | -------- |
| Unit        | `npm run test:unit`        | 1313 (80 files) | ~2.5s    |
| Integration | `npm run test:integration` | 73              | ~2 min   |
| All         | `npm test`                 | Both suites     | ~2.5 min |

Integration tests require OmniFocus on macOS. Set `DISABLE_INTEGRATION_TESTS=true` to skip them.

## Limitations

- **Task Movement** -- Moving tasks between projects may recreate the task with a new ID.
- **Sequential Blocking** -- Inbox tasks do not appear as blocked (requires project context).

See [Troubleshooting](docs/user/TROUBLESHOOTING.md) for workarounds.

## License

MIT License -- see LICENSE file.
