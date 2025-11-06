# User Testing Instructions: 4-Tool Unified API

**Branch to test:** `feature/unified-api`
**What it has:** 4 unified tools (omnifocus_read, omnifocus_write, omnifocus_analyze, system)
**Note:** This branch implements the unified API that consolidates 17 legacy tools into 3 core tools (plus system diagnostics)

---

## Quick Setup (5 minutes)

```bash
# 1. Get the correct branch
cd ~/src/omnifocus-mcp
git fetch --all
git checkout feature/unified-api
git pull

# 2. Build
npm install
npm run build

# 3. Verify you have 4 tools
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js 2>&1 | grep -o '"name":"omnifocus[^"]*"'

# Expected output:
# "name":"omnifocus_read"
# "name":"omnifocus_write"
# "name":"omnifocus_analyze"
# (plus "name":"system")
```

---

## Configure Claude Desktop

**Edit:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/absolute/path/to/omnifocus-mcp/dist/index.js"]
    }
  }
}
```

**Replace** `/absolute/path/to/omnifocus-mcp` with your actual path!

**Then:** Completely quit and restart Claude Desktop (Cmd+Q, reopen)

---

## Run the Test

**Copy the entire contents of `TESTING_PROMPT.md` into a new Claude Desktop conversation.**

That file contains a natural language testing script that will:
1. Verify you have the 4 unified tools
2. Test read operations (queries)
3. Test write operations (create/update/complete/delete)
4. Test analyze operations (productivity stats, patterns, etc.)
5. Test error handling
6. Provide a final report

Just paste it in and let Claude work through it.

---

## What You're Testing

We consolidated **17 individual tools** down to **4 unified tools**:

| Old (17 tools) | New (4 tools) | What it does |
|----------------|---------------|--------------|
| tasks, projects, tags, folders, perspectives, export, recurring_tasks | **omnifocus_read** | All query operations |
| manage_task, batch_create, parse_meeting_notes | **omnifocus_write** | All create/update/delete operations |
| productivity_stats, task_velocity, analyze_overdue, workflow_analysis, analyze_patterns, manage_reviews | **omnifocus_analyze** | All analytics and analysis |
| system | **system** | Version info and diagnostics |

**Question:** Can these 4 tools do everything the 17 tools did?

---

## Report Your Results

After running the testing prompt in Claude Desktop, report:

### ✅ What Worked
List tests that passed

### ❌ What Failed
List tests that failed with error details

### 💡 Overall Assessment
- [ ] **READY** - All tests passed, can replace 17 tools with 4
- [ ] **NOT READY** - Issues found (list them)

---

## Troubleshooting

### "Claude doesn't see 4 tools, it sees 17"
Wrong branch! Check: `git branch --show-current` should show `feature/unified-api`

### "Build fails"
```bash
rm -rf dist/ node_modules/
npm install
npm run build
```

### "Claude can't connect to OmniFocus"
1. Check OmniFocus is running
2. Check config path is correct: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json`
3. Restart Claude Desktop completely

---

## Files Reference

- **`TESTING_PROMPT.md`** ← Copy this into Claude Desktop
- **`QUICK_START_TESTING.md`** - Alternative quick reference
- **`FOR_USER_TESTING.md`** - Background on what we're testing
- **`TESTING_INSTRUCTIONS.md`** - Detailed technical instructions

---

**Last Updated:** 2025-11-05
**Branch:** feature/unified-api
**Tools:** 4 unified tools (omnifocus_read, omnifocus_write, omnifocus_analyze, system)
