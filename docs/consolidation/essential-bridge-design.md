# Essential Bridge Bundle Design

**Created:** 2025-11-07 **Purpose:** Minimal bridge bundle for JXA limitations **Target:** create-task.ts,
update-task.ts (2 scripts) **Status:** Analysis Complete - Recommendation OPTION A

---

## Executive Summary

**RECOMMENDATION: Use existing pattern - NO NEW FILE NEEDED**

The "essential bridge bundle" already exists as the combination of:

- `MINIMAL_TAG_BRIDGE` (~140 lines, ~4.5KB)
- `REPEAT_HELPERS` (~234 lines, ~7.5KB)

Both scripts already import these. The task is to **remove getUnifiedHelpers()**, not create new files.

**Savings:**

- Current: getUnifiedHelpers (18KB) × 2 scripts = 36KB
- Proposed: MINIMAL_TAG_BRIDGE + REPEAT_HELPERS (~12KB) × 2 = 24KB
- Net reduction: 12KB (33% reduction)

---

## Current vs Proposed

### Current State (As of 2025-11-07)

**create-task.ts (lines 8-15):**

```typescript
import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

export const CREATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}        // ← 18KB
  ${getMinimalTagBridge()}      // ← 4.5KB
  ${REPEAT_HELPERS}             // ← 7.5KB
  // ... script logic
`;
```

**update-task.ts (lines 1-14):**

```typescript
import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

export const UPDATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}        // ← 18KB
  ${getMinimalTagBridge()}      // ← 4.5KB
  ${REPEAT_HELPERS}             // ← 7.5KB
  // ... script logic
`;
```

**Total:** (18KB + 4.5KB + 7.5KB) × 2 = 60KB

### Proposed State

**create-task.ts:**

```typescript
// REMOVE: import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

export const CREATE_TASK_SCRIPT = `
  // REMOVE: ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}      // ← 4.5KB
  ${REPEAT_HELPERS}             // ← 7.5KB
  // ... script logic
`;
```

**update-task.ts:**

```typescript
// REMOVE: import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

export const UPDATE_TASK_SCRIPT = `
  // REMOVE: ${getUnifiedHelpers()}
  ${getMinimalTagBridge()}      // ← 4.5KB
  ${REPEAT_HELPERS}             // ← 7.5KB
  // ... script logic
`;
```

**Total:** (4.5KB + 7.5KB) × 2 = 24KB

**Savings:** 36KB reduction (60%)

---

## Functions Analysis

### From getUnifiedHelpers() - Used or Not?

Analyzed create-task.ts and update-task.ts usage:

#### Functions Used by Scripts (MUST KEEP)

1. **formatError(error, context)** - ERROR_HANDLING
   - Used: create-task.ts line 238, update-task.ts line 476, 714
   - Purpose: Format error messages
   - **Status:** KEEP - Need to inline or extract

2. **validateProject(projectId, doc)** - PROJECT_VALIDATION
   - Used: create-task.ts line 76, update-task.ts line 232
   - Purpose: Validate project exists
   - **Status:** KEEP - Need to inline or extract

3. **safeGet(getter, defaultValue)** - SAFE_UTILITIES
   - Used: update-task.ts lines 111, 416, 436, 555
   - Purpose: Safe property access
   - **Status:** KEEP - Need to inline or extract

4. **safeGetProject(task)** - SAFE_UTILITIES
   - Used: update-task.ts lines 274, 285, 465
   - Purpose: Get task's project safely
   - **Status:** KEEP - Need to inline or extract

#### Functions NOT Used by Scripts (CAN REMOVE)

From SAFE_UTILITIES:

- safeGetDate() - NOT USED
- safeGetTags() - NOT USED (bridge handles tags)
- isValidDate() - NOT USED
- isTaskAvailable() - NOT USED
- isTaskEffectivelyCompleted() - NOT USED
- isFlagged() - NOT USED
- safeGetEstimatedMinutes() - NOT USED
- safeGetFolder() - NOT USED
- safeGetTaskCount() - NOT USED
- safeIsCompleted() - NOT USED
- getTaskStatus() - NOT USED
- safeGetStatus() - NOT USED

**Analysis:** Scripts only use 4 functions from getUnifiedHelpers():

- formatError
- validateProject
- safeGet
- safeGetProject

---

## Bridge Functions Analysis

### From MINIMAL_TAG_BRIDGE (4.5KB) - ALL USED

1. **\_\_formatTagScript(template, params)** - Lines 58-70
   - Purpose: Template formatting for OmniJS bridge
   - Used by: bridgeSetTags
   - **Status:** REQUIRED

2. **bridgeSetTags(app, taskId, tagNames)** - Lines 91-106
   - Purpose: Assign tags via OmniJS bridge (JXA limitation)
   - Used: create-task.ts line 164, update-task.ts line 400, 675
   - **Status:** REQUIRED - JXA cannot persist tags

3. **bridgeSetPlannedDate(app, taskId, dateValue)** - Lines 124-135
   - Purpose: Set planned date via bridge
   - Used: create-task.ts line 206
   - **Status:** REQUIRED - OmniFocus 4.7+ feature

### From REPEAT_HELPERS (7.5KB) - ALL USED

1. **convertToRRULE(rule)** - Lines 8-93
   - Purpose: Convert repeat rule to RRULE format
   - Used by: prepareRepetitionRuleData
   - **Status:** REQUIRED

2. **convertToOmniMethod(method)** - Lines 96-108
   - Purpose: Convert method to OmniFocus enum
   - Used by: prepareRepetitionRuleData
   - **Status:** REQUIRED

3. **prepareRepetitionRuleData(rule)** - Lines 112-135
   - Purpose: Prepare rule for bridge application
   - Used: create-task.ts line 139, update-task.ts line 195, 630
   - **Status:** REQUIRED

4. **applyRepetitionRuleViaBridge(taskId, ruleData)** - Lines 139-188
   - Purpose: Apply repeat rule via bridge (JXA limitation)
   - Used: create-task.ts line 144, update-task.ts line 200, 633
   - **Status:** REQUIRED - JXA cannot set complex rules

5. **applyDeferAnother(task, rule)** - Lines 191-233
   - Purpose: Calculate defer date from due date
   - Used: create-task.ts line 152, update-task.ts line 210, 642
   - **Status:** REQUIRED

**Analysis:** All bridge functions are used - KEEP ALL

---

## Implementation Options

### Option A: Extract Only Used Helpers (RECOMMENDED)

**Approach:** Remove getUnifiedHelpers(), inline only the 4 used functions

**create-task.ts:**

```typescript
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

// Inline only used helpers (4 functions, ~80 lines)
const ESSENTIAL_HELPERS = `
  function safeGet(getter, defaultValue = null) {
    try {
      const result = getter();
      return result !== null && result !== undefined ? result : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  function safeGetProject(task) {
    try {
      const project = task.containingProject();
      if (project) {
        return {
          name: safeGet(() => project.name()),
          id: safeGet(() => project.id())
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };

    let foundProject = null;
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try { if (projects[i].id() === projectId) { foundProject = projects[i]; break; } } catch (e) {}
    }

    if (!foundProject) {
      return {
        valid: false,
        error: "Project with ID '" + projectId + "' not found"
      };
    }

    return { valid: true, project: foundProject };
  }

  function formatError(error, context = '') {
    const errorObj = {
      error: true,
      message: error.message || String(error),
      context: context
    };

    if (error.stack) {
      errorObj.stack = error.stack;
    }

    return JSON.stringify(errorObj);
  }
`;

export const CREATE_TASK_SCRIPT = `
  ${ESSENTIAL_HELPERS}          // ← 2.5KB (4 functions)
  ${getMinimalTagBridge()}      // ← 4.5KB
  ${REPEAT_HELPERS}             // ← 7.5KB
  // ... script logic
`;
```

**Pros:**

- Maximum reduction: 18KB → 2.5KB = 15.5KB saved per script
- Only includes what's actually used
- Self-contained - all helpers visible in one place
- No new files to maintain

**Cons:**

- Duplicates 4 functions between create-task and update-task
- If helper logic changes, must update 2 places
- Inlined code slightly harder to test in isolation

**Size:**

- Per script: 2.5KB + 4.5KB + 7.5KB = 14.5KB
- Total (2 scripts): 29KB
- **Savings from current:** 60KB → 29KB = 31KB (52% reduction)

### Option B: Create Essential Helpers Module

**Approach:** Create new file with only the 4 used helpers

**Create:** `src/omnifocus/scripts/shared/essential-helpers.ts`

```typescript
/**
 * Essential helper functions for create/update task scripts
 * Only the functions actually used - no dead code
 */

export const ESSENTIAL_HELPERS = `
  // Safe utility for property access
  function safeGet(getter, defaultValue = null) {
    try {
      const result = getter();
      return result !== null && result !== undefined ? result : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  // Safe project extraction
  function safeGetProject(task) {
    try {
      const project = task.containingProject();
      if (project) {
        return {
          name: safeGet(() => project.name()),
          id: safeGet(() => project.id())
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Project validation
  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };

    let foundProject = null;
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try {
        if (projects[i].id() === projectId) {
          foundProject = projects[i];
          break;
        }
      } catch (e) {}
    }

    if (!foundProject) {
      return {
        valid: false,
        error: "Project with ID '" + projectId + "' not found"
      };
    }

    return { valid: true, project: foundProject };
  }

  // Error formatting
  function formatError(error, context = '') {
    const errorObj = {
      error: true,
      message: error.message || String(error),
      context: context
    };

    if (error.stack) {
      errorObj.stack = error.stack;
    }

    return JSON.stringify(errorObj);
  }
`;

export function getEssentialHelpers(): string {
  return ESSENTIAL_HELPERS;
}
```

**Usage:**

```typescript
import { getEssentialHelpers } from '../shared/essential-helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

export const CREATE_TASK_SCRIPT = `
  ${getEssentialHelpers()}      // ← 2.5KB
  ${getMinimalTagBridge()}      // ← 4.5KB
  ${REPEAT_HELPERS}             // ← 7.5KB
  // ... script logic
`;
```

**Pros:**

- Centralized helper logic - change once, apply everywhere
- Clear module boundary - "essential helpers for task mutation"
- Easier to test in isolation
- Consistent with existing pattern (getMinimalTagBridge, REPEAT_HELPERS)

**Cons:**

- Creates new file to maintain
- One more import per script
- Slight indirection

**Size:**

- Per script: 2.5KB + 4.5KB + 7.5KB = 14.5KB
- Total (2 scripts): 29KB
- **Savings from current:** 60KB → 29KB = 31KB (52% reduction)

### Option C: Keep getUnifiedHelpers (Status Quo)

**Approach:** Do nothing

**Pros:**

- Zero work
- No risk of breaking tests
- Helpers already tested

**Cons:**

- Wastes 15.5KB per script on unused functions
- 12 unused functions embedded in every script
- Perpetuates "everything everywhere" anti-pattern

**Size:**

- Per script: 18KB + 4.5KB + 7.5KB = 30KB
- Total (2 scripts): 60KB
- **Savings:** 0KB

---

## Recommendation: Option A

**Rationale:**

1. **Maximum Size Reduction:** 52% reduction (31KB saved)

2. **Simplest Implementation:**
   - No new files to create
   - Just remove import + inline 4 functions
   - Self-contained and obvious

3. **Alignment with Phase 2B Goals:**
   - Remove unnecessary helper imports
   - Minimize script size
   - Keep only what's used

4. **Low Risk:**
   - Only 2 scripts affected
   - Easy to verify with tests
   - Can revert easily if issues

5. **Precedent Exists:**
   - update-task.ts already inlines \_\_formatBridgeScript (lines 45-57)
   - update-task.ts already inlines moveTaskViaBridge (lines 88-96)
   - This pattern is already used in the codebase

**Counter-argument for Option B:**

Option B would be better IF:

- More scripts needed these helpers (only 2 do)
- Helpers were complex and changed frequently (they're stable)
- Testing in isolation was critical (they're simple utility functions)

Since neither is true, **Option A's simplicity wins**.

---

## Essential Function Details

### 1. safeGet(getter, defaultValue)

**Lines:** ~10 lines **Purpose:** Safe property access with fallback **Used in:**

- update-task.ts: 4 times (lines 111, 416, 436, 555)

**Implementation:**

```javascript
function safeGet(getter, defaultValue = null) {
  try {
    const result = getter();
    return result !== null && result !== undefined ? result : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}
```

### 2. safeGetProject(task)

**Lines:** ~15 lines **Purpose:** Extract project info safely **Used in:**

- update-task.ts: 3 times (lines 274, 285, 465)

**Implementation:**

```javascript
function safeGetProject(task) {
  try {
    const project = task.containingProject();
    if (project) {
      return {
        name: safeGet(() => project.name()),
        id: safeGet(() => project.id()),
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}
```

### 3. validateProject(projectId, doc)

**Lines:** ~25 lines **Purpose:** Validate project exists by ID **Used in:**

- create-task.ts: 1 time (line 76)
- update-task.ts: 1 time (line 232)

**Implementation:**

```javascript
function validateProject(projectId, doc) {
  if (!projectId) return { valid: true, project: null };

  let foundProject = null;
  const projects = doc.flattenedProjects();
  for (let i = 0; i < projects.length; i++) {
    try {
      if (projects[i].id() === projectId) {
        foundProject = projects[i];
        break;
      }
    } catch (e) {}
  }

  if (!foundProject) {
    return {
      valid: false,
      error: "Project with ID '" + projectId + "' not found",
    };
  }

  return { valid: true, project: foundProject };
}
```

### 4. formatError(error, context)

**Lines:** ~15 lines **Purpose:** Format error messages as JSON **Used in:**

- create-task.ts: 1 time (line 238)
- update-task.ts: 2 times (lines 476, 714)

**Implementation:**

```javascript
function formatError(error, context = '') {
  const errorObj = {
    error: true,
    message: error.message || String(error),
    context: context,
  };

  if (error.stack) {
    errorObj.stack = error.stack;
  }

  return JSON.stringify(errorObj);
}
```

**Total:** ~65 lines, ~2KB

---

## Implementation Checklist

### Phase 1: Analysis (COMPLETE)

- [x] Identify all getUnifiedHelpers() functions
- [x] Grep create-task.ts for function usage
- [x] Grep update-task.ts for function usage
- [x] Confirm MINIMAL_TAG_BRIDGE covers all tag needs
- [x] Confirm REPEAT_HELPERS covers all repeat needs
- [x] Document findings

### Phase 2: Inline Essential Helpers (2 hours)

#### Step 1: Create helper constant

- [ ] Add ESSENTIAL_HELPERS constant to create-task.ts (after imports)
- [ ] Add ESSENTIAL_HELPERS constant to update-task.ts (after imports)
- [ ] Include 4 functions: safeGet, safeGetProject, validateProject, formatError

#### Step 2: Update create-task.ts

- [ ] Remove: `import { getUnifiedHelpers } from '../shared/helpers.js';`
- [ ] Remove: `${getUnifiedHelpers()}` from script template (line 13)
- [ ] Add: `${ESSENTIAL_HELPERS}` to script template (after line 15)
- [ ] Verify functions are used: validateProject (line 76), formatError (line 238)

#### Step 3: Update update-task.ts

- [ ] Remove: `import { getUnifiedHelpers } from '../shared/helpers.js';`
- [ ] Remove: `${getUnifiedHelpers()}` from UPDATE_TASK_SCRIPT (line 12)
- [ ] Add: `${ESSENTIAL_HELPERS}` to script template (after line 14)
- [ ] Remove: Duplicate `${getUnifiedHelpers()}` from createUpdateTaskScript (line 488)
- [ ] Add: `${ESSENTIAL_HELPERS}` to createUpdateTaskScript (after line 489)
- [ ] Verify functions are used:
  - safeGet: lines 111, 416, 436, 555
  - safeGetProject: lines 274, 285, 465
  - validateProject: line 232
  - formatError: lines 476, 714

#### Step 4: Build and verify

- [ ] Run: `npm run build`
- [ ] Check for TypeScript errors
- [ ] Check for undefined function errors

### Phase 3: Test (2 hours)

#### Integration Tests

- [ ] Run: `npm run test:integration`
- [ ] Verify: create-task tests pass
- [ ] Verify: update-task tests pass
- [ ] Check logs for any helper function errors

#### Manual Testing

- [ ] Test: Create task in inbox
- [ ] Test: Create task in project
- [ ] Test: Create task with tags
- [ ] Test: Create task with repeat rule
- [ ] Test: Update task name
- [ ] Test: Update task project
- [ ] Test: Update task tags
- [ ] Test: Update task repeat rule
- [ ] Test: Move task to inbox (projectId = null)
- [ ] Test: Error handling (invalid project ID)

### Phase 4: Measure Savings (30 min)

#### Before Measurements

- [ ] Measure: create-task.ts script size (current with getUnifiedHelpers)
- [ ] Measure: update-task.ts script size (current with getUnifiedHelpers)
- [ ] Total: Document current total size

#### After Measurements

- [ ] Measure: create-task.ts script size (with ESSENTIAL_HELPERS)
- [ ] Measure: update-task.ts script size (with ESSENTIAL_HELPERS)
- [ ] Total: Document new total size
- [ ] Calculate: Reduction in KB and percentage

#### Success Criteria

- [ ] Size reduction ≥ 25KB (target: 31KB)
- [ ] Percentage reduction ≥ 40% (target: 52%)

### Phase 5: Documentation (30 min)

- [ ] Update: CLAUDE.md with essential helpers pattern
- [ ] Update: docs/consolidation/phase-2b-results.md
- [ ] Document: Size savings achieved
- [ ] Add: Comments in scripts explaining pattern
- [ ] Commit: Changes with descriptive message

---

## Success Criteria

### Functional Requirements

- ✅ All task creation operations work
- ✅ All task update operations work
- ✅ Tag assignment works (via bridge)
- ✅ Repeat rule assignment works (via bridge)
- ✅ Project validation works
- ✅ Error formatting works
- ✅ All integration tests pass

### Performance Requirements

- ✅ Script size reduced by ≥ 25KB (target: 31KB)
- ✅ No performance degradation
- ✅ Build time unchanged

### Code Quality Requirements

- ✅ No dead code in scripts
- ✅ All functions actually used
- ✅ Clear and maintainable
- ✅ Well-documented

---

## Alternatives Considered

### Alternative 1: Extract to new module (Option B)

**Rejected because:** Only 2 scripts use these helpers, not worth the indirection

### Alternative 2: Keep getUnifiedHelpers (Option C)

**Rejected because:** Wastes 15.5KB per script on unused functions

### Alternative 3: Create even more granular modules

**Rejected because:** Over-engineering for 4 simple functions

---

## Next Steps

1. **Implement Option A** (inline essential helpers)
2. **Run full test suite** to verify no regressions
3. **Measure savings** to confirm 31KB reduction
4. **Document pattern** in CLAUDE.md
5. **Move to Phase 2C** (update remaining 28 scripts)

---

## Questions for Review

1. **Are there other scripts that use ONLY these 4 helpers?**
   - If yes, they should also inline them
   - If no, Option A is confirmed as best

2. **Should we keep getUnifiedHelpers() for other scripts?**
   - Yes - 28 other scripts may need different subsets
   - Phase 2C will analyze those separately

3. **Is 4-function duplication acceptable?**
   - Yes - they're stable utility functions
   - Cost of maintaining centralized module > cost of duplication

---

## Appendix: File Sizes

### Current State

- MINIMAL_TAG_BRIDGE: 144 lines, ~4.5KB
- REPEAT_HELPERS: 234 lines, ~7.5KB
- getUnifiedHelpers(): 281 lines, ~18KB (includes 12 unused functions)
- **Total per script:** 30KB

### Proposed State

- MINIMAL_TAG_BRIDGE: 144 lines, ~4.5KB
- REPEAT_HELPERS: 234 lines, ~7.5KB
- ESSENTIAL_HELPERS: ~65 lines, ~2KB (4 functions only)
- **Total per script:** 14KB

### Savings

- Per script: 16KB (53% reduction)
- Total (2 scripts): 32KB (53% reduction)

---

## References

- **Pattern Source:** `/docs/dev/PATTERN_INDEX.md` - Bridge helper patterns
- **Helper Source:** `src/omnifocus/scripts/shared/helpers.ts`
- **Tag Bridge:** `src/omnifocus/scripts/shared/minimal-tag-bridge.ts`
- **Repeat Helpers:** `src/omnifocus/scripts/shared/repeat-helpers.ts`
- **Target Scripts:**
  - `src/omnifocus/scripts/tasks/create-task.ts`
  - `src/omnifocus/scripts/tasks/update-task.ts`
