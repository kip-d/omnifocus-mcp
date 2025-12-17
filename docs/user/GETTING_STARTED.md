# Getting Started with OmniFocus MCP

Welcome! This guide will help you start using your AI assistant as your personal executive secretary for OmniFocus.

## What This Does

This MCP server lets you talk to your AI assistant (like Claude) in plain English about your tasks, and it handles all
the OmniFocus complexity for you. Think of it as having an executive assistant who:

- Knows what's on your plate
- Reminds you what's urgent
- Creates and organizes tasks for you
- Helps you plan your day
- Captures meeting notes into actionable tasks

You don't need to be an OmniFocus expert - just ask questions naturally.

## Prerequisites

Before you begin, make sure you have:

- **OmniFocus 4.6+** installed on your Mac
- **Node.js 18+** installed ([download here](https://nodejs.org/))
- **An MCP-compatible AI assistant** (Claude Desktop, Claude Code, Cursor, Windsurf, etc.)

## Installation

### Step 1: Install the Server

```bash
git clone https://github.com/kip-d/omnifocus-mcp.git
cd omnifocus-mcp
npm install
npm run build
```

### Step 2: Connect to Your AI Assistant

**For Claude Desktop:**

1. Open or create this file: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add this configuration (replace `/absolute/path/to/` with your actual path):

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

3. **Restart Claude Desktop** completely (Quit and reopen)

**For Other AI Assistants:**

- **Claude Code**: Add to VS Code settings (`.vscode/settings.json` or User Settings)
- **Cursor**: Settings > MCP or create `.cursor/mcp.json`
- **Windsurf**: Configure via MCP settings
- **Cline**:
  `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

All use the same configuration format - see [Configuration Details](./claude-desktop-config.md) for specifics.

### Step 3: Grant OmniFocus Permissions

When you first use the server, macOS will ask for permission to control OmniFocus. Click "OK" to allow this.

**If you don't see the permission prompt:**

1. Open **System Settings** > **Privacy & Security** > **Automation**
2. Find your AI assistant (Terminal, Code, etc.)
3. Enable **OmniFocus** access

## Your First Conversation

Now comes the fun part. Open your AI assistant (like Claude Desktop) and try these:

### Test 1: Check It's Working

> **You:** "What's in my OmniFocus inbox?"

**What should happen:** Claude will list any tasks currently in your OmniFocus inbox. If your inbox is empty, Claude
will tell you that too.

**If Claude says:** "I don't have access to OmniFocus" or gives an error → See [Troubleshooting](#quick-troubleshooting)
below.

### Test 2: See Today's Tasks

> **You:** "What do I need to do today?"

or

> **You:** "What's on my plate today?"

Claude will show you tasks that are due today, available to work on, or flagged as important.

### Test 3: Add a Task

> **You:** "Add 'Call dentist' to my inbox"

or

> **You:** "Remind me to review the budget by Friday"

Claude will create the task in OmniFocus for you. You can check OmniFocus to see it there.

## Common Things You Can Do

Just talk naturally! Here are examples, but don't memorize these - ask in your own words:

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

> **You:** "I just got out of a meeting. Here are my notes:
>
> - Send proposal to client by Friday
> - Call Sarah about the budget
> - Review Q4 metrics before next week
> - Schedule follow-up meeting"

Claude will parse this and help you create organized tasks with appropriate tags and due dates.

### Daily Planning

- "Help me plan my day"
- "What should I focus on this afternoon?"
- "Show me quick tasks I can knock out in 15 minutes"

## Understanding OmniFocus Concepts

Your AI assistant understands these OmniFocus terms, so you can use them naturally:

- **Inbox**: Where new tasks go before you organize them
- **Projects**: Collections of related tasks (like "Website Redesign" or "Plan Vacation")
- **Tags**: Labels to categorize tasks (like "urgent", "phone calls", "15 minutes")
- **Defer Date**: When a task becomes relevant (hides it until then)
- **Due Date**: When a task must be completed
- **Flagged**: Mark something as high priority
- **Sequential Projects**: Tasks must be done in order
- **Parallel Projects**: Tasks can be done in any order
- **Perspectives**: Saved views of your tasks (like "Today", "Flagged", "Overdue")

**Don't worry if you don't know all these!** Just describe what you want in plain English, and Claude will figure out
the OmniFocus details.

## Tips for Natural Conversation

### You Don't Need to Be Precise

❌ **Don't say:** "Use the tasks tool with mode parameter 'today' and limit 10"

✅ **Just say:** "What's on my to-do list today?"

### The Assistant Understands Context

You can have a natural back-and-forth:

> **You:** "What's due today?" **Claude:** _[shows 5 tasks]_ **You:** "Flag the budget review one as urgent" **Claude:**
> _[flags it]_ **You:** "Actually, move it to tomorrow instead" **Claude:** _[reschedules it]_

### Be as Casual or Detailed as You Want

Both of these work fine:

**Casual:** "Remind me to email John"

**Detailed:** "Create a task in my Work project to email John about the Q4 budget, tag it as urgent, and make it due
this Friday at 5pm"

## Quick Troubleshooting

### "I don't have access to OmniFocus" or Permission Errors

**Fix:**

1. Make sure OmniFocus is running
2. Check System Settings > Privacy & Security > Automation
3. Enable OmniFocus for your AI assistant's app
4. Restart your AI assistant completely

### Claude says "Tool not found" or doesn't see OmniFocus

**Fix:**

1. Make sure you ran `npm run build`
2. Check your configuration file has the correct path
3. **Fully quit and restart** your AI assistant (don't just refresh)

### OmniFocus is running but nothing works

**Fix:**

1. Close any dialog boxes in OmniFocus (they can block access)
2. Make sure OmniFocus isn't showing a dialog asking for sync resolution
3. Try: "Check if OmniFocus is accessible" (Claude will run diagnostics)

### Tasks appear in Claude but not in OmniFocus

**Fix:**

- Wait 30 seconds for cache to sync
- Check OmniFocus isn't filtered to hide the task
- Look in Inbox if you can't find it elsewhere

### More detailed troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for complete troubleshooting guide.

## What's Next?

### Explore GTD Workflows

If you're interested in Getting Things Done (GTD) methodology, try:

- "Help me process my inbox" (processes tasks one by one)
- "Guide me through a weekly review" (comprehensive review workflow)
- "What does GTD recommend I do with this task?"

See [GTD Workflow Guide](./GTD-WORKFLOW-MANUAL.md) for more.

### Built-in Prompts

Your AI assistant has access to several pre-built workflows:

**In Claude Desktop:** Click the "+" button and select "Add from omnifocus" to see available prompts.

**In Claude Code or other assistants:** Just ask naturally - for example, "Help me process my inbox using the GTD
method"

### Remote Access (Windows to Mac)

Want to use Claude Desktop on a Windows PC to access OmniFocus on your Mac? The HTTP transport mode enables this:

```bash
# On your Mac - start in HTTP mode
node dist/index.js --http --port 3000
```

Then configure Claude Desktop on Windows to connect to your Mac's IP address or Tailscale hostname.

See **[HTTP Transport Guide](./HTTP-TRANSPORT.md)** for complete setup instructions including:

- Secure access with authentication tokens
- Tailscale/VPN configuration
- Running as a background service
- Troubleshooting remote connections

### Advanced Features

Once you're comfortable with basics, you can explore:

- **Batch operations**: Create multiple tasks at once
- **Export data**: Export tasks to CSV, JSON, or Markdown
- **Analytics**: "Show me my productivity stats for this week"
- **Perspective queries**: "Show me my custom 'Evening Review' perspective"

See [API Reference for LLMs](../api/API-REFERENCE-LLM.md) for complete capabilities.

## For Developers

If you're a developer wanting to integrate this into your own tools or understand the technical details:

- **[API Reference](./API-REFERENCE-V2.md)** - Complete tool reference with JSON examples
- **[Architecture Documentation](./ARCHITECTURE.md)** - Technical implementation details
- **[Testing Guide](./REAL_LLM_TESTING.md)** - How to test with real AI models

## Privacy & Data

- **All processing happens locally** on your Mac
- No data is sent to external servers (except your AI assistant's normal operation)
- OmniFocus data stays in OmniFocus
- The MCP server only accesses OmniFocus when you ask it to

## Getting Help

If you run into issues:

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Search [existing issues](https://github.com/kip-d/omnifocus-mcp/issues)
3. Open a new issue with:
   - Your OmniFocus version
   - Your AI assistant and version
   - What you asked and what happened
   - Any error messages

## Remember

**This is your executive assistant.** Just talk naturally about what you need to do, and let the AI handle the OmniFocus
complexity. You don't need to learn every feature - discover them as you need them.

Start simple, and explore more as you get comfortable. Enjoy having a personal productivity assistant!
