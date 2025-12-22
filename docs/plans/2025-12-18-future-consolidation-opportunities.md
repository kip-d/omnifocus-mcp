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

## Completed 2025-12-19

- [x] Phase 5: `export-tasks.ts` - Migrated to `buildExportTasksScript()` (323 lines removed)
- [x] Phase 6: `get-task-count.ts` - Migrated to `buildTaskCountScript()` (204 lines removed)
  - Added `filter.search` support to AST builder (alias for `filter.text`)
  - Unified OmniJS-only approach (removed dual-path JXA/OmniJS architecture)

---

## Future Work

### 1. Remove Debug Fields from processAdvancedFilters

**Priority:** Low
**Effort:** 30 min
**Status:** ✅ COMPLETED (2025-12-20)

Removed 16 debug fields from `processAdvancedFilters` method (27 lines deleted).

### 2. export-tasks.ts Filter Duplication

**Priority:** Medium
**Effort:** 2-3 hours
**Status:** ✅ COMPLETED (2025-12-19)

Lines 52-117 duplicated filter logic that already exists in `filter-generator.ts`:
- completed, flagged, available filters
- project name/ID filters
- tags with AND/OR/NOT_IN operators
- search text filter

Refactored to use `generateFilterCode()` from AST system for consistency and maintainability.

**File:** `src/omnifocus/scripts/export/export-tasks.ts`

### 3. Scripts That Could Benefit from AST (Lower Priority)

These scripts still use template-based approaches but are lower priority:

| Script | Lines | Notes |
|--------|-------|-------|
| `manage-tags.ts` | 590 | Tag CRUD mutations - would need tag-mutation-builder |
| `date-range-queries.ts` | 329 | Ultra-optimized with specialized perf techniques |
| `update-project.ts` | 311 | Project mutations |
| `get-recurring-patterns.ts` | 266 | Pattern analysis |

**Decision:** These are lower priority since they work correctly. Only migrate if:
- Bug is found requiring significant changes
- New feature needs to be added
- Performance issues identified

### 4. workflow-analysis-v3.ts (866 lines)

**Decision:** Keep as-is. Already optimized OmniJS with complex aggregation logic that doesn't benefit from AST modularization. The script performs multi-pass analysis that isn't easily decomposed.

### 5. Testing Prompt Response Path Consistency

**Priority:** Medium
**Effort:** 2-3 hours
**Status:** ✅ COMPLETED (2025-12-22)

Standardized all list responses to use entity-specific keys:
- Tasks: `.data.tasks`
- Projects: `.data.projects`
- Tags: `.data.tags`
- Folders: `.data.folders`

Updated `createListResponseV2` to accept entity-specific itemType parameter and generate appropriate data keys. All tests updated to use new paths.

---

## Notes

### AST Consolidation Impact

Total archived: ~3,400 lines
- Phase 1: list-tasks-omnijs.ts (571 lines)
- Phase 2: update-task-v3.ts + project scripts (~1,100 lines)
- Phase 3: list-projects-v3.ts, list-tags-v3.ts (570 lines)
- Phase 4: analyze-recurring-tasks.ts (500 lines)
- Final: create-task.ts (290 lines)
- Phase 5: export-tasks.ts (323 lines)
- Phase 6: get-task-count.ts (204 lines)

### Current Script Codebase

~9,700 lines total in `src/omnifocus/scripts/`

The largest remaining scripts are analytics/workflow scripts that perform complex operations not easily decomposed into AST patterns.
