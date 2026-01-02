# OmniFocus MCP v3.0.0 Prompts

This directory contains ready-to-use prompts for testing and using the OmniFocus MCP server with Claude Desktop.

## ⭐ For Claude Desktop System Prompts

### [OMNIFOCUS_GOTCHAS.md](./OMNIFOCUS_GOTCHAS.md) - Recommended (~250 tokens)

**Use this in your Claude Desktop Instructions or system prompt.**

The MCP server automatically provides ~11,200 tokens of tool documentation. This slim gotchas prompt covers critical
tips that complement (not duplicate) that information:

- Date format conversion (natural language → YYYY-MM-DD)
- Inbox assignment (`project: null`)
- Fast counting (`countOnly: true`)
- Tag operations (replace vs add/remove)
- Batch preview (`dryRun: true`)

**Why not use the full API reference?** Analysis showed it's 93% redundant with MCP tool descriptions. The gotchas
prompt provides higher value per token.

---

**📚 Related Documentation:**

- **[Main README](../README.md)** - Installation, setup, and overview
- **[Programmatic Prompts](../src/prompts/README.md)** - Built-in MCP prompts (TypeScript-based)
- **[API Documentation](../docs/api/)** - Complete tool references (for human readers)

## Available Prompts

### 🔍 Quick Discovery

**Need help choosing? Here's a quick guide:**

| I want to...                 | Use This Prompt                                        | Type            |
| ---------------------------- | ------------------------------------------------------ | --------------- |
| Add to Claude Desktop config | [OMNIFOCUS_GOTCHAS.md](./OMNIFOCUS_GOTCHAS.md)         | System Prompt   |
| Test if everything works     | [test-v2-comprehensive.md](./test-v2-comprehensive.md) | Manual Template |
| Start daily GTD routine      | [daily-gtd-workflow.md](./daily-gtd-workflow.md)       | Manual Template |
| Do a weekly review           | Ask Claude: "Use the gtd_weekly_review prompt"         | MCP Prompt      |
| Process my inbox             | Ask Claude: "Use the gtd_process_inbox prompt"         | MCP Prompt      |
| Learn GTD principles         | Ask Claude: "Show me the gtd_principles prompt"        | MCP Prompt      |
| Get quick commands reference | Ask Claude: "Use the quick_reference prompt"           | MCP Prompt      |

**🆚 Manual Templates vs MCP Prompts:**

- **Manual Templates** (below): Copy/paste entire content → More customizable
- **[MCP Prompts](../src/prompts/)**: Ask Claude to use them → More integrated

### 🧪 Testing & Verification

#### [test-v2-comprehensive.md](./test-v2-comprehensive.md)

Comprehensive test suite covering all V2 functionality. Use this to verify your installation is working correctly.

- Tests all CRUD operations
- Validates advanced features
- Checks performance
- Includes diagnostic commands

#### [v2-features-test.md](./v2-features-test.md)

Quick test of V2-specific improvements over V1.

- Tag assignment during creation
- Complex repeat rules
- Task reparenting
- Perspective queries
- Summary-first responses

### 📅 Daily Use

#### [daily-gtd-workflow.md](./daily-gtd-workflow.md)

Complete GTD (Getting Things Done) workflow for daily use.

- Morning review routine
- Project status checks
- Task capture and processing
- Context-based work
- End-of-day review
- Weekly review additions

## How to Use These Prompts

### With Claude Desktop

1. Make sure your OmniFocus MCP server is configured in Claude Desktop
2. Start a new conversation
3. Copy and paste the entire content of a prompt file
4. Replace any {{timestamp}} placeholders with actual values
5. Claude will execute the commands and report results

### For Testing

1. Start with `v2-features-test.md` for a quick health check
2. Run `test-v2-comprehensive.md` for full validation
3. Note any failures and check the troubleshooting section

### For Daily Use

1. Use `daily-gtd-workflow.md` as a template
2. Customize the sections you need
3. Save your own variations for different contexts (work, personal, etc.)

## v3.0.0 Unified API

The v3.0.0 API consolidates everything into **4 unified tools**:

| Tool                | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `omnifocus_read`    | Query tasks, projects, tags, perspectives   |
| `omnifocus_write`   | Create, update, complete, delete, batch ops |
| `omnifocus_analyze` | Productivity stats, velocity, patterns      |
| `system`            | Version, diagnostics, metrics, cache        |

### Key Features

- ✅ 76% fewer tool schemas (4 vs 17 legacy)
- ✅ countOnly queries (33x faster for counting)
- ✅ dryRun mode for batch preview
- ✅ Tags assigned during creation
- ✅ Complex repeat rules supported
- ✅ Export to JSON/CSV/Markdown

## Troubleshooting

### If tools aren't working:

1. Check version: Should be 2.0.0-beta.4 or higher
2. Verify V2 mode: OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS should NOT be set
3. Run diagnostics using the commands in test prompts
4. Check Claude Desktop logs for errors

### For V1 compatibility:

- Set `OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS=true` to enable V1 tools
- Both V1 and V2 tools will be available
- V1 tools are frozen and won't receive updates

## Creating Custom Prompts

When creating your own prompts:

1. Use natural language - V2 tools understand context
2. Specify dates clearly: "tomorrow at 2pm", "next Monday"
3. Include validation steps to confirm operations worked
4. Add placeholder {{variables}} for dynamic content
5. Structure with clear sections and expected outcomes

## 🔗 MCP Programmatic Prompts

In addition to these manual copy/paste templates, the OmniFocus MCP server includes
**[built-in programmatic prompts](../src/prompts/README.md)** that you can call directly through the MCP protocol.

**➡️ See the [Programmatic Prompts Documentation](../src/prompts/README.md) for complete technical details.**

### Available MCP Prompts

You can access these prompts by asking Claude to "use the [prompt_name] prompt":

#### GTD Workflow Prompts

- **`gtd_principles`** - Core GTD methodology and principles guide
- **`gtd_weekly_review`** - Complete weekly review process with OmniFocus integration
- **`gtd_process_inbox`** - Structured inbox processing workflow
- **`eisenhower_matrix_inbox`** - Prioritize inbox items using the Eisenhower Matrix

#### Reference Prompts

- **`quick_reference`** - Essential OmniFocus MCP commands and patterns

### Usage Examples

```
# Use built-in prompts directly:
"Use the gtd_weekly_review prompt to help me with my weekly review"
"Show me the gtd_principles prompt"
"Use the eisenhower_matrix_inbox prompt to prioritize my tasks"
```

### Manual Templates vs MCP Prompts

| Approach                                          | Best For                              | Usage                                        |
| ------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| **[Manual Templates](.)** (this directory)        | Beginners, customization, offline use | Copy/paste entire prompt into Claude         |
| **[MCP Prompts](../src/prompts/)** (programmatic) | Advanced users, integrated workflows  | Ask Claude to "use the [prompt_name] prompt" |

Both approaches use the same underlying V2 tools and provide similar functionality through different interfaces.

## Support

- Report issues: [GitHub Issues](https://github.com/kip-d/omnifocus-mcp/issues)
- Documentation: See /docs directory
- Version info: Ask Claude to "show me the MCP server version"
- MCP Prompts: Ask Claude to "list available prompts" to see programmatic options
