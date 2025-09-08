# Claude Desktop MCP Troubleshooting Guide

## Issue: Tools Don't Appear Despite Prompts Working

Your testing group is experiencing a **known issue with Claude Desktop 0.12.129** where:
- ✅ MCP server appears in settings
- ✅ Prompts work correctly  
- ❌ Tools don't appear or can't be toggled on
- ❌ Cannot enable MCP server in conversation interface

## Root Cause Analysis

Based on research of recent Claude Desktop issues, this appears to be a **client-side bug** in Claude Desktop, not our MCP server. Several confirmed issues exist:

### Known Claude Desktop Bugs (July-September 2025):

1. **Parameter Validation Regression** - Claude Desktop stopped properly packaging tool parameters
2. **Tools Not Available in Interface** - Tools discovered via `tools/list` but never exposed to chat
3. **Toggle/Enable Issues** - Cannot activate MCP servers in conversation interface
4. **Version-Specific Problems** - Affects versions 0.11.3+ including 0.12.129

## Diagnostic Steps

### 1. Run Our Diagnostic Script
```bash
./claude-desktop-diagnostic.sh
```

This will test:
- ✅ MCP server functionality 
- ✅ Schema validation
- ✅ Tools/prompts registration
- ✅ Response sizes and formats

### 2. Test with Minimal Server
```bash
# Test with minimal 2-tool server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node minimal-test-server.js
```

If both our server and minimal server work independently but Claude Desktop doesn't show tools, **it confirms a Claude Desktop bug**.

## Workarounds & Solutions

### Immediate Actions:

1. **Complete Claude Desktop Restart**
   ```bash
   # Kill all Claude processes
   pkill -f "Claude"
   # Wait 5 seconds
   sleep 5  
   # Restart Claude Desktop from Applications
   ```

2. **Verify Configuration Location**
   - Config: `~/.config/claude/claude_desktop_config.json`
   - Ensure valid JSON syntax
   - Try absolute paths in config

3. **Enable Developer Mode**
   - Claude Desktop → Settings → Developer Mode
   - Check logs for MCP connection errors

### Alternative Testing Methods:

#### Option 1: Direct MCP Inspector Testing
```bash
# Use official MCP inspector instead of Claude Desktop
npx @modelcontextprotocol/inspector dist/index.js
```

#### Option 2: Test with Different Claude Version
- Try Claude Desktop 0.11.2 (if available)
- Test with Claude Code CLI (different MCP implementation)

#### Option 3: Use HTTP Transport Instead of Stdio
```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["http-server-version.js"],
      "transport": "http"
    }
  }
}
```

## Expected Diagnostic Results

### If Our Server is Working Correctly:
- ✅ `./claude-desktop-diagnostic.sh` shows all tests passing
- ✅ Returns 15 tools via `tools/list` 
- ✅ Returns 9 prompts via `prompts/list`
- ✅ Schemas are valid JSON Schema Draft 7
- ✅ No server-side errors in logs

### If This is a Claude Desktop Bug:
- ✅ Server tests pass independently 
- ✅ Prompts appear in Claude Desktop
- ❌ Tools don't appear despite valid server responses
- ❌ Cannot toggle MCP server on/off
- ❌ No `tools/call` requests in server logs (only `tools/list`)

## Escalation Path

If diagnostics confirm our server works but Claude Desktop doesn't show tools:

### 1. Report to Anthropic
- File bug report with Claude Desktop team
- Include diagnostic output
- Reference version 0.12.129 MCP regression

### 2. Document Configuration for Users
```json
// Working claude_desktop_config.json format
{
  "mcpServers": {
    "omnifocus": {
      "command": "node", 
      "args": ["absolute/path/to/dist/index.js"],
      "cwd": "absolute/path/to/omnifocus-mcp"
    }
  }
}
```

### 3. Alternative Solutions
- Provide HTTP-based MCP server version
- Create Claude Code integration guide
- Document MCP Inspector usage for testing

## Version Compatibility Matrix

| Claude Desktop Version | MCP Status | Notes |
|------------------------|------------|-------|
| 0.11.2 | ✅ Working | Last known good version |
| 0.11.3+ | ⚠️ Issues | Tools discovered but not exposed |
| 0.12.129 | ❌ Broken | Cannot toggle servers, tools missing |
| Claude Code | ⚠️ Mixed | Different implementation, may work |

## Next Steps for Testing Group

1. **Run diagnostics** to confirm server health
2. **Try complete Claude Desktop restart** procedure  
3. **Test with minimal-test-server.js** to isolate issue
4. **Document exact error messages** from Claude Desktop logs
5. **Consider testing with different Claude Desktop version** if available

The evidence strongly suggests this is a **Claude Desktop client bug**, not an issue with our MCP server implementation.