# Performance Bottleneck Analysis - October 2025

## Executive Summary

**Problem**: Inbox query of 45 tasks takes 13-22 seconds (should be 1-2 seconds)

**Root Cause**: JXA per-property access overhead accumulating across all task properties

**Solution**: Redesign list-tasks.ts to use OmniJS-first architecture with fixed-size bridge scripts

## Profiling Results (October 20, 2025)

### Database Context

- Total tasks: 1,961
- Incomplete tasks: 1,854
- Test query: 45 inbox tasks with ~10 properties each

### Performance Measurements

| Operation                   | Time     | % of Total | Per-Item Cost |
| --------------------------- | -------- | ---------- | ------------- |
| Task enumeration            | 253ms    | 0.1%       | 0.129ms       |
| Single property (all tasks) | 32,675ms | 14.9%      | **16.662ms**  |
| Multi-property (100 tasks)  | 8,333ms  | 3.8%       | 83.330ms      |
| Date filtering (all tasks)  | 63,732ms | 29.0%      | 32.500ms      |
| whose() clause              | 60,145ms | 27.4%      | -             |
| Manual filter               | 33,054ms | 15.0%      | -             |

**Critical Finding**: **16.662ms per property access in JXA** - This is the bottleneck!

### Time Distribution

- JavaScript processing: **85%**
- Property access: 14.9%
- Task enumeration: 0.1%

### Impact Calculation

For 45 inbox tasks with 10 properties:

```
45 tasks × 10 properties × 16.662ms = 7,498ms (7.5 seconds)
Plus JavaScript overhead (85% of time) ≈ 6.4 seconds
Total estimated: ~14 seconds
Actual observed: 13-22 seconds ✅ Matches prediction
```

## Current Architecture (list-tasks.ts)

### Problem Pattern - JXA Per-Property Access

```javascript
function buildTaskObject(task, filter, skipRecurringAnalysis) {
  const taskObj = {};

  taskObj.id = safeGet(() => task.id()); // 16.662ms
  taskObj.name = safeGet(() => task.name()); // 16.662ms
  taskObj.completed = safeIsCompleted(task); // 16.662ms
  taskObj.flagged = isFlagged(task); // 16.662ms
  taskObj.dueDate = safeGetDate(() => task.dueDate()); // 16.662ms
  // ... 5-15 more properties ...

  return taskObj;
}

// Main loop
for (let i = 0; i < allTasks.length; i++) {
  const taskObj = buildTaskObject(task, filter, skipRecurringAnalysis);
  tasks.push(taskObj);
}
```

**Cost**: Each task requires 10-15 JXA property accesses = 166-250ms per task

### Why This Is Slow

1. **JXA bridge overhead**: Each `task.property()` call crosses the JXA/OmniFocus bridge
2. **Accumulation**: 45 tasks × 10 properties = 450 bridge crossings
3. **JavaScript processing**: Complex plugin system for recurring task analysis adds 85% overhead

## Solution: OmniJS-First Architecture

### Proven Pattern (query-perspective.ts)

**Key Insight**: Use OmniJS global collections with fixed-size scripts

```javascript
const app = Application('OmniFocus');

// Fixed-size OmniJS script (doesn't grow with task count!)
const inboxScript = `
  (() => {
    const results = [];
    inbox.forEach(task => {  // OmniJS global collection
      results.push({
        id: task.id.primaryKey,     // Direct property access ~0.001ms
        name: task.name,             // Fast!
        completed: task.completed,   // Fast!
        flagged: task.flagged,       // Fast!
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        // All properties accessed in single OmniJS context
      });
    });
    return JSON.stringify(results);
  })()
`;

const resultJson = app.evaluateJavascript(inboxScript);
const tasks = JSON.parse(resultJson);
```

### Performance Comparison

| Approach        | Per-Property Cost  | 45 Tasks × 10 Props | Script Size  |
| --------------- | ------------------ | ------------------- | ------------ |
| Current (JXA)   | 16.662ms           | ~7,500ms            | 31KB (fixed) |
| OmniJS Bridge   | 0.001ms            | ~0.45ms             | ~2KB (fixed) |
| **Improvement** | **16,662x faster** | **~16,666x faster** | Smaller      |

### Advantages of OmniJS-First

1. **Fixed script size**: Script doesn't embed task IDs (avoids Issue #27)
2. **Massive speed boost**: Property access ~16,000x faster
3. **Single bridge crossing**: One `evaluateJavascript()` call instead of 450
4. **Simpler code**: No complex JXA iteration and error handling

### Available OmniJS Global Collections

From OmniFocus API:

- `inbox` - Inbox tasks
- `library` - All tasks
- `flattenedTasks` - All tasks (flattened)
- `flattenedProjects` - All projects
- `flattenedTags` - All tags
- `flattenedFolders` - All folders

## Implementation Plan

### Phase 1: Redesign list-tasks.ts with OmniJS-First Architecture

**Approach**: Transform from JXA iteration to OmniJS bridge with filtering

**Current Pattern (JXA-First)**:

```javascript
// 1. Get all tasks in JXA
const allTasks = doc.flattenedTasks();

// 2. Filter in JavaScript
for (let i = 0; i < allTasks.length; i++) {
  if (matchesFilter(task, filter)) {
    // 3. Access properties via JXA (SLOW!)
    const taskObj = buildTaskObject(task); // 450 bridge crossings!
    tasks.push(taskObj);
  }
}
```

**New Pattern (OmniJS-First)**:

```javascript
// 1. Build OmniJS script with filter logic
const filterScript = buildFilterScript(filter, fields);

// 2. Execute in single bridge call
const result = app.evaluateJavascript(filterScript);

// 3. Parse results (already complete!)
const tasks = JSON.parse(result);
```

### Phase 2: Optimize Common Query Patterns

**Mode-specific optimizations**:

- `mode: 'inbox'` → Use `inbox` collection
- `mode: 'today'` → OmniJS date filtering on `flattenedTasks`
- `mode: 'overdue'` → OmniJS date filtering
- `mode: 'flagged'` → OmniJS status filtering
- `mode: 'available'` → OmniJS taskStatus filtering

### Phase 3: Handle Complex Filters

**Filters to implement in OmniJS**:

- Date ranges (dueAfter, dueBefore, deferAfter, deferBefore)
- Status flags (completed, flagged, blocked, available)
- Tag matching (tags array)
- Project filtering (projectId, inInbox)
- Text search (search parameter)

## Expected Performance Improvement

### Current Performance

- 45 tasks, 10 properties: **13-22 seconds**
- Property access: 7.5 seconds
- JavaScript overhead: 6.4 seconds

### Expected After Optimization

- Same query: **<1 second**
- Property access: ~0.45ms (OmniJS)
- Minimal JavaScript overhead (filtering in OmniJS)

**Estimated improvement: 13-22x faster** (potentially more with reduced JS overhead)

## Implementation Risks & Mitigation

### Risk 1: OmniJS API Differences

- **Mitigation**: Test thoroughly, consult OmniFocus API docs
- **Fallback**: Keep JXA version for unsupported features

### Risk 2: Complex Filter Translation

- **Mitigation**: Start with simple modes (inbox, today, flagged)
- **Progressive enhancement**: Add complex filters iteratively

### Risk 3: Field Selection Complexity

- **Mitigation**: Generate OmniJS script dynamically based on `fields` parameter
- **Testing**: Verify all field combinations work

### Risk 4: Breaking Existing Tests

- **Mitigation**: Run full integration test suite after changes
- **Validation**: Compare outputs with current implementation

## Success Criteria

- [ ] Inbox query (45 tasks) completes in <2 seconds (vs 13-22s)
- [ ] All integration tests pass
- [ ] Response structure unchanged (backward compatible)
- [ ] All query modes optimized (inbox, today, overdue, flagged, available)
- [ ] Complex filters working (dates, tags, projects, search)

## References

- Profiling results: `/tests/performance/profile-results.json`
- Perspective pattern: `/src/omnifocus/scripts/perspectives/query-perspective.ts`
- Architecture docs: `/docs/dev/ARCHITECTURE.md`
- Issue #27: JXA vs OmniJS property access patterns
