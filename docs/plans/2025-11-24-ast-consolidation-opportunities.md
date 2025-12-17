# AST Consolidation Opportunities

**Date:** 2025-11-24
**Updated:** 2025-12-17
**Status:** Phase 1 Complete, Phase 2-4 Ready for Implementation
**Context:** With AST contracts now complete, significant code reduction opportunities exist

---

## Executive Summary

**Phase 1 Complete:** QueryTasksTool now uses AST-powered `buildListTasksScriptV4` for all task queries.

| Metric              | Before             | After (Current)           |
| ------------------- | ------------------ | ------------------------- |
| `list-tasks` script | 571 lines          | 146 lines (74% reduction) |
| Status              | Template-based     | ✅ AST-powered (V4)       |
| Tests               | 18 test references | All passing               |
| QueryTasksTool      | Used V3 template   | ✅ Uses `buildListTasksScriptV4` |

---

## ✅ Phase 1 Complete: AST-Powered list-tasks

### Current State (As of 2025-12-17)

```typescript
// src/omnifocus/scripts/tasks.ts
export { buildListTasksScriptV4 } from './tasks/list-tasks-ast.js';

// src/tools/tasks/QueryTasksTool.ts
import { buildListTasksScriptV4 } from '../../omnifocus/scripts/tasks.js';

// All handlers use AST version:
const script = buildListTasksScriptV4({ filter, fields, limit });
```

**File:** `list-tasks-ast.ts` - 146 lines using AST-generated filters ✅

### Benefits Realized

- ✅ **74% code reduction** (571 → 146 lines)
- ✅ **Type-safe filters** (compile-time validation)
- ✅ **Easier to maintain** (logic in AST, not templates)
- ✅ **All tests passing**
- ✅ **Old template archived** (list-tasks-omnijs.ts removed)

---

## Future Consolidation Opportunities

### Large Scripts That Could Benefit from AST

| Script                               | Lines | Potential Consolidation                                  |
| ------------------------------------ | ----- | -------------------------------------------------------- |
| workflow-analysis-v3.ts              | 866   | Could generate analysis predicates from AST              |
| update-task-v3.ts                    | 769   | **MUTATION**: Use AST mutation builder (already exists!) |
| manage-tags.ts                       | 590   | Tag operations could use AST                             |
| recurring/analyze-recurring-tasks.ts | 500   | Recurring patterns from AST                              |
| date-range-queries.ts                | 329   | Date filter predicates from AST                          |
| export/export-tasks.ts               | 323   | Filter + field selection from AST                        |
| update-project.ts                    | 311   | **MUTATION**: Use AST mutation builder                   |
| list-tags-v3.ts                      | 293   | Tag queries from AST                                     |
| create-task.ts                       | 290   | **MUTATION**: Use AST mutation builder                   |
| list-projects.ts                     | 277   | Project filters from AST                                 |

### Mutation Scripts (High Value)

**Current:** Hand-written mutation logic in multiple files **AST Contract:** `mutation-script-builder.ts` with 50 unit
tests

**Consolidation candidates:**

1. `update-task-v3.ts` (769 lines) → AST mutation builder
2. `create-task.ts` (290 lines) → AST mutation builder
3. `update-project.ts` (311 lines) → AST mutation builder

**Estimated reduction:** ~60-70% code reduction per script

---

## Prioritized Implementation Roadmap

### Phase 1: Immediate Win (30 min) - ✅ COMPLETE

- ✅ Switch `list-tasks` to AST version - **DONE**
- ✅ 74% code reduction - **ACHIEVED**
- ✅ Zero risk (already tested) - **ALL TESTS PASSING**
- ✅ Old template archived - **DONE 2025-12-17**

### Phase 2: Mutation Consolidation (2-4 hours) - **DO THIS NEXT**

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

| Phase                | Time          | LOC Reduction    | Risk            | Status      |
| -------------------- | ------------- | ---------------- | --------------- | ----------- |
| Phase 1 (list-tasks) | 30 min        | -425 lines       | Zero            | ✅ COMPLETE |
| Phase 2 (mutations)  | 2-4 hrs       | -800 lines       | Low             | ⏳ Next     |
| Phase 3 (queries)    | 4-6 hrs       | -500 lines       | Low             | Pending     |
| Phase 4 (analytics)  | 6-8 hrs       | -600 lines       | Medium          | Pending     |
| **TOTAL**            | **13-18 hrs** | **-2,325 lines** | **Low overall** |             |

**Code reduction: 2,325 lines (~20-25% of script codebase)**
**Progress: Phase 1 complete (425 lines saved)**

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

### Phase 1 (Immediate) - ✅ ALL CRITERIA MET (2025-12-17)

- ✅ All tools using AST-powered `list-tasks` - **DONE**
- ✅ All tests passing - **VERIFIED**
- ✅ Old `list-tasks-omnijs.ts` archived - **DONE**
- ✅ No performance regression - **CONFIRMED**

### Overall

- ✅ 2,000+ lines of code removed
- ✅ All filter/mutation logic in AST
- ✅ Comprehensive test coverage maintained
- ✅ Performance maintained or improved
- ✅ Developer velocity increased (easier to add features)

---

## Recommendation

**Phase 1 is complete!** QueryTasksTool now uses `buildListTasksScriptV4` for all task queries. The old template
(`list-tasks-omnijs.ts`) has been archived.

**Next: Proceed to Phase 2** - mutation consolidation has high value (800 LOC reduction) and the mutation-script-builder
already exists with 50 tests. Key targets:
- `create-task.ts` (290 lines) → AST mutation builder
- `update-task-v3.ts` (769 lines) → AST mutation builder

This is the culmination of building the AST contracts system - now we get to reap the benefits!
