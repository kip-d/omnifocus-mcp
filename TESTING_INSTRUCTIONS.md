# Testing Instructions: Three-Tool Builder API

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

# Verify all 20 tools are registered
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js 2>&1 | grep -c '"name":'

# Expected output: 20 (3 new + 17 legacy)
```

## Step 3: Run Integration Tests

```bash
# Run all unified tool tests
npm run test:integration -- tests/integration/tools/unified

# Expected: All tests passing
# - OmniFocusReadTool.test.ts: 3/3 passing
# - OmniFocusWriteTool.test.ts: 2/2 passing
# - OmniFocusAnalyzeTool.test.ts: 3/3 passing
# - end-to-end.test.ts: 10/10 passing
```

## Step 4: Test with Claude Desktop

### A. Test with ALL tools (3 new + 17 legacy)

1. Update your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

### B. Test with ONLY the 3 new tools (remove 17 legacy)

This verifies the new tools can operate independently.

1. **Temporarily disable legacy tools:**

```bash
# Edit src/tools/index.ts
# Comment out the 17 legacy tool instantiations (lines 94-123)
# Keep only the 3 new unified tools (lines 89-91)

# Then rebuild
npm run build
```

2. **Verify only 3 tools registered:**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js 2>&1 | grep -c '"name":'

# Expected output: 3 (only unified tools)
```

3. **Test with Claude Desktop** using the same natural language prompt

4. **Important:** All functionality should work through the 3 unified tools

5. **Restore legacy tools when testing complete:**

```bash
# Undo changes to src/tools/index.ts
git checkout src/tools/index.ts

# Rebuild
npm run build
```

## Step 5: Report Results

Create a testing report with:

### Test Results Template

```markdown
## Testing Results: Three-Tool Builder API

**Date:** [DATE]
**Tester:** [NAME]
**Branch:** feature/three-tool-builder-api
**Commit:** [COMMIT_HASH from git log]

### Build Status
- [ ] Clean build (no TypeScript errors)
- [ ] All 20 tools registered

### Integration Tests
- [ ] OmniFocusReadTool.test.ts: PASS/FAIL
- [ ] OmniFocusWriteTool.test.ts: PASS/FAIL
- [ ] OmniFocusAnalyzeTool.test.ts: PASS/FAIL
- [ ] end-to-end.test.ts: PASS/FAIL

### Claude Desktop Testing - All Tools (3+17)
- [ ] Read operations working
- [ ] Write operations working
- [ ] Analyze operations working
- [ ] No errors in Claude Desktop

### Claude Desktop Testing - Only 3 Tools
- [ ] Successfully disabled 17 legacy tools
- [ ] Only 3 tools showing in tool list
- [ ] Read operations working
- [ ] Write operations working
- [ ] Analyze operations working
- [ ] ALL functionality working with just 3 tools

### Issues Found
[List any issues, errors, or unexpected behavior]

### Notes
[Any additional observations or feedback]
```

## Troubleshooting

### Build Fails
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### Tests Timeout
```bash
# OmniFocus may be blocked by dialogs
# Check OmniFocus app for permission dialogs
```

### Claude Desktop Not Connecting
```bash
# Check logs
tail -f ~/Library/Logs/Claude/mcp*.log

# Verify config path is correct
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Only 3 Tools Test Fails
This would indicate the new tools cannot fully replace the old ones - CRITICAL FINDING to report immediately.
