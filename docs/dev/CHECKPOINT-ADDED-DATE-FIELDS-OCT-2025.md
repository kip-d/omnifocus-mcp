# Checkpoint: Added/Modified/DropDate Field Implementation

**Date:** October 22, 2025
**Branch:** main
**Status:** Script enrichment working ✅ | MCP integration debugging needed ⚠️
**Commits:** 994320d, 157c875

---

## 🎯 Objective

Enable access to `added`, `modified`, and `dropDate` fields on OmniFocus tasks through the MCP `tasks` tool.

**User Request:** "Can you now accurately tell me the creation dates for the 46 actions I see with a tag of 'test'"

**Problem:** These fields exist in the OmniFocus API (`DatedObject` class) but cannot be accessed via JXA due to Date type conversion limitations.

---

## ✅ What's Working

### 1. Pattern Successfully Implemented

Following the **embedded bridge helper pattern** from `minimal-tag-bridge.ts`:

**File:** `src/omnifocus/scripts/shared/date-fields-bridge.ts` (NEW)
- Created `bridgeGetDateFields(app, taskIds)` function
- Returns: `{taskId: {added, modified, dropDate}, ...}`
- Follows exact pattern from tag bridge
- ~1KB size, efficient bulk retrieval

**File:** `src/omnifocus/scripts/tasks/list-tasks.ts` (MODIFIED)
- Lines 19-22: Imported and embedded bridge helper
- Lines 427-465: In-script enrichment after task filtering
- Only runs when date fields explicitly requested
- Single execution context (no two-stage queries)

### 2. Script-Level Verification ✅

**Test:** Direct osascript execution of built script

```bash
# Test script execution directly
node -e "
import { OmniAutomation } from './dist/omnifocus/omniautomation.js';
const omni = new OmniAutomation();
const script = omni.buildScript(
  (await import('./dist/omnifocus/scripts/tasks/list-tasks.js')).LIST_TASKS_SCRIPT,
  { filter: { tags: ['test'], limit: 2 }, fields: ['id', 'name', 'added', 'modified'] }
);
const result = await omni.execute(script);
"
```

**Result:** ✅ SUCCESS
```json
{
  "id": "ehBgRYDMXmG",
  "name": "Task with Planned Date",
  "added": "2025-10-20T19:17:16.534Z",
  "modified": "2025-10-20T19:17:16.534Z"
}
```

**Verification:** Script correctly:
1. Detects date fields are requested
2. Calls `bridgeGetDateFields(app, taskIds)`
3. Merges date fields into results
4. Returns enriched tasks

### 3. Standalone Bridge Test ✅

**Test:** `/tmp/test-bulk-added-dates.js`
```javascript
const omnijsScript = `
  const tasks = flattenedTasks;  // Property, not method
  const task = tasks[0];
  const added = task.added;      // Direct property access
  added.toISOString()            // Success!
`;
```

**Result:** Returns valid ISO date strings for 10 test tasks

### 4. Documentation Created ✅

All pattern documentation completed and committed:
- `CLAUDE.md` - Prominent "STOP" section added
- `docs/dev/PATTERN_INDEX.md` - NEW comprehensive pattern catalog
- `minimal-tag-bridge.ts` - Enhanced with pattern header
- `date-fields-bridge.ts` - Implementation example added
- `LESSONS_LEARNED.md` - This incident documented with cost analysis

---

## ⚠️ What's NOT Working

### MCP Tool Response Missing Date Fields

**Symptom:** When querying via MCP tool, date fields don't appear in response

**Test:**
```javascript
mcp__omnifocus__tasks({
  mode: "all",
  tags: ["test"],
  limit: 5,
  fields: ["id", "name", "added", "modified"]
})
```

**Actual Response:**
```json
{
  "tasks": [
    {
      "id": "ehBgRYDMXmG",
      "name": "Task with Planned Date"
      // ❌ added and modified fields MISSING
    }
  ]
}
```

**Expected Response:**
```json
{
  "tasks": [
    {
      "id": "ehBgRYDMXmG",
      "name": "Task with Planned Date",
      "added": "2025-10-20T19:17:16.534Z",
      "modified": "2025-10-20T19:17:16.534Z"
    }
  ]
}
```

### Evidence of Where Data is Lost

**Known Facts:**
1. ✅ Script returns dates (verified via direct execution)
2. ✅ Script built correctly (19,299 chars, includes bridge)
3. ❌ MCP response doesn't contain dates
4. ⚠️ Issue is in `QueryTasksToolV2` processing layer

**Suspected Locations:**
- `src/tools/tasks/QueryTasksToolV2.ts:1262` - `parseTasks()` method
- `src/tools/tasks/QueryTasksToolV2.ts:1294` - `projectFields()` method

### Debugging Attempts Made

1. **Added debug logging** - Not visible in output (logger calls added but not showing)
2. **Checked field projection** - Logic looks correct but may have edge case
3. **Verified script compilation** - Bridge code present in dist/

**Note:** Debugging was interrupted by working directory issue (was in `src/tools/tasks/` instead of project root). After fixing, ran out of context/time.

---

## 🔍 Next Steps for Fresh Context

### 1. Verify Data Flow Through Tool Layer

**Add temporary debug output** to see where dates are lost:

```typescript
// In QueryTasksToolV2.ts, around line 1100 (handleAllTasks method)
const result = await this.execJson(script);

// ADD THIS:
this.logger.info('[DATE_DEBUG] Raw script result:', JSON.stringify(result.data));

const tasks = this.parseTasks(data.tasks || []);

// ADD THIS:
this.logger.info('[DATE_DEBUG] After parseTasks:', JSON.stringify(tasks[0]));

const projectedTasks = this.projectFields(tasks, args.fields);

// ADD THIS:
this.logger.info('[DATE_DEBUG] After projectFields:', JSON.stringify(projectedTasks[0]));
```

### 2. Check parseTasks Method

**File:** `src/tools/tasks/QueryTasksToolV2.ts:1262-1289`

```typescript
private parseTasks(tasks: unknown[]): OmniFocusTask[] {
  return tasks.map(task => {
    const t = task as {
      added?: string | Date;
      modified?: string | Date;
      dropDate?: string | Date;
      // ...
    };
    return {
      ...t,
      added: t.added ? new Date(t.added) : undefined,
      modified: t.modified ? new Date(t.modified) : undefined,
      dropDate: t.dropDate ? new Date(t.dropDate) : undefined,
      // ...
    } as unknown as OmniFocusTask;
  });
}
```

**Potential Issue:** If `t.added` is coming through as string but conversion fails silently?

### 3. Check projectFields Method

**File:** `src/tools/tasks/QueryTasksToolV2.ts:1294-1330`

```typescript
private projectFields(tasks: OmniFocusTask[], selectedFields?: string[]): OmniFocusTask[] {
  // ...
  selectedFields.forEach(field => {
    if (field in task) {  // ⚠️ POTENTIAL ISSUE
      const typedField = field as keyof OmniFocusTask;
      (projectedTask as Record<string, unknown>)[field] = task[typedField];
    }
  });
}
```

**Potential Issue:**
- `if (field in task)` returns `true` even if value is `undefined`
- If parseTasks sets `added: undefined`, the field exists but has no value
- projectFields might copy undefined and it gets stripped somewhere

**Test:** Check if `'added' in task` when `added: undefined`

### 4. Run Integration Test

```bash
npm run build

# Test with actual MCP call, capture full output
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"all","tags":["test"],"limit":"2","fields":["id","name","added","modified"]}}}' | \
  node dist/index.js 2>&1 | tee /tmp/debug-output.log

# Search for added field in output
grep -i "added" /tmp/debug-output.log
```

### 5. Quick Validation Test

**Create minimal test:**

```bash
# File: /tmp/test-parse-flow.js
node -e "
import { OmniFocusTask } from './dist/omnifocus/types.js';

// Simulate what parseTasks receives
const rawTask = {
  id: 'test-id',
  name: 'Test Task',
  added: '2025-10-20T19:17:16.534Z'  // String from script
};

// Simulate parseTasks conversion
const parsed = {
  ...rawTask,
  added: rawTask.added ? new Date(rawTask.added) : undefined
};

console.log('Raw:', rawTask.added);
console.log('Parsed:', parsed.added);
console.log('Is Date?:', parsed.added instanceof Date);

// Test projectFields logic
const fields = ['id', 'name', 'added'];
const projected = {};
fields.forEach(field => {
  if (field in parsed) {
    console.log('Field', field, 'exists:', parsed[field]);
    projected[field] = parsed[field];
  }
});

console.log('Projected:', projected);
"
```

---

## 📋 Important Context

### Architecture Decision: Embedded Bridge Pattern

**✅ CORRECT APPROACH** (what we implemented):
```typescript
export const MY_SCRIPT = `
  ${getBridgeHelper()}  // Embed in script

  (() => {
    const results = filterTasks();
    const enriched = bridgeEnrich(app, results);  // Call within script
    return JSON.stringify(enriched);
  })()
`;
```

**❌ WRONG APPROACH** (what we initially tried):
```typescript
// Two-stage query from TypeScript
const tasks = await this.execJson(queryScript);
const enriched = await this.execJson(enrichScript);  // WRONG
// Merge in TypeScript...
```

**Why Wrong:** Two osascript executions, complex state management, prone to bugs

**Pattern Source:** `src/omnifocus/scripts/shared/minimal-tag-bridge.ts`

**Lesson Learned:** Spent 2+ hours on wrong approach before user reminded us to search for existing patterns. Pattern search would have taken 30 seconds.

### Files Modified

**Created:**
- `src/omnifocus/scripts/shared/date-fields-bridge.ts` - Bridge helper
- `docs/dev/PATTERN_INDEX.md` - Pattern catalog

**Modified:**
- `src/omnifocus/scripts/tasks/list-tasks.ts` - Added enrichment (lines 19-22, 427-465)
- `CLAUDE.md` - Added STOP section
- `docs/dev/LESSONS_LEARNED.md` - Documented incident
- `minimal-tag-bridge.ts` - Enhanced documentation

**Not Modified** (attempted but removed):
- `src/tools/tasks/QueryTasksToolV2.ts` - Two-stage query attempt was backed out

### Test Tasks Available

User has 46-48 tasks with tag "test" for verification:
```bash
# Sample task IDs:
ehBgRYDMXmG - "Task with Planned Date" - added: 2025-10-20T19:17:16.534Z
g9t_HvVcpwH - "Planned Task for Query" - added: 2025-10-20T19:17:17.557Z
nSp2Y369riR - "Task with Planned Date" - added: 2025-10-22T14:38:07.804Z
```

---

## 🚨 Critical Reminders

### 1. Pattern Search Protocol

**BEFORE implementing anything:**
```bash
grep -r "keyword" src/omnifocus/scripts/shared/
```

**Check:** `docs/dev/PATTERN_INDEX.md`

**Cost of skipping:** 2+ hours (today's lesson)

### 2. JXA vs OmniJS Context

- JXA: Cannot access `task.added`, `task.modified`, `task.dropDate` (Date conversion fails)
- OmniJS: CAN access as properties: `task.added` (not `task.added()`)
- Bridge: Use `app.evaluateJavascript()` to run OmniJS from JXA context

### 3. Testing Levels

1. **Direct osascript** - Test script in isolation ✅ WORKS
2. **Node OmniAutomation** - Test through OmniAutomation class ✅ WORKS
3. **MCP tool call** - Full integration ❌ BROKEN (debugging needed)

### 4. Don't Reinvent Two-Stage Queries

If you find yourself writing:
```typescript
const result1 = await this.execJson(script1);
const result2 = await this.execJson(script2);
// Merge...
```

**STOP.** You're doing it wrong. Embed and enrich in-script.

---

## 📊 Success Criteria

Implementation is complete when:

1. ✅ Script enriches tasks with date fields (DONE)
2. ✅ Direct script execution returns dates (VERIFIED)
3. ❌ MCP tool response includes dates (TODO)
4. ❌ User can query: `fields: ["id", "name", "added"]` and receive all three (TODO)
5. ✅ Documentation updated (DONE)

**Remaining:** Debug why MCP tool layer loses the date fields that the script correctly returns.

---

## 🔬 Debugging Hypothesis

**Most Likely Issue:**

The `projectFields` method is copying fields but something about Date objects or undefined values is causing them to be stripped before JSON serialization.

**Test:**
1. Add logging in `handleAllTasks` after each transformation step
2. Check if dates exist after `parseTasks`
3. Check if dates exist after `projectFields`
4. Check if dates exist in `createTaskResponseV2`

**Quick Win:**

If dates are being lost in `projectFields`, the fix might be as simple as:

```typescript
// BEFORE (potential issue):
if (field in task) {
  projected[field] = task[field];  // Copies undefined
}

// AFTER (potential fix):
if (field in task && task[field] !== undefined) {
  projected[field] = task[field];  // Only copies actual values
}
```

---

## 📁 Reference Files

**For understanding:**
- `minimal-tag-bridge.ts` - Pattern source
- `create-task.ts:158-162` - How tags use bridge (working example)
- `list-tasks.ts:427-465` - Our enrichment implementation

**For debugging:**
- `QueryTasksToolV2.ts:1262` - parseTasks method
- `QueryTasksToolV2.ts:1294` - projectFields method
- `QueryTasksToolV2.ts:1076-1126` - handleAllTasks method

**For testing:**
- `/tmp/test-bulk-added-dates.js` - Standalone bridge test (works)
- `/tmp/test-list-tasks-with-dates.js` - Minimal enrichment test (works)

---

## 💬 User Quote to Remember

> "So can we explore using OmniJS to get at these fields?"

That simple question, asked after 2 hours of wrong approach, led us to find the existing pattern. **Always search for patterns before implementing.**

---

**Next developer:** Start with the debugging steps in section "🔍 Next Steps for Fresh Context". The script works, the bridge works, something in the tool layer is filtering out the dates. Find it, fix it, verify with the test tasks.
