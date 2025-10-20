# Checkpoint: Issue #27 - PlannedDate Support

**Date:** 2025-10-20
**Session:** Continuation after tag fixes
**Status:** ✅ MAJOR PROGRESS - Creation working, query optimization needed

## Starting Point
- 14 of 16 integration tests passing
- 2 tests failing: `plannedDate` field undefined in query results
- Tag retrieval fixed (JXA method calls)
- Performance improved (87.6s → 4.8s via OmniJS-first redesign)

## Root Cause Discovered

**JXA Property Assignment Doesn't Persist** (Same pattern as tags issue):
```javascript
// ❌ DOESN'T WORK - JXA assignment doesn't persist
task.plannedDate = new Date(taskData.plannedDate);  // Silent failure

// ✅ WORKS - OmniJS bridge required for persistence
const bridgeResult = bridgeSetPlannedDate(app, taskId, taskData.plannedDate);
```

## Solution Implemented

### 1. Created Bridge Helper (src/omnifocus/scripts/shared/minimal-tag-bridge.ts)

Added `bridgeSetPlannedDate()` function following the same pattern as `bridgeSetTags()`:

```javascript
// OmniJS template for setting plannedDate - reliable persistence
const __SET_PLANNED_DATE_TEMPLATE = [
  '(() => {',
  '  const task = Task.byIdentifier($TASK_ID$);',
  '  if (!task) return JSON.stringify({success: false, error: "task_not_found"});',
  '  const dateValue = $DATE_VALUE$;',
  '  if (dateValue === null) {',
  '    task.plannedDate = null;',
  '  } else {',
  '    task.plannedDate = new Date(dateValue);',
  '  }',
  '  return JSON.stringify({success: true, plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null});',
  '})()'
].join('\\n');

function bridgeSetPlannedDate(app, taskId, dateValue) {
  try {
    const script = __formatTagScript(__SET_PLANNED_DATE_TEMPLATE, {
      TASK_ID: taskId,
      DATE_VALUE: dateValue
    });
    const result = app.evaluateJavascript(script);
    return JSON.parse(result);
  } catch (e) {
    return {success: false, error: e.message};
  }
}
```

### 2. Updated Task Creation (src/omnifocus/scripts/tasks/create-task.ts)

**Changes:**
- Lines 112: Added comment explaining JXA doesn't persist plannedDate
- Lines 200-214: Added bridge call after getting taskId
- Line 224: Response now uses `plannedDateResult` from bridge instead of direct JXA access

```javascript
// Apply plannedDate using OmniJS bridge for reliable persistence
let plannedDateResult = null;
if (taskData.plannedDate) {
  try {
    const bridgeResult = bridgeSetPlannedDate(app, taskId, taskData.plannedDate);
    if (bridgeResult && bridgeResult.success) {
      plannedDateResult = bridgeResult.plannedDate;
      console.log('Successfully set plannedDate via bridge:', plannedDateResult);
    }
  } catch (plannedDateError) {
    console.log('Warning: Error setting plannedDate:', plannedDateError.message);
  }
}

// Build response...
plannedDate: plannedDateResult,  // Use bridge result, not JXA access
```

## Verification Results

### ✅ Task Creation Working Perfectly

**Test:** Create task with plannedDate
```javascript
const createResp = await client.callTool('manage_task', {
  operation: 'create',
  name: 'Bridge Test',
  plannedDate: '2025-12-01 10:00'
});

// Response includes plannedDate ✅
createResp.data.task.plannedDate === "2025-12-01T15:00:00.000Z"
```

**Direct JXA Verification:**
```javascript
// Task ID: lLAQiKRvwhD
task.plannedDate() === "2025-12-01T15:00:00.000Z"  // ✅ Persisted in OmniFocus
```

### ❌ Query Results Missing PlannedDate

**Problem:** Query operations return `plannedDate: undefined` for ALL tasks

**Test Results:**
```javascript
// Query with mode: 'all', limit: 5
const queryResp = await client.callTool('tasks', { mode: 'all', limit: 5 });

// ALL tasks show: plannedDate: (undefined) ❌
queryResp.data.tasks.forEach(t => {
  console.log(t.plannedDate);  // undefined for every task
});
```

**Integration Tests:** Still 2 failing (same as before)
- `"should list tasks with planned date included"` - expects `plannedDate` to be defined
- `"should query tasks with all 4.7+ properties"` - expects `plannedDate` to be defined

## Investigation Findings

### What We Know:

1. **Bridge Works**: OmniJS successfully sets plannedDate in OmniFocus ✅
2. **Creation Response Correct**: Create response includes plannedDate ✅
3. **OmniFocus Storage Confirmed**: Direct JXA query shows plannedDate stored ✅
4. **Query Code Looks Correct**: list-tasks.ts lines 63-68 retrieve plannedDate ✅
5. **Field Filtering Not The Issue**: `shouldIncludeField('plannedDate')` returns true ✅

### What's Wrong:

**Query operations don't return plannedDate field at all** - even though:
- The code in list-tasks.ts (lines 63-68) looks correct
- The `shouldIncludeField()` logic is working (returns all fields when no filter)
- Direct JXA access to the same tasks shows plannedDate exists

## Current Hypotheses

1. **Field Projection Issue**: `QueryTasksToolV2.projectFields()` might be filtering it out
2. **Script Execution Problem**: The JXA script might not be executing the plannedDate retrieval code
3. **Type/Serialization Issue**: PlannedDate might not survive JSON.stringify/parse
4. **Timing/Race Condition**: OmniFocus might not have indexed new plannedDate values yet

## Next Steps (Priority Order)

### 1. Debug Query Script Execution
Add console logging to list-tasks.ts to verify:
- Is `shouldIncludeField('plannedDate')` being called?
- Is `omniJsTask.plannedDate()` returning a value?
- Is the value being added to the task object?
- What does the task object look like before JSON.stringify?

### 2. Test Direct Script Execution
Create a minimal test script that directly calls LIST_TASKS_SCRIPT and examine raw output:
```bash
# Execute list-tasks.ts directly with minimal filter
osascript -l JavaScript -e "$(build script with plannedDate field request)"
```

### 3. Check Field Projection
Verify `QueryTasksToolV2.projectFields()` isn't filtering plannedDate:
- Add logging before/after projection
- Check if 'plannedDate' is in the field list
- Verify the projection logic handles all field types

### 4. Examine parseTasks Method
Check if `QueryTasksToolV2.parseTasks()` properly handles plannedDate field

## Files Modified

1. `/src/omnifocus/scripts/shared/minimal-tag-bridge.ts`
   - Added `bridgeSetPlannedDate()` function (lines 58-85)

2. `/src/omnifocus/scripts/tasks/create-task.ts`
   - Removed direct JXA plannedDate assignment (line 112 → comment)
   - Added bridge call for plannedDate (lines 200-214)
   - Updated response to use bridge result (line 224)

## Test Results

**Before Fix:**
- 14/16 tests passing
- plannedDate undefined in create response
- plannedDate undefined in query results

**After Fix:**
- 14/16 tests passing (same)
- plannedDate **correctly returned** in create response ✅
- plannedDate still undefined in query results ❌

**Performance:**
- Task creation: ~10s (includes bridge call)
- Queries: Timeout issues with large result sets (needs optimization)

## Key Insights

### OmniFocus 4.x Persistence Pattern

**Direct JXA property assignment fails silently for:**
- `task.tags` (previously fixed with `bridgeSetTags`)
- `task.plannedDate` (now fixed with `bridgeSetPlannedDate`)

**Likely also affects:**
- Other date properties that might need bridge?
- Complex object properties?

**Working Pattern:**
1. Create task with JXA
2. Get taskId from created task
3. Use OmniJS bridge (`app.evaluateJavascript`) to set complex properties
4. Return bridge result in response (don't rely on JXA re-reading)

### Why This Matters

This is a **fundamental architectural constraint** of OmniFocus 4.x automation:
- JXA can CREATE tasks
- JXA can READ properties
- JXA **CANNOT reliably SET** certain properties
- OmniJS bridge required for persistence

## Summary

**Major Achievement:** ✅ Task creation with plannedDate now works perfectly
- Bridge implementation successful
- OmniFocus stores plannedDate correctly
- Create responses include plannedDate

**Remaining Work:** ❌ Query operations need debugging
- PlannedDate field not returned in query results
- Issue is in query/retrieval layer, not storage
- Root cause TBD (field filtering? script execution? serialization?)

**Overall Progress:** 50% complete
- Creation side: ✅ DONE
- Query/retrieval side: ❌ IN PROGRESS

---

**Next Session Should Focus On:**
Debugging why list-tasks.ts doesn't return plannedDate in query results despite having correct-looking code. Add extensive logging to trace the field through the entire query pipeline.
