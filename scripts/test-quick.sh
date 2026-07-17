#!/bin/bash

# Quick test suite for rapid development iteration
# Essential validation only - fails fast

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}⚡ Quick Test Suite${NC}"
echo "=================="

# Essential environment checks
echo -e "${YELLOW}⏳ Environment check${NC}"
curl -f http://localhost:11434/api/version > /dev/null 2>&1 || (echo -e "${RED}❌ Ollama not running${NC}" && exit 1)
osascript -e 'tell application "OmniFocus" to return name of default document' > /dev/null || (echo -e "${RED}❌ OmniFocus not accessible${NC}" && exit 1)

# Build and core functionality
echo -e "${YELLOW}⏳ Build and integration${NC}"
npm run build > /dev/null || (echo -e "${RED}❌ Build failed${NC}" && exit 1)
npm run test:integration > /dev/null || (echo -e "${RED}❌ Integration tests failed${NC}" && exit 1)

# Key tool validation
# Driver invocation mirrors test-comprehensive.sh's $VERIFY (minus CI=true) —
# if you change the invocation there, change it here too.
echo -e "${YELLOW}⏳ Core tools${NC}"
npx tsx scripts/verify-deploy.ts dist/index.js --timeout 30000 tasks '{"mode":"today","limit":"3","details":"true"}' > /dev/null || (echo -e "${RED}❌ Tasks tool failed${NC}" && exit 1)

# Real LLM - key improvement test (M2 MacBook Air: ~30-60s expected)
echo -e "${YELLOW}⏳ Real LLM (overdue query)${NC}"
env ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts --run --testTimeout=120000 -t "should understand.*overdue" --reporter=basic > /dev/null || (echo -e "${RED}❌ Real LLM test failed${NC}" && exit 1)

echo -e "${GREEN}✅ Quick tests passed! Ready for development.${NC}"