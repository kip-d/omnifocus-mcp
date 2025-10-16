# OmniFocus MCP Testing Tools Documentation

## Overview
This document describes the comprehensive testing toolkit developed for debugging and validating the OmniFocus MCP server. These tools provide direct MCP server testing without requiring Claude Desktop.

## Testing Kit Components

### 1. Emergency Diagnostic (`emergency-diagnostic.js`)
**Purpose**: Quick diagnostic tool to test all 16 tools and identify which are working.

```bash
node emergency-diagnostic.js
```

**Features**:
- Tests all tools with minimal parameters
- Shows execution time for each tool
- Parses MCP responses correctly (handles 'text' type responses)
- Reports success/failure status for each tool
- Graceful MCP termination handling

**Sample Output**:
```
=== OmniFocus MCP Emergency Diagnostic ===
Testing all tools...

✅ system: 45ms - SUCCESS
❌ tasks: 387ms - NO OUTPUT (tool executed but produced no stdout)
❌ manage_task: 23ms - NO OUTPUT
✅ projects: 12ms - SUCCESS
...

Summary: 2/16 tools working
```

### 2. Single Tool Tester (`test-single-tool.js`)
**Purpose**: Detailed testing of individual tools with custom parameters and comprehensive output analysis.

```bash
node test-single-tool.js <tool_name> [json_params]
```

**Examples**:
```bash
# Test tasks tool with limit
node test-single-tool.js tasks '{"limit": 5}'

# Test system tool 
node test-single-tool.js system '{"operation": "version"}'

# Test manage_task with minimal params
node test-single-tool.js manage_task '{"action": "create", "name": "Test task"}'
```

**Features**:
- Shows full MCP request being sent
- Reports exact execution time
- Displays complete response (including errors)
- Handles both success and error responses
- Validates JSON response format

### 3. Comprehensive Test Suite (`test-suite-comprehensive.js`)
**Purpose**: Runs complete test suite across all tools with realistic parameters.

```bash
node test-suite-comprehensive.js
```

**Features**:
- Tests all 16 tools with appropriate parameters
- Shows pass/fail summary
- Reports which tools are producing output vs executing silently
- Identifies systematic issues (like the current 90% failure rate)

**Current Results** (as of investigation):
```
=== Comprehensive MCP Tool Test Suite ===
Results Summary:
✅ system (version check): PASS - 45ms
❌ tasks (query with limit 5): FAIL - 387ms - NO OUTPUT
❌ manage_task (create simple): FAIL - 23ms - NO OUTPUT
❌ projects (list with limit 10): FAIL - 12ms - NO OUTPUT
[... 8 more failures ...]

CRITICAL: 1/11 tools passing (90% failure rate)
```

## MCP Testing Patterns

### Understanding MCP Success vs Failure

**✅ SUCCESS Pattern**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"..."}]}}
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```

**❌ FAILURE Pattern**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks
{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"SCRIPT_ERROR",...}}
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```

**🚨 SILENT EXECUTION (Current Issue)**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```
*Tool executes (~400ms) but produces no stdout - this is the current systematic issue*

### Key Testing Insights

1. **Graceful Exit ≠ Failure**: Quick exit (3-400ms) with "graceful" message indicates successful MCP protocol compliance
2. **No stdout ≠ Timeout**: Tools that execute but produce no output are failing silently, not timing out
3. **Response Format**: All responses use `type: 'text'` with JSON strings inside (not `type: 'json'`)
4. **MCP Compliance**: Server properly exits on stdin close per MCP specification

## Usage Guidelines

### When to Use Each Tool

1. **Emergency Diagnostic**: First step for any widespread issues
2. **Single Tool Tester**: Deep dive into specific tool failures  
3. **Comprehensive Suite**: Validation after fixes, regression testing

### Integration with Development Workflow

```bash
# After making changes, run full diagnostic
npm run build && node emergency-diagnostic.js

# If issues found, test specific tools
node test-single-tool.js tasks '{"limit": 3}'

# Before committing, run comprehensive suite
node test-suite-comprehensive.js
```

### Debugging Failed Tools

1. Use single tool tester to verify exact request/response
2. Check OmniFocus for blocking dialogs or permissions issues
3. Review tool implementation for JXA script errors
4. Verify tool is properly registered in `src/tools/index.ts`

## Historical Context

These tools were developed during v2.1.0 debugging when 90% of tools started failing silently. Key discoveries:

- Issue predates v2.1.0 (existed in v2.0.0)
- Tools execute (~400ms) but produce no stdout
- Not related to recent architectural changes
- Systematic OmniFocus connectivity issue

## Future Enhancements

1. Add tool-specific validation of responses
2. Performance benchmarking over time
3. Automated regression testing
4. Integration with CI/CD pipeline
5. Mock OmniFocus mode for unit testing