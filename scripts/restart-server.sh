#!/bin/bash

echo "Restarting OmniFocus MCP server..."

# Kill any existing processes
echo "Killing existing processes..."
pkill -f "omnifocus-mcp-cached" || true
sleep 1

# Rebuild
echo "Building server..."
npm run build

# Test the server
echo "Testing server..."
if node scripts/test-mcp.js dist/index.js; then
    echo "✅ Server test passed!"
else
    echo "❌ Server test failed!"
    exit 1
fi

echo ""
echo "Server is ready. Please restart Claude Desktop to connect."
echo ""
echo "To manually test in Claude Desktop:"
echo "1. Quit Claude Desktop completely"
echo "2. Reopen Claude Desktop"
echo "3. Start a new conversation"
echo ""
echo "The server binary is at: /usr/local/bin/omnifocus-mcp-cached"