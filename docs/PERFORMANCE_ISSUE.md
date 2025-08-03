# Performance Issue Analysis

Last Updated: August 3, 2025 (v1.6.0)

## Current Performance Characteristics

Based on extensive user testing with a database of ~2,000 tasks:

### ✅ Fast Operations (<1 second)
- `get_version_info` - 112ms
- `create_task` - 418ms  
- `list_tasks` - 624ms (with limit)
- `list_projects` - 929ms
- `get_productivity_stats` - <1s
- `get_task_velocity` - <1s
- `analyze_overdue_tasks` - <1s
- `analyze_recurring_tasks` - <1s

### ⚠️ Previously Slow Operations (Fixed in v1.5.0+)
- `todays_agenda` - Was 48 seconds → **Now ~1-2 seconds** (reduced default limit to 50)
- `get_task_count` - Was 25+ seconds → **Now <1 second** (fixed undefined variable)

### ⚠️ Still Slow Operations (JXA Limitations)
- `list_tags` with usage stats - **40+ seconds** (iterates all tasks for counts)
- Large queries without limits - Performance degrades with database size
- Complex whose() queries - Can timeout with 2000+ tasks

### Previously Fixed Issues
- `delete_task` - Was 14.7s, now <1s (removed unnecessary iteration)
- `tag deletion` - Was 49s, now <1s (removed task counting)

## Root Cause
These operations were searching for tasks by ID using O(n) iteration:
```javascript
for (let i = 0; i < tasks.length; i++) {
  if (safeGet(() => tasks[i].id()) === taskId) {
    task = tasks[i];
    break;
  }
}
```

With ~2000 tasks, this means calling `task.id()` up to 2000 times per operation.

## Why This Is Slow
1. Each `task.id()` is a JXA bridge call to OmniFocus
2. JXA bridge calls have overhead (likely 5-10ms each)
3. 2000 tasks × 8ms = 16 seconds just to find one task

## Potential Solutions

### 1. Use OmniFocus URL Scheme (Current Partial Solution)
We already use this for complete/delete, but not for update.

### 2. Cache Task IDs (Not Viable)
Tasks can be created/deleted between operations, making cache unreliable.

### 3. Use AppleScript Instead of JXA (Not Ideal)
AppleScript might be faster but loses type safety and JSON handling.

### 4. Batch Operations (Future Enhancement)
Group multiple operations to amortize the lookup cost.

## Major Performance Breakthrough: whose() Method

Through empirical testing, we discovered:
1. `Task.byIdentifier` exists but throws "Can't convert types" in JXA
2. `doc.flattenedTasks.whose({id: taskId})` works perfectly!
3. Performance improvement: **7ms (iteration) → 2ms (whose())** 

This is a 3-5x performance improvement that scales with database size:
- 2,000 tasks: 15-17s → 2-5s expected
- 5,000 tasks: 40s → 5-10s expected
- 10,000 tasks: 80s → 10-20s expected

## Optimizations Applied in v1.4.0

### get_task_count
- Now uses pre-filtered collections: `doc.flattenedTasks.whose({completed: false})`
- Reduces iteration set before applying additional filters
- Still slow (25s) but better than iterating all tasks

### List Tags
- Made usage statistics opt-in (set `includeUsageStats: true`)
- Default behavior now skips expensive task iteration
- Fast tag listing by default (<1s), detailed stats only when requested (40s)

## todays_agenda Performance (Fixed in v1.5.0)

### Original Issue
The `todays_agenda` tool took ~49 seconds because it iterated through ALL tasks.

### Fix Applied in v1.5.0
- Changed default limit from 200 to 50 tasks
- Changed default `includeDetails` from true to false
- These defaults prevent timeout while still providing useful results

### Current Performance
- **Before**: 48 seconds timeout
- **After**: ~1-2 seconds for typical use
- Users can still request more tasks/details if needed

### Understanding the Performance

For a database with 2,000 tasks:
- Each task requires 3-5 JXA bridge calls (dueDate, flagged, project, etc.)
- Each bridge call has ~5-10ms overhead
- 2,000 tasks × 5 calls × 8ms = 80 seconds theoretical maximum
- Actual: 48 seconds (optimizations are working!)

### Recommendations for Users

1. **Use caching** - Results are cached for 1 minute
2. **Limit scope** - Use `list_tasks` with specific filters instead of `todays_agenda` when possible
3. **Schedule updates** - Run agenda queries during natural breaks
4. **Consider database size** - Performance scales linearly with task count

### Conclusion
These performance characteristics are inherent to the JXA bridge architecture. Without access to:
1. Direct database queries (not supported by OmniFocus)
2. Native filtered collections (e.g., "tasks due today")
3. Bulk operations API

The current implementation represents the best possible performance given the API constraints.