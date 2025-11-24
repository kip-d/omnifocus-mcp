# AST Consolidation Opportunities

**Date:** 2025-11-24
**Status:** Analysis Complete - Ready for Implementation
**Context:** With AST contracts now complete, significant code reduction opportunities exist

---

## Executive Summary

**Key Finding:** We built an AST-powered query script (74% smaller) but never switched to using it!

| Metric | Current | Potential |
|--------|---------|-----------|
| `list-tasks` script | 571 lines | 146 lines (74% reduction) |
| Status | AST version exists | Not being used yet! |
| Tests | 18 test references | Already written |
| Effort | LOW | Just swap imports |

---

## Immediate Win: Switch to AST-Powered list-tasks

### Current State
```typescript
// src/omnifocus/scripts/tasks.ts
export { LIST_TASKS_SCRIPT_V3 } from './tasks/list-tasks-omnijs.js';

// src/tools/tasks/QueryTasksTool.ts
import { LIST_TASKS_SCRIPT_V3 } from '../../omnifocus/scripts/tasks.js';
```

**File:** `list-tasks-omnijs.ts` - 571 lines of hand-written filter logic

### AST Version (Already Built!)
**File:** `list-tasks-ast.ts` - 146 lines using AST-generated filters

```typescript
/**
 * list-tasks-ast.ts - AST-Powered Task Query Script (V4)
 *
 * Benefits:
 * 1. Single source of truth for filter logic (AST)
 * 2. Validated filters catch errors before script generation
 * 3. Consistent behavior across all query modes
 * 4. Smaller, cleaner scripts (~40% code reduction)
 * 5. Testable filter logic (unit tests for AST)
 */
import { buildFilteredTasksScript, buildInboxScript, buildTaskByIdScript } from '../../../contracts/ast/script-builder.js';
```

### Migration Plan (Estimated: 30 minutes)

**Step 1: Update export** (5 min)
```typescript
// src/omnifocus/scripts/tasks.ts
-export { LIST_TASKS_SCRIPT_V3 } from './tasks/list-tasks-omnijs.js';
+export { buildListTasksScriptV4 as LIST_TASKS_SCRIPT_V4 } from './tasks/list-tasks-ast.js';
```

**Step 2: Update tools** (10 min)
```typescript
// src/tools/tasks/QueryTasksTool.ts
-import { LIST_TASKS_SCRIPT_V3 } from '../../omnifocus/scripts/tasks.js';
+import { LIST_TASKS_SCRIPT_V4 } from '../../omnifocus/scripts/tasks.js';

// Change usage (example)
-const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT_V3, { filter });
+const script = LIST_TASKS_SCRIPT_V4({ filter, fields, limit });
```

**Step 3: Run tests** (10 min)
```bash
npm run test:unit
npm run test:integration
```

**Step 4: Archive old version** (5 min)
```bash
mv src/omnifocus/scripts/tasks/list-tasks-omnijs.ts .archive/scripts/
```

### Benefits
- ✅ **74% code reduction** (571 → 146 lines)
- ✅ **Type-safe filters** (compile-time validation)
- ✅ **Easier to maintain** (logic in AST, not templates)
- ✅ **Already tested** (18 test references)

---

## Future Consolidation Opportunities

### Large Scripts That Could Benefit from AST

| Script | Lines | Potential Consolidation |
|--------|-------|-------------------------|
| workflow-analysis-v3.ts | 866 | Could generate analysis predicates from AST |
| update-task-v3.ts | 769 | **MUTATION**: Use AST mutation builder (already exists!) |
| manage-tags.ts | 590 | Tag operations could use AST |
| recurring/analyze-recurring-tasks.ts | 500 | Recurring patterns from AST |
| date-range-queries.ts | 329 | Date filter predicates from AST |
| export/export-tasks.ts | 323 | Filter + field selection from AST |
| update-project.ts | 311 | **MUTATION**: Use AST mutation builder |
| list-tags-v3.ts | 293 | Tag queries from AST |
| create-task.ts | 290 | **MUTATION**: Use AST mutation builder |
| list-projects.ts | 277 | Project filters from AST |

### Mutation Scripts (High Value)

**Current:** Hand-written mutation logic in multiple files
**AST Contract:** `mutation-script-builder.ts` with 50 unit tests

**Consolidation candidates:**
1. `update-task-v3.ts` (769 lines) → AST mutation builder
2. `create-task.ts` (290 lines) → AST mutation builder
3. `update-project.ts` (311 lines) → AST mutation builder

**Estimated reduction:** ~60-70% code reduction per script

---

## Prioritized Implementation Roadmap

### Phase 1: Immediate Win (30 min) - **DO THIS NOW**
- ✅ Switch `list-tasks` to AST version
- ✅ 74% code reduction
- ✅ Zero risk (already tested)

### Phase 2: Mutation Consolidation (2-4 hours)
- Migrate `create-task.ts` to AST mutation builder
- Migrate `update-task-v3.ts` to AST mutation builder
- Migrate `update-project.ts` to AST mutation builder
- **Estimated reduction:** ~800 lines of code

### Phase 3: Query Consolidation (4-6 hours)
- Migrate `list-projects.ts` to AST
- Migrate `list-tags-v3.ts` to AST
- Migrate `export-tasks.ts` to AST field selection
- **Estimated reduction:** ~500 lines of code

### Phase 4: Analytics Consolidation (optional, 6-8 hours)
- Migrate `workflow-analysis-v3.ts` to AST
- Migrate `analyze-recurring-tasks.ts` to AST patterns
- **Estimated reduction:** ~600 lines of code

---

## Total Potential Impact

| Phase | Time | LOC Reduction | Risk |
|-------|------|---------------|------|
| Phase 1 (list-tasks) | 30 min | -425 lines | Zero |
| Phase 2 (mutations) | 2-4 hrs | -800 lines | Low |
| Phase 3 (queries) | 4-6 hrs | -500 lines | Low |
| Phase 4 (analytics) | 6-8 hrs | -600 lines | Medium |
| **TOTAL** | **13-18 hrs** | **-2,325 lines** | **Low overall** |

**Code reduction: 2,325 lines (~20-25% of script codebase)**

---

## Why This Matters

### Before AST Contracts
```typescript
// list-tasks-omnijs.ts (571 lines)
export const LIST_TASKS_SCRIPT_V3 = `
  ${getUnifiedHelpers()}
  (() => {
    // ... 500+ lines of hand-written filter logic
    if (filter.status === 'active' && !task.completed()) { ... }
    if (filter.flagged && task.flagged()) { ... }
    if (filter.dueDate) {
      if (filter.dueDate.before) { ... }
      if (filter.dueDate.after) { ... }
    }
    // ... repeated for every filter type
  })();
`;
```

### After AST Contracts
```typescript
// list-tasks-ast.ts (146 lines)
export function buildListTasksScriptV4(params) {
  const { filter, fields, limit } = params;

  // AST generates the filter logic
  const generatedScript = buildFilteredTasksScript(filter, { limit, fields });

  // Just wrap in JXA execution
  return `...app.evaluateJavascript(${generatedScript})...`;
}
```

**Benefits:**
- Single source of truth (AST)
- Compile-time validation
- Unit-testable filter logic
- Smaller, cleaner scripts
- Easier to maintain

---

## Success Criteria

### Phase 1 (Immediate)
- ✅ All tools using AST-powered `list-tasks`
- ✅ All tests passing
- ✅ Old `list-tasks-omnijs.ts` archived
- ✅ No performance regression

### Overall
- ✅ 2,000+ lines of code removed
- ✅ All filter/mutation logic in AST
- ✅ Comprehensive test coverage maintained
- ✅ Performance maintained or improved
- ✅ Developer velocity increased (easier to add features)

---

## Recommendation

**Start with Phase 1 immediately** - it's a 30-minute task that delivers 74% code reduction with zero risk. The AST version is already built, tested, and ready to use. We're literally just swapping imports.

**Then proceed to Phase 2** - mutation consolidation has high value (800 LOC reduction) and the mutation-script-builder already exists with 50 tests.

This is the culmination of building the AST contracts system - now we get to reap the benefits!
