# Future Consolidation Opportunities

**Date:** 2025-12-18
**Status:** Backlog
**Context:** Notes from AST consolidation completion session

---

## Completed This Session

- [x] Phase 4 AST consolidation (recurring tasks)
- [x] Count-only query bug fix (`result.data` access)
- [x] Testing prompt updated for AST coverage (23 tests)
- [x] `create-task.ts` archived (final cleanup)

---

## Future Work

### 1. Remove Debug Fields from processAdvancedFilters

**Priority:** Low
**Effort:** 30 min

The `processAdvancedFilters` method in `QueryTasksTool.ts` includes debug fields:
- `_debug_filters_type`
- `_debug_no_filters_param`
- `_debug_filters_is_string`
- etc.

These were useful during development but should be removed for cleaner production responses.

**File:** `src/tools/tasks/QueryTasksTool.ts:462-491`

### 2. Scripts That Could Benefit from AST

These scripts still use template-based approaches and could potentially use AST builders:

| Script | Lines | Notes |
|--------|-------|-------|
| `manage-tags.ts` | 590 | Tag CRUD operations |
| `export-tasks.ts` | 323 | Export with filters |
| `date-range-queries.ts` | 329 | Date filter predicates |
| `update-project.ts` | 311 | Project mutations |
| `get-recurring-patterns.ts` | 266 | Pattern analysis |

**Decision:** These are lower priority since they work correctly. Only migrate if:
- Bug is found requiring significant changes
- New feature needs to be added
- Performance issues identified

### 3. workflow-analysis-v3.ts (866 lines)

**Decision:** Keep as-is. Already optimized OmniJS with complex aggregation logic that doesn't benefit from AST modularization. The script performs multi-pass analysis that isn't easily decomposed.

### 4. Testing Prompt Response Path Consistency

The validation prompt tests check different response paths:
- Tasks: `.data.tasks` or `.metadata.total_count`
- Projects/Tags: `.data.items`

Consider standardizing or documenting the response structure differences more clearly.

---

## Notes

### AST Consolidation Impact

Total archived: ~2,900 lines
- Phase 1: list-tasks-omnijs.ts (571 lines)
- Phase 2: update-task-v3.ts + project scripts (~1,100 lines)
- Phase 3: list-projects-v3.ts, list-tags-v3.ts (570 lines)
- Phase 4: analyze-recurring-tasks.ts (500 lines)
- Final: create-task.ts (290 lines)

### Current Script Codebase

~9,700 lines total in `src/omnifocus/scripts/`

The largest remaining scripts are analytics/workflow scripts that perform complex operations not easily decomposed into AST patterns.
