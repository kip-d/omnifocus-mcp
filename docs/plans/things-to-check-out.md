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

## 4. JXA vs OmniJS Investigation (2025-11-27)

**Context:** We've documented many JXA "failures" (parent relationships, property access issues), but the Omni Group developers are highly skilled. We should investigate whether these are true JXA/Apple Events limitations or if we're missing something.

### Questions to Answer

1. **Is JXA truly limited, or are we using it wrong?**
   - Work through all examples in `/docs/dev/JXA-VS-OMNIJS-PATTERNS.md`
   - Test each "failing" pattern systematically
   - Verify our assumptions about what works/doesn't work

2. **Why does OmniJS exist?**
   - Is it purely for performance (avoiding Apple Events overhead)?
   - Did Omni Group create it because JXA couldn't do what they needed?
   - Or is it for cross-platform compatibility (iOS doesn't have JXA)?

3. **Apple Events limitations**
   - JXA uses Apple's JavaScript-ObjectiveC bridge
   - Parent relationships failing might be Apple Events limitation, not OmniFocus
   - Research Apple's documentation on scripting bridges

4. **OmniFocus scripting documentation**
   - Review official OmniFocus automation documentation
   - Check Omni Automation website: https://omni-automation.com/omnifocus/
   - Look for guidance on when to use JXA vs OmniJS

### Test Plan

Work through each example in `JXA-VS-OMNIJS-PATTERNS.md`:
- [ ] Test property access patterns (method calls vs property access)
- [ ] Test parent/folder relationships in both contexts
- [ ] Test hierarchical vs flattened collections
- [ ] Test tag operations in both contexts
- [ ] Document any patterns where JXA actually works but we thought it didn't

### Hypothesis

The Omni Group likely created OmniJS for:
1. **Performance** - Direct object access vs Apple Events marshaling
2. **iOS support** - JXA doesn't exist on iOS, OmniJS works everywhere
3. **Richer API** - OmniJS may expose more functionality than Apple Events allows

The "failures" we see in JXA might be Apple Events bridge limitations when serializing complex object relationships across process boundaries.
