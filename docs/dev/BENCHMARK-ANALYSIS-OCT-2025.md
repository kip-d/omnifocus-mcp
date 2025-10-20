# Benchmark Analysis - October 20, 2025

## Test Configuration
- **Mode**: Warmed cache (production performance)
- **Hardware**: Apple M2, 8 cores, 24GB RAM
- **Cache warming time**: 12.1 seconds

## Benchmark Results

| Operation | Time | Status | Optimization Potential |
|-----------|------|--------|----------------------|
| Task velocity | **67,592ms** | Critical | High - 67x slower than target |
| Productivity stats | **7,841ms** | Slow | High - Could be <1s |
| Tags (full mode) | **8,366ms** | Slow | High - Bulk property access |
| Tags (fast mode) | **6,937ms** | Slow | Medium - Already "fast" mode |
| Project statistics | **6,936ms** | Slow | High - Bulk operations |
| Tags (names only) | **3,548ms** | Moderate | Medium - Simple query |
| Today's tasks | **2ms** | Excellent | None - Already optimized |
| Overdue tasks | **1ms** | Excellent | None - Already optimized |
| Upcoming tasks | **0ms** | Excellent | None - Cached |

## Analysis

### Critical Performance Issues

**1. Task Velocity (67.6 seconds)**
- **Current**: 67,592ms for 7-day velocity calculation
- **Target**: <1 second
- **Problem**: Likely processing all completed tasks with JXA per-property access
- **Solution**: OmniJS bulk query for completed tasks in date range
- **Expected improvement**: 50-100x faster

**2. Productivity Stats (7.8 seconds)**
- **Current**: 7,841ms for weekly statistics
- **Target**: <1 second
- **Problem**: Multiple task queries with property access overhead
- **Solution**: Single OmniJS query for all required data
- **Expected improvement**: 10-20x faster

**3. Tags Operations (3.5-8.4 seconds)**
- **Full mode**: 8,366ms (includes usage stats)
- **Fast mode**: 6,937ms (excludes some stats)
- **Names only**: 3,548ms (minimal data)
- **Problem**: Iterating through all tags and tasks for statistics
- **Solution**: OmniJS global collections (flattenedTags)
- **Expected improvement**: 10-20x faster

**4. Project Statistics (6.9 seconds)**
- **Current**: 6,936ms
- **Target**: <1 second
- **Problem**: Iterating through all projects with JXA
- **Solution**: OmniJS flattenedProjects collection
- **Expected improvement**: 10-20x faster

### Operations Already Optimized

**Today's tasks (2ms)**
- Using optimized scripts or cache
- No further optimization needed

**Overdue tasks (1ms)**
- Using optimized scripts or cache
- No further optimization needed

**Upcoming tasks (0ms)**
- Cached response
- No optimization needed

## Optimization Priority

### Priority 1: Task Velocity (Immediate)
- **Impact**: 67.6s → <1s (67x improvement)
- **Effort**: Medium
- **Pattern**: Apply OmniJS-first to completed tasks query
- **Files**: `src/omnifocus/scripts/analytics/task-velocity.ts`

### Priority 2: Productivity Stats (High)
- **Impact**: 7.8s → <1s (8x improvement)
- **Effort**: Medium
- **Pattern**: Consolidate multiple queries into single OmniJS call
- **Files**: `src/omnifocus/scripts/analytics/productivity-stats.ts`

### Priority 3: Tags Operations (High)
- **Impact**: 8.4s → <1s (8x improvement)
- **Effort**: Medium
- **Pattern**: Use flattenedTags OmniJS collection
- **Files**: `src/omnifocus/scripts/tags/list-tags.ts`

### Priority 4: Project Statistics (Medium)
- **Impact**: 6.9s → <1s (7x improvement)
- **Effort**: Medium
- **Pattern**: Use flattenedProjects OmniJS collection
- **Files**: `src/omnifocus/scripts/projects/project-stats.ts`

## Implementation Strategy

### Phase 1: Task Velocity Optimization
Task velocity is the slowest operation by far (67.6s). Fixing this provides immediate user value.

**Current approach (estimated):**
```javascript
// JXA iteration through completed tasks
for (let i = 0; i < allTasks.length; i++) {
  if (task.completed()) {
    const completionDate = task.completionDate();  // 16.662ms
    const name = task.name();                      // 16.662ms
    // More property accesses...
  }
}
```

**OmniJS-first approach:**
```javascript
const velocityScript = `
  (() => {
    const startDate = new Date('${startDate}');
    const endDate = new Date('${endDate}');
    const results = [];

    flattenedTasks.forEach(task => {
      const completionDate = task.completionDate;
      if (completionDate && completionDate >= startDate && completionDate <= endDate) {
        results.push({
          id: task.id.primaryKey,
          name: task.name,
          completionDate: completionDate.toISOString(),
          project: task.containingProject ? task.containingProject.name : null
        });
      }
    });

    return JSON.stringify(results);
  })()
`;
```

### Phase 2: Analytics Suite
After task velocity, optimize the analytics suite (productivity stats, project stats).

### Phase 3: Tags Operations
Tags are used frequently, so optimizing these provides broad user benefit.

## Expected Total Impact

**Before optimization:**
- Task velocity: 67.6s
- Productivity stats: 7.8s
- Tags operations: 3.5-8.4s
- Project statistics: 6.9s
- **Total slow operations**: ~100 seconds

**After optimization (estimated):**
- Task velocity: <1s (67x faster)
- Productivity stats: <1s (8x faster)
- Tags operations: <1s (8x faster)
- Project statistics: <1s (7x faster)
- **Total slow operations**: ~4 seconds

**Overall improvement: 25x faster for slow operations**

## Recommendation

Start with task velocity optimization. It's the slowest operation and will provide the most immediate user impact. The pattern from list-tasks-v3 can be directly applied.

After task velocity, proceed with the analytics suite since these operations are related and can share OmniJS query patterns.

## Files to Review

```bash
# Task velocity (Priority 1)
src/omnifocus/scripts/analytics/task-velocity.ts
src/tools/analytics/TaskVelocityToolV2.ts

# Productivity stats (Priority 2)
src/omnifocus/scripts/analytics/productivity-stats.ts
src/tools/analytics/ProductivityStatsToolV2.ts

# Tags (Priority 3)
src/omnifocus/scripts/tags/list-tags.ts
src/tools/tags/TagsToolV2.ts

# Projects (Priority 4)
src/omnifocus/scripts/projects/project-stats.ts
src/tools/projects/ProjectsToolV2.ts
```
