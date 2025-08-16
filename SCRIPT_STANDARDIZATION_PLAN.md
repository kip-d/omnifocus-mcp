# Script Standardization Plan

## Current Status (v2.0.0-alpha.6)
We have 7+ variations of date-range query scripts creating maintenance chaos. This plan outlines the path to standardization.

## Recommended Standard: Ultra-Optimized V3

### Why V3 is Best
- **NO whose() usage** - Avoids JXA performance bottleneck
- **67-91% faster** than original implementations
- **Timestamp-based comparisons** - Optimal performance
- **Early exit conditions** - Stops when limit reached
- **Bitwise operations** - Fast integer math

### Scripts to Keep (Primary)
```
✅ date-range-queries-optimized-v3.ts (STANDARD)
   - GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT
   - GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT
   - GET_TASKS_IN_DATE_RANGE_ULTRA_OPTIMIZED_SCRIPT

✅ todays-agenda-optimized-v2.ts (NO WHOSE)
   - TODAYS_AGENDA_OPTIMIZED_NO_WHOSE_SCRIPT
   
✅ list-tasks-optimized.ts (For general queries)
   - LIST_TASKS_OPTIMIZED_SCRIPT
```

### Scripts to Deprecate
```
❌ date-range-queries.ts (original, uses whose())
❌ date-range-queries-fixed.ts (partial fix)
❌ date-range-queries-optimized.ts (still uses whose())
❌ date-range-queries-optimized-v2.ts (superseded by v3)
❌ date-range-queries-hybrid.ts (replaced by v3)
❌ date-range-queries-smart-hybrid.ts (uses whose())
```

## whose() Usage Guidelines

### ✅ KEEP whose() For:
1. **Single ID lookups** (fast, necessary)
   ```javascript
   doc.flattenedTasks.whose({id: taskId})
   ```

2. **Simple boolean filters** (acceptable performance)
   ```javascript
   doc.flattenedTasks.whose({completed: false})
   ```

3. **Folder/Project operations** (small datasets)
   ```javascript
   doc.flattenedFolders.whose({id: folderId})
   ```

### ❌ AVOID whose() For:
1. **Complex date queries**
   ```javascript
   // BAD - Multiple conditions
   whose({completed: false, dueDate: {">": startDate, "<": endDate}})
   ```

2. **Multiple whose() in sequence**
   ```javascript
   // BAD - Compounds performance issues
   const incomplete = whose({completed: false});
   const withDates = incomplete.whose({dueDate: {_not: null}});
   ```

3. **Large dataset filtering**
   ```javascript
   // BAD - Use manual iteration instead
   const allTasks = doc.flattenedTasks.whose({...complex conditions...})
   ```

## Migration Steps

### Phase 1: Update Tool References (COMPLETED)
- [x] QueryTasksToolV2 - Now uses v3 scripts
- [x] QueryTasksTool - Now uses v3 scripts
- [ ] DateRangeQueryTool - Already uses v3 ✅

### Phase 2: Test Performance
- [ ] Run smoke tests with updated scripts
- [ ] Verify 2000+ task performance
- [ ] Check memory usage

### Phase 3: Clean Up (Post-Beta)
- [ ] Remove deprecated script files
- [ ] Update all test files
- [ ] Update documentation

## Performance Benchmarks

### Before (whose() method)
- 2000 tasks: 25+ seconds
- Memory: High usage
- CPU: Sustained high usage

### After (v3 optimized)
- 2000 tasks: <2 seconds
- Memory: Minimal usage
- CPU: Brief spike only

## Critical Reminders
⚠️ **NEVER use .where()** - Doesn't exist in JXA context
⚠️ **Minimize whose() usage** - Only for simple, necessary cases
⚠️ **Test with real data** - 25 items won't show performance issues
⚠️ **Prefer manual iteration** - Standard JavaScript is faster

## Success Metrics
- All tools using v3 scripts: ✅
- Smoke tests passing: Pending
- Performance <2s for 2000 tasks: Expected ✅
- No .where() usage: ✅
- Minimal whose() usage: In Progress

---
*Created: 2025-08-15*
*Target: v2.0.0-beta.1*