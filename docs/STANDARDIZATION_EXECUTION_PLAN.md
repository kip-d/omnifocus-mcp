# Codebase Standardization - Execution Plan

**Start Time:** October 10, 2025
**Estimated Duration:** 4-6 hours
**Status:** In Progress

## Overview

This plan systematically addresses all inconsistencies identified in the codebase audit. We'll migrate the entire codebase to V2 patterns, ensuring architectural consistency.

## Phase 1: Critical Fixes (30 minutes)

### Task 1.1: Fix update-task.ts Tag Operations ⏱️ 20 min
**Status:** Starting
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
**Status:** Pending

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
**Status:** Pending

**Files:**
- `src/omnifocus/scripts/export/export-projects.ts`
- `src/omnifocus/scripts/export/export-tasks.ts`

**Change:**
```typescript
// Old:
import { getMinimalHelpers } from '../shared/helpers.js';
${getMinimalHelpers()}

// New:
import { getUnifiedHelpers } from '../shared/helpers.js';
${getUnifiedHelpers()}
```

### Task 3.2: Run Full Test Suite ⏱️ 10 min
**Status:** Pending

```bash
npm run lint
npm run typecheck
npm test
```

### Task 3.3: Update Documentation ⏱️ 10 min
**Status:** Pending

**Update files:**
- `docs/CODEBASE_INCONSISTENCIES_AUDIT.md` - Mark issues as resolved
- `docs/PATTERNS.md` - Add update-task.ts example
- `CLAUDE.md` - Update tag operations section

---

## Success Criteria

### Phase 1 ✅
- [ ] update-task.ts uses bridge for tag operations
- [ ] Tag updates work in tests
- [ ] No regressions in tag creation

### Phase 2 ✅
- [ ] All 7 tools have response type definitions
- [ ] All 4 tools migrated to V2 error handling
- [ ] TypeScript shows 0 errors
- [ ] All tools have explicit response types in class declaration

### Phase 3 ✅
- [ ] No deprecated helper usage in codebase
- [ ] All tests passing (713+ tests)
- [ ] Lint clean
- [ ] Documentation updated

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

Will be filled in upon completion with:
- Total time spent
- Issues encountered
- Lessons learned
- Remaining technical debt

---

**Next Action:** Begin Phase 1 - Fix update-task.ts tag operations
