# CLAUDE.md - Essential Guide for Claude Code

This file provides critical guidance to Claude Code (claude.ai/code) when working with this OmniFocus MCP server.

---

# 🚨🚨🚨 STOP! Before Writing ANY Code 🚨🚨🚨

**This project has established patterns for common tasks. DON'T REINVENT THE WHEEL.**

### 1. Search for Existing Patterns FIRST

```bash
# Before implementing, search shared helpers:
grep -r "your_task_keyword" src/omnifocus/scripts/shared/

# Examples:
grep -r "bridge" src/omnifocus/scripts/shared/          # Bridge patterns
grep -r "evaluateJavascript" src/omnifocus/scripts/    # OmniJS usage
grep -r "tag" src/omnifocus/scripts/shared/             # Tag operations
```

### 2. Check the Pattern Index

See **`docs/dev/PATTERN_INDEX.md`** for:
- Bridge helper patterns (tags, dates, repetition)
- Field access patterns (JXA vs OmniJS)
- Script embedding patterns
- Common solutions to known problems

### 3. Read Existing Code COMPLETELY

If you find similar code, **READ IT IN FULL** before implementing your solution.

**Real Cost of Skipping This:** We spent 2+ hours reinventing the bridge pattern that already existed in `minimal-tag-bridge.ts`. The solution took 10 minutes once we found the pattern.

---

## 📚 CRITICAL: Read Architecture Documentation First!
**Before making ANY changes, consult these essential documents:**
- `/docs/dev/PATTERNS.md` - **START HERE** - Quick symptom lookup and common solutions
- `/docs/dev/ARCHITECTURE.md` - Unified JavaScript execution patterns and decision tree
- `/docs/dev/LESSONS_LEARNED.md` - Hard-won insights that will save you from repeating costly mistakes

**Key Architecture Principle:** Use hybrid JXA + evaluateJavascript() bridge approach. Pure JXA for simple operations, bridge for complex operations that JXA cannot handle.

## 🔍 Quick Symptom → Documentation Index

**Having an issue? Find the solution instantly:**

| Symptom | Go To | Quick Fix |
|---------|-------|-----------|
| Tool returns 0s/empty but has data | `/docs/dev/PATTERNS.md` → "Tool Returns Empty/Zero Values" | Test MCP integration first! Compare script vs tool output |
| Test expects data.id but gets undefined | `/docs/dev/PATTERNS.md` → "Response Structure Mismatches" | Test MCP response structure first! |
| Tool works in CLI but test fails | `/docs/dev/PATTERNS.md` → "Response Structure Mismatches" | Compare actual response structure |
| Tags not saving/empty | `/docs/dev/PATTERNS.md` → "Tags Not Working" | Use `bridgeSetTags()` (line 120 below) |
| Script timeout (25+ seconds) | `/docs/dev/PATTERNS.md` → "Performance Issues" | Never use `.where()/.whose()` |
| Dates wrong time | `/docs/dev/PATTERNS.md` → "Date Handling" | Use `YYYY-MM-DD HH:mm` not ISO+Z |
| MCP test hangs | `/docs/dev/PATTERNS.md` → "MCP Testing" | Stdin close = correct behavior |
| "Script too large" error | `/docs/dev/LESSONS_LEARNED.md` → "Script Size" | Limits are 523KB - check syntax |
| Function not found | Search `src/omnifocus/scripts/shared/` | Use existing helpers |
| Integration test timeout | `/docs/dev/PATTERNS.md` → "Integration Tests" | 60s requests, 90s tests |

**Not listed? Search `/docs/dev/PATTERNS.md` for keywords before debugging!**

## 🚨 BEFORE DEBUGGING - MANDATORY CHECKLIST

**When encountering ANY issue, complete these steps IN ORDER:**

□ **Step 1: Search PATTERNS.md**
  - Open `/docs/dev/PATTERNS.md` and search for symptom keywords
  - Example: "tags not working" → direct solution with code location

□ **Step 2: Search existing documentation**
  ```bash
  grep -r "keyword" docs/  # Search all documentation
  grep -r "function_name" src/omnifocus/scripts/shared/  # Find helpers
  ```

□ **Step 3: Check for existing helper functions**
  - `src/omnifocus/scripts/shared/helpers.ts` - Core utilities
  - `src/omnifocus/scripts/shared/bridge-helpers.ts` - Bridge operations
  - `src/omnifocus/scripts/shared/minimal-tag-bridge.ts` - Tag operations

□ **Step 4: Verify current implementation**
  - Read the existing code in the file you're modifying
  - Check what helpers are already included (e.g., `getMinimalTagBridge()`)
  - Don't reinvent - use what's already there!

□ **Step 5: ONLY THEN - Begin implementation**
  - Follow the patterns found in documentation
  - Use existing helper functions
  - Test with the documented approach

**This checklist saves 30+ minutes per issue by avoiding rediscovery of documented solutions.**

## 🚨 MANDATORY: Pre-Implementation Checklist

**BEFORE writing ANY new script or optimization, complete ALL steps:**

□ **Step 1: Classify the operation**
  - How many items will be processed? (>100 = bulk operation)
  - Does it create/update tasks with tags? (REQUIRES bridge)
  - Does it need repetition rules? (REQUIRES bridge)

□ **Step 2: Search for existing patterns**
  ```bash
  # Search for similar operations
  grep -r "evaluateJavascript" src/omnifocus/scripts/ --include="*.ts"
  grep -r "flattenedTasks" src/omnifocus/scripts/ --include="*.ts"
  grep -r "forEach" src/omnifocus/scripts/ --include="*.ts"
  ```

□ **Step 3: Review the decision tree below**
  - Match your operation to the tree
  - If bulk operation (>100 items) → CHECK EXISTING BRIDGE PATTERNS FIRST

□ **Step 4: Find reference implementation**
  - Perspectives: `src/omnifocus/scripts/perspectives/query-perspective.ts`
  - Bulk operations: `src/omnifocus/scripts/perspectives/query-perspective.ts` (lines 14-36)
  - Tag operations: Search for bridge patterns in codebase

□ **Step 5: Test your assumption**
  - If optimizing, MEASURE the current bottleneck first
  - Don't assume - profile to find what's actually slow

## 🚨 JavaScript Execution Decision Tree (UPDATED - September 2025)

**CRITICAL: Both JXA and Bridge have valid use cases. Choose based on CONTEXT, not just item count:**

```
HOW WILL YOU USE THE DATA?
├── Streaming/Processing as collected
│   └── Use INLINE JXA (per-item, simple, no bottleneck)
│       ├── Good for: Query responses, real-time processing
│       ├── Performance: ~1-2ms per item (acceptable in stream)
│       └── Example: tags during buildTaskObject()
│
└── Bulk operation after collection
    ├── If < 50 items → Bridge can be fast (single call)
    ├── If 50-100 items → Measure! (bridge script size matters)
    └── If > 100 items → Prefer streaming/pagination over bulk bridge
        └── Why: Embedded-ID scripts cause timeouts (Issue #27)

OPERATION TYPE?
├── Reading data (tasks, projects, tags)
│   ├── During task building → Pure JXA (inline, no overhead)
│   ├── After bulk collection → CAREFUL with bridge (script size!)
│   └── Bulk property access without filtering → Use bridge sparingly
│
├── Creating/Updating tasks
│   ├── Without tags → Pure JXA
│   ├── With tags → JXA for creation + Bridge for assignment (REQUIRED)
│   └── With repetition → JXA + Bridge (REQUIRED)
│
├── Task movement/organization
│   ├── Single task → Pure JXA
│   └── Bulk movement → Consider pagination vs bridge
│
└── Property access on ALL tasks (flattenedTasks)
    └── Context matters: Use bridge for analysis, JXA for streaming responses
```

**Performance Reality Check (with lessons from Issue #27):**
- JXA direct property access: ~1-2ms per item
- Bridge per-task overhead: More than JXA when streaming
- Bridge bulk operation (fixed script): Faster for <50 items
- Bridge with embedded IDs grows as: `base + (ID.length × count)` - becomes problematic fast!
- Crossover point: Usually around 50-100 items, BUT script size matters more than count

**When in doubt:**
1. **Measure first!** Profile to find actual bottleneck
2. **Check context:** Are you streaming results or processing bulk?
3. **Grep for patterns** before implementing - use existing examples

**Bridge is ABSOLUTELY REQUIRED for:**
- ✅ Tag assignment during task creation (JXA limitation)
- ✅ Setting repetition rules (complex rule objects)
- ✅ Task movement between projects (preserves IDs)

**Bridge provides REAL PERFORMANCE benefit for:**
- ✅ Bulk property analysis (calculate statistics on 1000+ items)
- ✅ Complex data transformations on fixed datasets
- ✅ Perspective queries that don't embed dynamic IDs
- ⚠️  NOT good for: Queries with embedded task IDs (script size explosion)

### 🏷️ Tag Operations - Complete Guide with Both Approaches

**CRITICAL: Tag assignment REQUIRES bridge, but tag retrieval has options based on WHEN you retrieve:**

#### Tag Assignment (Creation) - BRIDGE REQUIRED
```javascript
// ❌ DON'T: These fail silently
task.addTags(tags);      // Doesn't persist
task.tags = tags;        // Doesn't persist

// ✅ DO: Use bridge for assignment
const bridgeResult = bridgeSetTags(app, taskId, tagNames);
// Returns: {success: true, tags: ["tag1", "tag2"]}
```

#### Tag Retrieval - TWO VALID APPROACHES WITH DIFFERENT TRADEOFFS

**APPROACH 1: Inline Retrieval During Task Building (SIMPLE JXA)**
- **When**: Need tags for tasks as you build them
- **Performance**: ~1-2ms per task (acceptable for streamed processing)
- **Implementation**: Direct property access during buildTaskObject
```javascript
// ✅ FAST for inline/streamed retrieval
const tags = task.tags();
taskData.tags = tags ? tags.map(t => t.name()) : [];
```
- **Pros**: No bridge overhead, immediately available, simple code
- **Cons**: Per-task overhead adds up if processing 1000+ tasks without streaming
- **Use case**: Query responses where tasks are processed as they're collected

**APPROACH 2: Bulk Retrieval After Collection (BRIDGE)**
- **When**: Need to retrieve tags for many pre-collected tasks in one operation
- **Performance**: Single bridge call instead of N calls, but script size grows
- **Implementation**: Build script with all task IDs embedded
```javascript
// ⚠️  PROBLEMATIC if script gets too large
const ids = [id1, id2, id3, ...];  // Don't embed hundreds of IDs!
const script = buildBridgeScriptWithIds(ids);
const tags = app.evaluateJavascript(script);
```
- **Pros**: Single network call, can be faster for <50 items
- **Cons**: Script size grows linearly, causes timeout for 100+ items (Issue #27)
- **Lesson**: DON'T use this for bulk collection queries - script becomes too large

#### Recommended Pattern: Inline JXA for Query Responses
```javascript
// ✅ BEST for general queries
function buildTaskObject(task, filter, skipAnalysis) {
  const taskObj = {};
  // ... other properties ...

  if (shouldIncludeField('tags')) {
    const tags = task.tags();
    taskObj.tags = tags ? tags.map(t => t.name()) : [];
  }

  return taskObj;
}
```

**Key Insight from Issue #27**: Don't use "bulk bridge with embedded IDs" for queries. Instead:
- Use simple JXA during task building (inline)
- Let streaming/pagination handle volume
- Cache results to avoid re-fetching

**Location of helper function:**
- Function: `bridgeSetTags(app, taskId, tagNames)`
- File: `src/omnifocus/scripts/shared/minimal-tag-bridge.ts:41`
- Already included in: `CREATE_TASK_SCRIPT` via `getMinimalTagBridge()`

**Why bridge is required:**
- JXA's `task.addTags()` doesn't persist to OmniFocus database
- JXA's `task.tags()` has caching/timing issues
- OmniJS bridge uses proper API that immediately persists
- Tags appear in UI and queries immediately after bridge assignment

## 📚 Pattern Library - Where to Find Examples

**Before implementing, CHECK THESE FILES for similar patterns:**

### Bulk Operations (>100 items)
**Example:** `src/omnifocus/scripts/perspectives/query-perspective.ts`
```typescript
// Lines 14-36: Inbox perspective processing
const inboxScript = `
  inbox.forEach(task => {
    // OmniJS: Direct property access
    results.push({
      id: task.id.primaryKey,
      name: task.name,
    });
  });
`;
const result = app.evaluateJavascript(inboxScript);
```

**Real-world example:** `src/omnifocus/scripts/cache/warm-task-caches.ts`
- Processes 1,510 tasks in 2.4 seconds using OmniJS bridge
- JXA version timed out after 5+ minutes
- 125x faster with bridge for bulk property access

### Tag Operations
**Search command:** `grep -r "evaluateJavascript.*tags" src/`

### Task Creation with Complexity
**Search command:** `grep -r "create-task-with-bridge" src/`

### 🚨 RED FLAGS - Research Required
If you see these in your plan, STOP and search for patterns:
- ⚠️ Processing >100 items
- ⚠️ Iterating through flattenedTasks/flattenedProjects
- ⚠️ Multiple property accesses per item (id, name, date, project, etc.)
- ⚠️ "This seems slow in JXA"
- ⚠️ Timeout issues with existing scripts

## Critical: V2 Architecture
- **Use only V2 tools** (`*ToolV2.ts` files in `src/tools/`)
- V1 tools removed in v2.0.0 for 30% context reduction
- **Official API**: See `src/omnifocus/api/OmniFocus.d.ts` for OmniFocus 4.6.1 type definitions

## Development Rules
- **TypeScript only** - All files must be `.ts` (including tests and scripts)
- **Never create `.js` files**
- **Always run integration tests** before considering features complete
- Build before running: `npm run build`

## 🚨 CRITICAL: Systematic Debugging Workflow
**Before fixing ANY issues, consult `/docs/dev/DEBUGGING_WORKFLOW.md`**
This document prevents the Fix → Lint → Build error cycle by establishing proper analysis and implementation patterns. Following this workflow saves 10+ minutes per fix and creates better code.

### 🚨 CRITICAL DEBUGGING RULE: Test MCP Integration First

**⚠️ STOP! Before opening ANY script file to debug, follow this order:**

1. ✅ **Test the full MCP tool call** with actual parameters
2. ✅ **Check logs** for what the SCRIPT returns (`stdout data received`)
3. ✅ **Compare** SCRIPT output to TOOL output in response
4. ✅ **Identify which layer is wrong** (script vs tool wrapper)
5. ❌ **Do NOT open script files** until you confirm the problem is in the script

**Testing command:**
```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{...}}}' | node dist/index.js 2>&1 | tee debug.log

# Check what script returns
grep "stdout data received" debug.log

# Check what tool returns
grep -A 20 '"result":' debug.log
```

**Why this order saves hours:**
- Scripts might be working perfectly (productivity_stats was!)
- Tool wrappers might process data wrong (double-unwrapping issue)
- Debugging the wrong layer wastes time
- **Real example:** productivity_stats took 7 cycles debugging script when wrapper was the issue

**Cost of not following this rule:**
- Example: 2 hours wasted fixing script bugs that weren't the problem
- Added debug logging that broke the script (console.error in JXA)
- Fixed date logic that was already correct
- Finally tested MCP integration → found wrapper issue in 5 minutes

**Do NOT debug isolated scripts/components until MCP integration test shows script output is wrong.**

### 🚨 CRITICAL: Response Structure Validation Pattern

**Problem:** Tests frequently break due to response structure mismatches (expecting `data.id` but getting `data.task.taskId`).

**Solution: ALWAYS verify actual response structure before writing tests!**

```bash
# Test actual MCP response structure (30 seconds)
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{}}}' | \
  node dist/index.js 2>&1 | grep '"result":' | jq '.result.content[0].text | fromjson'
```

**Standard V2 Response Structure:**
```typescript
{
  success: boolean;
  data?: {
    // Structure varies by tool! See PATTERNS.md for tool-specific structures
  };
  error?: { code, message, details };
  metadata?: { executionTime, operation, ... };
}
```

**Critical Rules:**
1. **Test structure BEFORE writing assertions** - Use MCP CLI test to see actual structure
2. **Use optional chaining (`?.`)** for all nested access
3. **Test `response.success` first** before accessing data
4. **Response structure is tool-specific AND operation-specific**

**For complete guide:** See `/docs/dev/PATTERNS.md` → "Response Structure Mismatches"

## 🚨 CRITICAL LESSON: MCP stdin Handling

**We spent 6+ months with broken MCP lifecycle compliance!** 

Every MCP server MUST handle stdin closure for specification compliance:
```typescript
// ✅ REQUIRED - Add to every MCP server
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
```

Without this, servers hang forever and violate MCP specification. See `/docs/dev/LESSONS_LEARNED.md` for full embarrassing details.

## Documentation Management
**NEVER delete documentation outright unless there's a clear reason (e.g., contains incorrect/dangerous information).**

Instead, preserve historical documentation:
1. Create/use `.archive/` directory (ignored by git in main repo)
2. Move obsolete docs there with context about why they're obsolete
3. Push to archive repository: https://github.com/kip-d/omnifocus-mcp-archive
4. This preserves development history and lessons learned for future developers

Active documentation stays in `docs/`, historical context goes to archive repo.

## 🚨 Critical: MCP Bridge Type Coercion
**Claude Desktop converts ALL parameters to strings during transport.**

```typescript
// ❌ WRONG - Will fail with Claude Desktop
limit: z.number().min(1).max(200).default(25)

// ✅ CORRECT - Handles both direct calls and MCP bridge
limit: z.union([
  z.number(),
  z.string().transform(val => parseInt(val, 10))
]).pipe(z.number().min(1).max(200)).default(25)
```

Always test with BOTH: Direct Node.js calls AND Claude Desktop (stringified params)

## Date Formats
- **Preferred**: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` (local time, e.g., "2025-03-15" or "2025-03-15 14:30")
- **Smart defaults for date-only (YYYY-MM-DD)**:
  - **Due dates**: Default to 5:00 PM local time (e.g., "2025-03-15" becomes 5pm)
  - **Defer dates**: Default to 8:00 AM local time (e.g., "2025-03-15" becomes 8am)
  - **Completion dates**: Default to 12:00 PM (noon) local time
- **Avoid**: ISO-8601 with Z suffix (causes timezone confusion - will set wrong time)
- **Basic natural language works**: 
  - "today"/"tomorrow" → 5pm for due dates, 8am for defer dates
  - "next week" → same smart defaults
  - "next monday" → always 9am
  - "friday"/"end of week" → always 5pm
- **Complex natural language should be converted**: LLM should convert "the 3rd Thursday after next week" to YYYY-MM-DD format

## Task Management
- **Move to inbox**: Set `projectId` to `null`, `""`, or `"null"`
- **Known limits**: Large queries (2000+ tasks) may be slow

## 🚨 Critical: JXA Performance Rules

### NEVER Use .where() or .whose() Methods
**We run in JXA context, NOT OmniJS. These methods don't exist in our environment.**

```javascript
// ❌ NEVER - Takes 25+ seconds or fails entirely
const tasks = doc.flattenedTasks.whose({completed: false})();
const tasks = doc.flattenedTasks.where(task => !task.completed);

// ✅ ALWAYS - Use standard JavaScript
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  try {
    if (!task.completed()) tasks.push(task);
  } catch (e) { /* skip */ }
}
```

### Performance Best Practices
- **Direct try/catch** is 50% faster than safeGet() wrappers
- **Use timestamps** for date comparisons, not Date objects in loops
- **Early exit** on most common conditions (completed, no date)
- Set `skipAnalysis: true` for 30% faster queries when recurring analysis not needed

## 🚨 Critical: Script Size Limits & CLI Testing - EMPIRICALLY VERIFIED ✅

### Script Size Limits - CORRECTED (September 2025)
**Previous Assumption:** 19KB limit (INCORRECT)
**Empirical Reality:**
- **JXA Direct:** 523,266 characters (~511KB)
- **OmniJS Bridge:** 261,124 characters (~255KB)

**Key Finding:** Our "19KB limit" was only **3.6%** of actual JXA capacity!

**Current Codebase Status:**
- Largest script: `helpers.ts` (31,681 chars) - only 6% of JXA limit
- All scripts well within empirical limits
- No size constraints for planned development

**See `/docs/dev/SCRIPT_SIZE_LIMITS.md` for complete empirical testing results.**

### CLI Testing - SOLVED ✅
**Previous misconception:** "CLI testing hangs forever"  
**Reality:** MCP servers exit when stdin closes (correct behavior)

**Proper CLI Testing Pattern:**
```bash
# ✅ CORRECT - Include required clientInfo parameter
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js

# ❌ WRONG - Missing clientInfo causes schema validation error  
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' | node dist/index.js
```

### Helper Function Strategy - UPDATED
- **Empirical capacity:** 523KB for JXA, 261KB for OmniJS bridge
- **Current largest:** `getAllHelpers()` ~30KB (only 6% of JXA limit)
- **Recommendation:** Use appropriate helper level for functionality needed

**Available helper functions:**
- `getCoreHelpers()` - Essential JXA utilities (~8KB)
- `getAllHelpers()` - Full helper suite (~30KB, **now safe to use freely**)
- `getBridgeOperations()` - evaluateJavascript() bridge templates

## 🚨 CRITICAL: JavaScript Execution Decision Tree

**When to use each approach:**
```
Operation needed?
├── Simple read/write → Use Pure JXA
├── Tags during creation → Use JXA + Bridge
├── Task movement → Use JXA + Bridge
├── Repetition rules → Use JXA + Bridge
├── Bulk operations → Use JXA + Bridge (if performance needed)
└── Everything else → Start with Pure JXA, add bridge if needed
```

**Key Rules:**
- All scripts MUST start with JXA (`Application('OmniFocus')`)
- NEVER use pure OmniJS without JXA wrapper
- Bridge operations use `app.evaluateJavascript(omniJsCode)`
- See `/docs/dev/ARCHITECTURE.md` for complete implementation patterns

### Implementation Pattern - UPDATED
```typescript
// ✅ NOW SAFE - Use full helpers as needed
import { getAllHelpers } from '../shared/helpers.js';
export const FULL_FEATURED_SCRIPT = `
  ${getAllHelpers()}  // ~30KB - well within 523KB limit
  // ... complex script logic
`;

// ✅ STILL GOOD - Use minimal helpers for simple cases
import { getMinimalHelpers } from '../shared/helpers.js';
export const SIMPLE_SCRIPT = `
  ${getMinimalHelpers()}  // ~8KB for basic needs
  // ... simple script logic
`;
```

### When Scripts Fail with Syntax Errors
- **Script size is unlikely to be the issue** (limits are 523KB+ for JXA)
- Check for JXA vs OmniJS syntax differences
- Validate JavaScript syntax and variable scoping
- Test with both direct execution AND Claude Desktop

## 🚨 CRITICAL: Async Operation Lifecycle (September 2025)

**THE PROBLEM:** MCP server exits immediately when stdin closes, killing osascript child processes before they return results.

**THE SOLUTION:** Implement pending operations tracking:
```typescript
// ✅ REQUIRED: Track async operations to prevent premature exit
const pendingOperations = new Set<Promise<any>>();
setPendingOperationsTracker(pendingOperations);

const gracefulExit = async (reason: string) => {
  logger.info(`${reason}, waiting for pending operations to complete...`);
  if (pendingOperations.size > 0) {
    await Promise.allSettled([...pendingOperations]);
  }
  process.exit(0);
};

process.stdin.on('end', () => gracefulExit('stdin closed'));
```

**SYMPTOMS of missing async tracking:**
- Tools execute but return no response
- osascript processes get killed mid-execution  
- "Silent failures" where tools appear to work but produce no output

**See `docs/LESSONS_LEARNED.md` for complete implementation details.**

## Quick Reference

### Commands
```bash
npm run build        # Compile TypeScript (required before running)
npm run dev          # Watch mode
npm test             # Unit tests
npm run test:integration  # Integration tests

# Direct MCP Testing (Fast debugging - see docs/operational/TESTING_TOOLS.md)
node emergency-diagnostic.js  # Test all tools quickly
node test-single-tool.js <tool_name> [params]  # Detailed single tool testing  
node test-suite-comprehensive.js  # Full test suite

# Legacy Testing
node tests/integration/test-as-claude-desktop.js  # Simulate Claude Desktop
npx @modelcontextprotocol/inspector dist/index.js  # Interactive testing
```

### Before You Implement - Run These First

```bash
# Find similar operations in codebase
grep -r "your_operation_name" src/omnifocus/scripts/ --include="*.ts"

# Find all bridge usage patterns
grep -r "evaluateJavascript" src/omnifocus/scripts/ --include="*.ts" -B2 -A10

# Find bulk operation patterns
grep -r "forEach.*task\|flattenedTasks" src/omnifocus/scripts/ --include="*.ts" -l

# Count how many items you'll process (example)
grep -c "task.id" src/omnifocus/scripts/your-script.ts

# Profile existing script (if optimizing)
time node -e "import('./dist/omnifocus/scripts/your-script.js').then(m => console.log(m.YOUR_SCRIPT.length))"
```

### Testing Pattern
**✅ ALL TOOLS NOW WORK WITH PROPER MCP CALLS**

**✅ RECOMMENDED - Direct MCP tool calls (now working for all tools):**
```bash
# Initialize and call any tool directly
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js

# Test OmniFocus tools (all working in CLI as of Sept 2025)
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"today","limit":"3"}}}' | node dist/index.js
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"manage_task","arguments":{"operation":"create","name":"CLI Test"}}}' | node dist/index.js

# System tools also work
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"system","arguments":{"operation":"version"}}}' | node dist/index.js
```

**Alternative - Legacy testing scripts (if available):**
```bash
# Alternative method using helper scripts
node test-single-tool-proper.js tasks '{"mode":"today","limit":"3"}'
node test-single-tool-proper.js manage_task '{"operation":"create","name":"Test"}'
```

**Legacy patterns (still work for system tools):**
```bash
# ✅ System tools work with direct calls
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"system","arguments":{"operation":"version"}}}' | node dist/index.js

# ⚠️ FALLBACK - Use timeout only if server doesn't exit gracefully  
timeout 10s node dist/index.js <<< '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**MCP Specification Compliance**: 
- **stdio transport**: Client closes stdin → Server exits gracefully ✅ IMPLEMENTED
- **No protocol shutdown**: MCP uses transport-level termination, not JSON-RPC methods
- **Graceful cascade**: stdin close → server exit → SIGTERM → SIGKILL (if needed)
- **Our Implementation**: Added stdin 'end'/'close' handlers → process.exit(0) for clean termination

## 📖 MCP Specification Reference

**Official MCP Specification**: https://modelcontextprotocol.io/specification/2025-06-18/

### Key Specification Sections
- **[Lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)** - Server startup, initialization, and shutdown
- **[Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)** - stdio, HTTP/SSE transport mechanisms
- **[Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)** - Tool definition, parameter schemas, execution
- **[Prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)** - Prompt registration and argument handling

### Critical Implementation Details
- **Version**: Current protocol version is "2025-06-18"  
- **Transport**: We use stdio transport (stdin/stdout communication)
- **Shutdown**: No protocol-level shutdown - servers exit when stdin closes
- **Error Handling**: Use McpError with proper error codes from specification
- **Type Safety**: Parameter schemas must handle Claude Desktop's string conversion

### SDK Version Management
- **Current**: @modelcontextprotocol/sdk@1.17.4 (matches latest available)
- **Update Check**: `npm view @modelcontextprotocol/sdk version`
- **GitHub Repo**: https://github.com/modelcontextprotocol/typescript-sdk

### Common MCP Patterns & Requirements
- **Tool Schemas**: Use Zod schemas, handle string coercion for Claude Desktop
- **Response Format**: `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
- **Error Codes**: INVALID_REQUEST (-32600), METHOD_NOT_FOUND (-32601), INVALID_PARAMS (-32602), INTERNAL_ERROR (-32603)
- **Capabilities**: Declare tool and prompt capabilities during initialization
- **Transport**: stdio uses stdin/stdout, HTTP uses Server-Sent Events

### When In Doubt
Always reference the official specification rather than making assumptions about MCP behavior.

### Project Structure
- `src/omnifocus/`: OmniAutomation integration via JXA
- `src/tools/`: MCP tools (tasks, projects, analytics, export)
- `src/cache/`: TTL-based caching (30s tasks, 5m projects, 1h analytics)

### Key Design
- **OmniAutomation only** - No direct DB access, all via osascript
- **Caching** - Auto-invalidated on writes
- **Errors** - McpError for protocol compliance

## Debugging Tips
- **Server won't start?** Run `npm run build` - usually missing dist/
- **Script timeouts?** Check OmniFocus not blocked by dialogs
- **ID issues?** See src/omnifocus/scripts/tasks.ts for extraction patterns

## 🚨 CRITICAL: MCP Testing Pattern Recognition

**NEVER confuse graceful server exit with failure!**

### ✅ SUCCESS Pattern:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks [...]
# JSON response appears here (if any)
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```
**This is SUCCESSFUL execution!** The server exits gracefully as required by MCP spec.

### ❌ FAILURE Pattern:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks [...]
{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"SCRIPT_ERROR",...}}
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```
**This shows actual failure** - JSON error response before graceful exit.

### Key Indicators:
- **Success**: Tool execution log + graceful exit (JSON response may not be visible in bash output)
- **Failure**: Tool execution log + JSON error response + graceful exit
- **The graceful exit itself is NEVER an error** - it's required MCP compliance!

### ✅ CLI Testing Status - RESOLVED (September 2025)
**ISSUE RESOLVED:** The previously documented v2.1.0 CLI testing regression has been resolved as of current codebase state.

**Current Status:**
- ✅ Read-only tools (system, tasks, projects): Perfect CLI testing
- ✅ Write tools with bridge helpers (manage_task create/update): **Now working in CLI**
- ✅ ALL tools work in both CLI and Claude Desktop

**Testing Verification (September 26, 2025):**
- Bridge operations (`app.evaluateJavascript`) execute successfully in CLI
- Tag assignment via bridge works correctly in CLI testing
- Task creation with tags completes without truncation issues
- The "line 145 truncation" issue no longer reproduces

**For Development:** Both CLI testing and Claude Desktop can be used for all operations. The regression documented in earlier versions has been resolved.

## 🚨 Common Mistakes & How to Avoid Them

### Mistake 1: "I'll optimize by reducing API calls"
**Wrong focus:** Reducing osascript calls from 3→1
**Actual bottleneck:** JXA property access overhead (1000+ calls)
**How to avoid:** Profile FIRST, then optimize the actual slow part
**Example:** Cache warming - flattenedTasks() was fast (160ms), property access was slow (5+ min)

### Mistake 2: "I'll just write the code directly"
**Missing step:** Search for existing patterns
**Result:** Reinvent the wheel, miss better approach
**How to avoid:** Run grep commands from checklist above BEFORE implementing

### Mistake 3: "Bulk operations = multiple queries"
**Wrong assumption:** Bulk means many API calls
**Reality:** Bulk means processing many items (use bridge!)
**How to avoid:** Count items, not API calls. >100 items = bulk operation.

### Mistake 4: "JXA is fine for everything"
**Missing context:** JXA property access has overhead (~1-2ms per item)
**Reality:** Bridge is 1000x faster for bulk property access (~0.001ms per item)
**How to avoid:** Check decision tree when processing >100 items
**Proof:** Cache warming - JXA timed out (5+ min), bridge completed in 2.4s (125x faster)

### Mistake 5: "I optimized it, it should be faster"
**Wrong approach:** Implement optimization without measuring
**Missing step:** Profile to identify actual bottleneck
**How to avoid:** Always test/profile BEFORE and AFTER optimization
**Tools:** `time node script.js`, add timing instrumentation, check logs

### Mistake 6: "Tool returns wrong data, must be the script"
**Wrong assumption:** The script logic is broken
**Missing step:** Test MCP integration to see what script actually returns
**Reality:** Script might be working perfectly, tool wrapper processes it wrong
**How to avoid:** ALWAYS run MCP integration test before opening script files

**Real example: productivity_stats bug hunt**
- User reported: Tool returns all 0s (totalTasks: 0, completedTasks: 0)
- I debugged: Opened productivity-stats.ts script file immediately
- Found bugs: Missing date upper bound, period not normalized to midnight
- Fixed bugs: Commit e88c50e - script logic improved
- Still broken: User still sees 0s
- Added logging: console.error() debug statements → broke the script!
- User suggested: "Run the test yourself"
- **Finally tested MCP integration:** Script returns completedInPeriod: 95 ✓, tool returns 0 ✗
- **Root cause found:** Tool wrapper double-unwrapping issue in ProductivityStatsToolV2.ts
- **Fix applied:** Commit 84c01cc - unwrap both layers, works perfectly

**Cost of not following the rule:**
- 7 debugging cycles instead of 1
- 2 hours wasted debugging the wrong layer
- Fixed 2 real bugs that weren't causing the issue
- Broke the script with console.error() (doesn't exist in JXA)
- Required user to suggest testing myself

**What I should have done:**
1. Run MCP integration test FIRST (5 minutes)
2. Compare script output (95) vs tool output (0)
3. Identify: Wrapper issue, not script issue
4. Fix: ProductivityStatsToolV2.ts unwrapping logic
5. Total time: 10 minutes vs 2 hours

**Lesson:** See `/docs/dev/PATTERNS.md` → "Tool Returns Empty/Zero Values" for diagnostic commands

## Known Limitations & Workarounds

### JXA whose() Limitations
- No "not null" support
- String operators: Use underscore prefix (`_contains`, `_beginsWith`)
- Date operators: Use symbols (`>`, `<`, `>=`, `<=`)
- Complex queries timeout with 2000+ tasks

### Quality Criteria
Solutions must:
- Solve the exact problem (no more, no less)
- Require minimal code modification
- Maintain existing patterns
- Be immediately implementable