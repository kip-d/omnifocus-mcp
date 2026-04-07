# OmniFocus MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants read and write your OmniFocus database. Talk to
Claude (or any MCP client) in natural language and it handles the OmniFocus automation for you.

> **Personal Project Notice**: A hobby project for my workflow automation. MIT licensed -- use or adapt freely, but
> provided as-is.

## What You Can Do

Once configured, talk to your assistant naturally:

- "What do I need to do today?"
- "Show me everything that's overdue"
- "Add 'Call dentist' to my inbox, due Friday"
- "Create a project for the kitchen remodel with these tasks..."
- "I just finished a meeting, here are my notes..." (parses into tasks)
- "How's my weekly review looking?"

The server exposes four tools that cover the full OmniFocus API:

| Tool                | Purpose     | Operations                                                 |
| ------------------- | ----------- | ---------------------------------------------------------- |
| `omnifocus_read`    | Query data  | Tasks, projects, tags, perspectives, folders, export       |
| `omnifocus_write`   | Modify data | Create, update, complete, delete, batch, tag management    |
| `omnifocus_analyze` | Analytics   | Productivity stats, velocity, patterns, workflows, reviews |
| `system`            | Diagnostics | Version info, performance metrics, cache stats             |

Five built-in GTD prompts (weekly review, inbox processing, Eisenhower matrix, and more) are available via the MCP
prompt protocol. See [Getting Started](docs/user/GETTING_STARTED.md) for details.

## Requirements

- **macOS** with **OmniFocus 4.7+** (the server communicates with OmniFocus via Apple's automation APIs)
- **Node.js 18+**

## Quick Start

```bash
git clone https://github.com/kip-d/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### Claude Desktop

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

### Claude Code

```bash
claude mcp add omnifocus -- node /absolute/path/to/omnifocus-mcp/dist/index.js
```

**Optional:** Install the [GTD skill](docs/skills/omnifocus-assistant/SKILL.md) for enhanced intent recognition and
workflow guidance:

```bash
ln -s /absolute/path/to/omnifocus-mcp/docs/skills/omnifocus-assistant ~/.claude/skills/omnifocus-assistant
```

### Other Clients

Cursor, Windsurf, Cline, and Zed all support local stdio MCP servers. Use the same `node dist/index.js` command; refer
to each client's documentation for config file location.

### Remote Access (HTTP)

The server supports HTTP transport for accessing OmniFocus from another machine (e.g., via Tailscale):

```bash
node dist/index.js --http --port 3000
```

See the [HTTP Transport Guide](docs/user/HTTP-TRANSPORT.md) for setup, authentication, and client configuration.

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
| Developers | [Documentation Map](docs/DOCS_MAP.md)           | Full index of documentation          |

## Testing

| Suite       | Command                    | Tests           | Time   |
| ----------- | -------------------------- | --------------- | ------ |
| Unit        | `npm run test:unit`        | 1634 (70 files) | ~2s    |
| Integration | `npm run test:integration` | 73              | ~4 min |
| All         | `npm test`                 | Both suites     | ~4 min |

Integration tests require OmniFocus running on macOS and exercise real database queries. Timing scales with database
size (the ~4 min figure is against a ~2,500 task database). Set `DISABLE_INTEGRATION_TESTS=true` to skip them.

## Limitations

- **Task Movement** -- Moving tasks between projects may recreate the task with a new ID.
- **Sequential Blocking** -- Inbox tasks do not appear as blocked (requires project context).

See [Troubleshooting](docs/user/TROUBLESHOOTING.md) for workarounds.

## License

MIT License -- see LICENSE file.
