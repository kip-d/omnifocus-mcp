# Integration Test Notes

## Overview
The integration tests in `tests/unit/integration.test.ts` test the MCP server by spawning it as a child process and communicating via stdin/stdout, simulating how Claude Desktop would interact with it.

## Known Issues and Fixes

### 1. Null Check Errors
**Issue**: "Cannot use 'in' operator to search for 'error' in null"

**Root Cause**: Several tool implementations were checking `'error' in result` without first verifying that `result` was not null.

**Fix Applied**: Added null checks before using the `in` operator:
```typescript
// Before
if ('error' in result && result.error) {

// After  
if (result && typeof result === 'object' && 'error' in result && result.error) {
```

**Files Fixed**:
- `src/tools/tasks/CreateTaskTool.ts`
- `src/tools/tasks/ListTasksTool.ts`

### 2. MCP Protocol Error Handling
**Issue**: Test expected a successful response with `success: false` for validation errors, but MCP correctly throws protocol errors.

**Root Cause**: The test was written expecting application-level error responses, but MCP validation errors should throw -32602 protocol errors.

**Fix Applied**: Updated test to expect thrown errors:
```typescript
// Before
const response = JSON.parse(result.content[0].text);
expect(response.success).toBe(false);

// After
try {
  await sendRequest(...);
  expect.fail('Should have thrown an error');
} catch (error: any) {
  expect(error.message).toContain('Invalid parameters');
}
```

### 3. OmniFocus Not Running
**Issue**: Create task test fails with "Invalid response from create task script" when OmniFocus is not running.

**Current Status**: This is expected behavior. The integration tests check for either:
- Success when OmniFocus is running
- Error message containing "OmniFocus" when it's not running

**Recommendation**: The test should handle this case gracefully. The create task tool is correctly throwing an error when the script returns null (which happens when OmniFocus is not accessible).

## Test Environment Considerations

1. **OmniFocus Requirement**: These integration tests require OmniFocus to be installed and running on macOS. They will fail in CI/CD environments without OmniFocus.

2. **Timeout Issues**: Some tests have extended timeouts (20 seconds) because:
   - Server initialization takes time
   - OmniFocus JXA scripts can be slow
   - First-time script execution may trigger macOS permission dialogs

3. **Permission Requirements**: The tests require:
   - Terminal/IDE to have Automation permission for OmniFocus
   - No blocking dialogs in OmniFocus

## Running Integration Tests

```bash
# Run just the integration tests
npm test -- integration.test.ts

# Run with OmniFocus running (recommended)
# 1. Open OmniFocus
# 2. Ensure it has a document open
# 3. Run tests
npm test -- integration.test.ts
```

## Script Refactoring and IIFE Wrapper Issues (2025-08-03)

### Issue
After refactoring large script files into modular components, integration tests started failing with:
- Empty script output
- "Script execution failed with code 1"
- "Return statements are only valid inside functions"

### Root Cause
The `wrapScript` method in `omniautomation.ts` was wrapping all scripts with error handling, but the refactored scripts already contained:
1. Their own IIFE wrappers
2. Their own `app` and `doc` initialization

This caused double-wrapping and conflicts, especially for LIST_TASKS_SCRIPT which didn't have an IIFE wrapper initially.

### Solution
1. Modified `executeInternal` to detect if scripts already have IIFE and app initialization
2. Only wrap scripts that don't have their own structure
3. Added IIFE wrapper to LIST_TASKS_SCRIPT

### Code Changes
```typescript
// In omniautomation.ts
const hasIIFE = script.includes('(() =>') || script.includes('(function');
const hasAppInit = script.includes("Application('OmniFocus')");
const wrappedScript = hasIIFE && hasAppInit ? script : this.wrapScript(script);
```

## Future Improvements

1. **Mock Mode**: Add environment variable to run integration tests in mock mode for CI/CD
2. **Better Error Messages**: Enhance error messages to clearly indicate when OmniFocus is not available
3. **Graceful Degradation**: Tests should pass with warnings when OmniFocus is not available, rather than failing