#!/bin/bash

echo "🥒 Running Cucumber Tests for OmniFocus MCP"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Ensure we're in the right directory
cd "$(dirname "$0")/.." || exit 1

# Check if built
if [ ! -f "dist/index.js" ]; then
    echo -e "${YELLOW}Building TypeScript first...${NC}"
    npm run build
fi

# Create test results directory
mkdir -p test-results

echo "Running Cucumber tests..."
echo ""

# Run Cucumber with simpler format
npx cucumber-js test/features/basic-tests.feature \
  --format progress \
  --format json:test-results/cucumber-results.json \
  --publish-quiet

CUCUMBER_EXIT_CODE=$?

echo ""
echo "==========================================="

if [ $CUCUMBER_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ All Cucumber tests passed!${NC}"
else
    echo -e "${RED}❌ Some Cucumber tests failed${NC}"
    echo ""
    echo "To see detailed results:"
    echo "  cat test-results/cucumber-results.json | jq '.'"
fi

echo ""
echo "Test Summary:"
echo "-------------"

# Parse results if jq is available
if command -v jq &> /dev/null && [ -f "test-results/cucumber-results.json" ]; then
    TOTAL=$(jq '[.[] | .elements[]] | length' test-results/cucumber-results.json)
    PASSED=$(jq '[.[] | .elements[] | select(.steps[].result.status == "passed")] | length' test-results/cucumber-results.json 2>/dev/null || echo "0")
    FAILED=$(jq '[.[] | .elements[] | select(.steps[].result.status == "failed")] | length' test-results/cucumber-results.json 2>/dev/null || echo "0")
    
    echo "Total scenarios: $TOTAL"
    echo -e "Passed: ${GREEN}$PASSED${NC}"
    echo -e "Failed: ${RED}$FAILED${NC}"
else
    echo "Install jq for detailed test summary"
fi

echo ""
echo "Next Steps:"
echo "-----------"
echo "1. Fix failing tests by updating step definitions"
echo "2. Add more scenarios to test all 22 tools"
echo "3. Run full test suite: ./scripts/run-all-tests.sh"
echo "4. Generate HTML report: node test/generate-test-report.js"

exit $CUCUMBER_EXIT_CODE