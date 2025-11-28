# Things to Check Out

## 1. Minute/Hour Repetition Rules in OmniFocus

**Context:** In `ManageTaskTool.ts`, there's a comment noting that OmniFocus supports 'minute' and 'hour' repetition units, but our `RepetitionRule` contract type only supports 'daily', 'weekly', 'monthly', and 'yearly'.

**Observation:** Some OmniFocus tasks have been seen with hour or minute repeat durations.

---

### Research Findings (2025-11-25)

#### 1. Two Different Rule String Formats

OmniFocus supports two ways to set repetition rules:

**A. ICS/iCalendar RRULE Format** (for constructor)
```javascript
new Task.RepetitionRule("FREQ=WEEKLY;INTERVAL=2", null, ...)
```
Valid FREQ values per iCalendar spec: `SECONDLY`, `MINUTELY`, `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`

**B. Human-readable Format** (for `fromString()` method)
```javascript
Task.RepetitionRule.fromString("daily", Task.RepetitionMethod.DueDate)
Task.RepetitionRule.fromString("every 2 weeks", Task.RepetitionMethod.DueDate)
```
This is what our code currently uses.

#### 2. Current Type Definitions

| Type | Location | Supported Units |
|------|----------|-----------------|
| `RepeatRule` | `script-response-types.ts` | minute, hour, day, week, month, year |
| `RepetitionRule` | `mutations.ts` | daily, weekly, monthly, yearly |

The `RepeatRule` type (used for reading from OmniFocus) already supports minute/hour. The `RepetitionRule` type (used for mutations) does not.

#### 3. Current Code Behavior

In `mutation-script-builder.ts` lines 177-180:
```javascript
let ruleString = rule.frequency;  // "daily", "weekly", etc.
if (rule.interval > 1) ruleString = 'every ' + rule.interval + ' ' + rule.frequency;
task.repetitionRule = Task.RepetitionRule.fromString(ruleString, Task.RepetitionMethod.DueDate);
```

In `ManageTaskTool.ts` `convertToRepetitionRule()`:
```javascript
const unitToFrequency = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};
// minute and hour default to 'daily' (lossy conversion!)
```

---

### Recommendations

#### REQUIRED FIX: Switch to ICS Format with Constructor

The `fromString()` method doesn't exist. We MUST switch to ICS RRULE format with the constructor:

**Current broken code:**
```javascript
// ❌ BROKEN - fromString doesn't exist
let ruleString = rule.frequency;
if (rule.interval > 1) ruleString = 'every ' + rule.interval + ' ' + rule.frequency;
task.repetitionRule = Task.RepetitionRule.fromString(ruleString, Task.RepetitionMethod.DueDate);
```

**Fixed code:**
```javascript
// ✅ WORKING - Use constructor with ICS RRULE format
const freqMap = {
  minutely: 'MINUTELY', hourly: 'HOURLY', daily: 'DAILY',
  weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY'
};
let rrule = 'FREQ=' + freqMap[rule.frequency];
if (rule.interval > 1) rrule += ';INTERVAL=' + rule.interval;

task.repetitionRule = new Task.RepetitionRule(
  rrule,
  null,
  Task.RepetitionScheduleType.Regularly,
  Task.AnchorDateKey.DueDate,
  true
);
```

#### Additionally: Extend RepetitionRule Type

Add 'hourly' and 'minutely' to support full OmniFocus capabilities:

```typescript
export interface RepetitionRule {
  frequency: 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  endDate?: string;
}
```

---

### 🚨 CRITICAL BUG DISCOVERED (2025-11-25)

**`Task.RepetitionRule.fromString()` DOES NOT EXIST!**

Testing confirmed that our current code is **silently failing**:

```
Test: Exact copy of mutation-script-builder code pattern
Result: {
  "success": false,
  "error": "Task.RepetitionRule.fromString is not a function",
  "usedRuleString": "every 2 daily"
}
```

**Impact:** All repetition rule setting via `buildCreateTaskScript()` and `buildUpdateTaskScript()` is broken. The try/catch blocks swallow the errors silently.

**Affected Code:**
- `src/contracts/ast/mutation-script-builder.ts:180` - create script
- `src/contracts/ast/mutation-script-builder.ts:475` - update script

**Root Cause:** The OmniAutomation docs mention `fromString` but it doesn't actually exist in the OmniJS API. Only the constructor works.

---

### Testing Results (2025-11-25)

| Test | Result |
|------|--------|
| `fromString("hourly", ...)` | ❌ Method doesn't exist |
| `fromString("daily", ...)` | ❌ Method doesn't exist |
| `new Task.RepetitionRule("FREQ=HOURLY", null, ...)` | ✅ Works |
| `new Task.RepetitionRule("FREQ=MINUTELY;INTERVAL=30", ...)` | ✅ Works |
| `new Task.RepetitionRule("FREQ=HOURLY;INTERVAL=2", ...)` | ✅ Works |
| `new Task.RepetitionRule("FREQ=DAILY", ...)` | ✅ Works |

**Conclusion:** Must use the constructor with ICS RRULE format, not `fromString()`.

---

### ✅ FIXED (2025-11-25) - Comprehensive RFC 5545 RRULE Support

**Status:** COMPLETE - All OmniFocus-supported RRULE parameters now work.

#### OmniFocus RRULE Support (Empirically Verified)

| Parameter | Supported | Example |
|-----------|-----------|---------|
| `FREQ` | ✅ All 6 | MINUTELY, HOURLY, DAILY, WEEKLY, MONTHLY, YEARLY |
| `INTERVAL` | ✅ | `INTERVAL=2` |
| `BYDAY` | ✅ | `MO,WE,FR` or `2MO` or `-1FR` |
| `BYMONTHDAY` | ✅ | `1,15,-1` |
| `COUNT` | ✅ | `COUNT=10` |
| `UNTIL` | ✅ | `20251231` |
| `WKST` | ✅ | `MO` or `SU` |
| `BYSETPOS` | ✅ | `1,-1` |
| `BYMONTH` | ❌ | OmniFocus explicitly rejects |

#### New RepetitionRule Interface

```typescript
interface DayOfWeek {
  day: 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
  position?: number;  // -1 = last, 1 = first, 2 = second, etc.
}

interface RepetitionRule {
  frequency: 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: DayOfWeek[];    // BYDAY
  daysOfMonth?: number[];      // BYMONTHDAY
  count?: number;              // COUNT
  endDate?: string;            // UNTIL (YYYY-MM-DD)
  weekStart?: string;          // WKST
  setPositions?: number[];     // BYSETPOS
}
```

#### Common Patterns (LLM Reference)

| Natural Language | RepetitionRule |
|-----------------|----------------|
| "Every Monday and Wednesday" | `{ frequency: 'weekly', daysOfWeek: [{day:'MO'},{day:'WE'}] }` |
| "Last Friday of month" | `{ frequency: 'monthly', daysOfWeek: [{day:'FR', position:-1}] }` |
| "1st and 15th of month" | `{ frequency: 'monthly', daysOfMonth: [1, 15] }` |
| "Every weekday" | `{ frequency: 'weekly', daysOfWeek: [{day:'MO'},{day:'TU'},{day:'WE'},{day:'TH'},{day:'FR'}] }` |
| "Daily for 10 days" | `{ frequency: 'daily', count: 10 }` |
| "Weekly until Dec 31" | `{ frequency: 'weekly', endDate: '2025-12-31' }` |

**Commits:**
- `47eac4f` - fix: replace non-existent Task.RepetitionRule.fromString() with constructor
- `796078f` - feat: comprehensive RFC 5545 RRULE support for repetition rules

---

### Related Code
- `src/contracts/mutations.ts:35-40` - `RepetitionRule` interface
- `src/tools/tasks/ManageTaskTool.ts:1045-1063` - `convertToRepetitionRule()` function
- `src/omnifocus/script-response-types.ts:202-213` - `RepeatRule` interface
- `src/contracts/ast/mutation-script-builder.ts:177-180` - rule string building

### References
- [OmniFocus: Repeating Tasks](https://omni-automation.com/omnifocus/task-repeat.html)
- [OmniFocus API 3.13.1](https://omni-automation.com/omnifocus/OF-API.html)
- [iCalendar RRULE Tool](https://icalendar.org/rrule-tool.html)

---

## 2. Unified API Filter Passthrough Issues (2025-11-27)

**Context:** When trying to query projects/tasks by folder or project name, filters are not being passed through the unified API correctly.

### Issues Discovered

#### Issue 2.1: Project Folder Filtering Broken → ✅ FIXED (2025-11-27)

**Symptom:** Querying projects with folder filter returns ALL projects instead of filtering.

```typescript
// ✅ FIXED - Now returns only projects in the specified folder
{
  query: {
    type: "projects",
    filters: { folder: "Fix OmniFocus MCP Bridge Issues" }
  }
}
```

**Expected:** Only projects in that folder
**Result:** 4 projects returned (correct!)

**Root Causes Found:**
1. `QueryCompiler.transformFilters()` was not passing folder filter to internal TaskFilter
2. `OmniFocusReadTool.routeToProjectsTool()` was not passing folder to ProjectsTool
3. `list-projects-v3.ts` was using `project.folder` (always null) instead of `project.parentFolder`

**Fix Applied:**
- Added `folder` to TaskFilter contract (`src/contracts/filters.ts`)
- Added folder passthrough in QueryCompiler (`src/tools/unified/compilers/QueryCompiler.ts`)
- Added folder passthrough in OmniFocusReadTool (`src/tools/unified/OmniFocusReadTool.ts`)
- Fixed OmniJS script to use `project.parentFolder` (`src/omnifocus/scripts/projects/list-projects-v3.ts`)

**Important Finding:** In OmniJS, `project.folder` returns null for all projects accessed via `flattenedProjects`. Must use `project.parentFolder` instead!

**Behavior Note:** The folder filter matches the **direct parent folder** only. Projects in subfolders are not included. For example:
- `folder: "Development"` → returns 2 projects directly in Development
- `folder: "Fix OmniFocus MCP Bridge Issues"` → returns 4 projects in that subfolder

#### ✅ Nested Folder Path Support Added (2025-11-27)

Full nested path support is now implemented. You can filter by:
- Simple folder name: `folder: "Fix OmniFocus MCP Bridge Issues"`
- Full nested path: `folder: "Development/Fix OmniFocus MCP Bridge Issues"`

Both return the same 4 projects in that folder. The script detects if the filter contains "/" and switches to path-matching mode.

**New Output Field:** Projects now include `folderPath` showing the full hierarchy:
```json
{
  "name": "Investigation: Available Mode Behavior Issue",
  "folder": "Fix OmniFocus MCP Bridge Issues",
  "folderPath": "Development/Fix OmniFocus MCP Bridge Issues"
}
```

---

#### Issue 2.2: Project Name Filtering Broken

**Symptom:** Querying projects with name filter returns ALL projects.

```typescript
// ❌ BROKEN - Returns all projects, ignores name filter
{
  query: {
    type: "projects",
    filters: { name: { contains: "OmniFocus MCP" } }
  }
}
```

**Expected:** Only projects containing "OmniFocus MCP" in name
**Actual:** All 50 projects returned

---

#### Issue 2.3: Search Mode Filter Handling

**Symptom:** `mode: "search"` rejects filters even when provided.

```typescript
// ❌ BROKEN - Error: "Search mode requires a search term or filters"
{
  query: {
    type: "tasks",
    mode: "search",
    filters: { name: { contains: "MCP" } }
  }
}
```

The filters object is not being passed through to the backend TasksTool.

---

### What Works

```typescript
// ✅ WORKS - Task text filtering with mode: "all"
{
  query: {
    type: "tasks",
    mode: "all",
    filters: { text: { contains: "MCP" } }
  }
}
```

This correctly finds tasks where name or note contains "MCP".

---

### Root Cause Analysis

**Suspected Location:** `src/tools/unified/compilers/QueryCompiler.ts`

The QueryCompiler may not be:
1. Passing folder/name filters to the ProjectsTool backend
2. Converting the unified filter format to backend-specific parameters
3. Handling the `search` mode's filter requirements

**Files to Investigate:**
- `src/tools/unified/compilers/QueryCompiler.ts` - Filter translation logic
- `src/tools/unified/OmniFocusReadTool.ts` - Tool routing
- `src/tools/projects/ProjectsTool.ts` - Backend project filtering
- `src/tools/tasks/QueryTasksToolV2.ts` - Backend task filtering

---

### What LLMs Can/Cannot Easily See (Updated 2025-11-27)

**CAN see easily:**
- Tasks by text search (`text: {contains: "keyword"}`)
- Tasks by tag, status, dates, flagged
- All projects (unfiltered list)
- All folders (unfiltered list)
- **✅ Projects filtered by folder** (FIXED!)
- **✅ Projects filtered by nested folder path** (e.g., "Development/Fix OmniFocus MCP Bridge Issues")

**CANNOT see easily (still needs work):**
- Projects filtered by name
- Tasks via search mode with filters

~~- Folder hierarchy/nesting (nested path like "Parent/Child")~~ **✅ FIXED!**

**Workaround for name filtering:** Search for tasks by text content, which returns the project name as a field.

---

### Test Case for Fix Verification ✅ PASSED

This query now correctly returns only projects in the specified folder:

```typescript
// ✅ VERIFIED - Returns 4 projects (correct!)
{
  query: {
    type: "projects",
    filters: { folder: "Fix OmniFocus MCP Bridge Issues" }
  }
}

// Results (verified 2025-11-27):
// - Investigation: Available Mode Behavior Issue
// - Fix: batch_create Tool - Tags & ParentId Issues
// - Testing Infrastructure: Claude Desktop Conversation Limits
// - Fix: task_velocity Tool Returns Zero Data
```

---

## 3. MCP Hot Reload for Development (2025-11-27)

**Context:** When developing this MCP server, code changes require restarting Claude Code to pick up the new code. Claude Code has no built-in way to restart MCP servers without quitting the session.

### Community Solution: mcp-hot-reload

**Repository:** https://github.com/data-goblin/claude-code-mcp-reload

A Python proxy wrapper that enables hot reloading of MCP servers during development:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "python",
      "args": [
        "-m", "mcp_hot_reload", "wrap", "--proxy", "--name", "omnifocus",
        "--", "node", "/path/to/omnifocus-mcp/dist/index.js"
      ]
    }
  }
}
```

**Benefits:**
- Restart MCP server without losing Claude Code session
- Preserves conversation context
- Claude can trigger restarts via a built-in tool
- Transparent proxy with full MCP protocol support

### Native Feature Requests

No built-in support yet. Open issues requesting this:
- [#2756](https://github.com/anthropics/claude-code/issues/2756) - `/reload-mcps` command
- [#1026](https://github.com/anthropics/claude-code/issues/1026) - Reconnect MCP servers

### Current Workaround

Without hot-reload, use `claude --resume` to restart Claude Code while preserving conversation context.

---

## 4. Search/Filter Fixes Session (2025-11-27) ✅ COMPLETE

**Context:** During review of 4 OmniFocus projects in "Fix OmniFocus MCP Bridge Issues" folder, discovered that search/filter functionality needed fixes to properly find projects and tasks.

### Issues Discovered and Fixed

#### Issue 4.1: Task Project Filter Mismatch → ✅ FIXED

**Symptom:** Filtering tasks by project returned 0 results.

**Root Causes Found (Two-layer problem):**
1. **AST Builder**: `builder.ts` checked `filter.projectId`, but `QueryTasksTool` sets `filter.project`
2. **OmniJS Emitter**: Compared `task.containingProject.id.primaryKey` with project NAME (always false)

**Fix Applied:**
- `src/contracts/ast/builder.ts`: Accept both `filter.project` and `filter.projectId`
- `src/contracts/ast/emitters/omnijs.ts`: Detect ID vs name and compare appropriately:
  - IDs (>10 chars, alphanumeric): Compare by `.id.primaryKey`
  - Names: Compare by `.name`

**Verification:** Query for tasks in "Investigation: Available Mode Behavior Issue" returns 6 tasks.

---

#### Issue 4.2: Project Folder ID Filter → ✅ FIXED

**Symptom:** Filtering projects by folder ID returned 0 results; only folder names worked.

**Root Cause:** `list-projects-v3.ts` only matched folder names, not IDs.

**Fix Applied:**
- Added ID detection regex: `/^[a-zA-Z0-9_-]+$/.test(filterFolder) && filterFolder.length > 10`
- ID match: Compare `folder.id.primaryKey`
- Name match: Compare `folder.name`
- Path match: Compare full `getFolderPath(folder)` for nested paths

**Verification:** Query with folder ID `lCGfklDrxWd` returns 4 projects correctly.

---

#### Issue 4.3: Project Name Filter Not Passed Through → ✅ FIXED

**Symptom:** Projects couldn't be searched by name through the unified API.

**Root Cause:** `name` filter not defined in schema or passed through routing chain.

**Fix Applied:**
- `read-schema.ts`: Added `name` filter with `contains`/`matches` operators
- `QueryCompiler.ts`: Transform `name.contains` to `search` filter
- `OmniFocusReadTool.ts`: Pass `search` to ProjectsTool routing
- `ProjectsTool.ts`: Added `search` schema and handling

**Verification:** Query for projects with name "Investigation" finds correct matches.

---

### Key Insights

1. **ID vs Name Detection Heuristic:** Strings >10 chars that are alphanumeric (with - or _) are treated as IDs. This works because OmniFocus IDs are 11-char base64-ish strings like `lCGfklDrxWd`.

2. **Two-Layer Problem Pattern:** The task project filter had TWO bugs at different layers (builder and emitter). Fixing only one layer still resulted in 0 results. Always check the full pipeline!

3. **Filter Passthrough Chains:** Unified API → QueryCompiler → OmniFocusReadTool → Backend Tool. Missing a link anywhere breaks the filter.

### Commits

- `58bec6b` - fix: improve search/filter functionality for projects and tasks

### Files Modified

- `src/contracts/ast/builder.ts` - Accept both project and projectId
- `src/contracts/ast/emitters/omnijs.ts` - Smart ID vs name comparison
- `src/contracts/filters.ts` - Added project and search to TaskFilter
- `src/omnifocus/scripts/projects/list-projects-v3.ts` - Folder ID matching
- `src/tools/projects/ProjectsTool.ts` - Added search parameter
- `src/tools/unified/OmniFocusReadTool.ts` - Pass search to ProjectsTool
- `src/tools/unified/compilers/QueryCompiler.ts` - Name→search transform
- `src/tools/unified/schemas/read-schema.ts` - Added name filter

---

## 5. OmniFocus Projects to Review (2025-11-27)

**Context:** Four projects in "Development/Fix OmniFocus MCP Bridge Issues" folder were identified for review during testing. Status from review session:

### Project 5.1: Investigation: Available Mode Behavior Issue → ✅ FIXED (2025-11-28)

**Status:** Fixed
**Summary:** Available mode was emitting incorrect filter code. The OmniJS emitter wasn't handling the synthetic `task.available` field correctly.

**Root Cause Found:**
The AST builder creates `comparison('task.available', '==', filter.available)`, but OmniFocus doesn't have a `task.available` property - it uses `task.taskStatus === Task.Status.Available`.

The OmniJS emitter was directly outputting `task.available === true` instead of translating it to the correct status check.

**Fix Applied:**
Added special handling in `src/contracts/ast/emitters/omnijs.ts`:

```javascript
// Special handling for 'available' synthetic field
if (field === 'task.available') {
  return emitAvailableComparison(operator, value as boolean);
}

function emitAvailableComparison(operator: ComparisonOperator, isAvailable: boolean): string {
  if (isAvailable) {
    return 'task.taskStatus === Task.Status.Available';
  } else {
    return 'task.taskStatus !== Task.Status.Available';
  }
}
```

Also added similar handling for `task.blocked` which had the same issue.

**Verification:**
```
Query: mode: 'available', limit: 3
Result: 3 tasks returned, all with available: true ✅
```

---

### Project 5.2: Fix: batch_create Tool - Tags & ParentId Issues → ✅ FIXED (2025-11-28)

**Status:** Fixed
**Summary:** Two issues were discovered and addressed:

**Bug A: Field Name Confusion (User Error - Documentation)**
- Schema uses `parentTempId` but easily mistaken for `parentId`
- Solution: Better documentation/examples (not a code bug)

**Bug B: CREATE_PROJECT_SCRIPT Doesn't Handle Tags (Server Bug) → FIXED**

**Root Cause Found:**
1. `CREATE_PROJECT_SCRIPT` had no code to handle `options.tags`
2. Projects created via JXA are not immediately visible to `Project.byIdentifier()` in OmniJS
3. Unlike tasks, we needed a name-based lookup instead of ID-based lookup

**Fixes Applied:**

1. **minimal-tag-bridge.ts**: Added `bridgeSetProjectTags()` function that uses name-based lookup:
   ```javascript
   const __SET_PROJECT_TAGS_TEMPLATE = [
     '(() => {',
     '  const projectName = $PROJECT_NAME$;',
     '  const matches = flattenedProjects.filter(p => p.name === projectName);',
     '  // ... add tags via OmniJS ...',
     '})()'
   ];
   ```

2. **create-project.ts**: Added tag handling after project creation:
   - Imports `getMinimalTagBridge()`
   - Calls `bridgeSetProjectTags(app, name, options.tags)` after project placement
   - Returns tags in the response object

**Key Insight:**
Tasks created via JXA are immediately visible to `Task.byIdentifier()`, but projects are NOT visible to `Project.byIdentifier()`. This required using name-based lookup for the project tag bridge.

**Verification:**
```
Create project with tags: ["priority", "urgent"] → tags: ["priority", "urgent"] ✅
Batch create 2 projects with tags → all tags added correctly ✅
```

---

### Project 5.3: Testing Infrastructure: Claude Desktop Conversation Limits → NOT A BUG

**Status:** Active (5 tasks), Flagged
**Summary:** Hit conversation limit at test 21/31. This is a Claude Desktop limitation, not an MCP server bug.

**Conclusion:** Not an MCP server issue. Consider multi-session testing approach or more concise test responses.

---

### Project 5.4: Fix: task_velocity Tool Returns Zero Data → ✅ FIXED (2025-11-28)

**Status:** Fixed
**Summary:** task_velocity was showing all metrics as 0 due to nested data structure mismatch.

**Root Cause Found:**
The V3 script returns `{ ok: true, v: '3', data: { velocity: {...}, throughput: {...} } }`.
When wrapped by `execJson`, it becomes `{ success: true, data: { ok, v, data: {...} } }`.
The tool was accessing `scriptData?.throughput` but the actual data was in `scriptData?.data?.throughput`.

**Fixes Applied:**
1. **TaskVelocityTool.ts** (line 121-122): Unwrap nested data structure
   ```typescript
   const rawData = isScriptSuccess(result) ? result.data : null;
   const scriptData = (rawData as { data?: TaskVelocityV3Data } | null)?.data ?? null;
   ```

2. **OmniFocusAnalyzeTool.ts** (line 137): Fix parameter name routing
   ```typescript
   args.groupBy = compiled.params.groupBy;  // Was incorrectly 'interval'
   ```

**Verification:**
- `tasksCompleted: 322` (was 0)
- `averagePerDay: 4.39` (was 0)
- `predictedCapacity: 30.8` (was 0)

---

## 6. JXA vs OmniJS Investigation (2025-11-27) ✅ COMPLETE

**Context:** We documented many JXA "failures" (parent relationships, property access issues), but the Omni Group developers are highly skilled. Investigation completed to understand the true limitations.

### Key Findings

#### 1. JXA is Official "Legacy/Sunset Mode"

Per [Omni Group forums](https://discourse.omnigroup.com/t/how-to-get-going-with-javascript-and-omnifocus/66578):
> "osascript (JXA) and omniJS are completely different programming interfaces... The osascript interface is described as **legacy / sunset mode** with slower performance."

#### 2. Why OmniJS Exists (All Three Hypotheses Confirmed!)

- **Performance**: OmniJS runs *inside* OmniFocus (direct object access). JXA runs *outside* via Apple Events RPC (inter-process communication per property access).
- **iOS support**: JXA only exists on macOS. OmniJS works on macOS, iOS, and iPadOS.
- **Richer API**: Some object relationships can't be marshaled through Apple Events.

#### 3. Specific JXA Limitations (Empirically Verified)

**The Pattern**: Folder→folder parent relationships fail. Other parents work fine!

| Method | JXA Result |
|--------|------------|
| `task.containingProject()` | ✅ Works |
| `task.parentTask()` | ✅ Works |
| `project.folder()` | ✅ Works |
| `folder.folders()` | ✅ Works |
| `folder.parent()` | ❌ "Can't convert types" |
| `folder.containingFolder()` | ❌ "Can't convert types" |
| `project.parentFolder()` | ❌ "Can't convert types" |

#### 4. Documentation Correction

Previous documentation incorrectly stated `project.folder()` returns null - this is **WRONG**. It works perfectly in JXA! Use `project.folder()` instead of `project.parentFolder()`.

### Test Results

Full empirical testing completed with `/tmp/jxa-patterns-test.js`:
- Tested 150 projects with `project.folder()` → 127 success, 0 errors
- Tested 10 folders with `folder.parent()` → 0 success, 10 "Can't convert types" errors
- Collection-based retrieval (`folders.name()`) works for bulk operations
- Hierarchical traversal (`doc.folders() → folder.folders()`) works correctly

### Updated Documentation

All findings documented in `/docs/dev/JXA-VS-OMNIJS-PATTERNS.md`:
- Added "Background: Why Two JavaScript Environments?" section
- Added "Parent Relationship Compatibility Matrix" with empirical results
- Corrected troubleshooting section for parent/folder access
- Added official sources and forum references

### Conclusion

The Omni Group developers *are* sharp - they created OmniJS specifically because JXA/Apple Events has inherent limitations. The `evaluateJavascript()` bridge is the **recommended approach** for operations that JXA can't handle, which is exactly what we're doing.

---

## 7. Update Operations Test Consolidation (2025-11-28)

**Context:** The `update-operations.test.ts` integration test suite takes ~12.4 minutes to run 12 tests, each averaging ~60 seconds. Analysis shows significant redundancy that can be consolidated without losing coverage.

### Current Test Suite Timing

| Test | Duration | Category |
|------|----------|----------|
| dueDate update | 60.5s | Date Updates |
| deferDate update | 61.3s | Date Updates |
| plannedDate update | 20.8s | Date Updates |
| clearDueDate | 63.8s | Date Updates |
| tags replacement | 69.9s | Tag Operations |
| addTags | 69.8s | Tag Operations |
| removeTags | 71.5s | Tag Operations |
| addTags dedup | 69.7s | Tag Operations |
| note update | 58.2s | Basic Properties |
| flagged update | 61.7s | Basic Properties |
| estimatedMinutes | 60.7s | Basic Properties |
| multiple updates | 58.5s | Combined |

**Total: ~12.4 minutes** for 12 tests

### Redundancy Analysis

#### Date Updates (4 tests → 2 tests)
- **dueDate** and **deferDate** test identical code paths (both use same update mechanism)
- **clearDueDate** could be verified in the same test as dueDate (create with date, then clear)
- **plannedDate** must stay separate (migration check logic)

**Proposed consolidation:**
```typescript
it('should update and clear date fields', async () => {
  // 1. Create task with dueDate
  // 2. Update deferDate
  // 3. Verify both persisted
  // 4. Clear dueDate using clearDueDate flag
  // 5. Verify dueDate cleared, deferDate still set
});

it('should update plannedDate (if database migrated)', async () => {
  // Keep separate due to migration handling
});
```

#### Basic Properties (3 tests → 1 test)
- **note**, **flagged**, **estimatedMinutes** all use the same update mechanism
- No special handling or edge cases - just property assignment

**Proposed consolidation:**
```typescript
it('should update basic properties (note, flagged, estimatedMinutes)', async () => {
  // 1. Create task
  // 2. Update all three properties
  // 3. Read back and verify all three
});
```

#### Tag Operations (4 tests → 3 tests)
- **tags** (full replacement) - Keep (tests replacement semantics)
- **addTags** + **dedup** - Merge (dedup is an assertion, not separate operation)
- **removeTags** - Keep (tests removal semantics)

**Proposed consolidation:**
```typescript
it('should support addTags with deduplication', async () => {
  // 1. Create task with initial tags
  // 2. Add new tags + one that exists (tests both add AND dedup)
  // 3. Verify no duplicates and new tags present
});
```

#### Multiple Updates (1 test → Keep as is)
Already tests combined changes - provides good smoke test.

### Consolidated Test Suite Plan

| Test | What It Tests | Bug Prevention |
|------|---------------|----------------|
| Date updates + clear | dueDate, deferDate, clearDueDate | Bug #11 |
| Planned date update | plannedDate (migration aware) | Bug #11 |
| Tags replacement | Full tag replacement | Bug #12 |
| AddTags + dedup | Append with deduplication | Bug #12 |
| RemoveTags | Tag removal filtering | Bug #12 |
| Basic properties | note, flagged, estimatedMinutes | General |
| Multiple updates | Combined changes | Regression |

**Total: 7 tests** (was 12)
**Estimated runtime: ~7 minutes** (was 12.4 minutes)
**Coverage: Maintained** - All bug scenarios (#11, #12, #14) still covered

### Implementation Notes

1. Each consolidated test still follows the **create → update → read-back → verify** pattern
2. All assertions from individual tests are preserved
3. The main time savings comes from fewer task creation/cleanup cycles
4. PlannedDate stays separate due to migration handling complexity

### File to Modify

- `tests/integration/validation/update-operations.test.ts`

---

## 8. PlannedDate Create/Update Bug (2025-11-28) ✅ FIXED

**Context:** User has migrated OmniFocus database for planned dates feature, but tasks created with `plannedDate` don't persist the value.

**Symptom (Before Fix):**
- Create task with `plannedDate: "2025-12-18"` → returns success
- Read task back → `plannedDate: null`

### Root Cause Analysis

**The bug was in `src/contracts/ast/mutation-script-builder.ts`:**

The script set `dueDate` and `deferDate` but **didn't set `plannedDate`**:
```javascript
// Set dates
if (taskData.dueDate) {
  try { task.dueDate = new Date(taskData.dueDate); } catch (e) {}
}
if (taskData.deferDate) {
  try { task.deferDate = new Date(taskData.deferDate); } catch (e) {}
}
// ❌ WAS MISSING: No code to set plannedDate!
```

### Fix Applied (2025-11-28)

Added plannedDate handling to both create and update scripts:

1. **`buildCreateTaskScript`** (line ~129):
   ```javascript
   if (taskData.plannedDate) {
     try { task.plannedDate = new Date(taskData.plannedDate); } catch (e) {}
   }
   ```

2. **`buildUpdateTaskScript`** (line ~458):
   ```javascript
   if (changes.plannedDate !== undefined) {
     task.plannedDate = changes.plannedDate ? new Date(changes.plannedDate) : null;
   }
   if (changes.clearPlannedDate) task.plannedDate = null;
   ```

3. **Create response** (line ~254):
   ```javascript
   plannedDate: task.plannedDate() ? task.plannedDate().toISOString() : null,
   ```

### Verification

```
Create response plannedDate: 2025-12-18T17:00:00.000Z ✅
```

The create response now correctly shows the plannedDate being set and returned.

**Status:** ✅ Fixed
