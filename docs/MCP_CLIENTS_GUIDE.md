# MCP Clients Guide for OmniFocus Users

This guide helps OmniFocus users find MCP clients that fully support all features of the OmniFocus MCP server, including prompts that Claude Desktop doesn't yet support.

## Quick Comparison

| Client | Platform | Prompts | User-Friendly | Free | macOS Native |
|--------|----------|---------|---------------|------|--------------|
| Claude Desktop | macOS/Win | ❌ | ✅✅✅ | ✅ | ✅ |
| Cline 3.0 | VS Code | ✅ | ✅✅ | ✅ | ✅ |
| Continue | VS Code/JetBrains | ✅ | ✅✅ | ✅ | ✅ |
| AIQL TUUI | Desktop | ✅ | ✅✅ | ? | ✅ |
| MCP Inspector | Browser | ✅ | ✅ | ✅ | ✅ |
| Glama | Web/Desktop | ✅ | ✅✅✅ | ? | ✅ |

## Recommended for macOS OmniFocus Users

### 1. **Cline 3.0** (Best Overall Alternative)
**Platform**: VS Code Extension (macOS native)  
**Website**: Install from VS Code Marketplace → "Cline"

**Why it's great for OmniFocus users:**
- Full MCP prompts support - access all 8 GTD and reference prompts
- Chat interface similar to Claude Desktop
- Can create custom MCP tools on demand
- One-click MCP server installation
- Active community and marketplace

**Setup:**
1. Install VS Code (if not already installed)
2. Install Cline extension
3. Configure MCP connection to OmniFocus server
4. Access prompts via `/` commands (e.g., `/gtd_weekly_review`)

### 2. **Continue** (For Developers)
**Platform**: VS Code & JetBrains IDEs  
**Website**: continue.dev

**Why it's great:**
- Prompts appear as slash commands
- Integrates with your coding workflow
- Good for developers already using IDEs
- Supports multiple AI models

**Setup:**
```json
{
  "experimental": {
    "modelContextProtocol": {
      "servers": {
        "omnifocus": {
          "transport": {
            "type": "stdio",
            "command": "node",
            "args": ["/path/to/omnifocus-mcp/dist/index.js"]
          }
        }
      }
    }
  }
}
```

### 3. **AIQL TUUI** (Standalone Desktop App)
**Platform**: Native macOS app  
**Status**: Check availability

**Why it's interesting:**
- Native cross-platform desktop application
- Not tied to any IDE
- Supports multiple AI providers
- Full MCP prompts support

### 4. **MCP Inspector** (For Testing/Learning)
**Platform**: Browser-based  
**Command**: `npx @modelcontextprotocol/inspector node dist/index.js`

**Why it's useful:**
- No installation required
- Great for testing and learning MCP features
- See all available prompts, tools, and resources
- Browser-based UI works on any macOS machine

## Features You're Missing in Claude Desktop

When you use Claude Desktop, you can't access these MCP prompts:

### GTD Workflow Prompts
1. **gtd_principles** - Complete GTD methodology guide
2. **gtd_weekly_review** - Interactive weekly review process
3. **gtd_process_inbox** - Inbox processing workflow

### Reference Prompts
4. **tool_discovery_guide** - All 28 tools explained
5. **common_patterns_guide** - Best practices and examples
6. **troubleshooting_guide** - Solutions to common issues
7. **tag_performance_guide** - Tag optimization strategies
8. **quick_reference** - Performance cheat sheet

These prompts provide interactive guides and structured workflows that enhance the OmniFocus MCP experience significantly.

## Installation Guide for Cline (Recommended)

Since Cline is the most user-friendly alternative for macOS users:

1. **Install VS Code** (if needed)
   - Download from: https://code.visualstudio.com/
   - macOS native application

2. **Install Cline Extension**
   - Open VS Code
   - Go to Extensions (⇧⌘X)
   - Search for "Cline"
   - Click Install

3. **Configure OmniFocus MCP**
   - Open Cline settings
   - Add MCP server configuration:
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

4. **Use Prompts**
   - Type `/` in Cline chat to see available prompts
   - Select prompts like `/gtd_weekly_review`
   - Follow interactive guides

## Future Outlook

- **Claude Desktop**: Anthropic will likely add prompt support in future updates
- **More macOS Clients**: As MCP gains adoption, expect more native macOS clients
- **OmniFocus Integration**: Potential for direct OmniFocus MCP integration

## Getting Help

- **MCP Documentation**: https://modelcontextprotocol.io/
- **Cline Documentation**: https://cline.bot/
- **Our GitHub**: Report issues with OmniFocus MCP server

## Note for Power Users

If you're comfortable with command line tools, you can also:
- Use the Python or TypeScript MCP SDKs to build custom clients
- Create shell scripts that interact with MCP servers
- Build Shortcuts or Automator workflows that leverage MCP

---

*Last updated: January 2025*