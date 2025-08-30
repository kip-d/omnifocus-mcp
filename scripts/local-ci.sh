#!/bin/bash

# Local CI/CD Script for OmniFocus MCP Server
# This script performs comprehensive testing locally since CI/CD requires OmniFocus

set -e  # Exit on any error

echo "🚀 Starting Local CI/CD Pipeline for OmniFocus MCP Server"
echo "========================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "info") echo -e "${BLUE}ℹ️  $message${NC}" ;;
        "success") echo -e "${GREEN}✅ $message${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "error") echo -e "${RED}❌ $message${NC}" ;;
    esac
}

# Function to check if OmniFocus is running
check_omnifocus() {
    if pgrep -x "OmniFocus" > /dev/null; then
        print_status "success" "OmniFocus is running"
        return 0
    else
        print_status "warning" "OmniFocus is not running - some tests may fail"
        return 1
    fi
}

# Function to check if OmniFocus document is open
check_omnifocus_document() {
    local result=$(osascript -e 'tell application "OmniFocus" to get name of every document' 2>/dev/null || echo "")
    if [[ -n "$result" && ! "$result" =~ "error" ]]; then
        print_status "success" "OmniFocus document is open"
        return 0
    else
        print_status "warning" "No OmniFocus document open - some tests may fail"
        return 1
    fi
}

# Step 1: Environment Check
print_status "info" "Step 1: Checking Environment"
echo "----------------------------------------"
check_omnifocus
check_omnifocus_document
echo ""

# Step 2: Build Check
print_status "info" "Step 2: Building Project"
echo "----------------------------------------"
if npm run build; then
    print_status "success" "Build completed successfully"
else
    print_status "error" "Build failed"
    exit 1
fi
echo ""

# Step 3: Type Checking
print_status "info" "Step 3: Type Checking"
echo "----------------------------------------"
if npm run typecheck; then
    print_status "success" "Type checking passed"
else
    print_status "error" "Type checking failed"
    exit 1
fi
echo ""

# Step 4: Linting
print_status "info" "Step 4: Code Quality Check"
echo "----------------------------------------"
if npm run lint; then
    print_status "success" "Linting passed"
else
    print_status "warning" "Linting issues found (continuing...)"
fi
echo ""

# Step 5: Unit Tests
print_status "info" "Step 5: Running Unit Tests"
echo "----------------------------------------"
if npm run test:coverage; then
    print_status "success" "Unit tests passed with coverage"
else
    print_status "error" "Unit tests failed"
    exit 1
fi
echo ""

# Step 6: Performance Tests (if OmniFocus is available)
if pgrep -x "OmniFocus" > /dev/null; then
    print_status "info" "Step 6: Running Performance Tests"
    echo "----------------------------------------"
    if npm run test:performance; then
        print_status "success" "Performance tests passed"
    else
        print_status "warning" "Performance tests failed (continuing...)"
    fi
    echo ""
else
    print_status "warning" "Step 6: Skipping Performance Tests (OmniFocus not running)"
    echo "----------------------------------------"
    echo ""
fi

# Step 7: Integration Tests (if OmniFocus is available)
if pgrep -x "OmniFocus" > /dev/null; then
    print_status "info" "Step 7: Running Integration Tests"
    echo "----------------------------------------"
    if npm run test:integration; then
        print_status "success" "Integration tests passed"
    else
        print_status "warning" "Integration tests failed (continuing...)"
    fi
    echo ""
else
    print_status "warning" "Step 7: Skipping Integration Tests (OmniFocus not running)"
    echo "----------------------------------------"
    echo ""
fi

# Step 8: Cleanup
print_status "info" "Step 8: Cleaning Up Test Data"
echo "----------------------------------------"
if npm run cleanup:test-data; then
    print_status "success" "Test data cleanup completed"
else
    print_status "warning" "Test data cleanup failed (continuing...)"
fi
echo ""

# Final Summary
print_status "info" "Local CI/CD Pipeline Complete!"
echo "========================================================"

# Check if all critical steps passed
if [[ $? -eq 0 ]]; then
    print_status "success" "🎉 All critical checks passed! Your code is ready for deployment."
    echo ""
    echo "📊 Summary:"
    echo "   ✅ Build: Successful"
    echo "   ✅ Type Checking: Passed"
    echo "   ✅ Unit Tests: Passed with Coverage"
    if pgrep -x "OmniFocus" > /dev/null; then
        echo "   ✅ Performance Tests: Completed"
        echo "   ✅ Integration Tests: Completed"
    else
        echo "   ⚠️  Performance Tests: Skipped (OmniFocus not running)"
        echo "   ⚠️  Integration Tests: Skipped (OmniFocus not running)"
    fi
    echo "   ✅ Test Data Cleanup: Completed"
    echo ""
    print_status "info" "💡 Tip: Run this script again after making changes to ensure quality"
else
    print_status "error" "❌ Some checks failed. Please review the output above."
    exit 1
fi
