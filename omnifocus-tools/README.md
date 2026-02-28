# omnifocus-tools

CLI-first OmniFocus GTD assistant with MCP server wrapper.

## Quick Start

```bash
npm install && npm run build
node packages/cli/dist/index.js tasks --limit 5
```

## Packages

| Package                 | Description                   |
| ----------------------- | ----------------------------- |
| `@omnifocus/cli`        | Standalone CLI for OmniFocus  |
| `@omnifocus/mcp-server` | Thin MCP wrapper (~170 lines) |

## CLI Commands

### Read

```bash
omnifocus tasks [--project <name>] [--tag <name>] [--flagged] [--available]
omnifocus task <id>
omnifocus projects [--status active|done|dropped]
omnifocus tags
omnifocus folders
```

### GTD Shortcuts

```bash
omnifocus inbox          # Inbox items
omnifocus today          # Due soon + flagged
omnifocus overdue        # Past due
omnifocus flagged        # Flagged tasks
omnifocus upcoming       # Due in next 14 days
omnifocus review         # Projects due for review
omnifocus suggest        # Smart suggestions
```

### Write

```bash
omnifocus add "Task name" [--project <name>] [--tag <name>] [--due <date>] [--flag]
omnifocus complete <id>
omnifocus update <id> [--name <name>] [--flag] [--due <date>]
omnifocus delete <id> --confirm
```

### Analytics & System

```bash
omnifocus stats [--group-by day|week|month]
omnifocus version
omnifocus doctor
omnifocus cache [--clear]
```

### Global Options

```bash
--format text|json|csv|markdown
--fields name,dueDate,flagged
--limit 25
--offset 0
--sort dueDate:asc
--quiet
```

## MCP Server

```bash
# Start MCP server (stdio transport)
node packages/mcp-server/dist/index.js
```

4 tools: `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`

## Requirements

- macOS with OmniFocus 4.7+
- Node.js 20+
- Accessibility permissions for osascript

## Testing

```bash
npm run test:unit          # Fast unit tests (~170 tests)
npm run test:integration   # Against live OmniFocus (~30 tests)
```
