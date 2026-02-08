# Getting Started with OmniFocus MCP

Your AI assistant becomes an executive secretary for OmniFocus.

## What This Does

Talk to Claude in plain English about your tasks. The server handles OmniFocus for you—an assistant who:

- Knows your commitments
- Flags what's urgent
- Creates and organizes tasks
- Plans your day
- Turns meeting notes into actions

Ask questions naturally. OmniFocus expertise is optional.

## Prerequisites

- **OmniFocus 4.7+** on macOS
- **Node.js 18+** ([download](https://nodejs.org/))
- **An MCP client**: Claude Desktop, Claude Code, Cursor, or Windsurf

## Installation

### Step 1: Install the Server

```bash
git clone https://github.com/kip-d/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### Step 2: Connect to Your AI Assistant

**Claude Desktop:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop completely.

**Other clients** use the same format:

- **Claude Code**: `.vscode/settings.json`
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: MCP settings
- **Cline**:
  `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

See [Configuration Details](../claude-desktop-config.md).

### Step 3: Grant Permissions

On first use, macOS requests permission to control OmniFocus. Click "OK".

**No prompt?** Open System Settings > Privacy & Security > Automation and enable OmniFocus for your AI app.

## Your First Conversation

Open Claude Desktop and try these:

### Test 1: Check Connection

> "What's in my OmniFocus inbox?"

Claude lists your inbox tasks, or confirms it's empty.

**Error?** See [Troubleshooting](#quick-troubleshooting).

### Test 2: See Today's Tasks

> "What do I need to do today?"

Claude shows tasks due today, available, or flagged.

### Test 3: Add a Task

> "Add 'Call dentist' to my inbox"

Claude creates the task. Check OmniFocus to confirm.

## Common Requests

Examples—use your own words:

### Checking Your Tasks

- "What's on my plate today?"
- "What am I overdue on?"
- "Show me everything flagged as important"
- "What tasks do I have in the 'Website Redesign' project?"
- "What's blocking me right now?"

### Adding Tasks

- "Add 'Order office supplies' to my inbox"
- "Create a task to send the proposal by Friday at 5pm with the tag 'urgent'"
- "I need to call Sarah tomorrow morning"

### Managing Projects

- "Create a new project called 'Q1 Planning' in my Work folder"
- "What projects need review?"
- "Show me all the tasks in the Budget Review project"

### Capturing Meeting Notes

> "I just got out of a meeting. Here are my notes:
>
> - Send proposal to client by Friday
> - Call Sarah about the budget
> - Review Q4 metrics before next week
> - Schedule follow-up meeting"

Claude parses these into organized tasks with tags and due dates.

### Daily Planning

- "Help me plan my day"
- "What should I focus on this afternoon?"
- "Show me quick tasks I can knock out in 15 minutes"

## OmniFocus Vocabulary

Claude understands these terms:

- **Inbox**: Unsorted new tasks
- **Projects**: Related task groups ("Website Redesign", "Plan Vacation")
- **Tags**: Categories ("urgent", "phone", "15 minutes")
- **Defer Date**: When a task becomes available
- **Due Date**: Deadline
- **Flagged**: High priority
- **Sequential/Parallel Projects**: Ordered vs. any-order tasks
- **Perspectives**: Saved views ("Today", "Flagged", "Overdue")

Describe what you want; Claude handles the OmniFocus details.

## Tips

### Skip the Technical Jargon

❌ "Use the tasks tool with mode parameter 'today' and limit 10"

✅ "What's on my to-do list today?"

### Claude Remembers Context

> "What's due today?" _[shows 5 tasks]_ "Flag the budget review as urgent" _[flags it]_ "Move it to tomorrow"
> _[reschedules]_

### Casual or Detailed—Both Work

**Casual:** "Remind me to email John"

**Detailed:** "Create a task in Work to email John about Q4 budget, tag urgent, due Friday 5pm"

## Quick Troubleshooting

### Permission Errors

1. Confirm OmniFocus is running
2. Open System Settings > Privacy & Security > Automation
3. Enable OmniFocus for your AI app
4. Restart the AI assistant

### "Tool not found"

1. Run `npm run build`
2. Verify the path in your config
3. Quit and restart the AI assistant

### OmniFocus Running but Unresponsive

1. Close any OmniFocus dialogs (they block automation)
2. Dismiss sync conflict prompts
3. Ask Claude: "Check if OmniFocus is accessible"

### Tasks Missing from OmniFocus

- Wait 30 seconds for cache sync
- Check perspective filters
- Look in Inbox

**More help:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## What's Next?

### GTD Workflows

Try these if you use Getting Things Done:

- "Help me process my inbox"
- "Guide me through a weekly review"
- "What does GTD recommend for this task?"

See [GTD Workflow Guide](../reference/GTD-WORKFLOW-MANUAL.md).

### Built-in Prompts

**Claude Desktop:** Click "+" → "Add from omnifocus"

**Other clients:** Ask naturally: "Help me process my inbox using GTD"

### Remote Access

Access OmniFocus from Windows or Linux via HTTP transport:

```bash
# On your Mac
node dist/index.js --http --port 3000
```

Configure your remote client to connect via IP or Tailscale hostname.

See **[HTTP Transport Guide](./HTTP-TRANSPORT.md)** for authentication, VPN setup, and troubleshooting.

### Advanced Features

- **Batch operations**: Create multiple tasks at once
- **Export**: CSV, JSON, or Markdown
- **Analytics**: "Show my productivity stats this week"
- **Perspectives**: "Show my 'Evening Review' perspective"

See [API Reference](../api/API-COMPACT-UNIFIED.md).

## For Developers

- **[API Reference](../api/API-COMPACT-UNIFIED.md)** - Unified API schemas with JSON examples
- **[Architecture](../dev/ARCHITECTURE.md)** - Implementation details
- **[Testing Guide](../operational/REAL_LLM_TESTING.md)** - Testing with real AI models

## Privacy

- All processing runs locally on your Mac
- OmniFocus data stays in OmniFocus
- The server accesses OmniFocus only when you ask

## Getting Help

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Search [existing issues](https://github.com/kip-d/omnifocus-mcp/issues)
3. Open a new issue with your OmniFocus version, AI client, what you asked, and any errors

## Remember

Talk naturally. The AI handles OmniFocus. Start simple; discover features as you need them.
