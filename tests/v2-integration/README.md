# V2 Integration Tests

This directory contains integration tests specifically for v2.0.0 features and functionality.

## Test Files

### Core Test Suites
- **test-v2-simple.js** - Simple v2.0.0 test suite with basic operations
- **test-v2-comprehensive.ts** - Comprehensive test covering all v2 features
- **test-repeat-rules.ts** - Tests for repeat rule functionality
- **test-repeat-rule-debug.js** - Debug script for troubleshooting repeat rules

### Test Data
- **test-create-with-tags.json** - JSON payload for testing tag creation

## Running Tests

### Simple Test Suite
```bash
npm run build
node tests/v2-integration/test-v2-simple.js
```

### Comprehensive Test
```bash
npm run build
npx tsx tests/v2-integration/test-v2-comprehensive.ts
```

### Repeat Rule Tests
```bash
npm run build
npx tsx tests/v2-integration/test-repeat-rules.ts
```

## Test Coverage

These tests verify:
- ✅ Task creation with tags
- ✅ Task updates with complex parameters
- ✅ Project ID validation
- ✅ Moving tasks to inbox
- ✅ Repeat rule creation and updates
- ✅ Performance targets (<2s)
- ✅ Error handling and validation

## Expected Results

All tests should pass with:
- Response times under 2 seconds
- Clear error messages for invalid inputs
- Successful tag and repeat rule operations
- Proper data persistence in OmniFocus

## Notes

- These tests require OmniFocus to be running
- Tests create real tasks in your OmniFocus database
- Created tasks are typically cleaned up at the end of each test run
- Run `npm run build` before testing to ensure latest code is compiled