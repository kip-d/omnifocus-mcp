# Testing Instructions: Four-Tool Unified API

**Status:** Experimental branch - 4 tools replace 17 legacy tools

## Overview

This branch consolidates the OmniFocus MCP server from 17 legacy tools to **4 unified tools**:

1. **omnifocus_read** - Query operations (tasks, projects, tags, perspectives, folders)
2. **omnifocus_write** - Mutation operations (create, update, complete, delete)
3. **omnifocus_analyze** - Analysis operations (analytics, patterns, workflows)
4. **system** - Version info and diagnostics

## Step 1: Pull Down the Feature Branch

```bash
# Navigate to the OmniFocus MCP repository
cd ~/src/omnifocus-mcp

# Fetch latest changes from remote
git fetch origin

# Checkout the feature branch
git checkout feature/three-tool-builder-api

# Pull latest changes (if branch exists remotely)
git pull origin feature/three-tool-builder-api

# Install dependencies and build
npm install
npm run build
```

## Step 2: Verify Build Success

```bash
# Should complete with no errors
npm run build

# Verify all 4 tools are registered
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 10s node dist/index.js 2>/dev/null | jq '.result.tools[].name'

# Expected output:
# "omnifocus_read"
# "omnifocus_write"
# "omnifocus_analyze"
# "system"
```

## Step 3: Run Integration Tests

```bash
# Run unified tool end-to-end tests
npm run test:integration -- tests/integration/tools/unified/end-to-end.test.ts

# Expected: All 17 tests passing
# Core operations (9 tests):
# - omnifocus_read > should query inbox tasks ✓
# - omnifocus_read > should query tasks with filters ✓
# - omnifocus_read > should list all projects ✓
# - omnifocus_read > should list all tags ✓
# - omnifocus_write > should create a new task ✓
# - omnifocus_write > should update the created task ✓
# - omnifocus_write > should complete the task ✓
# - omnifocus_write > should delete the completed task ✓
# - omnifocus_analyze > should analyze productivity stats ✓
#
# OmniFocus 4.7+ features (6 tests):
# - Planned Dates > should create task with planned date ✓
# - Planned Dates > should update task with new planned date ✓
# - Planned Dates > should clear planned date when set to null ✓
# - Enhanced Repeats > should create task with daily repeat rule ✓
# - Enhanced Repeats > should create task with weekly repeat rule ✓
# - Enhanced Repeats > should create task with repeat rule and end date ✓
#
# Version detection (2 tests integrated):
# - System tool version detection covered in mcp-protocol tests
```

**Note:** MCP protocol compliance tests have been updated to use the unified 4-tool API. Legacy data-lifecycle and omnifocus-4.7-features tests have been deleted (coverage integrated into end-to-end tests).

## Step 4: Test with Claude Desktop

### Update Claude Desktop Configuration

1. Edit your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/src/omnifocus-mcp/.worktrees/three-tool-builder-api/dist/index.js"]
    }
  }
}
```

2. Restart Claude Desktop

3. Use the natural language testing prompt (see `TESTING_PROMPT.md`)

## Step 5: Verify Tool Functionality

All functionality from the 17 legacy tools should work through the 4 unified tools:

### Query Operations (omnifocus_read replaces 5 tools)
- ✅ Query tasks (replaces `tasks` tool)
- ✅ List projects (replaces `projects` tool)
- ✅ List tags (replaces `tags` tool)
- ✅ List perspectives (replaces `perspectives` tool)
- ✅ List folders (replaces `folders` tool)

### Mutation Operations (omnifocus_write replaces 3 tools)
- ✅ Create/update/delete tasks (replaces `manage_task` tool)
- ✅ Batch create tasks/projects (replaces `batch_create` tool)
- ✅ Parse meeting notes (replaces `parse_meeting_notes` tool)

### Analysis Operations (omnifocus_analyze replaces 8 tools)
- ✅ Productivity stats (replaces `productivity_stats` tool)
- ✅ Task velocity (replaces `task_velocity` tool)
- ✅ Overdue analysis (replaces `analyze_overdue` tool)
- ✅ Workflow analysis (replaces `workflow_analysis` tool)
- ✅ Pattern analysis (replaces `analyze_patterns` tool)
- ✅ Recurring tasks (replaces `recurring_tasks` tool)
- ✅ Review management (replaces `manage_reviews` tool)
- ✅ Export operations (replaces `export` tool)

### System Operations (system tool retained)
- ✅ Version info and diagnostics

## Step 6: Report Results

After testing, report:

1. ✅ **What works:** List all operations that work correctly through the 4 unified tools
2. ❌ **What doesn't work:** Any functionality that fails or behaves differently
3. 💡 **Suggestions:** Any improvements or issues discovered during testing

## Troubleshooting

### Tool count is wrong
```bash
# Check how many tools are registered
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 10s node dist/index.js 2>/dev/null | jq '.result.tools | length'

# Should be: 4
```

### Build fails
```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

### Tests fail
```bash
# Only run unified tool tests (legacy tests are expected to fail)
npm run test:integration -- tests/integration/tools/unified
```

## Expected Test Results

- ✅ Unified end-to-end tests: **17/17 passing** (includes OmniFocus 4.7+ features)
- ✅ MCP protocol tests: **7/7 passing** (updated to use unified API)
- ✅ Unit tests: **All passing**
- ℹ️ Other integration tests: Still use legacy tool names (batch-operations, llm-assistant-simulation, etc.) - not yet updated to unified API

**Note:** The test suite has been reorganized to focus on the unified 4-tool API. Legacy test files (data-lifecycle, omnifocus-4.7-features) have been deleted with their coverage integrated into the main end-to-end test.
