# Common Issues → Pattern Lookup

**PURPOSE**: Quick reference for common issues. Always check here BEFORE debugging.

## 🏷️ Tags Not Working?

**Symptoms:**
- Tags show in create response but not in query
- Tags are empty array `[]` when they should have values
- Tags saved in JXA but not visible in OmniFocus

**Solution:**
1. Check CLAUDE.md section "Bridge is REQUIRED for: Tag assignment"
2. Use `bridgeSetTags(app, taskId, tagNames)` function
3. Location: `src/omnifocus/scripts/shared/minimal-tag-bridge.ts:41`
4. Already included in: CREATE_TASK_SCRIPT via `getMinimalTagBridge()`

**Example:**
```typescript
// ❌ DON'T: JXA methods fail silently
task.addTags(tags);
task.tags = tags;

// ✅ DO: Use bridge
const bridgeResult = bridgeSetTags(app, taskId, taskData.tags);
```

---

## 📅 Task Creation Failing?

**Symptoms:**
- Tasks not appearing in OmniFocus
- "Project not found" errors
- Invalid parameter errors

**Solution:**
1. Check ARCHITECTURE.md decision tree
2. Start with Pure JXA for basic properties
3. Use bridge for: tags, repetition rules, task movement
4. Verify project exists before creating task

**Decision Tree:**
```
Task Creation:
├── Without tags → Pure JXA ✓
├── With tags → JXA + Bridge (REQUIRED)
├── With repetition → JXA + Bridge (REQUIRED)
└── In project → Validate project first, then JXA
```

---

## 🐌 Performance Issues / Timeouts?

**Symptoms:**
- Script takes 25+ seconds
- Timeout errors with large task counts
- Queries hang with 2000+ tasks

**Solution:**
1. Check LESSONS_LEARNED.md "JXA Performance Rules"
2. **NEVER use `.where()` or `.whose()` methods** - they don't exist in JXA
3. Use direct iteration with try/catch instead
4. Set `skipAnalysis: true` for 30% faster queries

**Example:**
```javascript
// ❌ DON'T: Takes 25+ seconds or fails
const tasks = doc.flattenedTasks.whose({completed: false})();

// ✅ DO: Use standard JavaScript iteration
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  try {
    if (!allTasks[i].completed()) tasks.push(allTasks[i]);
  } catch (e) { /* skip */ }
}
```

---

## 📆 Date Handling Issues?

**Symptoms:**
- Dates off by hours
- Timezone confusion
- Dates not saving correctly

**Solution:**
1. Check CLAUDE.md "Date Formats" section
2. Use YYYY-MM-DD or YYYY-MM-DD HH:mm (local time)
3. **AVOID**: ISO-8601 with Z suffix (causes timezone issues)
4. Smart defaults: 5pm for due dates, 8am for defer dates

**Example:**
```javascript
// ❌ DON'T: ISO with Z suffix
dueDate: "2025-03-15T17:00:00Z"  // Wrong time!

// ✅ DO: Local time format
dueDate: "2025-03-15 17:00"  // Correct!
dueDate: "2025-03-15"        // Smart default: 5pm for due dates
```

---

## 🧪 MCP Testing Hangs / No Response?

**Symptoms:**
- CLI tests hang forever
- No JSON response
- Server doesn't exit

**Solution:**
1. Check CLAUDE.md "CLI Testing Pattern"
2. Remember: MCP servers exit when stdin closes (correct behavior!)
3. Use proper test pattern with graceful shutdown
4. See success pattern in CLAUDE.md

**Example:**
```bash
# ✅ Correct pattern - includes clientInfo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
```

---

## 🔧 Script Size Limit Errors?

**Symptoms:**
- "Script too large" errors
- Truncation issues
- Syntax errors at end of script

**Solution:**
1. Check LESSONS_LEARNED.md "Script Size Limits"
2. **Reality**: JXA supports 523KB, OmniJS Bridge supports 261KB
3. Our largest script: ~50KB (only 10% of limit)
4. Size is unlikely the issue - check syntax instead

**Limits:**
- JXA Direct: 523,266 chars (~511KB)
- OmniJS Bridge: 261,124 chars (~255KB)
- Current largest: `getAllHelpers()` ~30KB

---

## 🔍 Can't Find Function/Helper?

**Symptoms:**
- "function not defined" errors
- Looking for helper functions
- Don't know which helpers to include

**Solution:**
1. Search in `src/omnifocus/scripts/shared/`
2. Check `helpers.ts` for utility functions
3. Check `bridge-helpers.ts` for OmniJS bridge operations
4. Check `minimal-tag-bridge.ts` for tag operations
5. Use `getUnifiedHelpers()` - includes everything (~50KB, well within limits)

**Helper Locations:**
- `safeGet()`, `safeGetTags()` → helpers.ts
- `bridgeSetTags()` → minimal-tag-bridge.ts
- `validateProject()` → helpers.ts
- `formatError()` → helpers.ts

---

## 📝 Integration Tests Failing?

**Symptoms:**
- Tests timeout
- "Server did not exit gracefully"
- Pending operations never complete

**Solution:**
1. Check LESSONS_LEARNED.md "Async Operation Lifecycle"
2. Ensure graceful shutdown pattern (close stdin → wait → SIGTERM → SIGKILL)
3. Set reasonable timeouts (60s for requests, 90s for tests on M2 Ultra)
4. Track pending operations to prevent premature exit

**Timeout Settings:**
- Request timeout: 60000ms (60s)
- Test timeout: 90000ms (90s)
- Graceful wait: 5000ms (5s)

---

## 📊 Tool Returns Empty/Zero Values But Logs Show Data?

**Symptoms:**
- Tool returns `totalTasks: 0, completedTasks: 0` but user has data
- Logs show `stdout data received: {"completedInPeriod":95}` but tool returns 0
- Script output looks correct but tool response is empty/zeros
- User reports "no data" but database has records

**Critical Rule: TEST MCP INTEGRATION FIRST!**

**Diagnostic Command:**
```bash
# Run full MCP test and compare script output vs tool response
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{}}}' | node dist/index.js 2>&1 | tee debug.log

# Check what script returns
grep "stdout data received" debug.log

# Check what tool returns
grep -A 20 '"result":' debug.log
```

**Solution:**

If script returns correct data but tool returns zeros → **Response wrapping issue**

**Common Causes:**

1. **Double-wrapping**:
   - Script returns: `{ok: true, data: {summary: {completedTasks: 95}}}`
   - execJson wraps: `{success: true, data: {ok: true, data: {summary: {completedTasks: 95}}}}`
   - Tool only unwraps once: Looks for `summary` at wrong level
   - Result: Falls back to empty data

2. **Under-unwrapping**:
   - Tool checks `if ('summary' in result)` at wrong nesting level
   - Script structure changed but tool unwrapping didn't update

3. **Error detection failure**:
   - `isScriptError()` doesn't catch wrapped errors
   - Tool thinks it succeeded but falls back to default empty values

**Fix Pattern:**
```typescript
// Unwrap ALL layers to reach actual data
let actualData: unknown;

// First unwrap: execJson wrapper {success: true, data: ...}
if (result && typeof result === 'object' && 'data' in result) {
  actualData = (result as {data: unknown}).data;
}

// Second unwrap: script wrapper {ok: true, v: "1", data: ...}
if (actualData && typeof actualData === 'object' && 'ok' in actualData && 'data' in actualData) {
  actualData = (actualData as {ok: boolean, data: unknown}).data;  // NOW you have real data!
}

// NOW check for expected fields
if (actualData && typeof actualData === 'object' && 'summary' in actualData) {
  // Use the data
}
```

**Real Example:**
- File: `src/tools/analytics/ProductivityStatsToolV2.ts:87-105`
- Commit: `84c01cc`
- Issue: productivity_stats returned all 0s despite 95 completed tasks
- Root cause: Script returned correct data, tool only unwrapped one layer
- Cost: 7 debugging cycles debugging script before testing MCP integration
- Lesson: **ALWAYS test MCP integration BEFORE opening script files**

**Prevention:**
1. Run MCP integration test FIRST (not last!)
2. Check logs: Compare script output to tool response
3. If script output is correct → problem is in tool wrapper
4. If script output is wrong → problem is in script logic
5. **Don't debug scripts until you confirm script output is wrong**

---

## 🎯 General Debugging Workflow

**BEFORE starting any debugging:**

1. **STOP** - Don't start coding yet
2. **SEARCH** - Grep for keywords in `docs/` directory
   ```bash
   grep -r "keyword" docs/
   ```
3. **CHECK** - Consult this PATTERNS.md file
4. **VERIFY** - Look for existing helper functions
5. **READ** - Check ARCHITECTURE.md decision tree
6. **ONLY THEN** - Begin implementation

**This saves 30+ minutes per issue by avoiding rediscovery.**

---

## 📚 Documentation Map

- **PATTERNS.md** (this file) - Quick symptom lookup
- **CLAUDE.md** - Essential guide, architecture principles, testing
- **ARCHITECTURE.md** - JXA vs Bridge decision tree
- **LESSONS_LEARNED.md** - Hard-won insights, empirical data
- **DEBUGGING_WORKFLOW.md** - Systematic debugging approach
- **SCRIPT_SIZE_LIMITS.md** - Empirical testing results

**Always start here, then drill down to specific docs.**
