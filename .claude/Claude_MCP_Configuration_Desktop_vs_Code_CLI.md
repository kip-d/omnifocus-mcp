# Claude MCP Configuration - Desktop vs Code CLI

## Overview

Claude Desktop and Claude Code CLI handle MCP (Model Context Protocol) server configurations differently, using separate configuration files and locations.

## Configuration File Locations

### Claude Desktop
- **Location**: `~/.claude/mcp.json`
- **Purpose**: Configures MCP servers for the Claude Desktop application
- **Management**: Edited directly or through the desktop app settings

### Claude Code CLI
- **Location**: `.mcp.json` in the project root directory
- **Purpose**: Configures MCP servers for the Claude Code CLI tool
- **Management**: Can be edited directly or using `claude add mcp` command
- **Note**: Project-specific configuration allows different MCP servers per project

## Important Distinctions

### ~/.claude.json Does NOT Contain MCP Servers
The `~/.claude.json` file is used for Claude Code CLI settings like:
- API keys
- Model preferences
- General CLI configurations

**It does NOT contain MCP server configurations** - those are stored separately in `.mcp.json`

### Why Separate Configuration?

1. **Isolation**: Desktop and CLI tools have different runtime environments and requirements
2. **Flexibility**: Allows project-specific MCP configurations for Claude Code
3. **Security**: Keeps server configurations separate from general settings
4. **Portability**: Project MCP configs can be committed to version control

## Example Configuration

Here's an example of the omnifocus-mcp-cached configuration that can be added to `.mcp.json`:

```json
{
  "mcpServers": {
    "omnifocus-mcp-cached": {
      "command": "node",
      "args": [
        "/Users/guillaume/Library/Application Support/Claude/MCP/servers/omnifocus-mcp-cached/dist/index.js"
      ]
    }
  }
}
```

## Adding MCP Servers to Claude Code

To add an MCP server to your Claude Code project:

```bash
# Interactive command to add MCP server
claude add mcp

# Or manually edit .mcp.json in your project root
```

## Key Takeaways

- Claude Desktop and Claude Code CLI use completely separate MCP configurations
- Desktop uses `~/.claude/mcp.json`, CLI uses `.mcp.json` in project root
- The `~/.claude.json` file is for CLI settings only, not MCP servers
- Project-specific MCP configurations provide flexibility and portability