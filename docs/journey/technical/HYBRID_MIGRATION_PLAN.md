# Hybrid Migration Plan: JXA → evaluateJavascript() Bridge

## Executive Summary
The v1.12.1 performance breakthrough using `evaluateJavascript()` bridge shows a 96% improvement for upcoming tasks queries (23.7s → 0.75s). We should systematically migrate high-impact tools to this hybrid approach.

## Why Hybrid Approach is Superior

### Performance Comparison
| Operation | Pure JXA | Hybrid (Omni Automation) | Improvement |
|-----------|----------|--------------------------|-------------|
| Iterate 1000+ tasks | 20-25s | <1s | 96% faster |
| Access task properties | Slow | Fast | ~10x faster |
| Filter operations | Very slow | Native speed | ~20x faster |
| Batch operations | Timeouts | Reliable | No timeouts |

### Technical Advantages
1. **Omni Automation API** is native JavaScript running inside OmniFocus
2. **Direct object access** without JXA bridge overhead
3. **Better memory management** for large datasets
4. **Native collection methods** (filter, map, forEach) work efficiently
5. **No timeout issues** even with large databases

## Migration Priority List

### 🔴 Priority 1: High-Impact Performance Bottlenecks
These tools currently have performance issues and would benefit most:

#### 1. **list_tasks** (LIST_TASKS_SCRIPT)
- **Current**: Iterates all tasks with JXA, slow with 1000+ tasks
- **Impact**: Core functionality used by many operations
- **Effort**: Medium (complex filtering logic)
- **Expected improvement**: 10-20x faster

#### 2. **todays_agenda** (TODAYS_AGENDA_SCRIPT)
- **Current**: Can timeout with large databases
- **Impact**: High - frequently used feature
- **Effort**: Low-Medium
- **Expected improvement**: 95% faster

#### 3. **export_tasks** (EXPORT_TASKS_SCRIPT)
- **Current**: Slow with large exports
- **Impact**: Medium - important for backups
- **Effort**: Medium
- **Expected improvement**: 80% faster

### 🟡 Priority 2: Analytics and Batch Operations
These tools process many tasks and would see significant gains:

#### 4. **productivity_stats**
- **Current**: Processes all tasks for statistics
- **Impact**: Medium
- **Effort**: Medium
- **Expected improvement**: 70% faster

#### 5. **task_velocity**
- **Current**: Analyzes completion patterns
- **Impact**: Medium
- **Effort**: Low
- **Expected improvement**: 60% faster

#### 6. **analyze_recurring_tasks**
- **Current**: Iterates all tasks to find patterns
- **Impact**: Low-Medium
- **Effort**: Medium
- **Expected improvement**: 50% faster

#### 7. **list_projects**
- **Current**: Gets all projects with task counts
- **Impact**: Medium
- **Effort**: Low
- **Expected improvement**: 40% faster

### 🟢 Priority 3: Already Fast Enough
These tools are already performant or don't iterate large datasets:

#### Keep as JXA:
- **create_task** - Single operation, already fast
- **update_task** - Single operation, uses hybrid for repetition only
- **complete_task** - Single operation
- **delete_task** - Single operation
- **create_project** - Single operation
- **update_project** - Single operation

## Implementation Strategy

### Phase 1: Critical Performance Fixes (Week 1)
1. **list_tasks** - Core functionality
2. **todays_agenda** - User-facing, high-frequency
3. Create shared hybrid utilities module

### Phase 2: Batch Operations (Week 2)
4. **export_tasks** - Important for data portability
5. **export_projects** - Consistency with task exports
6. **productivity_stats** - Analytics improvement

### Phase 3: Optimization (Week 3)
7. **task_velocity** - Complete analytics suite
8. **analyze_recurring_tasks** - Pattern detection
9. Performance testing and optimization

## Code Pattern for Migration

### Current JXA Pattern
```javascript
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  // Slow property access
  if (task.completed()) continue;
  if (task.dueDate()) { /* ... */ }
}
```

### New Hybrid Pattern
```javascript
const omniScript = `
  (() => {
    // Runs inside OmniFocus - FAST!
    const tasks = flattenedTasks
      .filter(t => !t.completed && t.dueDate)
      .map(t => ({
        id: t.id.primaryKey,
        name: t.name,
        dueDate: t.dueDate.toISOString()
      }));
    return JSON.stringify(tasks);
  })()
`;
const result = app.evaluateJavascript(omniScript);
```

## Success Metrics
- **Target**: All Priority 1 tools complete in <2 seconds
- **Stretch goal**: 80% of all queries complete in <1 second
- **User satisfaction**: No timeout complaints

## Risks and Mitigations
1. **Risk**: Breaking changes in hybrid implementation
   - **Mitigation**: Comprehensive test suite for each migrated tool

2. **Risk**: Omni Automation API differences
   - **Mitigation**: Document API differences, create compatibility layer

3. **Risk**: Increased complexity
   - **Mitigation**: Create shared utilities, consistent patterns

## Estimated Timeline
- **Week 1**: Priority 1 tools (3 tools)
- **Week 2**: Priority 2 tools (4 tools)
- **Week 3**: Testing, optimization, documentation
- **Total**: 3 weeks for full migration

## Expected Outcomes
1. **90% reduction** in query times for large databases
2. **Zero timeout errors** for standard operations
3. **Better user experience** with responsive UI
4. **Future-proof** architecture leveraging Omni's preferred API

## Next Steps
1. Create `hybrid-utilities.ts` module for shared functionality
2. Migrate `list_tasks` as proof of concept
3. Measure performance improvements
4. Continue with priority order

## Conclusion
The hybrid approach using `evaluateJavascript()` bridge is clearly superior for any operation that:
- Iterates over many tasks/projects
- Performs filtering or searching
- Aggregates data
- Has current performance issues

We should aggressively migrate these tools while keeping simple CRUD operations in JXA for simplicity.