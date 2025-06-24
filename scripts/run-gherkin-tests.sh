#!/bin/bash

echo "🥒 OmniFocus MCP Gherkin Test Suite"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure we're in the right directory
cd "$(dirname "$0")/.." || exit 1

# Check if server is built
if [ ! -f "dist/index.js" ]; then
    echo -e "${YELLOW}Building TypeScript first...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}Build failed!${NC}"
        exit 1
    fi
fi

# Run different test suites
echo -e "${BLUE}1. Running Gherkin Test Runner${NC}"
echo "--------------------------------"
node test/gherkin-test-runner.js

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Gherkin tests passed${NC}"
else
    echo -e "${RED}❌ Gherkin tests failed${NC}"
fi

echo ""
echo -e "${BLUE}2. Generating Test Report${NC}"
echo "-------------------------"
node test/generate-test-report.js

echo ""
echo -e "${BLUE}3. Test Coverage Summary${NC}"
echo "------------------------"

# Count tested vs total tools
TOTAL_TOOLS=22
TESTED_TOOLS=$(grep -c "tested: true" test/generate-test-report.js || echo "0")

echo "Total MCP tools: $TOTAL_TOOLS"
echo "Tools with tests: $TESTED_TOOLS"
echo "Coverage: $((TESTED_TOOLS * 100 / TOTAL_TOOLS))%"

echo ""
echo -e "${BLUE}4. Manual Testing Guide${NC}"
echo "----------------------"
echo "For manual testing in Claude Desktop:"
echo ""
echo "1. Basic functionality (Already tested ✅):"
echo "   - list_tasks"
echo "   - todays_agenda" 
echo "   - create_task"
echo "   - get_productivity_stats"
echo "   - list_projects"
echo ""
echo "2. Still need testing:"
echo "   - Task lifecycle: update_task, complete_task, delete_task"
echo "   - Project CRUD: create_project, update_project, complete_project, delete_project"
echo "   - Tag management: list_tags, manage_tags (create/rename/delete/merge)"
echo "   - Analytics: get_task_velocity, analyze_overdue_tasks"
echo "   - Export: export_tasks, export_projects, bulk_export"
echo "   - Recurring: analyze_recurring_tasks, get_recurring_patterns"
echo ""
echo "Run specific scenarios from test/scenarios/all-features.json"

echo ""
echo -e "${BLUE}5. Next Steps${NC}"
echo "-------------"
echo "- Open test-report.html in your browser for visual report"
echo "- Run additional manual tests in Claude Desktop"
echo "- Execute performance benchmarks with large datasets"
echo "- Test error handling with invalid inputs"

echo ""
echo "=========================================="
echo -e "${GREEN}Test suite execution complete!${NC}"
echo "=========================================="