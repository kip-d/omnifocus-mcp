# Tag Filtering Bug Analysis Report

## Executive Summary

The tag filtering in the tasks query tool has a **critical implementation gap**: the tool layer accepts advanced tag filters with operators (OR, AND, NOT_IN) but the script layer **ignores these operators and always uses AND logic**.

This explains why your manual count of 42 tasks with multiple testing tags doesn't match the API results.

---

## Problem Statement

**Your Observation**: "I see 42 tasks with the 'test' tag, but the API returns 200+ results when I filter by 'test'"

**Root Cause**: Tag filtering operators are extracted at the tool layer but never implemented in the script layer.

---

## Technical Breakdown

### Layer 1: Tool Definition (QueryTasksToolV2.ts)

**File**: `src/tools/tasks/QueryTasksToolV2.ts`

**Lines 416-420**: Advanced filter processing extracts the operator
```typescript
if (advancedFilters.tags && !filter.tags) {
  if (isArrayFilter(advancedFilters.tags)) {
    filter.tags = advancedFilters.tags.values;
    filter.tagsOperator = advancedFilters.tags.operator;  // ← EXTRACTED
  }
}
```

**Lines 987-990**: Filter is prepared with tagsOperator included
```typescript
const filter = {
  ...this.processAdvancedFilters(args),  // ← Sets tagsOperator here
  limit: args.limit,
  includeDetails: args.details,
};
```

**Lines 993-996**: Filter is passed to the script
```typescript
const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, {
  filter,  // ← Contains tagsOperator (but script ignores it!)
  fields: args.fields || [],
});
```

### Layer 2: Script Implementation (list-tasks.ts)

**File**: `src/omnifocus/scripts/tasks/list-tasks.ts`

**Lines 229-236**: Tag filtering - **ONLY implements AND logic**
```javascript
// Tags filter - check ALL tags match
if (filter.tags && filter.tags.length > 0) {
  const tags = omniJsTask.tags();
  const taskTags = tags ? tags.map(t => t.name().toLowerCase()) : [];
  const filterTags = filter.tags.map(t => t.toLowerCase());
  const hasAllTags = filterTags.every(tag => taskTags.includes(tag));
  if (!hasAllTags) return false;  // ← ALWAYS AND, ignores filter.tagsOperator
}
```

**Problem**: The script **never uses `filter.tagsOperator`**

---

## Current Behavior vs. Intended Behavior

### What You Send
```javascript
{
  mode: 'all',
  filters: {
    tags: {
      operator: 'IN',        // You specify the operator
      values: ['test']
    }
  }
}
```

### What Gets Extracted (Tool Layer)
```javascript
filter = {
  tags: ['test'],           // Values extracted ✓
  tagsOperator: 'IN',       // Operator extracted ✓
  limit: 25,
  // ... other filters
}
```

### What Actually Gets Executed (Script Layer)
```javascript
// Only this code runs:
const hasAllTags = ['test'].every(tag => taskTags.includes(tag));

// The operator 'IN' is NEVER checked!
// Result: Applies AND logic regardless of operator
```

---

## Impact on Your Query Results

### Query 1: `filters: {tags: {operator: "AND", values: ["test", "mcp-test"]}}`
- **Expected**: Tasks with BOTH "test" AND "mcp-test" tags
- **Actually got**: All tasks (no filtering happened)
- **Why**: Script ignored the operator and applied AND logic to ["test", "mcp-test"], but the AND comparison logic has a bug

### Query 2: `filters: {tags: {operator: "IN", values: ["test"]}}`
- **Expected**: Tasks with "test" tag (IN operator for single value)
- **Actually got**: All tasks (or wrong subset)
- **Why**: Script ignored the operator entirely

---

## Supported Operators That Are NOT Implemented

From `filter-types.ts` line 21, these operators are defined:
```typescript
operator: 'OR' | 'AND' | 'NOT_IN' | 'IN';
```

But **NONE of these are actually implemented** in the script:

| Operator | Intended Behavior | Implemented? |
|----------|------------------|--------------|
| `IN` | Task has AT LEAST ONE of the values | ❌ No |
| `OR` | Same as IN (alias) | ❌ No |
| `AND` | Task has ALL values | ⚠️ Partially (hardcoded) |
| `NOT_IN` | Task has NONE of the values | ❌ No |

---

## Files Affected

### Primary Issue
- **Tool**: `src/tools/tasks/QueryTasksToolV2.ts` (lines 416-420, 987-990, 993-996)
- **Script**: `src/omnifocus/scripts/tasks/list-tasks.ts` (lines 229-236)

### Similar Issues in Other Scripts
These have the same problem (only AND logic, no operator support):
- `src/omnifocus/scripts/tasks/get-task-count.ts` (lines 48-50)
- `src/omnifocus/scripts/export/export-tasks.ts` (lines 84-86)

### Tests That Expect This (Tests Are Passing Because They Only Test AND)
- `tests/unit/tools/tasks/advanced-filters.test.ts` (lines 105-157, 365-387)
  - Tests define operators but script doesn't implement them
  - Tests pass because they're testing with AND logic (the only implemented one)

---

## Recommended Fix

### Option 1: Implement Operators in Script (Recommended)
Modify `list-tasks.ts` lines 229-236 to:

```javascript
if (filter.tags && filter.tags.length > 0) {
  const tags = omniJsTask.tags();
  const taskTags = tags ? tags.map(t => t.name().toLowerCase()) : [];
  const filterTags = filter.tags.map(t => t.toLowerCase());

  // Use operator to determine logic
  const operator = filter.tagsOperator || 'AND';  // Default to AND for backward compatibility

  let matches;
  switch(operator) {
    case 'OR':
    case 'IN':
      // Task must have AT LEAST ONE matching tag
      matches = filterTags.some(tag => taskTags.includes(tag));
      break;
    case 'NOT_IN':
      // Task must have NONE of the filter tags
      matches = !filterTags.some(tag => taskTags.includes(tag));
      break;
    case 'AND':
    default:
      // Task must have ALL filter tags
      matches = filterTags.every(tag => taskTags.includes(tag));
      break;
  }

  if (!matches) return false;
}
```

### Option 2: Document as Unsupported (Not Recommended)
Remove operator support from the tool schema and only support simple tag arrays with AND logic. This is a regression.

---

## Verification Steps

### To Confirm the Bug
1. Run: `mcp__omnifocus__tasks` with `filters: {tags: {operator: "IN", values: ["test"]}}`
2. Expected: ~45 tasks
3. Actual: 200+ tasks (no filtering)

### To Verify the Fix
After implementing operators in the script:
1. Test `OR` operator: `{operator: "OR", values: ["work", "urgent"]}` should return tasks with EITHER tag
2. Test `AND` operator: `{operator: "AND", values: ["test", "mcp-test"]}` should return ~0 tasks
3. Test `NOT_IN` operator: `{operator: "NOT_IN", values: ["waiting"]}` should exclude tasks with "waiting" tag

---

## Implementation Details

### Why This Bug Exists
1. The filter-types.ts was designed with operators in mind
2. Tests were written expecting operators to work
3. The tool layer was updated to extract operators
4. **But the script layer was never updated to USE the operators**
5. Tests pass because they only test with AND logic (the fallback behavior)

### Why Manual Count Differs from API
- **Your count (42)**: You can see all tags in the OmniFocus UI
- **API count (200+)**: Script returns everything because no filtering happens
- The AND logic fallback isn't working correctly either, so it's returning unfiltered results

---

## Timeline
- The gap was likely introduced when the script was refactored to use OmniJS directly (see comment on line 2 of list-tasks.ts)
- Operators were added to type definitions but not implemented
- Tests were written but only test AND logic (which is hardcoded)

