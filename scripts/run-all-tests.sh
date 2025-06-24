#!/bin/bash

echo "=========================================="
echo "OmniFocus MCP Server - Complete Test Suite"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "\n${YELLOW}Running: $test_name${NC}"
    echo "Command: $test_command"
    echo "----------------------------------------"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ $test_name PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ $test_name FAILED${NC}"
        ((TESTS_FAILED++))
    fi
}

# Ensure we're in the right directory
cd "$(dirname "$0")/.." || exit 1

echo "Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Run type checking
run_test "TypeScript Type Check" "npm run typecheck"

# Run our custom tests
run_test "Claude Desktop Protocol E2E Test" "node test/e2e/test-claude-protocol.js ./dist/index.js"
run_test "MCP Integration Test" "node test/integration/mcp-server.test.js"
run_test "Claude Code MCP Test" "node test/claude-code-mcp.js"

# Test a few specific tools
echo -e "\n${YELLOW}Testing specific new features...${NC}"

# Create a quick feature test script
cat > /tmp/test-new-features.js << 'EOF'
#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const server = spawn('node', ['./dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let messageId = 0;
const tests = [
  { name: 'get_productivity_stats', args: { period: 'week' } },
  { name: 'list_tags', args: { sortBy: 'name' } },
  { name: 'export_tasks', args: { format: 'json', filter: { available: true } } }
];

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

let currentTest = 0;
let passed = 0;

rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    if (response.id === 1) {
      // Init successful, start testing tools
      testNextTool();
    } else if (response.id > 1) {
      // Tool test result
      if (response.result) {
        console.log(`✅ ${tests[currentTest - 1].name} works`);
        passed++;
      } else {
        console.log(`❌ ${tests[currentTest - 1].name} failed:`, response.error?.message || 'Unknown error');
      }
      
      if (currentTest < tests.length) {
        testNextTool();
      } else {
        console.log(`\nNew features test: ${passed}/${tests.length} passed`);
        server.kill();
        process.exit(passed === tests.length ? 0 : 1);
      }
    }
  } catch (e) {
    // Ignore non-JSON
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

// Initialize
server.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' }
  }
}) + '\n');

function testNextTool() {
  if (currentTest >= tests.length) return;
  
  const test = tests[currentTest];
  currentTest++;
  
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: currentTest + 1,
    method: 'tools/call',
    params: {
      name: test.name,
      arguments: test.args
    }
  }) + '\n');
}

setTimeout(() => {
  console.error('Test timeout');
  server.kill();
  process.exit(1);
}, 30000);
EOF

run_test "New Features Functionality Test" "node /tmp/test-new-features.js"

# Clean up
rm -f /tmp/test-new-features.js

# Final summary
echo ""
echo "=========================================="
echo "Test Suite Summary"
echo "=========================================="
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo "Total tests: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo ""
    echo "The MCP server is working correctly and all new features are functional:"
    echo "• Analytics tools (productivity stats, task velocity, overdue analysis)"
    echo "• Tag management (list, create, rename, delete, merge)"
    echo "• Export functionality (JSON/CSV for tasks and projects)"
    echo "• Recurring task analysis"
    echo "• Project CRUD operations"
    echo "• Enhanced search and filtering"
    echo ""
    echo "You can now use the server with Claude Desktop!"
    exit 0
else
    echo ""
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo "Please check the output above for details."
    exit 1
fi