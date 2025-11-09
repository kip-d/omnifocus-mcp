# Script Consolidation Roadmap

## Executive Summary

The OmniFocus MCP codebase has grown to **62 scripts** with **1,800 LOC** of duplicated/versioned code (15.7%). This document provides a prioritized roadmap for consolidation.

**Estimated effort:** 10-12 hours total
**Estimated savings:** 1,400-1,600 LOC after consolidation
**Expected result:** Cleaner codebase, better maintainability, performance gains

---

## Phase 1: Critical Duplicates (Week 1) - 2-3 hours

### Task 1.1: Create-Task Consolidation (1 hour)
**Status:** Ready to execute
**Files involved:**
- `src/omnifocus/scripts/tasks/create-task.ts` (239 LOC)
- `src/omnifocus/scripts/tasks/create-task-with-bridge.ts` (180 LOC)

**Analysis:**
```typescript
// create-task.ts structure
export const CREATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}
  
  // Uses: helper bundle (1200 LOC)
  // Plus: repeat intent translation
  // Plus: tag assignment via bridge
  // Result: 239 LOC total
`;

// create-task-with-bridge.ts structure
export const CREATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}
  
  // Uses: same dependencies
  // No: repeat intent translation
  // Result: 180 LOC (simpler)
`;
```

**Action items:**
1. [ ] Keep `create-task-with-bridge.ts` (simpler baseline)
2. [ ] Add repeat intent translation from `create-task.ts`
3. [ ] Test feature parity
4. [ ] Delete original `create-task.ts`
5. [ ] Rename to `create-task.ts`

**Expected outcome:** Single 200-210 LOC create script with all features

---

### Task 1.2: List-Tasks Consolidation (1.5 hours)
**Status:** Ready to execute
**Files involved:**
- `src/omnifocus/scripts/tasks/list-tasks.ts` (495 LOC)
- `src/omnifocus/scripts/tasks/list-tasks-omnijs.ts` (437 LOC)

**Analysis:**
```
list-tasks.ts (CURRENT/DEPRECATED):
  - Uses: Pure JXA with inline filtering
  - Performance: 13-22 seconds for 45 items
  - Architecture: Complex nested filters
  
list-tasks-omnijs.ts (NEW/PREFERRED):
  - Uses: OmniJS bridge with template substitution
  - Performance: <1 second for 45 items
  - Architecture: Collection-based filtering
  - 13-22x FASTER ✓
```

**Feature comparison:**
```
Feature              | list-tasks.ts | list-tasks-omnijs.ts
--------------------|---------------|--------------------
Inbox filtering      | Yes           | Yes
Project filtering    | Yes           | Yes  
Tag filtering        | Yes           | Yes
Search               | Yes           | Yes
Completed filter     | Yes           | Yes
Flagged filter       | Yes           | Yes
Due date filtering   | Yes           | Yes
Defer date filtering | Yes           | Yes
Date enrichment      | Yes (bridge)  | Partial
Inline tags          | Yes           | Yes
Subtask support      | Yes           | Yes
```

**Action items:**
1. [ ] Verify feature parity by comparing test outputs
2. [ ] Add any missing features from v2 to omnijs version
3. [ ] Test with large database (2000+ tasks)
4. [ ] Verify date enrichment works correctly
5. [ ] Delete `list-tasks.ts`
6. [ ] Rename `list-tasks-omnijs.ts` to `list-tasks.ts`
7. [ ] Update imports in tool files

**Expected outcome:** Single optimized 437-495 LOC script with 13-22x better performance

---

## Phase 2: Near-Duplicate Consolidation (Week 2) - 4-5 hours

### Task 2.1: Productivity Stats Consolidation (1.5 hours)
**Files involved:**
- `src/omnifocus/scripts/analytics/productivity-stats.ts` (321 LOC)
- `src/omnifocus/scripts/analytics/productivity-stats-v3.ts` (283 LOC)

**Analysis:**
```diff
Lines of code difference: 38 LOC (12% variation)
Expected difference: Should be 0% if v3 is just refactored

Recommendation: Use v3 as base, add any features from v2
```

**Consolidation steps:**
1. [ ] Compare both scripts side-by-side
2. [ ] Identify what v3 removes vs v2
3. [ ] Add back any important features
4. [ ] Test with multiple period types (today/week/month/year)
5. [ ] Delete productivity-stats.ts, rename v3

**Expected output:** Single 300-320 LOC script

---

### Task 2.2: Task Velocity Consolidation (1 hour)
**Files involved:**
- `src/omnifocus/scripts/analytics/task-velocity.ts` (158 LOC)
- `src/omnifocus/scripts/analytics/task-velocity-v3.ts` (156 LOC)

**Analysis:**
```
Lines of code difference: 2 LOC

This is essentially the same script with trivial differences.
Consolidation is straightforward.
```

**Consolidation steps:**
1. [ ] Diff the two files to find actual differences
2. [ ] Use v3 as canonical version
3. [ ] Delete task-velocity.ts

**Expected output:** Single 156-158 LOC script

---

### Task 2.3: List Tags Consolidation (1.5 hours)
**Files involved:**
- `src/omnifocus/scripts/tags/list-tags.ts` (287 LOC)
- `src/omnifocus/scripts/tags/list-tags-v3.ts` (219 LOC)

**Analysis:**
```
Lines saved: 68 LOC (24% reduction from v2)

v3 appears to be optimization of v2.
Likely removed unused features or simplified logic.
```

**Analysis questions:**
1. Does v3 support all features of v2?
   - Fast mode?
   - Names only mode?
   - Usage stats?
   - Hierarchy information?
   
2. What's the 24% size reduction from?
   - Simplified bridge script?
   - Removed fallback code?
   - Better pattern matching?

**Consolidation steps:**
1. [ ] Compare feature support between v2 and v3
2. [ ] Verify v3 handles all use cases
3. [ ] Add back any critical features if missing
4. [ ] Test with large tag sets (100+ tags)
5. [ ] Delete list-tags.ts

**Expected output:** Single 220-260 LOC script

---

## Phase 3: Shared Pattern Extraction (Week 3) - 4-5 hours

### Task 3.1: Analytics Common Patterns (2-3 hours)
**Affected scripts (11 total, 2,289 LOC):**
```
core/
  - productivity-stats.ts (321 LOC)
  - workflow-analysis.ts (738 LOC)
  - analyze-overdue.ts (260 LOC)
  - task-velocity.ts (158 LOC)

recurring/
  - analyze-recurring-tasks.ts (500 LOC)

specialized/
  - next-actions-analyzer.ts (125 LOC)
  - wip-limits-analyzer.ts (100 LOC)
  - due-date-bunching-analyzer.ts (89 LOC)
  - review-gaps-analyzer.ts (81 LOC)
```

**Common patterns identified:**

**Pattern 1: Date Period Calculation**
```javascript
// Appears in: productivity-stats.ts, task-velocity.ts, workflow-analysis.ts
function calculatePeriodStart(period) {
  const now = new Date();
  const periodStart = new Date(now);
  
  switch(period) {
    case 'today':
      periodStart.setHours(0, 0, 0, 0);
      break;
    case 'week':
      periodStart.setDate(now.getDate() - 7);
      periodStart.setHours(0, 0, 0, 0);
      break;
    // ... etc
  }
  return periodStart;
}
```
**Extraction potential:** 40+ LOC saved across scripts

**Pattern 2: Task Status Checking**
```javascript
// Appears in: All analytics scripts
function checkTaskStatus(task) {
  return {
    completed: task.completed(),
    available: task.taskStatus() === Task.Status.Available,
    blocked: task.taskStatus() === Task.Status.Blocked
  };
}
```
**Extraction potential:** 30+ LOC per script

**Pattern 3: Count Aggregation**
```javascript
// Appears in: productivity-stats.ts, workflow-analysis.ts, analyze-recurring-tasks.ts
let active = 0, completed = 0, overdue = 0, flagged = 0;
for (let i = 0; i < tasks.length; i++) {
  const task = tasks[i];
  if (completed) completed++;
  else active++;
  if (flagged(task)) flagged++;
  // ...
}
```
**Extraction potential:** 50+ LOC per script

**Consolidation steps:**
1. [ ] Create `src/omnifocus/scripts/shared/analytics-helpers.ts`
2. [ ] Extract date period calculation function
3. [ ] Extract task status checking function
4. [ ] Extract count aggregation patterns
5. [ ] Update all 11 analytics scripts to use helpers
6. [ ] Test each script to verify behavior unchanged

**Estimated savings:** 200-300 LOC total

---

### Task 3.2: Date Handling Helper Extraction (1.5-2 hours)
**Affected scripts (12+ total):**
```
Tasks:
  - list-tasks.ts (uses safeGetDate + date filtering)
  - create-task.ts (uses date parsing)
  - update-task.ts (uses date parsing)

Analytics:
  - productivity-stats.ts
  - task-velocity.ts
  - workflow-analysis.ts
  - analyze-overdue.ts
  - analyze-recurring-tasks.ts
  (All use date filtering and period calculations)
```

**New helper module: `analytics-helpers.ts`**
```typescript
export function getAnalyticsPeriodStart(period: string): Date
export function filterTasksByPeriod(tasks, period, dateField)
export function safeParseDate(dateString): Date | null
export function calculateDaysDifference(date1, date2): number
```

**Consolidation steps:**
1. [ ] Create analytics-helpers.ts with date utilities
2. [ ] Move date filtering logic from all scripts
3. [ ] Create shared period calculation function
4. [ ] Update all analytics scripts
5. [ ] Test with various date scenarios

**Estimated savings:** 100-150 LOC total

---

## Phase 4: Code Cleanup (Week 3-4) - 1-2 hours

### Task 4.1: Audit Unused Code
**Files to audit:**
```
src/omnifocus/scripts/date-range-queries.ts (335 LOC)
  - Not imported by any operation scripts
  - Status: Unknown (legacy or unused?)
  - Action: Grep for usage, archive if unused

src/omnifocus/scripts/shared/bridge-helpers.ts
  - Check if used by any current scripts
  
src/omnifocus/scripts/shared/bridge-template.ts
  - Check if used by any current scripts
  
src/omnifocus/scripts/shared/script-builder.ts
  - Check if used by framework
```

**Steps:**
1. [ ] Search all operation scripts for imports
2. [ ] Check test files for usage
3. [ ] Review tool files for references
4. [ ] Archive or delete if truly unused

**Estimated cleanup:** 200+ LOC potentially

---

### Task 4.2: Consolidate Routing Files
**Files:**
```
src/omnifocus/scripts/tasks.ts (21 LOC)
src/omnifocus/scripts/recurring.ts (10 LOC)
src/omnifocus/scripts/perspectives.ts (252 LOC)
src/omnifocus/scripts/reviews.ts (5 LOC)
Total: 288 LOC
```

**Analysis:**
- These appear to be framework re-export files
- Verify if still needed with unified API
- May be part of tool discovery mechanism

**Steps:**
1. [ ] Check if any tools import from these files
2. [ ] Check if MCP framework requires them
3. [ ] Consolidate if redundant

---

## Implementation Timeline

### Week 1: Critical Consolidation
```
Day 1-2: Create-task merge (1 hour)
         + comprehensive testing (1 hour)

Day 3-4: List-tasks consolidation (1.5 hours)
         + feature verification (1.5 hours)

Day 5: Integration testing + bug fixes (2 hours)
```

### Week 2: Near-Duplicate Consolidation
```
Day 1-2: Productivity stats merge (1.5 hours)
         + testing (1.5 hours)

Day 3: Task velocity merge (1 hour)
       + testing (1 hour)

Day 4-5: List tags consolidation (1.5 hours)
         + comprehensive testing (1.5 hours)
```

### Week 3: Pattern Extraction
```
Day 1-3: Analytics pattern extraction (2-3 hours)
         + refactor analytics scripts (2 hours)
         + testing (1 hour)

Day 4-5: Date handling extraction (1.5-2 hours)
         + update affected scripts (1 hour)
         + integration testing (2 hours)
```

### Week 4: Cleanup & Review
```
Day 1-2: Audit unused code (1-2 hours)
         + decision on removal

Day 3-4: Code review + final testing (2 hours)

Day 5: Documentation update (1 hour)
```

---

## Rollback Plan

Each consolidation has a clear rollback strategy:

1. **Branch before each phase**
   - `consolidate/phase-1-critical`
   - `consolidate/phase-2-high`
   - etc.

2. **Create migration commits**
   - One commit per consolidation
   - Clear commit messages indicating what was consolidated

3. **Test thoroughly before merging**
   - Unit tests for each script
   - Integration tests for dependent tools
   - Manual testing with real OmniFocus

4. **Keep originals in git history**
   - Don't force-push
   - Old files remain in history for reference

---

## Success Criteria

### Code Quality
- [ ] All 62 scripts → 55-58 scripts (4-7 removed)
- [ ] 11,489 LOC → 9,700-9,900 LOC (13-15% reduction)
- [ ] Duplicate code → 0 LOC
- [ ] All tests passing
- [ ] No functionality lost

### Performance
- [ ] list-tasks execution: 13-22x faster
- [ ] analytics execution: No regression
- [ ] create/update operations: No change
- [ ] No new timeout issues

### Maintainability
- [ ] Single source of truth for each operation
- [ ] Clear helper hierarchy
- [ ] Well-documented consolidation decisions
- [ ] Ease of future enhancements

---

## Metrics to Track

### Before Consolidation
- Line count by directory
- Duplicate LOC percentage
- Script count
- Helper usage frequency
- Test coverage

### After Consolidation
- Same metrics (should show improvements)
- Performance metrics for affected scripts
- Maintenance effort (issue resolution time)
- Code review comments

---

## Post-Consolidation Review

After completing all phases, review:

1. **Performance gains**
   - Measure execution time for consolidated scripts
   - Compare with baseline

2. **Code quality**
   - Run linter on all affected files
   - Review helper usage patterns

3. **Completeness**
   - Verify all features preserved
   - Check for regression in tool behaviors

4. **Documentation**
   - Update architecture guide
   - Update pattern index
   - Update this inventory

---

## Notes & Considerations

### Important Constraints
- Each consolidation must be tested independently
- Tool tests must pass before moving to next phase
- No breaking changes to tool APIs
- Script exports must maintain backward compatibility

### Risk Areas
- List-tasks consolidation: Highest risk due to complexity
- Analytics extraction: Moderate risk due to widespread impact
- Helper extraction: Low risk if done carefully

### External Dependencies
- OmniFocus API stability
- Tool framework expectations
- Cache invalidation if consolidating cache-warmed scripts

