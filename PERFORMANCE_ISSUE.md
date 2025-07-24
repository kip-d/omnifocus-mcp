# Performance Issue Analysis

## Problem
The following operations are taking 15-45 seconds:
- `update_task` (16.7 seconds)
- `complete_task` (16.8 seconds) 
- `delete_task` (14.7 seconds)
- `get_task_count` with available filter (45 seconds)

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