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
echo -e "${YELLOW}⏳ Core tools${NC}"
node test-single-tool-proper.js tasks '{"mode":"today","limit":"3","details":"true"}' > /dev/null || (echo -e "${RED}❌ Tasks tool failed${NC}" && exit 1)

# Real LLM - key improvement test
echo -e "${YELLOW}⏳ Real LLM (overdue query)${NC}"
env ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts --run --testTimeout=30000 -t "should understand.*overdue" --reporter=basic > /dev/null || (echo -e "${RED}❌ Real LLM test failed${NC}" && exit 1)

echo -e "${GREEN}✅ Quick tests passed! Ready for development.${NC}"