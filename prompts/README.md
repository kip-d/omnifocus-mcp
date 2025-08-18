# OmniFocus MCP V2 Prompts

This directory contains ready-to-use prompts for testing and using the OmniFocus MCP server with Claude Desktop.

## Available Prompts

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

## V2 Tools Overview

The V2 tools provide a more natural, efficient interface:

### Primary Tools
- **tasks** - Unified task queries with modes (today, overdue, search, etc.)
- **projects** - Project management with operations (list, create, update, etc.)
- **create_task** - Create tasks with all properties including tags
- **update_task** - Update tasks including reparenting
- **complete_task** - Mark tasks complete
- **delete_task** - Remove tasks
- **productivity_stats** - GTD analytics and insights

### Key Improvements
- ✅ Tags assigned during creation (not after)
- ✅ Complex repeat rules supported
- ✅ Task reparenting between projects
- ✅ Perspective queries without window changes
- ✅ 95% faster query performance
- ✅ Summary-first responses for better UX
- ✅ Natural language friendly

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

## Support

- Report issues: [GitHub Issues](https://github.com/kip-d/omnifocus-mcp/issues)
- Documentation: See /docs directory
- Version info: Ask Claude to "show me the MCP server version"