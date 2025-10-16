#!/bin/bash

# Git bisect test script to find when CLI testing broke
# This script tests if manage_task create operation works in CLI environment
# Returns 0 (good) if it works, 1 (bad) if it fails

set -e  # Exit on any error

echo "=== Git Bisect CLI Test - Testing commit $(git rev-parse --short HEAD) ==="

# Check if package.json exists (early commits might not have proper structure)
if [ ! -f "package.json" ]; then
    echo "❌ No package.json found - too early in history"
    exit 1
fi

# Check if src directory exists
if [ ! -d "src" ]; then
    echo "❌ No src directory found - too early in history"  
    exit 1
fi

# Try to build the project
echo "🔨 Building project..."
if ! npm run build 2>/dev/null >/dev/null; then
    echo "❌ Build failed - likely compilation errors in this commit"
    exit 1
fi

# Check if dist/index.js exists after build
if [ ! -f "dist/index.js" ]; then
    echo "❌ No dist/index.js after build - build incomplete"
    exit 1
fi

# Test basic MCP functionality first  
echo "🧪 Testing basic MCP functionality..."
BASIC_TEST=$(timeout 10s node dist/index.js 2>/dev/null <<'EOF' | head -1
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
)

if [[ "$BASIC_TEST" != *"jsonrpc"* ]]; then
    echo "❌ Basic MCP not working - MCP protocol issue"
    exit 1
fi

# Test manage_task create operation (the key test)
echo "🎯 Testing manage_task create operation..."
# Create a temporary script that keeps stdin open longer
TEST_RESULT=$(
cat <<'EOF' | MCP_CLI_TESTING=1 timeout 15s node dist/index.js 2>&1
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"manage_task","arguments":{"operation":"create","name":"Bisect Test Task"}}}
EOF
)

# Check if we got a proper response (not just a hang or timeout)
if [[ -z "$TEST_RESULT" ]]; then
    echo "❌ No response from manage_task - likely hanging or broken"
    exit 1
fi

# Check if we got CLI debug output indicating success
if echo "$TEST_RESULT" | grep -q "\[CLI_DEBUG\].*SUCCESS"; then
    echo "✅ manage_task create operation successful!"
    # Show debug info
    echo "$TEST_RESULT" | grep "\[CLI_DEBUG\]"
    exit 0
elif echo "$TEST_RESULT" | grep -q "\[CLI_DEBUG\].*ERROR"; then
    ERROR_MSG=$(echo "$TEST_RESULT" | grep "\[CLI_DEBUG\].*Error:" | head -1)
    echo "❌ manage_task returned error: $ERROR_MSG"
    exit 1
elif echo "$TEST_RESULT" | grep -q '"error"'; then
    ERROR_MSG=$(echo "$TEST_RESULT" | grep -o '"message":"[^"]*"' | head -1)
    echo "❌ manage_task returned JSON error: $ERROR_MSG"
    exit 1
elif echo "$TEST_RESULT" | grep -q '"result"'; then
    echo "✅ manage_task got JSON result (no CLI debug, but working)"
    exit 0
else
    echo "❌ No clear success or error indication from manage_task"
    echo "Response preview: $(echo "$TEST_RESULT" | head -3)"
    exit 1
fi