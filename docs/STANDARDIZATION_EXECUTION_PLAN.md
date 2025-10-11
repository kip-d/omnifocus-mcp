# Codebase Standardization - Execution Plan

**Start Time:** October 10, 2025
**Completion Time:** October 10, 2025
**Duration:** Phase 1 complete (2 hours)
**Status:** Phase 1 Complete ✅ | Phase 2-3 Deferred

## Overview

This plan systematically addresses all inconsistencies identified in the codebase audit. We'll migrate the entire codebase to V2 patterns, ensuring architectural consistency.

## Phase 1: Critical Fixes (30 minutes)

### Task 1.1: Fix update-task.ts Tag Operations ⏱️ 20 min
**Status:** ✅ COMPLETE
**Priority:** 🚨 CRITICAL

**Current Issue:**
- Lines 338-409: Using JXA tag methods that fail in OmniFocus 4.x
- `task.tags()`, `task.addTags()`, `task.tags =` don't work

**Fix:**
```typescript
// Current (BROKEN):
const currentTags = task.tags();
task.addTags(tagsToAdd);

// New (WORKS):
const bridgeResult = bridgeSetTags(app, taskId, updates.tags);
```

**Files to modify:**
- `src/omnifocus/scripts/tasks/update-task.ts`

**Steps:**
1. Add `getMinimalTagBridge()` import
2. Replace tag update section with bridge call
3. Remove JXA fallback attempts

### Task 1.2: Test Tag Update Fix ⏱️ 10 min
**Status:** ✅ COMPLETE

**Test commands:**
```bash
npm run build
node test-tag-creation.js  # Verify create still works
# Create test for update operation
```

---

## Phase 2: Type Safety Migration (2-3 hours)

### Task 2.1: Create Response Type Definitions ⏱️ 30 min
**Status:** Pending

**Response types to create in `response-types-v2.ts`:**
1. `FoldersResponseV2` / `FolderOperationResponseV2`
2. `ExportResponseV2`
3. `RecurringTasksResponseV2`
4. `ReviewsResponseV2` / `ReviewOperationResponseV2`
5. `BatchCreateResponseV2`
6. `ParseMeetingNotesResponseV2`
7. `WorkflowAnalysisResponseV2`

**Pattern:**
```typescript
export interface FoldersDataV2 {
  folders?: unknown[];
  folder?: unknown;
  count?: number;
}

export type FoldersResponseV2 = StandardResponseV2<FoldersDataV2>;
```

### Task 2.2: Migrate FoldersTool to V2 ⏱️ 30 min
**Status:** Pending

**Changes:**
1. Add type parameter: `extends BaseTool<typeof FoldersSchema, FoldersResponseV2>`
2. Import: `FoldersResponseV2, FoldersDataV2`
3. Replace all `handleError()` → `handleErrorV2<FoldersDataV2>()`
4. Update return types

### Task 2.3: Migrate ExportTool to V2 ⏱️ 30 min
**Status:** Pending

**Changes:**
1. Add type parameter: `extends BaseTool<typeof ExportSchema, ExportResponseV2>`
2. Replace 4 instances of `handleError()` → `handleErrorV2<ExportDataV2>()`
3. Update return types

### Task 2.4: Migrate RecurringTasksTool to V2 ⏱️ 20 min
**Status:** Pending

**Changes:**
1. Add type parameter
2. Replace `handleError()` → `handleErrorV2<RecurringTasksDataV2>()`

### Task 2.5: Migrate ManageReviewsTool to V2 ⏱️ 20 min
**Status:** Pending

**Changes:**
1. Add type parameter
2. Replace `handleError()` → `handleErrorV2<ReviewsDataV2>()`

### Task 2.6: Verify TypeScript Compilation ⏱️ 10 min
**Status:** Pending

```bash
npm run typecheck
# Should show 0 errors
```

---

## Phase 3: Cleanup & Documentation (30 minutes)

### Task 3.1: Update Export Scripts ⏱️ 10 min
**Status:** ✅ COMPLETE

**Files Modified:**
- `src/omnifocus/scripts/export/export-projects.ts`
- `src/omnifocus/scripts/export/export-tasks.ts`

**Changes Applied:**
```typescript
// Old:
import { getMinimalHelpers } from '../shared/helpers.js';
${getMinimalHelpers()}

// New:
import { getUnifiedHelpers } from '../shared/helpers.js';
${getUnifiedHelpers()}
```

**Notes:**
- export-tasks.ts also had `getTaskStatusHelpers()` which was removed (included in getUnifiedHelpers)
- Both scripts now use the unified helper bundle

### Task 3.2: Run Full Test Suite ⏱️ 10 min
**Status:** ✅ COMPLETE

**Results:**
```bash
npm run build    # ✅ Success
npm run lint     # ✅ Success
npm run typecheck # ✅ Success
npm test         # ✅ 713 tests passed
```

### Task 3.3: Update Documentation ⏱️ 10 min
**Status:** In Progress

**Update files:**
- `docs/CODEBASE_INCONSISTENCIES_AUDIT.md` - Mark Phase 3 issues as resolved
- `docs/STANDARDIZATION_EXECUTION_PLAN.md` - Update with Phase 3 completion report

---

## Success Criteria

### Phase 1 ✅ COMPLETE
- [x] update-task.ts uses bridge for tag operations
- [x] Tag updates work in tests
- [x] No regressions in tag creation
- [x] All 713 tests passing

### Phase 2 ✅
- [ ] All 7 tools have response type definitions
- [ ] All 4 tools migrated to V2 error handling
- [ ] TypeScript shows 0 errors
- [ ] All tools have explicit response types in class declaration

### Phase 3 ✅ COMPLETE
- [x] No deprecated helper usage in export scripts
- [x] All tests passing (713 tests)
- [x] Lint clean
- [x] TypeScript compilation clean
- [ ] Documentation updated (in progress)

---

## Risk Management

### Potential Issues

**1. Tag update tests might fail initially**
- **Mitigation:** Test incrementally, verify bridge works first

**2. Type definitions might not match actual responses**
- **Mitigation:** Check existing V2 tools for patterns, use `unknown` if needed

**3. Breaking changes in tool interfaces**
- **Mitigation:** Keep backward compatibility, only change internals

### Rollback Plan

Each phase has its own commit:
```bash
git log --oneline -5  # Find commit before changes
git revert <commit>   # Rollback if needed
```

---

## Progress Tracking

| Phase | Task | Status | Time Spent | Issues |
|-------|------|--------|------------|--------|
| 1 | Fix update-task.ts | Starting | - | - |
| 1 | Test tag updates | Pending | - | - |
| 2 | Create types | Pending | - | - |
| 2 | Migrate FoldersTool | Pending | - | - |
| 2 | Migrate ExportTool | Pending | - | - |
| 2 | Migrate RecurringTasksTool | Pending | - | - |
| 2 | Migrate ManageReviewsTool | Pending | - | - |
| 2 | TypeCheck | Pending | - | - |
| 3 | Update exports | Pending | - | - |
| 3 | Test suite | Pending | - | - |
| 3 | Documentation | Pending | - | - |

---

## Completion Report

### Phase 1 Results (October 10, 2025)

**Status:** ✅ COMPLETE AND SUCCESSFUL

**Time Spent:** ~2 hours (vs 30min estimated)

**Issues Encountered:**
1. **Root Cause Discovery**: Found that `createUpdateTaskScript()` was calling non-existent `updateTaskTags()` function
   - `UPDATE_TASK_SCRIPT` template was fixed but function-based generator wasn't
   - Tag updates were silently failing

2. **Diagnostic Process**: Created multiple test scripts to isolate the issue:
   - `test-tag-update.js` - Full MCP integration test
   - `test-tag-sequence-diagnostic.js` - Step-by-step tag operation verification
   - `test-tag-direct-query.js` - Direct OmniFocus query bypassing cache

**Fix Applied:**
```typescript
// Added to createUpdateTaskScript()
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';

// Replaced non-existent call
- const tagResult = updateTaskTags(task, updates.tags);  // ❌ Doesn't exist
+ const bridgeResult = bridgeSetTags(app, taskId, updates.tags);  // ✅ Works
```

**Lessons Learned:**
1. **Always check both code paths**: Template substitution AND function-based generators
2. **Bridge operations work reliably**: Direct testing confirmed bridge tag operations work perfectly
3. **Diagnostic scripts essential**: Created comprehensive test suite for tag operations

**Verification:**
- ✅ test-tag-update.js passes: Tags update from `["initial-tag"]` to `["updated-tag", "second-tag"]`
- ✅ All 713 unit tests passing
- ✅ TypeScript compilation clean
- ✅ Pushed to main branch

### Phase 2 Status: DEFERRED

**Reason:** V2 type migration is more complex than initially estimated. Requires:
1. Updating `handleErrorV2()` signature in `base.ts` to accept tool name parameter
2. Updating all internal method return types to match stricter V2 types
3. Careful testing to ensure no runtime regressions

**Recommendation:** Address Phase 2 in a dedicated session focused solely on type system migration.

### Phase 3 Results (October 11, 2025)

**Status:** ✅ COMPLETE AND SUCCESSFUL

**Time Spent:** ~15 minutes (vs 30min estimated)

**Changes Applied:**

1. **Updated export-projects.ts**:
   - Changed import from `getMinimalHelpers` to `getUnifiedHelpers`
   - Replaced `${getMinimalHelpers()}` with `${getUnifiedHelpers()}`

2. **Updated export-tasks.ts**:
   - Changed import from `getMinimalHelpers, getTaskStatusHelpers` to `getUnifiedHelpers`
   - Replaced both `${getMinimalHelpers()}` and `${getTaskStatusHelpers()}` with single `${getUnifiedHelpers()}`
   - Simplified helper usage (getUnifiedHelpers includes all task status helpers)

**Verification:**
- ✅ npm run build: Success
- ✅ npm run lint: Success
- ✅ npm run typecheck: Success
- ✅ npm test: All 713 tests passing
- ✅ No deprecated helper usage in export scripts

**Benefits:**
- Unified helper usage across export scripts
- Removed deprecated `getMinimalHelpers()` usage
- Simplified maintenance (single helper import)
- Consistent with documented patterns

### Remaining Technical Debt

**From Audit (Not Fixed in Phase 3):**
- 4 tools still using V1 error handling (FoldersTool, ExportTool, RecurringTasksTool, ManageReviewsTool) - **Phase 2 deferred**
- 7 tools missing explicit response type declarations - **Phase 2 deferred**
- ~~2 files using deprecated helpers~~ - ✅ **FIXED in Phase 3**
- Some tools using basic cache invalidation instead of smart methods - **Low priority**

**Priority:**
- Phase 2 (V2 migration): MEDIUM - Deferred for dedicated session
- Cache invalidation improvements: LOW - Not affecting functionality

---

**Completed Actions:**
1. ✅ Phase 1 complete - Tag updates now working correctly
2. 📋 Phase 2 deferred - Schedule dedicated type migration session
3. ✅ Phase 3 complete - Export scripts now use unified helpers
4. 📝 Documentation updated with Phase 3 results
