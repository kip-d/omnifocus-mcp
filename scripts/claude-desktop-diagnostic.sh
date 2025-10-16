#!/bin/bash

echo "=== Claude Desktop MCP Diagnostic Tool ==="
echo "Date: $(date)"
echo

echo "=== System Information ==="
echo "OS: $(uname -s) $(uname -r)"
echo "Architecture: $(uname -m)"
echo "Node.js: $(node --version 2>/dev/null || echo 'Not found')"
echo "npm: $(npm --version 2>/dev/null || echo 'Not found')"
echo

echo "=== Claude Desktop Version ==="
if [[ "$OSTYPE" == "darwin"* ]]; then
    CLAUDE_APP="/Applications/Claude.app"
    if [ -d "$CLAUDE_APP" ]; then
        echo "Claude Desktop found at: $CLAUDE_APP"
        echo "Version: $(defaults read "$CLAUDE_APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo 'Cannot read version')"
        echo "Build: $(defaults read "$CLAUDE_APP/Contents/Info" CFBundleVersion 2>/dev/null || echo 'Cannot read build')"
    else
        echo "Claude Desktop not found at expected location"
    fi
else
    echo "Non-macOS system - please check Claude Desktop version manually"
fi
echo

echo "=== MCP Configuration ==="
CONFIG_FILE="$HOME/.config/claude/claude_desktop_config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "Config file found: $CONFIG_FILE"
    echo "Config contents:"
    cat "$CONFIG_FILE" | jq . 2>/dev/null || cat "$CONFIG_FILE"
else
    echo "❌ No MCP config file found at: $CONFIG_FILE"
    echo "Expected location for MCP server configuration"
fi
echo

echo "=== OmniFocus MCP Server Test ==="
cd "$(dirname "$0")"

if [ ! -f "dist/index.js" ]; then
    echo "❌ MCP server not built. Running npm run build..."
    npm run build
fi

if [ -f "dist/index.js" ]; then
    echo "✅ MCP server binary found"
    
    echo
    echo "--- Testing server initialization ---"
    timeout 10s node dist/index.js < /dev/null > /tmp/mcp_init_test.log 2>&1 &
    MCP_PID=$!
    sleep 2
    
    if kill -0 $MCP_PID 2>/dev/null; then
        echo "✅ Server starts successfully"
        kill $MCP_PID 2>/dev/null
        wait $MCP_PID 2>/dev/null
    else
        echo "❌ Server failed to start"
        echo "Error output:"
        cat /tmp/mcp_init_test.log
    fi
    
    echo
    echo "--- Testing tools/list method ---"
    TOOLS_OUTPUT=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 10s node dist/index.js 2>/dev/null)
    if echo "$TOOLS_OUTPUT" | jq -e '.result.tools | length' > /dev/null 2>&1; then
        TOOL_COUNT=$(echo "$TOOLS_OUTPUT" | jq -r '.result.tools | length')
        echo "✅ tools/list returns $TOOL_COUNT tools"
        
        # Check first tool schema validity
        FIRST_TOOL_SCHEMA=$(echo "$TOOLS_OUTPUT" | jq -r '.result.tools[0].inputSchema')
        if echo "$FIRST_TOOL_SCHEMA" | jq -e '.type' > /dev/null 2>&1; then
            echo "✅ First tool has valid schema structure"
        else
            echo "❌ First tool schema appears malformed"
        fi
        
        # Check response size
        RESPONSE_SIZE=$(echo "$TOOLS_OUTPUT" | wc -c)
        echo "Response size: ${RESPONSE_SIZE} bytes"
        if [ "$RESPONSE_SIZE" -gt 50000 ]; then
            echo "⚠️  Large response size may cause issues"
        fi
    else
        echo "❌ tools/list method failed"
        echo "Output: $TOOLS_OUTPUT"
    fi
    
    echo
    echo "--- Testing prompts/list method ---"
    PROMPTS_OUTPUT=$(echo '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}' | timeout 10s node dist/index.js 2>/dev/null)
    if echo "$PROMPTS_OUTPUT" | jq -e '.result.prompts | length' > /dev/null 2>&1; then
        PROMPT_COUNT=$(echo "$PROMPTS_OUTPUT" | jq -r '.result.prompts | length')
        echo "✅ prompts/list returns $PROMPT_COUNT prompts"
    else
        echo "❌ prompts/list method failed"
    fi
    
else
    echo "❌ MCP server binary not found - run 'npm run build'"
fi

echo
echo "=== Claude Desktop Log Locations ==="
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS log locations to check:"
    echo "1. Console.app -> search for 'Claude' or 'MCP'"
    echo "2. ~/Library/Logs/Claude/"
    echo "3. System logs: log show --predicate 'process == \"Claude\"' --last 1h"
else
    echo "Check system logs for Claude Desktop errors"
fi

echo
echo "=== Known Issues & Solutions ==="
echo "Claude Desktop 0.12.129 known issues:"
echo "• Tools not appearing despite server being listed"
echo "• Cannot toggle MCP servers on/off"
echo "• Prompts work but tools don't register"
echo
echo "Troubleshooting steps:"
echo "1. Restart Claude Desktop completely"
echo "2. Check that config file has proper JSON syntax"
echo "3. Verify server runs independently (see tests above)"
echo "4. Try with a minimal MCP server to isolate issue"
echo "5. Check Claude Desktop logs for error messages"
echo

echo "=== Diagnostic Complete ==="
echo "If server tests pass but Claude Desktop doesn't show tools,"
echo "this indicates a Claude Desktop client issue, not a server problem."