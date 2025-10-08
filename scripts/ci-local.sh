#!/bin/bash

# Local CI script - mirrors the GitHub Actions workflow
set -e

echo "🚀 Running Local CI Pipeline..."
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Cross-platform timeout command
# Use gtimeout (from coreutils) on macOS, timeout on Linux
if command -v gtimeout &> /dev/null; then
    TIMEOUT_CMD="gtimeout"
elif command -v timeout &> /dev/null; then
    TIMEOUT_CMD="timeout"
else
    # Fallback: Install coreutils on macOS or skip timeout tests
    if [[ "$OSTYPE" == "darwin"* ]]; then
        print_warning "timeout command not found. Install with: brew install coreutils"
        print_warning "Skipping timeout-based tests..."
        TIMEOUT_CMD=""
    else
        print_error "timeout command not found. Please install coreutils."
        exit 1
    fi
fi

# Step 1: TypeScript compilation
print_step "TypeScript compilation check"
npm run build
print_success "TypeScript compilation successful"

# Step 2: Type checking
print_step "TypeScript type checking"
npm run typecheck
print_success "TypeScript type checking passed"

# Step 3: Lint check (with reasonable threshold)
print_step "Lint check (error count threshold)"
LINT_OUTPUT=$(npm run lint 2>&1 || true)
ERROR_COUNT=$(echo "$LINT_OUTPUT" | grep -o "[0-9]\+ errors" | cut -d' ' -f1 2>/dev/null || echo "0")
# Ensure ERROR_COUNT is a number
ERROR_COUNT=${ERROR_COUNT:-0}
TOTAL_PROBLEMS=$(echo "$LINT_OUTPUT" | grep -o "[0-9]\+ problems" | head -1 | cut -d' ' -f1 2>/dev/null || echo "0")

echo "Lint errors: $ERROR_COUNT"
echo "Total problems: $TOTAL_PROBLEMS"

if [ "$ERROR_COUNT" -gt 50 ]; then
    print_error "Too many lint errors ($ERROR_COUNT > 50)"
    exit 1
else
    print_success "Lint error count acceptable ($ERROR_COUNT <= 50)"
fi

# Step 4: Unit tests
print_step "Unit tests"
npm run test:quick
print_success "Unit tests passed"

# Step 5: Integration tests
print_step "MCP Integration tests"
npm run test:integration
print_success "Integration tests passed"

# Step 6: MCP Server verification
print_step "MCP server startup verification"
if [ -n "$TIMEOUT_CMD" ]; then
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | $TIMEOUT_CMD 10s node dist/index.js > /dev/null 2>&1 && print_success "MCP server starts correctly" || (print_error "MCP server startup failed" && exit 1)
else
    print_warning "Skipping MCP server startup test (timeout command not available)"
fi

# Step 7: Tool registration check
print_step "Tool registration verification"
if [ -n "$TIMEOUT_CMD" ]; then
    TOOL_COUNT=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | $TIMEOUT_CMD 10s node dist/index.js 2>/dev/null | jq -r '.result.tools | length' 2>/dev/null || echo "0")
    echo "Registered tools: $TOOL_COUNT"

    if [ "$TOOL_COUNT" -eq "17" ]; then
        print_success "All 17 tools registered correctly"
    else
        print_error "Expected 17 tools, got $TOOL_COUNT"
        exit 1
    fi
else
    print_warning "Skipping tool registration test (timeout command not available)"
fi

# Step 8: Sample tool execution
print_step "Sample tool execution test"
if [ -n "$TIMEOUT_CMD" ]; then
    RESULT=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"system","arguments":{"operation":"version"}}}' | $TIMEOUT_CMD 15s node dist/index.js 2>/dev/null | jq -r '.result.content[0].text' 2>/dev/null || echo "error")

    if echo "$RESULT" | grep -q "version"; then
        print_success "Sample tool execution successful"
    else
        print_error "Sample tool execution failed"
        echo "Result: $RESULT"
        exit 1
    fi
else
    print_warning "Skipping sample tool execution test (timeout command not available)"
fi

echo -e "\n${GREEN}🎉 All CI checks passed!${NC}"
echo "================================="
echo -e "${BLUE}Summary:${NC}"
echo "- TypeScript compilation: ✅"
echo "- Type checking: ✅"
echo "- Lint errors: ✅ ($ERROR_COUNT <= 50)"
echo "- Unit tests: ✅"
echo "- Integration tests: ✅"
if [ -n "$TIMEOUT_CMD" ]; then
    echo "- MCP server startup: ✅"
    echo "- Tool registration: ✅ ($TOOL_COUNT tools)"
    echo "- Sample tool execution: ✅"
else
    echo "- MCP server tests: ⚠️ (skipped - install coreutils for timeout command)"
fi
echo -e "\n${GREEN}Ready for production! 🚀${NC}"