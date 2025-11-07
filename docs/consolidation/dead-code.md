# Potentially Dead Code Analysis

**Purpose:** Document backend tools and scripts NOT called by the unified API.

**Date Created:** 2025-11-06

**Methodology:**
1. Listed all backend tools in `src/tools/`
2. Cross-referenced with unified API tool registrations in `src/tools/index.ts`
3. Listed all scripts in `src/omnifocus/scripts/` (excluding `shared/`)
4. Cross-referenced with tool imports, accounting for barrel exports

---

## Backend Tools Not Registered in Unified API

### ExportTool

**File:** `src/tools/export/ExportTool.ts`

**Status:** ⚠️ NOT REGISTERED - Not exposed via MCP

**Reason:** Not included in `src/tools/index.ts` tool registration array

**Scripts Used:**
- `src/omnifocus/scripts/export/export-tasks.ts` (EXPORT_TASKS_SCRIPT)
- `src/omnifocus/scripts/export/export-projects.ts` (EXPORT_PROJECTS_SCRIPT)

**Functionality:** Exports OmniFocus data to files (JSON/CSV/Markdown formats)

**Why It Exists But Is Unused:**
- ExportTool was developed before the unified API consolidation
- v2.3.0 unified API (4 tools) does not include export functionality
- Export operations may have been deemed out-of-scope for the unified API
- Tool is fully implemented and functional, just not registered/exposed

**Action Recommendation:**
- **Option A:** Register ExportTool as 5th tool if export is valuable
- **Option B:** Keep for future use but document as "not currently registered"
- **Option C:** Delete if export functionality not needed (would also make export scripts dead code)
- **DO NOT delete yet** - needs user/stakeholder decision on export feature value

---

## Scripts Not Imported by Any Backend Tool

### 1. Analytics V3 Variants (Not Currently Used)

#### productivity-stats-v3.ts
**File:** `src/omnifocus/scripts/analytics/productivity-stats-v3.ts`

**Status:** ⚠️ NOT USED - V3 variant exists but not imported

**Currently Used Version:** `productivity-stats.ts` (imported by ProductivityStatsTool)

**Notes:**
- Comment in ProductivityStatsTool mentions "V3 optimized script with OmniJS bridge" but imports regular version
- V3 file is 12% smaller (283 vs 321 LOC per inventory)
- Consolidation candidate for Phase 1 Task 7

**Action:** Evaluate during consolidation - likely choose v3 and delete regular version

---

#### task-velocity-v3.ts
**File:** `src/omnifocus/scripts/analytics/task-velocity-v3.ts`

**Status:** ⚠️ NOT USED - V3 variant exists but not imported

**Currently Used Version:** `task-velocity.ts` (imported by TaskVelocityTool)

**Notes:**
- Nearly identical implementations (158 vs 156 LOC - only 2 line difference)
- Consolidation candidate for Phase 1 Task 8

**Action:** Evaluate during consolidation - minimal difference suggests simple merge

---

### 2. Tags V3 Variant (Not Currently Used)

#### list-tags-v3.ts
**File:** `src/omnifocus/scripts/tags/list-tags-v3.ts`

**Status:** ⚠️ NOT USED - V3 variant exists but not imported

**Currently Used Version:** `list-tags.ts` (imported by TagsTool)

**Notes:**
- V3 is 24% smaller (219 vs 287 LOC per inventory)
- Consolidation candidate for Phase 1 Task 9

**Action:** Evaluate during consolidation - likely choose v3 for size reduction

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

### Backend Tools
- **Total Backend Tools:** 17 (excluding unified API tools)
- **Registered in Unified API:** 16
- **Not Registered:** 1 (ExportTool)
- **Not Registered %:** 5.9%

### Scripts (excluding shared/)
- **Total Scripts:** 53
- **Actively Used:** 47 (including barrel exports and cache warming)
- **V3 Variants Not Used:** 3 (productivity-stats-v3, task-velocity-v3, list-tags-v3)
- **Export Scripts (depends on ExportTool):** 2
- **Truly Dead Code:** 0 (all scripts used somewhere, even if by unregistered tools)

### Consolidation Opportunities Identified
1. **productivity-stats:** Regular → v3 (12% smaller, 283 vs 321 LOC)
2. **task-velocity:** Regular → v3 (nearly identical, 156 vs 158 LOC)
3. **list-tags:** Regular → v3 (24% smaller, 219 vs 287 LOC)

---

## Observations

### 1. Minimal True Dead Code
- **Zero scripts** are truly unused - all are imported somewhere
- The only "dead" component is ExportTool (not registered)
- This indicates good code hygiene overall

### 2. V3 Optimization Pattern
- Three v3 variants exist but aren't used yet
- All v3 variants are smaller (12-24% size reduction)
- Clear consolidation opportunity: migrate to v3, delete originals

### 3. Barrel Export Architecture
- Barrel exports (`tasks.ts`, `recurring.ts`, `reviews.ts`) work well
- Makes script imports cleaner in tools
- Initial "unused" detection was fooled - must account for barrel pattern

### 4. ExportTool Status Unclear
- Fully implemented, functional tool
- Scripts exist and are imported
- But not exposed via MCP
- Needs stakeholder decision on whether to:
  - Register as 5th tool (add export capability)
  - Keep for future use (document but don't register)
  - Delete if not needed (saves ~500 LOC)

---

## Recommendations for Phase 1

### Immediate Actions (Conservative - No Deletions Yet)

1. **Document v3 consolidation targets** in helper-pain-points.md during consolidation tasks
2. **Flag ExportTool for user decision** before any deletion
3. **Validate v3 scripts** during consolidation to ensure they're actually better

### Phase 1 Consolidation (Tasks 5-9)

Execute as planned:
- Task 7: Consolidate productivity-stats → v3
- Task 8: Consolidate task-velocity → v3
- Task 9: Consolidate list-tags → v3

Expected outcome: 62 scripts → 59 scripts (3 deletions)

### ExportTool Decision Point

**Before Task 10 (dead code removal), decide:**

**Option A: Register ExportTool (Add Feature)**
- Register in `src/tools/index.ts`
- Expose as 5th MCP tool
- Document export capabilities
- Result: 5 tools, all scripts active

**Option B: Keep But Document (Future Use)**
- Add comment in code about why it's not registered
- Document in architecture docs as "available but not exposed"
- Result: 4 tools, export scripts dormant

**Option C: Delete ExportTool (Remove Feature)**
- Delete `src/tools/export/ExportTool.ts`
- Delete `src/omnifocus/scripts/export/export-tasks.ts`
- Delete `src/omnifocus/scripts/export/export-projects.ts`
- Result: 4 tools, 59 scripts → 57 scripts

---

## Next Steps

1. ✅ Task 3 complete - Dead code documented
2. Continue to Task 4 - Create helper pain points log
3. During consolidation (Tasks 5-9) - Migrate to v3 variants
4. Before Task 10 - **Get user decision on ExportTool**
5. Task 10 - Remove dead code based on decisions

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
