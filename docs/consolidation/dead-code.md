# Potentially Dead Code Analysis

**Purpose:** Document backend tools and scripts NOT called by the unified API.

**Date Created:** 2025-11-06
**Last Updated:** 2025-11-07 (Task 10 - Post-Consolidation Review)

**Methodology:**
1. Listed all backend tools in `src/tools/`
2. Cross-referenced with unified API tool registrations in `src/tools/index.ts`
3. Listed all scripts in `src/omnifocus/scripts/` (excluding `shared/`)
4. Cross-referenced with tool imports, accounting for barrel exports

---

## ✅ Phase 1 Consolidation Complete (Tasks 5-9)

**Status as of 2025-11-07:**

### Successfully Consolidated and Deleted:
1. ✅ `list-tasks.ts` → Migrated to `list-tasks-omnijs.ts` (LIST_TASKS_SCRIPT_V3)
2. ✅ `create-task-with-bridge.ts` → Consolidated into ManageTaskTool
3. ✅ `productivity-stats.ts` → Migrated to `productivity-stats-v3.ts`
4. ✅ `task-velocity.ts` → Migrated to `task-velocity-v3.ts`
5. ✅ `list-tags.ts` → Migrated to `list-tags-v3.ts`

**Result:** 5 scripts deleted, 4 v3 scripts now active, codebase simplified

---

## Backend Tools Not Registered in Unified API

### ExportTool

**File:** `src/tools/export/ExportTool.ts`

**Status:** ⚠️ NOT REGISTERED - Not exposed via MCP (but has unit tests)

**Reason:** Not included in `src/tools/index.ts` tool registration array

**Scripts Used:**
- `src/omnifocus/scripts/export/export-tasks.ts` (EXPORT_TASKS_SCRIPT)
- `src/omnifocus/scripts/export/export-projects.ts` (EXPORT_PROJECTS_SCRIPT)

**Test Coverage:**
- ✅ Unit tests exist: `tests/unit/tools/export/export-tool.test.ts`
- ✅ Also referenced in: `tests/unit/completed-project-tasks.test.ts`

**Functionality:** Exports OmniFocus data to files (JSON/CSV/Markdown formats)

**Why It Exists But Is Unused:**
- ExportTool was developed before the unified API consolidation
- v2.3.0 unified API (4 tools) does not include export functionality
- Export operations may have been deemed out-of-scope for the unified API
- Tool is fully implemented, functional, and has test coverage

**Task 10 Analysis (2025-11-07):**
- ✅ Tool code is clean and well-tested
- ✅ No dead imports or references to consolidated files
- ✅ Export scripts are isolated to export/ directory
- ⚠️ Decision needed: Keep for future use or remove entirely

**Action Recommendation:**
- **Option A:** Keep as-is - Document as "available but not registered" (safest option)
  - Pros: Preserved for future use, has tests, isolated code
  - Cons: Maintenance burden for unused code
- **Option B:** Register ExportTool as 5th tool if export is valuable
  - Pros: Exposes useful functionality to users
  - Cons: Increases API surface area
- **Option C:** Delete if export functionality not needed
  - Files to delete: ExportTool.ts, export-tasks.ts, export-projects.ts, export-tool.test.ts
  - Would save ~35KB and reduce maintenance burden

**Recommendation for Now:** **Keep as-is (Option A)** - Tool is clean, isolated, and well-tested. No compelling reason to delete unless actively causing problems.

---

## Scripts Not Imported by Any Backend Tool

### ✅ RESOLVED - All V3 Variants Now Active (Tasks 7-9)

#### productivity-stats-v3.ts
**File:** `src/omnifocus/scripts/analytics/productivity-stats-v3.ts`

**Status:** ✅ NOW ACTIVE - ProductivityStatsTool updated to use v3 (Task 7)

**Old File Status:** ❌ DELETED - `productivity-stats.ts` removed after consolidation

**Result:** Tool now uses optimized v3 script, old version deleted

---

#### task-velocity-v3.ts
**File:** `src/omnifocus/scripts/analytics/task-velocity-v3.ts`

**Status:** ✅ NOW ACTIVE - TaskVelocityTool updated to use v3 (Task 8)

**Old File Status:** ❌ DELETED - `task-velocity.ts` removed after consolidation

**Result:** Tool now uses v3 script, old version deleted

---

#### list-tags-v3.ts
**File:** `src/omnifocus/scripts/tags/list-tags-v3.ts`

**Status:** ✅ NOW ACTIVE - TagsTool updated to use v3 (Task 9)

**Old File Status:** ❌ DELETED - `list-tags.ts` removed after consolidation

**Result:** Tool now uses optimized v3 script (24% smaller), old version deleted

---

## Scripts Used via Indirect Mechanisms (NOT Dead Code)

The following scripts appeared unused in initial search but are actually used:

### Cache Warming Scripts (Used by CacheWarmer)

- ✅ `cache/warm-task-caches.ts` - Used by `src/cache/CacheWarmer.ts`
- ✅ `cache/warm-projects-cache.ts` - Used by `src/cache/CacheWarmer.ts`

### Scripts Used via Barrel Exports

The following scripts are imported via barrel export files (`tasks.ts`, `recurring.ts`, `reviews.ts`):

**Tasks Scripts (via `scripts/tasks.ts`):**
- ✅ `tasks/complete-task.ts` - Re-exported as COMPLETE_TASK_SCRIPT
- ✅ `tasks/complete-tasks-bulk.ts` - Re-exported as BULK_COMPLETE_TASKS_SCRIPT
- ✅ `tasks/delete-task.ts` - Re-exported as DELETE_TASK_SCRIPT
- ✅ `tasks/delete-tasks-bulk.ts` - Re-exported as BULK_DELETE_TASKS_SCRIPT
- ✅ `tasks/get-task-count.ts` - Re-exported as GET_TASK_COUNT_SCRIPT
- ✅ `tasks/todays-agenda.ts` - Re-exported as TODAYS_AGENDA_SCRIPT
- ✅ `tasks/list-tasks-omnijs.ts` - Re-exported as LIST_TASKS_SCRIPT_V3

**Recurring Scripts (via `scripts/recurring.ts`):**
- ✅ `recurring/analyze-recurring-tasks.ts` - Re-exported as ANALYZE_RECURRING_TASKS_SCRIPT
- ✅ `recurring/get-recurring-patterns.ts` - Re-exported as GET_RECURRING_PATTERNS_SCRIPT

**Reviews Scripts (via `scripts/reviews.ts`):**
- ✅ `reviews/projects-for-review.ts` - Re-exported as PROJECTS_FOR_REVIEW_SCRIPT
- ✅ `reviews/mark-project-reviewed.ts` - Re-exported as MARK_PROJECT_REVIEWED_SCRIPT
- ✅ `reviews/set-review-schedule.ts` - Re-exported as SET_REVIEW_SCHEDULE_SCRIPT

### System Scripts (Used Directly)

- ✅ `system/get-version.ts` - Used by `src/tools/system/SystemTool.ts`

---

## Export Scripts (Status Depends on ExportTool Decision)

**File:** `src/omnifocus/scripts/export/export-tasks.ts`
**File:** `src/omnifocus/scripts/export/export-projects.ts`

**Status:** ⚠️ USED BY UNREGISTERED TOOL

**Notes:**
- These scripts ARE imported by ExportTool
- But ExportTool itself is not registered in the unified API
- If ExportTool is deleted, these become dead code
- If ExportTool is registered as 5th tool, these are active

**Action:** Depends on decision about ExportTool (see Backend Tools section above)

---

## Summary Statistics

### Backend Tools (as of 2025-11-07)
- **Total Backend Tools:** 17 (excluding unified API tools)
- **Registered in Unified API:** 16
- **Not Registered:** 1 (ExportTool - intentionally kept for future use)
- **Not Registered %:** 5.9%

### Scripts (excluding shared/) - Post-Consolidation
- **Total Scripts Before:** 53
- **Total Scripts After:** 48 (5 deleted in consolidation)
- **Actively Used:** 46 (including barrel exports and cache warming)
- **Export Scripts (ExportTool):** 2 (kept for future use)
- **Truly Dead Code:** 0 (all scripts used somewhere, even if by unregistered tools)

### ✅ Consolidation Completed (Tasks 7-9)
1. ✅ **productivity-stats:** Regular → v3 (DONE - old file deleted)
2. ✅ **task-velocity:** Regular → v3 (DONE - old file deleted)
3. ✅ **list-tags:** Regular → v3 (DONE - old file deleted)
4. ✅ **list-tasks:** Regular → omnijs (DONE - old file deleted, Task 5)
5. ✅ **create-task-with-bridge:** Consolidated into ManageTaskTool (DONE - Task 6)

---

## Observations (Updated 2025-11-07)

### 1. ✅ Minimal True Dead Code Achieved
- **Zero scripts** are truly unused - all are imported somewhere
- The only "dead" component is ExportTool (intentionally not registered)
- Excellent code hygiene after consolidation

### 2. ✅ V3 Optimization Pattern - COMPLETED
- ~~Three v3 variants exist but aren't used yet~~ → All v3 variants NOW ACTIVE
- All v3 variants provided size reductions (12-24% smaller)
- ✅ Consolidation complete: v3 scripts active, originals deleted
- Result: Cleaner codebase with optimized scripts

### 3. ✅ Barrel Export Architecture Working Well
- Barrel exports (`tasks.ts`, `recurring.ts`, `reviews.ts`) work well
- Makes script imports cleaner in tools
- Must account for barrel pattern when identifying "unused" code

### 4. ExportTool - Intentionally Preserved
- Fully implemented, functional tool with test coverage
- Scripts exist and are imported by ExportTool
- Not exposed via MCP (by design - not part of v2.3.0 unified API)
- **Decision:** Keep for future use (Option A)
  - Clean, isolated code (~35KB)
  - No maintenance burden or conflicts
  - Available if export functionality needed later
  - No compelling reason to delete

---

## ✅ Phase 1 Complete - Final Status

### Tasks Completed (2025-11-07)

1. ✅ **Task 3:** Dead code documented
2. ✅ **Task 4:** Helper pain points log created
3. ✅ **Task 5:** list-tasks consolidated to list-tasks-omnijs
4. ✅ **Task 6:** create-task-with-bridge consolidated into ManageTaskTool
5. ✅ **Task 7:** productivity-stats migrated to v3
6. ✅ **Task 8:** task-velocity migrated to v3
7. ✅ **Task 9:** list-tags migrated to v3
8. ✅ **Task 10:** Dead code reviewed and documented

### Final Consolidation Results

**Scripts:**
- Started with: 53 scripts
- Deleted: 5 scripts (list-tasks.ts, create-task-with-bridge.ts, productivity-stats.ts, task-velocity.ts, list-tags.ts)
- Final count: 48 scripts
- Reduction: 9.4%

**Dead Code:**
- Truly dead code: 0 scripts
- Unregistered tools: 1 (ExportTool - intentionally preserved)
- Code quality: Excellent

### ExportTool - Final Decision

**Decision Made: Option A - Keep But Document (Future Use)**

**Rationale:**
- ✅ Clean, isolated code (~35KB total)
- ✅ Has comprehensive test coverage
- ✅ No conflicts with active codebase
- ✅ No maintenance burden
- ✅ Available if export functionality needed later
- ✅ Deleting would require removing tests without clear benefit

**Implementation:**
- No code changes needed
- ExportTool remains in codebase but not registered
- Documentation updated to reflect status

---

## Next Steps (Post-Phase 1)

1. ✅ Phase 1 consolidation complete - 5 scripts deleted
2. Monitor for any issues from consolidations
3. If export functionality needed → Register ExportTool as 5th tool
4. Continue with Phase 2 (helper consolidation) if planned

---

## Appendix: Complete Tool Registration Mapping

### Unified API Tools (Registered)
1. ✅ `OmniFocusReadTool` (omnifocus_read)
2. ✅ `OmniFocusWriteTool` (omnifocus_write)
3. ✅ `OmniFocusAnalyzeTool` (omnifocus_analyze)
4. ✅ `SystemTool` (system)

### Backend Tools (Called by Unified API)
5. ✅ `QueryTasksTool` - Called by OmniFocusReadTool
6. ✅ `ManageTaskTool` - Called by OmniFocusWriteTool
7. ✅ `ProjectsTool` - Called by OmniFocusReadTool
8. ✅ `TagsTool` - Called by OmniFocusReadTool
9. ✅ `PerspectivesTool` - Called by OmniFocusReadTool
10. ✅ `FoldersTool` - Called by OmniFocusReadTool
11. ✅ `BatchCreateTool` - Called by OmniFocusWriteTool
12. ✅ `ProductivityStatsTool` - Called by OmniFocusAnalyzeTool
13. ✅ `TaskVelocityTool` - Called by OmniFocusAnalyzeTool
14. ✅ `OverdueAnalysisTool` - Called by OmniFocusAnalyzeTool
15. ✅ `PatternAnalysisTool` - Called by OmniFocusAnalyzeTool
16. ✅ `WorkflowAnalysisTool` - Called by OmniFocusAnalyzeTool
17. ✅ `RecurringTasksTool` - Called by OmniFocusAnalyzeTool
18. ✅ `ParseMeetingNotesTool` - Called by OmniFocusAnalyzeTool
19. ✅ `ManageReviewsTool` - Called by OmniFocusAnalyzeTool

### Backend Tools (NOT Called by Unified API)
20. ❌ `ExportTool` - NOT REGISTERED (see decision point above)

**Total:** 20 tools (4 unified + 16 backend active + 1 backend inactive)
