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
