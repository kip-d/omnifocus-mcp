# Performance Issue Analysis

## Problem
The following operations are taking 15-49 seconds:
- `update_task` (16.7 seconds)
- `complete_task` (16.8 seconds) 
- `delete_task` (14.7 seconds)
- `get_task_count` with available filter (45 seconds) - FIXED: now ~2.5 seconds
- `todays_agenda` (49 seconds) - partially optimized, still ~48 seconds

## Root Cause
These operations search for tasks by ID using O(n) iteration:
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

## Immediate Fix
For now, we should:
1. Add progress logging to show where time is spent
2. Consider limiting task searches to recent tasks first
3. Document this as a known limitation of the JXA API

## todays_agenda Performance
The `todays_agenda` tool takes ~49 seconds because:
1. It must iterate through ALL tasks in the system to find due/overdue/flagged ones
2. Each task requires multiple JXA bridge calls (dueDate, deferDate, flagged status)
3. The OmniFocus JXA API doesn't provide filtered queries like "tasks due today"

### Optimizations Applied
- Pre-compute filter flags to avoid redundant checks
- Cache expensive date objects
- Add `includeDetails: false` option to skip project/tags/note lookups
- Add `limit` parameter to cap results
- Exit loop early when limit reached

### Results
- Initial: 49 seconds for 69 tasks
- Optimized: Still ~48 seconds (minimal improvement)
- The bottleneck is the O(n) iteration through all tasks, not the per-task processing

### Conclusion
Without access to filtered queries in the JXA API, todays_agenda will remain slow for users with many tasks. The only real solution would be:
1. Direct database access (not supported by OmniFocus)
2. A native OmniFocus plugin with better API access
3. Caching results aggressively (already implemented)