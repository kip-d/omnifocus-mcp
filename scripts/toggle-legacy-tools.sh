#!/bin/bash

# Toggle between all tools (3+17) and 3-tools-only mode
# Usage: ./scripts/toggle-legacy-tools.sh [enable|disable]

set -e

TOOLS_FILE="src/tools/index.ts"
BACKUP_FILE="src/tools/index.ts.backup"

if [ "$1" == "disable" ]; then
    echo "🚫 Disabling 17 legacy tools (keeping only 3 unified tools)..."

    # Backup original file
    cp "$TOOLS_FILE" "$BACKUP_FILE"

    # Comment out legacy tools (lines with "new" instantiations after the unified tools)
    # This is a safer approach than trying to comment specific lines
    sed -i.tmp '/\/\/ Task operations (2 tools)/,/new SystemToolV2(cache)/s/^    new /    \/\/ new /' "$TOOLS_FILE"
    rm "${TOOLS_FILE}.tmp"

    echo "✅ Legacy tools disabled"
    echo "📦 Rebuilding..."
    npm run build

    echo ""
    echo "🧪 Verifying only 3 tools registered..."
    TOOL_COUNT=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js 2>&1 | grep -c '"name":' || echo "0")

    if [ "$TOOL_COUNT" == "3" ]; then
        echo "✅ SUCCESS: Only 3 tools registered (omnifocus_read, omnifocus_write, omnifocus_analyze)"
    else
        echo "❌ ERROR: Expected 3 tools, found $TOOL_COUNT"
        echo "   Restoring original file..."
        mv "$BACKUP_FILE" "$TOOLS_FILE"
        npm run build
        exit 1
    fi

    echo ""
    echo "🎯 Ready for 3-tools-only testing!"
    echo "   Use TESTING_PROMPT.md with Claude Desktop"
    echo "   When done, run: ./scripts/toggle-legacy-tools.sh enable"

elif [ "$1" == "enable" ]; then
    echo "✅ Restoring all 20 tools (3 unified + 17 legacy)..."

    if [ ! -f "$BACKUP_FILE" ]; then
        echo "❌ ERROR: No backup file found. Run 'disable' first."
        exit 1
    fi

    # Restore original file
    mv "$BACKUP_FILE" "$TOOLS_FILE"

    echo "📦 Rebuilding..."
    npm run build

    echo ""
    echo "🧪 Verifying 20 tools registered..."
    TOOL_COUNT=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js 2>&1 | grep -c '"name":' || echo "0")

    if [ "$TOOL_COUNT" == "20" ]; then
        echo "✅ SUCCESS: All 20 tools registered (3 unified + 17 legacy)"
    else
        echo "⚠️  WARNING: Expected 20 tools, found $TOOL_COUNT"
    fi

    echo ""
    echo "✅ All tools restored!"

else
    echo "Usage: $0 [enable|disable]"
    echo ""
    echo "  disable - Comment out 17 legacy tools (keep only 3 unified tools)"
    echo "  enable  - Restore all 20 tools (3 unified + 17 legacy)"
    echo ""
    echo "Examples:"
    echo "  $0 disable  # Test with only 3 tools"
    echo "  $0 enable   # Restore all tools"
    exit 1
fi
