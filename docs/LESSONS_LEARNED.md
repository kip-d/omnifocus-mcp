# OmniFocus MCP: Critical Lessons Learned

## ⚠️ Essential Knowledge for Future Development

This document captures hard-won insights from developing OmniFocus MCP v2.0.0. These lessons will save you from repeating our mistakes.

## 🚨 Critical Performance Issues

### 1. NEVER Use whose() in JXA
**Problem:** JXA's `whose()` method takes 25+ seconds for simple queries
```javascript
// ❌ CATASTROPHIC - Takes 25+ seconds
const tasks = doc.flattenedTasks.whose({completed: false})();

// ✅ FAST - Takes <100ms
const tasks = doc.flattenedTasks();
const incompleteTasks = [];
for (let i = 0; i < tasks.length; i++) {
  if (!tasks[i].completed()) incompleteTasks.push(tasks[i]);
}
```
**Impact:** 95% performance improvement by removing all whose() calls

### 2. Script Size Limits (50KB Max)
**Problem:** JXA scripts over ~50KB get truncated, causing syntax errors
```javascript
// ❌ Script with all helpers inline - 75KB - FAILS
const script = `${allHelperFunctions} ${mainLogic}`;

// ✅ Minimal helpers - 15KB - WORKS
const script = `${minimalHelpers} ${mainLogic}`;
```
**Solution:** 
- Use `getMinimalHelpers()` not `getAllHelpers()`
- Pass complex data as JSON strings
- Parse inside the script

### 2b. JXA Runtime Parsing Limits (~5-10KB) - CRITICAL
**Problem:** Scripts over ~5-10KB cause misleading "Can't convert types" JXA runtime errors
```javascript
// ❌ FAILS - 9,679 chars - "Can't convert types" error
export const UPDATE_PROJECT_SCRIPT = `
  ${getMinimalHelpers()}
  // ... complex folder logic (2,543 chars)
  // ... complex review logic (1,413 chars)
  // ... advanced properties logic
`;

// ✅ WORKS - 4,922 chars - Success!
export const UPDATE_PROJECT_SCRIPT = `
  ${getMinimalHelpers()}
  // ... only essential updates (name, note, dates, status)
`;
```

**CRITICAL INSIGHT:** "Can't convert types" is often NOT a type conversion issue - it's a script size issue!

**Debugging Process (September 2025):**
- Template substitution: ✅ Working correctly  
- Individual JXA operations: ✅ All work fine
- Script wrapping logic: ✅ No double-wrapping
- Direct osascript execution: ✅ Works perfectly
- **Root cause: Script too large for JXA runtime parser**

**Solution:**
- Keep core scripts under 5,000 characters
- Remove bloated features (complex folder moves, advanced properties)
- Split complex operations into focused, modular scripts
- Test script sizes regularly: `script.length < 5000`

**Impact:** Fixed project update "Can't convert types" errors by reducing UPDATE_PROJECT_SCRIPT from 9,679 to 4,922 chars (49% reduction)

### 3. Direct Property Access is Faster
**Finding:** Direct try/catch is 50% faster than wrapper functions
```javascript
// ❌ SLOWER - Wrapper function
const name = safeGet(() => task.name());

// ✅ FASTER - Direct access
let name;
try { name = task.name(); } catch { name = null; }
```

## 🐛 OmniFocus UI Issues & Inconsistencies

### Task Count Discrepancy (September 2025)
**Issue:** OmniFocus UI count line doesn't match displayed content in "Everything" view

**Details:**
- **OmniFocus UI Bug**: Projects view set to "Everything" shows completed tasks but doesn't count them in status line
- **Example**: Shows 1,449 tasks in count but displays 1,828 total tasks (including 379 completed)
- **UI displays**: "122 inbox items, 1,327 actions, 394 projects" 
- **Reality**: ~1,828 total tasks (our MCP server count is correct)

**Root Cause:** OmniFocus UI inconsistency - "Everything" view should either:
1. Count completed items in status line totals, OR
2. Not display completed items if they won't be counted

**Impact:** 
- Users may report "discrepancies" between MCP server counts and UI counts
- **Our MCP server is correct** - `doc.flattenedTasks()` returns complete dataset
- This is a **UI presentation bug**, not a data accuracy issue

**Status:** Bug identified but not yet reported to OmniGroup (as of Sept 2025)

**For Developers:**
- Expect user reports about count "mismatches" 
- Explain that MCP gives complete/accurate totals
- OmniFocus UI filtering is inconsistent in "Everything" view

## 🚨 CRITICAL: Systematic Script Size Crisis (September 2025)

### Major Architectural Gap Discovered
**Problem:** Found 36 files still using `getAllHelpers()` causing massive script bloat

**Impact:**
- Scripts were 41KB+ (approaching 50KB JXA limit)
- "Can't convert types" errors were actually **script truncation failures**
- Multiple tools failing with identical symptoms
- 6+ months of undiscovered performance issues

**Root Cause Analysis:**
- Previous helper optimization was **incomplete**
- No systematic audit process in place  
- Easy to miss during individual feature development
- `getAllHelpers()` includes 75KB+ of code vs 5KB minimal helpers

**Systematic Solution Applied:**
```bash
# Found 36 files with getAllHelpers() usage
Analytics scripts (4 files)    → getAnalyticsHelpers()
Export scripts (3 files)       → getSerializationHelpers() 
Task queries (9 files)         → getBasicHelpers()
CRUD operations (6 files)      → getBasicHelpers()
Simple operations (8 files)    → getMinimalHelpers()
Recurring tasks (2 files)      → getRecurrenceHelpers()
Date ranges (2 files)          → getBasicHelpers()
Project stats (1 file)         → getAnalyticsHelpers()
Reviews (3 files)              → getBasicHelpers()
```

**Lessons for Future:**
1. **Mandatory Helper Audits**: Add to development checklist
2. **Automated Detection**: Consider linting rules for `getAllHelpers()`  
3. **Individual Analysis Required**: Never blindly replace - each script needs appropriate helpers
4. **Script Size Monitoring**: Track script sizes during development

**Expected Impact:** 
- Resolves all "Can't convert types" errors from script size limits
- 90% reduction in script sizes (5KB vs 75KB+)
- Dramatic performance improvements across all tools

### Second Wave: REPEAT_HELPERS Crisis (September 2025)

**Problem Discovered:** Even after the systematic cleanup, scripts were STILL hitting size limits due to massive REPEAT_HELPERS (321 lines) being imported unnecessarily.

**Scripts Affected:**
- 3 LIST scripts: Only needed to READ repeat rules, but imported full 321-line helpers
- 2 CRUD scripts: Properly needed repeat functionality but used inefficient imports
- getAllHelpers(): Included massive repeat helpers by default

**Final Solution:**
```bash
# LIST scripts (read-only): Minimal helper + 8-line extractor
list-tasks*.ts → getBasicHelpers() + extractRepeatRuleInfo() (8 lines)

# CRUD scripts (full functionality): Proper recurrence helpers 
create-project.ts, update-task.ts → getRecurrenceHelpers()

# Safety improvement: Remove from default helpers
getAllHelpers() → no longer includes REPEAT_HELPERS by default
```

**Final Impact:**
- List scripts: 75KB → 15KB (80% reduction)
- CRUD scripts: 75KB → 35KB (53% reduction) 
- All scripts now well under 50KB JXA limit
- Complete elimination of "Can't convert types" errors

**Key Architectural Lesson:** 
- READ operations: Minimal helpers + focused extractors
- WRITE operations: Full helpers only when needed
- Default helpers should be lean, specialized helpers explicit

---

## 🔧 Technical Gotchas

### 4. Bridge Context Consistency
**Problem:** Writing via `evaluateJavascript()` but reading via JXA causes invisible changes
```javascript
// ❌ WRONG - Mixed contexts
app.evaluateJavascript(`task.tags = [tag1, tag2]`);  // Write
const tags = task.tags();  // Read via JXA - won't see changes!

// ✅ CORRECT - Same context
app.evaluateJavascript(`
  task.tags = [tag1, tag2];
  task.tags.map(t => t.name());  // Read in same context
`);
```

### 5. MCP Bridge Type Coercion
**Problem:** Claude Desktop converts ALL parameters to strings
```typescript
// ❌ FAILS with Claude Desktop
schema: z.object({
  limit: z.number()  // Will receive "25" not 25
})

// ✅ WORKS everywhere
schema: z.object({
  limit: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10))
  ])
})
```

### 6. Task Status is Not a Simple Property
**Problem:** Task availability depends on multiple factors
```javascript
// ❌ INCOMPLETE - Misses many cases
const available = !task.completed() && !task.blocked();

// ✅ COMPLETE - Checks all conditions
const available = !task.completed() && 
                  !isBlocked(task) &&
                  !isDeferred(task) &&
                  projectIsActive(task);
```

## 🏗️ Architecture Decisions

### 7. Tool Consolidation for LLMs
**Finding:** Fewer tools = better LLM performance
- v1: 22 tools → confusion, wrong tool selection
- v2: 14 tools → clear mental model, consistent patterns
- **Pattern:** Use `operation` parameter for related actions

### 8. Summary-First Responses
**Finding:** LLMs and users need insights before data
```javascript
// ❌ Data dump
return { tasks: [500 items...] }

// ✅ Summary first
return {
  summary: { 
    insights: ["3 tasks overdue", "Focus on Project X"],
    total: 500
  },
  data: { tasks: [...] }
}
```

### 9. Date Handling Smart Defaults
**Finding:** Users expect intelligent date defaults
- Due dates without time → 5:00 PM (end of work)
- Defer dates without time → 8:00 AM (start of work)
- "Today" → appropriate time based on context

## 🐛 Common Pitfalls

### 10. Tags During Task Creation
**Issue:** JXA cannot set tags during task creation
**Workaround:** Use evaluateJavascript() bridge after creation

### 11. Project ID Extraction
**Issue:** Claude Desktop may extract partial IDs
```javascript
// Full ID: "az5Ieo4ip7K"
// Claude might extract: "547"
// Solution: Always validate full alphanumeric ID
```

### 12. Invisible Sanitization
**Issue:** Parameters silently filtered by sanitization
```javascript
// Parameter 'minimalResponse' not in whitelist → silently removed
// Solution: Always check sanitization whitelist when adding parameters
```

## 📊 Performance Benchmarks

### Target Performance (2000+ tasks)
- Query operations: <1 second ✅
- Write operations: <500ms ✅
- Analytics: <2 seconds ✅
- Export: <3 seconds ✅

### Performance Killers
1. `whose()` method: +25 seconds
2. `safeGet()` in loops: +50% overhead
3. Date object creation in loops: +30% overhead
4. Full helper functions: Script size errors

## 🎯 Best Practices

### Script Development
1. **Always use minimal helpers** - Avoid script size limits
2. **Never use whose()** - Manual iteration is 250x faster
3. **Direct try/catch in hot paths** - Avoid wrapper overhead
4. **Cache expensive calls** - Store task.id() outside loops

### Tool Design
1. **Consolidate related operations** - One tool per domain
2. **Use operation parameters** - Not separate tools
3. **Return summaries first** - Insights before data
4. **Support minimal response mode** - For bulk operations

### Testing
1. **Test with Claude Desktop** - String coercion issues
2. **Test with 2000+ items** - Performance at scale
3. **Test script size** - Stay under 50KB
4. **Test with real data** - Edge cases matter

## 🚀 Migration Path

### From v1 to v2
1. **Tools consolidated** - 22 → 14 tools
2. **Operation-based patterns** - Consistent interface
3. **No user migration needed** - LLMs handle it transparently
4. **Keep internal tools** - Used by consolidated tools

## 📝 Quick Reference

### Never Do
- Use `whose()` or `where()` in JXA
- Include all helpers (script too large)
- Mix evaluateJavascript and JXA contexts
- Trust Claude Desktop to preserve types
- Assume task properties are simple

### Always Do
- Use minimal helpers
- Test with large datasets
- Return summaries first
- Handle string coercion
- Validate full IDs

## 🔮 Future Considerations

### If Starting Fresh
1. Consider pure OmniJS with evaluateJavascript() throughout
2. Build a proper query engine outside the JXA context
3. Implement streaming for large datasets
4. Use TypeScript code generation for scripts

### Known Limitations
- JXA performance ceiling reached
- Script size limits are hard boundaries
- Bridge context switching has overhead
- Some OmniFocus features inaccessible via JXA

---

## 🚨 CRITICAL: MCP Server Lifecycle Compliance

### **The Great stdin Discovery (September 2025)**

**THE EMBARRASSING TRUTH:** For **6+ months and 50+ commits**, our MCP server violated the core MCP specification by never handling stdin closure properly.

#### What We Did Wrong
```typescript
// ❌ WRONG - Hangs forever, violates MCP spec
const transport = new StdioServerTransport();
await server.connect(transport); // Never exits when client closes stdin
```

#### The Hidden Cost
- **Every test required timeout**: `timeout 5s node dist/index.js`
- **2-minute waits for hanging processes**
- **Manual process killing** in development
- **Poor developer experience** for months
- **MCP specification violation** from day one

#### The Git History Investigation
- **Search result**: ZERO instances of `process.stdin.on` in entire git history
- **Original commit**: Missing stdin handling
- **Every commit since**: Never fixed the fundamental issue
- **Root cause**: MCP SDK examples don't show this pattern

#### The Correct Implementation
```typescript
// ✅ CORRECT - MCP specification compliant
const transport = new StdioServerTransport();

// Handle stdin closure for proper MCP lifecycle compliance
process.stdin.on('end', () => {
  logger.info('stdin closed, exiting gracefully per MCP specification');
  process.exit(0);
});

process.stdin.on('close', () => {
  logger.info('stdin stream closed, exiting gracefully per MCP specification');
  process.exit(0);
});

await server.connect(transport);
```

#### MCP Specification Requirements
**From https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle:**
- **stdio transport**: Client closes stdin → Server should exit gracefully
- **No protocol shutdown**: MCP uses transport-level termination
- **Graceful cascade**: stdin close → server exit → SIGTERM → SIGKILL

#### Testing Impact
```bash
# 🚫 BEFORE: Required timeout workaround
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5s node dist/index.js

# ✅ AFTER: Clean MCP-compliant shutdown  
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
# Exits immediately when stdin closes!
```

#### Key Lesson
**ALWAYS implement stdin handling in MCP servers.** The MCP SDK examples don't show this critical requirement, leading to widespread non-compliance.

**Developer Impact:** This single fix eliminated:
- All timeout requirements in testing
- 2-minute waits for hanging processes  
- Manual process killing
- MCP specification violations

---

**Remember:** These lessons cost months of debugging. When in doubt, check this document first before attempting optimizations or architectural changes.