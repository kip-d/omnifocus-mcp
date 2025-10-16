# Codebase Consistency Audit & Cleanup Implementation Plan

## ✅ STATUS: COMPLETED - October 15, 2025

**Completion Details:**
- **PR**: #26 (merged to main)
- **Phase 2 Completed**: All Critical + Medium priority fixes applied
- **Results**: 0 lint errors, 563/563 unit tests passing, 24/24 integration tests passing
- **Documentation**: See `docs/audit/phase2-completion-summary.md` for full details

---

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Systematically audit and fix all pattern inconsistencies in the OmniFocus MCP codebase to ensure documented lessons and architecture guidelines are consistently applied.

**Architecture:** Deep audit followed by prioritized fixes, with automated scans + manual review to verify compliance with ARCHITECTURE.md, PATTERNS.md, and LESSONS_LEARNED.md.

**Tech Stack:** TypeScript, ts-prune, grep, existing test suite

---

## PHASE 1: DEEP AUDIT (Tasks 1-15)

### Task 1: Verify STANDARDIZATION_PLAN Status

**Files:**
- Read: `docs/STANDARDIZATION_PLAN.md`
- Read: `src/utils/error-codes.ts`
- Read: `src/tools/response-types-v2.ts`

**Step 1: Check foundation work completion**

Verify the checklist items marked complete:
```bash
# Check error codes file exists and has ErrorCode enum
grep -n "export enum ErrorCode" src/utils/error-codes.ts

# Check response types exist
grep -n "TaskOperationResponseV2\|TagsResponseV2\|PatternAnalysisResponseV2" src/tools/response-types-v2.ts
```

**Step 2: Check high priority tool updates**

```bash
# Check if ManageTaskTool uses TaskOperationResponseV2
grep -n "Promise<TaskOperationResponseV2>" src/tools/tasks/ManageTaskTool.ts

# Check if TagsToolV2 uses proper response types
grep -n "Promise<TagsResponseV2\|TagOperationResponseV2>" src/tools/tags/TagsToolV2.ts

# Check if PatternAnalysisToolV2 uses proper response type
grep -n "Promise<PatternAnalysisResponseV2>" src/tools/analytics/PatternAnalysisToolV2.ts
```

**Step 3: Document findings in audit report**

Create: `docs/audit/2025-10-13-consistency-audit.md`

```markdown
# Consistency Audit Report - 2025-10-13

## STANDARDIZATION_PLAN Status

### ✅ Completed
- [ ] Error codes enum (verify details)
- [ ] Response type definitions (verify details)

### ❌ Incomplete
- [ ] Tool return types (list specific tools)
- [ ] Error handling patterns (list specific tools)
- [ ] Script execution patterns (list specific tools)
```

**Step 4: Commit audit report skeleton**

```bash
git add docs/audit/2025-10-13-consistency-audit.md
git commit -m "docs: create consistency audit report skeleton"
```

---

### Task 2: Run ts-prune for Unused Exports

**Files:**
- Command output will be analyzed

**Step 1: Run ts-prune scan**

```bash
npx ts-prune --skip external > docs/audit/unused-exports-raw.txt 2>&1
```

**Step 2: Count unused exports**

```bash
wc -l docs/audit/unused-exports-raw.txt
```

**Step 3: Categorize by directory**

```bash
# Group by directory
awk '{print $1}' docs/audit/unused-exports-raw.txt | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn > docs/audit/unused-exports-by-dir.txt
```

**Step 4: Add to audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## Unused Exports

**Total Count:** [number from wc -l]

**By Directory:**
[paste contents of unused-exports-by-dir.txt]

**Raw Output:** See `docs/audit/unused-exports-raw.txt`
```

**Step 5: Commit unused exports scan**

```bash
git add docs/audit/unused-exports-*.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: scan for unused exports with ts-prune"
```

---

### Task 3: Scan for Deprecated Helper Usage

**Files:**
- All TypeScript files in `src/`

**Step 1: Find getAllHelpers() usage**

```bash
grep -rn "getAllHelpers()" src/ --include="*.ts" > docs/audit/deprecated-getAllHelpers.txt
wc -l docs/audit/deprecated-getAllHelpers.txt
```

**Step 2: Find getCoreHelpers() usage**

```bash
grep -rn "getCoreHelpers()" src/ --include="*.ts" > docs/audit/deprecated-getCoreHelpers.txt
wc -l docs/audit/deprecated-getCoreHelpers.txt
```

**Step 3: Find getMinimalHelpers() usage**

```bash
grep -rn "getMinimalHelpers()" src/ --include="*.ts" > docs/audit/deprecated-getMinimalHelpers.txt
wc -l docs/audit/deprecated-getMinimalHelpers.txt
```

**Step 4: Check for getUnifiedHelpers() usage (correct)**

```bash
grep -rn "getUnifiedHelpers()" src/ --include="*.ts" | wc -l
```

**Step 5: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## Deprecated Helper Functions

Per ARCHITECTURE.md (lines 132-136), getUnifiedHelpers() is the only correct helper.

**Deprecated Usage Found:**
- getAllHelpers(): [count] files
- getCoreHelpers(): [count] files
- getMinimalHelpers(): [count] files

**Correct Usage:**
- getUnifiedHelpers(): [count] files

**Files to Fix:** See docs/audit/deprecated-*.txt
```

**Step 6: Commit helper usage scan**

```bash
git add docs/audit/deprecated-*.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: scan for deprecated helper function usage"
```

---

### Task 4: Scan for whose() Method Violations

**Files:**
- All script files in `src/omnifocus/scripts/`

**Step 1: Search for whose() usage**

```bash
grep -rn "\.whose(" src/omnifocus/scripts/ --include="*.ts" > docs/audit/whose-violations.txt
```

**Step 2: Search for where() usage**

```bash
grep -rn "\.where(" src/omnifocus/scripts/ --include="*.ts" >> docs/audit/whose-violations.txt
```

**Step 3: Count violations**

```bash
wc -l docs/audit/whose-violations.txt
```

**Step 4: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## JXA Performance Violations

Per LESSONS_LEARNED.md (line 147-159), whose() and where() methods cause 25+ second timeouts.

**Violations Found:** [count from wc -l]

**Files with Violations:** See docs/audit/whose-violations.txt

**Priority:** 🔴 CRITICAL - Must fix immediately
```

**Step 5: Commit whose() violations scan**

```bash
git add docs/audit/whose-violations.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: scan for whose() and where() method violations"
```

---

### Task 5: Audit Error Handling Patterns

**Files:**
- All tool files in `src/tools/`

**Step 1: Find tools using ErrorCode enum (correct)**

```bash
grep -l "import.*ErrorCode.*from.*error-codes" src/tools/**/*.ts > docs/audit/tools-with-errorcode.txt
wc -l docs/audit/tools-with-errorcode.txt
```

**Step 2: Find tools throwing errors (incorrect)**

```bash
grep -rn "throw new Error\|throw error" src/tools/ --include="*Tool*.ts" > docs/audit/tools-throwing-errors.txt
wc -l docs/audit/tools-throwing-errors.txt
```

**Step 3: Find tools missing specific error checks**

```bash
# Tools that should check for "not running" but might not
grep -L "not running.*find process" src/tools/**/*Tool*.ts > docs/audit/tools-missing-error-checks.txt
```

**Step 4: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## Error Handling Patterns

Per STANDARDIZATION_PLAN.md Priority 2, tools should:
1. Use ErrorCode enum
2. Check for specific errors (OMNIFOCUS_NOT_RUNNING, PERMISSION_DENIED, SCRIPT_TIMEOUT)
3. Return error responses, not throw

**Tools Using ErrorCode:** [count] / [total tools]
**Tools Throwing Errors:** [count] (see docs/audit/tools-throwing-errors.txt)
**Tools Missing Error Checks:** [count] (see docs/audit/tools-missing-error-checks.txt)
```

**Step 5: Commit error handling audit**

```bash
git add docs/audit/tools-*.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: analyze error handling patterns across tools"
```

---

### Task 6: Audit Script Execution Methods

**Files:**
- All tool files

**Step 1: Find execJson() usage (recommended)**

```bash
grep -rn "this.execJson(" src/tools/ --include="*.ts" | wc -l
```

**Step 2: Find omniAutomation.executeJson() usage**

```bash
grep -rn "omniAutomation.executeJson(" src/tools/ --include="*.ts" > docs/audit/script-exec-executeJson.txt
wc -l docs/audit/script-exec-executeJson.txt
```

**Step 3: Find omniAutomation.executeTyped() usage**

```bash
grep -rn "omniAutomation.executeTyped(" src/tools/ --include="*.ts" > docs/audit/script-exec-executeTyped.txt
wc -l docs/audit/script-exec-executeTyped.txt
```

**Step 4: Find omniAutomation.execute() usage**

```bash
grep -rn "omniAutomation.execute(" src/tools/ --include="*.ts" > docs/audit/script-exec-execute.txt
wc -l docs/audit/script-exec-execute.txt
```

**Step 5: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## Script Execution Methods

Per STANDARDIZATION_PLAN.md Priority 3, tools should use execJson() method.

**Pattern Usage:**
- execJson() (recommended): [count] uses
- omniAutomation.executeJson(): [count] uses (see docs/audit/script-exec-executeJson.txt)
- omniAutomation.executeTyped(): [count] uses (see docs/audit/script-exec-executeTyped.txt)
- omniAutomation.execute(): [count] uses (see docs/audit/script-exec-execute.txt)

**Files to Standardize:** [count] total non-standard uses
```

**Step 6: Commit script execution audit**

```bash
git add docs/audit/script-exec-*.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: analyze script execution method usage"
```

---

### Task 7: Audit MCP Lifecycle Compliance

**Files:**
- `src/index.ts`
- Any files spawning processes

**Step 1: Verify stdin handlers in src/index.ts**

```bash
grep -n "process.stdin.on.*end\|process.stdin.on.*close" src/index.ts
```

Expected: Should find handlers for both 'end' and 'close' events.

**Step 2: Verify pending operations tracking**

```bash
grep -n "pendingOperations\|setPendingOperationsTracker" src/index.ts
```

Expected: Should find Set<Promise> tracking and gracefulExit function.

**Step 3: Check OmniAutomation.ts for async tracking**

```bash
grep -n "globalPendingOperations\|pendingOperations.add\|pendingOperations.delete" src/omnifocus/OmniAutomation.ts
```

**Step 4: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## MCP Lifecycle Compliance

Per LESSONS_LEARNED.md lines 520-590, MCP servers must:
1. Handle stdin closure (end/close events)
2. Track pending async operations
3. Wait for operations before exit

**src/index.ts:**
- [ ] stdin 'end' handler: [found/missing]
- [ ] stdin 'close' handler: [found/missing]
- [ ] pendingOperations tracking: [found/missing]
- [ ] gracefulExit function: [found/missing]

**src/omnifocus/OmniAutomation.ts:**
- [ ] globalPendingOperations: [found/missing]
- [ ] Operation tracking in execute: [found/missing]
```

**Step 5: Commit MCP lifecycle audit**

```bash
git add docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: verify MCP lifecycle compliance patterns"
```

---

### Task 8: Review All V2 Tool Files (Batch 1)

**Files:**
- Read: `src/tools/tasks/QueryTasksToolV2.ts`
- Read: `src/tools/tasks/ManageTaskTool.ts`
- Read: `src/tools/projects/ProjectsToolV2.ts`
- Read: `src/tools/tags/TagsToolV2.ts`

**Step 1: For each file, check:**

Create checklist in `docs/audit/tool-review-batch1.md`:
```markdown
# Tool Review Batch 1

## QueryTasksToolV2.ts
- [ ] Return type specific (not unknown)
- [ ] Uses ErrorCode enum
- [ ] Uses execJson() for script execution
- [ ] Has explicit constructor
- [ ] Cache keys consistent
- [ ] Error handling follows standard pattern

## ManageTaskTool.ts
- [ ] Return type specific (not unknown)
- [ ] Uses ErrorCode enum
- [ ] Uses execJson() for script execution
- [ ] Has explicit constructor
- [ ] Cache keys consistent
- [ ] Error handling follows standard pattern

## ProjectsToolV2.ts
- [ ] Return type specific (not unknown)
- [ ] Uses ErrorCode enum
- [ ] Uses execJson() for script execution
- [ ] Has explicit constructor
- [ ] Cache keys consistent
- [ ] Error handling follows standard pattern

## TagsToolV2.ts
- [ ] Return type specific (not unknown)
- [ ] Uses ErrorCode enum
- [ ] Uses execJson() for script execution
- [ ] Has explicit constructor
- [ ] Cache keys consistent
- [ ] Error handling follows standard pattern
```

**Step 2: Actually read files and check each item**

For each tool, grep for patterns:
```bash
# Return type
grep -n "async executeValidated.*Promise<" src/tools/tasks/QueryTasksToolV2.ts

# ErrorCode usage
grep -n "import.*ErrorCode" src/tools/tasks/QueryTasksToolV2.ts

# execJson usage
grep -n "this.execJson\|omniAutomation.execute" src/tools/tasks/QueryTasksToolV2.ts

# Constructor
grep -n "constructor(cache" src/tools/tasks/QueryTasksToolV2.ts
```

**Step 3: Mark checklist items**

Update the checklist with ✅ or ❌ for each item.

**Step 4: Commit tool review batch 1**

```bash
git add docs/audit/tool-review-batch1.md
git commit -m "audit: review batch 1 tools (tasks, projects, tags)"
```

---

### Task 9: Review All V2 Tool Files (Batch 2)

**Files:**
- Read: `src/tools/folders/FoldersTool.ts`
- Read: `src/tools/perspectives/PerspectivesToolV2.ts`
- Read: `src/tools/export/ExportTool.ts`
- Read: `src/tools/recurring/RecurringTasksTool.ts`

**Step 1-4: Same process as Task 8**

Create `docs/audit/tool-review-batch2.md` and follow same verification pattern.

---

### Task 10: Review All V2 Tool Files (Batch 3)

**Files:**
- Read: `src/tools/batch/BatchCreateTool.ts`
- Read: `src/tools/system/SystemToolV2.ts`
- Read: `src/tools/reviews/ManageReviewsTool.ts`
- Read: `src/tools/analytics/WorkflowAnalysisTool.ts`
- Read: `src/tools/analytics/PatternAnalysisToolV2.ts`
- Read: `src/tools/capture/ParseMeetingNotesTool.ts`

**Step 1-4: Same process as Task 8**

Create `docs/audit/tool-review-batch3.md` and follow same verification pattern.

---

### Task 11: Review Script Files (Sample)

**Files:**
- Read: `src/omnifocus/scripts/shared/helpers.ts`
- Read: `src/omnifocus/scripts/tasks/list-tasks.ts`
- Read: `src/omnifocus/scripts/projects/list-projects.ts`
- Read: `src/omnifocus/scripts/tags/list-tags.ts`
- Read: `src/omnifocus/scripts/tasks/create-task.ts`

**Step 1: Check each script for:**

Create `docs/audit/script-review.md`:
```markdown
# Script File Review

## helpers.ts
- [ ] Contains getUnifiedHelpers() function
- [ ] No deprecated helper functions exported
- [ ] No whose() or where() method usage
- [ ] Follows ARCHITECTURE.md patterns

## list-tasks.ts
- [ ] Uses getUnifiedHelpers()
- [ ] No whose() or where() methods
- [ ] Proper error handling with JSON.stringify({success: false, error: ...})
- [ ] Returns structured result

## list-projects.ts
- [ ] Uses getUnifiedHelpers()
- [ ] No whose() or where() methods
- [ ] Proper error handling
- [ ] Returns structured result

## list-tags.ts
- [ ] Uses getUnifiedHelpers()
- [ ] No whose() or where() methods
- [ ] Proper error handling
- [ ] Returns structured result

## create-task.ts
- [ ] Uses getUnifiedHelpers()
- [ ] Uses bridge for tag assignment (if needed)
- [ ] Proper error handling
- [ ] Returns structured result with task ID
```

**Step 2: Actually verify each script**

```bash
# Check helper usage
grep -n "getUnifiedHelpers\|getAllHelpers\|getCoreHelpers\|getMinimalHelpers" src/omnifocus/scripts/tasks/list-tasks.ts

# Check for whose/where
grep -n "\.whose(\|\.where(" src/omnifocus/scripts/tasks/list-tasks.ts

# Check error handling pattern
grep -n "JSON.stringify({success: false" src/omnifocus/scripts/tasks/list-tasks.ts
```

**Step 3: Commit script review**

```bash
git add docs/audit/script-review.md
git commit -m "audit: review sample script files for compliance"
```

---

### Task 12: Check Type Safety Issues

**Files:**
- All tool files

**Step 1: Find unknown return types**

```bash
grep -rn "Promise<unknown>" src/tools/ --include="*Tool*.ts" > docs/audit/unknown-return-types.txt
wc -l docs/audit/unknown-return-types.txt
```

**Step 2: Find unnecessary type casts**

```bash
grep -rn "as unknown as" src/tools/ --include="*.ts" > docs/audit/unnecessary-casts.txt
wc -l docs/audit/unnecessary-casts.txt
```

**Step 3: Find any type usage**

```bash
grep -rn ": any\|<any>" src/tools/ --include="*.ts" | grep -v "any\[\]" > docs/audit/any-types.txt
wc -l docs/audit/any-types.txt
```

**Step 4: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## Type Safety Issues

**Unknown Return Types:** [count] (see docs/audit/unknown-return-types.txt)
**Unnecessary Casts:** [count] (see docs/audit/unnecessary-casts.txt)
**Any Types:** [count] (see docs/audit/any-types.txt)

**Priority:** 🟡 MEDIUM - Reduces type safety
```

**Step 5: Commit type safety audit**

```bash
git add docs/audit/*types*.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: scan for type safety issues"
```

---

### Task 13: Audit Cache Patterns

**Files:**
- All tool files

**Step 1: Extract all cache key generation patterns**

```bash
grep -rn "cache.get\|cache.set" src/tools/ --include="*.ts" -A 1 > docs/audit/cache-usage-raw.txt
```

**Step 2: Find string concatenation patterns**

```bash
grep -n "cacheKey.*=.*\`\|cacheKey.*=.*+" src/tools/**/*.ts > docs/audit/cache-key-patterns.txt
```

**Step 3: Find JSON.stringify cache keys**

```bash
grep -n "JSON.stringify.*cacheKey\|cacheKey.*JSON.stringify" src/tools/**/*.ts >> docs/audit/cache-key-patterns.txt
```

**Step 4: Update audit report**

Append to `docs/audit/2025-10-13-consistency-audit.md`:
```markdown
## Cache Key Generation Patterns

**Total cache operations:** [count from cache-usage-raw.txt]
**Cache key generation patterns:** [count from cache-key-patterns.txt]

**Recommendation:** Create utility function for consistent cache key generation

See docs/audit/cache-*.txt for details
```

**Step 5: Commit cache patterns audit**

```bash
git add docs/audit/cache-*.txt docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: analyze cache key generation patterns"
```

---

### Task 14: Consolidate Audit Findings

**Files:**
- Modify: `docs/audit/2025-10-13-consistency-audit.md`

**Step 1: Add priority summary section at top**

```markdown
# Consistency Audit Report - 2025-10-13

## Executive Summary

**Audit Scope:** Deep audit of all tools, scripts, and infrastructure for compliance with ARCHITECTURE.md, PATTERNS.md, and LESSONS_LEARNED.md.

**Critical Issues (Must Fix):** [count]
**Medium Issues (Should Fix):** [count]
**Low Priority (Nice to Have):** [count]

## Priority Breakdown

### 🔴 Critical (Must Fix Immediately)
1. whose()/where() violations: [count] files
2. Deprecated helper functions: [count] files
3. Missing ErrorCode enum: [count] tools
4. Tools throwing errors: [count] tools
5. [other critical issues]

### 🟡 Medium (Should Fix)
1. Unknown return types: [count] tools
2. Inconsistent script execution: [count] tools
3. Inconsistent cache patterns: [count] tools
4. [other medium issues]

### 🟢 Low Priority (Nice to Have)
1. Unused exports: [count] exports
2. Missing constructors: [count] tools
3. [other low priority issues]

---

[Rest of detailed sections follow...]
```

**Step 2: Calculate totals for summary**

Review all section counts and summarize.

**Step 3: Commit consolidated audit report**

```bash
git add docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: consolidate findings with priority breakdown"
```

---

### Task 15: Review Audit Report and Create Fix Plan

**Files:**
- Read: `docs/audit/2025-10-13-consistency-audit.md`
- Read: `docs/STANDARDIZATION_PLAN.md`

**Step 1: Compare audit findings to STANDARDIZATION_PLAN**

Identify:
- Items in STANDARDIZATION_PLAN that are actually complete
- Items in STANDARDIZATION_PLAN that need updates
- New issues found in audit not in STANDARDIZATION_PLAN

**Step 2: Create prioritized fix categories**

Document in audit report under "Implementation Plan" section:
```markdown
## Implementation Plan

### Phase 2: Critical Fixes (6-8 hours)

**Category 1: JXA Performance Violations** (2 hours)
- Fix whose()/where() method usage
- Files: [list from whose-violations.txt]

**Category 2: Helper Function Standardization** (2 hours)
- Replace deprecated helpers with getUnifiedHelpers()
- Files: [list from deprecated-*.txt]

**Category 3: Error Handling** (2-3 hours)
- Add ErrorCode enum imports
- Replace throw with error responses
- Add specific error checks
- Files: [list from tools-throwing-errors.txt]

**Category 4: Script Execution** (1-2 hours)
- Standardize to execJson()
- Files: [list from script-exec-*.txt]

### Phase 3: Medium Priority Fixes (4-6 hours)

**Category 5: Type Safety** (2-3 hours)
- Replace unknown return types
- Remove unnecessary casts
- Files: [list from unknown-return-types.txt]

**Category 6: Unused Exports** (1-2 hours)
- Manual review + removal
- Files: [list from unused-exports-raw.txt]

**Category 7: Cache Patterns** (1 hour)
- Create utility function
- Update all cache key generation

### Phase 4: Verification (1-2 hours)
- Run full test suite
- Run ci:local
- Update documentation
```

**Step 3: Commit implementation plan**

```bash
git add docs/audit/2025-10-13-consistency-audit.md
git commit -m "audit: add implementation plan based on findings"
```

---

## PHASE 2: CRITICAL FIXES (Tasks 16-35)

### Task 16: Fix whose() Violations - Preparation

**Files:**
- Read: `docs/audit/whose-violations.txt`

**Step 1: Review each violation**

For each line in whose-violations.txt, note:
- File path
- Line number
- Context (what query is being performed)

**Step 2: Create fix checklist**

```bash
cat docs/audit/whose-violations.txt | cut -d: -f1 | sort -u > docs/audit/whose-files-to-fix.txt
```

**Step 3: For first file, plan the fix**

Read the file and understand the whose() usage.

Common pattern:
```javascript
// ❌ BEFORE
const tasks = doc.flattenedTasks.whose({completed: false})();

// ✅ AFTER
const allTasks = doc.flattenedTasks();
const tasks = [];
for (let i = 0; i < allTasks.length; i++) {
  try {
    if (!allTasks[i].completed()) tasks.push(allTasks[i]);
  } catch (e) { /* skip */ }
}
```

**Step 4: No commit yet - preparation only**

We'll fix and commit in next task.

---

### Task 17: Fix whose() Violations - Execute Fixes

**Files:**
- Modify: All files from `docs/audit/whose-files-to-fix.txt`

**Step 1: Fix first file**

Replace whose() with manual iteration following LESSONS_LEARNED.md pattern.

**Step 2: Test the fix**

```bash
npm run build
npm run test:quick
```

Expected: Build succeeds, tests pass.

**Step 3: Commit first file**

```bash
git add [first-file-path]
git commit -m "fix: replace whose() with manual iteration in [filename]

Per LESSONS_LEARNED.md line 147-159, whose() causes 25+ second timeouts.
Replaced with direct iteration for 250x performance improvement.
"
```

**Step 4: Repeat for remaining files**

Fix one file at a time, test, commit.

**Step 5: Verify all whose() violations fixed**

```bash
grep -rn "\.whose(\|\.where(" src/omnifocus/scripts/ --include="*.ts"
```

Expected: No results (or only results in comments/tests).

---

### Task 18: Replace Deprecated Helpers - getAllHelpers

**Files:**
- Modify: All files from `docs/audit/deprecated-getAllHelpers.txt`

**Step 1: Fix first file using getAllHelpers()**

Replace:
```typescript
// ❌ BEFORE
import { getAllHelpers } from '../shared/helpers.js';
const script = `${getAllHelpers()} ...`;

// ✅ AFTER
import { getUnifiedHelpers } from '../shared/helpers.js';
const script = `${getUnifiedHelpers()} ...`;
```

**Step 2: Build and test**

```bash
npm run build
npm run test:quick
```

**Step 3: Commit**

```bash
git add [file-path]
git commit -m "fix: replace deprecated getAllHelpers with getUnifiedHelpers

Per ARCHITECTURE.md line 132-136, getUnifiedHelpers is the unified approach.
"
```

**Step 4: Repeat for all getAllHelpers() files**

---

### Task 19: Replace Deprecated Helpers - getCoreHelpers

**Files:**
- Modify: All files from `docs/audit/deprecated-getCoreHelpers.txt`

**Step 1-4: Same as Task 18, but for getCoreHelpers()**

---

### Task 20: Replace Deprecated Helpers - getMinimalHelpers

**Files:**
- Modify: All files from `docs/audit/deprecated-getMinimalHelpers.txt`

**Step 1-4: Same as Task 18, but for getMinimalHelpers()**

---

### Task 21: Add ErrorCode Enum to ManageTaskTool

**Files:**
- Modify: `src/tools/tasks/ManageTaskTool.ts`

**Step 1: Add import at top of file**

```typescript
import { ErrorCode } from '../../utils/error-codes.js';
```

**Step 2: Find all error response calls**

Search for `createErrorResponseV2` calls that use string error codes.

**Step 3: Replace first occurrence**

```typescript
// ❌ BEFORE
return createErrorResponseV2(
  this.name,
  'VALIDATION_ERROR',
  'Missing required field',
  ...
);

// ✅ AFTER
return createErrorResponseV2(
  this.name,
  ErrorCode.VALIDATION_ERROR,
  'Missing required field',
  ...
);
```

**Step 4: Build and test**

```bash
npm run build
npm run typecheck
npm run test:quick
```

**Step 5: Commit**

```bash
git add src/tools/tasks/ManageTaskTool.ts
git commit -m "fix: use ErrorCode enum in ManageTaskTool error handling"
```

**Step 6: Repeat for all error responses in file**

---

### Task 22: Add ErrorCode Enum to TagsToolV2

**Files:**
- Modify: `src/tools/tags/TagsToolV2.ts`

**Step 1-6: Same as Task 21, but for TagsToolV2**

---

### Task 23: Add ErrorCode Enum to PatternAnalysisToolV2

**Files:**
- Modify: `src/tools/analytics/PatternAnalysisToolV2.ts`

**Step 1-6: Same as Task 21, but for PatternAnalysisToolV2**

---

### Task 24: Fix PatternAnalysisToolV2 Throwing Errors

**Files:**
- Modify: `src/tools/analytics/PatternAnalysisToolV2.ts`

**Step 1: Find throw statements**

```bash
grep -n "throw" src/tools/analytics/PatternAnalysisToolV2.ts
```

**Step 2: Replace first throw with error response**

```typescript
// ❌ BEFORE
throw new Error('Pattern analysis failed: ' + error.message);

// ✅ AFTER
return createErrorResponseV2(
  this.name,
  ErrorCode.EXECUTION_ERROR,
  'Pattern analysis failed: ' + error.message,
  undefined,
  error,
  timer.toMetadata()
);
```

**Step 3: Build and test**

```bash
npm run build
npm run test:quick
```

**Step 4: Commit**

```bash
git add src/tools/analytics/PatternAnalysisToolV2.ts
git commit -m "fix: return error responses instead of throwing in PatternAnalysisToolV2"
```

**Step 5: Repeat for all throw statements**

---

### Task 25: Add Standard Error Pattern to TagsToolV2

**Files:**
- Modify: `src/tools/tags/TagsToolV2.ts`

**Step 1: Find executeValidated method**

**Step 2: Add specific error checks before generic catch**

Insert after `catch (error) {` and before current error handling:

```typescript
const errorMessage = error instanceof Error ? error.message : String(error);

// Check for OmniFocus not running
if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
  return createErrorResponseV2(
    this.name,
    ErrorCode.OMNIFOCUS_NOT_RUNNING,
    'OmniFocus is not running or not accessible',
    'Start OmniFocus and ensure it is running',
    error,
    timer.toMetadata()
  );
}

// Check for permission errors
if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
  return createErrorResponseV2(
    this.name,
    ErrorCode.PERMISSION_DENIED,
    'Permission denied: automation access required',
    'Enable automation access in System Settings > Privacy & Security > Automation',
    error,
    timer.toMetadata()
  );
}

// Check for timeout errors
if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
  return createErrorResponseV2(
    this.name,
    ErrorCode.SCRIPT_TIMEOUT,
    'Script execution timed out',
    'Try reducing parameters',
    error,
    timer.toMetadata()
  );
}
```

**Step 3: Build and test**

```bash
npm run build
npm run test:quick
```

**Step 4: Commit**

```bash
git add src/tools/tags/TagsToolV2.ts
git commit -m "fix: add specific error checks to TagsToolV2 error handling"
```

---

### Task 26: Standardize Script Execution in PatternAnalysisToolV2

**Files:**
- Modify: `src/tools/analytics/PatternAnalysisToolV2.ts`

**Step 1: Find omniAutomation.execute() calls**

```bash
grep -n "omniAutomation.execute(" src/tools/analytics/PatternAnalysisToolV2.ts
```

**Step 2: Replace with execJson()**

```typescript
// ❌ BEFORE
const result = await this.omniAutomation.execute(script);

// ✅ AFTER
const result = await this.execJson(script);

if (isScriptError(result)) {
  return createErrorResponseV2(
    this.name,
    ErrorCode.SCRIPT_ERROR,
    result.error,
    'Check error details',
    result.details,
    timer.toMetadata()
  );
}

if (isScriptSuccess(result)) {
  const data = result.data as ExpectedType;
  // ... continue processing
}
```

**Step 3: Build and test**

```bash
npm run build
npm run test:quick
```

**Step 4: Commit**

```bash
git add src/tools/analytics/PatternAnalysisToolV2.ts
git commit -m "fix: standardize script execution to execJson() in PatternAnalysisToolV2"
```

---

### Task 27: Fix Return Types - ManageTaskTool

**Files:**
- Modify: `src/tools/tasks/ManageTaskTool.ts`

**Step 1: Add import for TaskOperationResponseV2**

```typescript
import type { TaskOperationResponseV2 } from '../response-types-v2.js';
```

**Step 2: Update class declaration**

```typescript
// ❌ BEFORE
export class ManageTaskTool extends BaseTool<typeof ManageTaskSchema>

// ✅ AFTER
export class ManageTaskTool extends BaseTool<
  typeof ManageTaskSchema,
  TaskOperationResponseV2
>
```

**Step 3: Update executeValidated signature**

```typescript
// ❌ BEFORE
async executeValidated(args: ManageTaskInput): Promise<unknown> {

// ✅ AFTER
async executeValidated(args: ManageTaskInput): Promise<TaskOperationResponseV2> {
```

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: Should compile without errors. If there are errors, the return statements need to match TaskOperationResponseV2.

**Step 5: Commit**

```bash
git add src/tools/tasks/ManageTaskTool.ts
git commit -m "fix: add specific return type TaskOperationResponseV2 to ManageTaskTool"
```

---

### Task 28: Fix Return Types - TagsToolV2

**Files:**
- Modify: `src/tools/tags/TagsToolV2.ts`

**Step 1: Add imports**

```typescript
import type { TagsResponseV2, TagOperationResponseV2 } from '../response-types-v2.js';
```

**Step 2: Update executeValidated signature**

```typescript
// ❌ BEFORE
async executeValidated(args: TagsToolInput): Promise<StandardResponseV2<unknown>>

// ✅ AFTER
async executeValidated(args: TagsToolInput): Promise<TagsResponseV2 | TagOperationResponseV2>
```

**Step 3: Run typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add src/tools/tags/TagsToolV2.ts
git commit -m "fix: add specific return types to TagsToolV2"
```

---

### Task 29: Fix Return Types - PatternAnalysisToolV2

**Files:**
- Modify: `src/tools/analytics/PatternAnalysisToolV2.ts`

**Step 1-4: Same as previous return type tasks, using PatternAnalysisResponseV2**

---

### Task 30: Run Full Test Suite After Critical Fixes

**Files:**
- None (testing only)

**Step 1: Build project**

```bash
npm run build
```

Expected: No build errors.

**Step 2: Run type checking**

```bash
npm run typecheck
```

Expected: No type errors.

**Step 3: Run linting**

```bash
npm run lint
```

Expected: Error count ≤ 50 (acceptable per STANDARDIZATION_PLAN).

**Step 4: Run unit tests**

```bash
npm run test:quick
```

Expected: All tests pass.

**Step 5: Run integration tests**

```bash
npm run test:integration
```

Expected: All tests pass.

**Step 6: Document results**

Create `docs/audit/test-results-after-critical-fixes.txt`:
```
Build: [PASS/FAIL]
Typecheck: [PASS/FAIL - # errors]
Lint: [PASS/FAIL - # errors]
Unit Tests: [PASS/FAIL - X/Y passing]
Integration Tests: [PASS/FAIL - X/Y passing]
```

**Step 7: Commit test results**

```bash
git add docs/audit/test-results-after-critical-fixes.txt
git commit -m "test: document results after critical fixes"
```

---

### Task 31-35: Continue Critical Fixes

[Similar detailed tasks for remaining critical fixes based on audit findings]

---

## PHASE 3: MEDIUM PRIORITY FIXES (Tasks 36-50)

### Task 36: Review Unused Exports - Manual Categorization

**Files:**
- Read: `docs/audit/unused-exports-raw.txt`

**Step 1: Create categorization file**

Create `docs/audit/unused-exports-categorized.md`:
```markdown
# Unused Exports - Manual Review

## ✅ Safe to Remove (Not Public API)

## ⚠️ Review Needed (May Be Public API)

## ❌ Keep (Intentionally Exported)
```

**Step 2: For each unused export, categorize**

Consider:
- Is it part of the public API? (types, interfaces exported for users)
- Is it used in tests?
- Is it a type that should be exported for consumers?

**Step 3: Start with clearly safe removals**

Move obvious internal-only exports to "Safe to Remove" section.

**Step 4: Flag ambiguous cases**

Move to "Review Needed" section with notes.

**Step 5: Commit categorization**

```bash
git add docs/audit/unused-exports-categorized.md
git commit -m "audit: categorize unused exports for removal"
```

---

### Task 37-45: Remove Unused Exports, Add Constructors, Fix Cache Patterns

[Similar detailed tasks for medium priority fixes]

---

## PHASE 4: VERIFICATION & DOCUMENTATION (Tasks 46-50)

### Task 46: Run CI:Local

**Files:**
- None (testing only)

**Step 1: Run full CI pipeline**

```bash
npm run ci:local
```

Expected: All checks pass.

**Step 2: Document results**

Create `docs/audit/final-ci-results.txt`

**Step 3: If failures, document and create follow-up tasks**

**Step 4: Commit results**

```bash
git add docs/audit/final-ci-results.txt
git commit -m "test: document final CI results after all fixes"
```

---

### Task 47: Update STANDARDIZATION_PLAN with Completion Status

**Files:**
- Modify: `docs/STANDARDIZATION_PLAN.md`

**Step 1: Update checkboxes based on completed work**

Mark completed items with [x].

**Step 2: Add completion date**

Update status section:
```markdown
**Status**: COMPLETED - 2025-10-13
```

**Step 3: Add summary of work**

```markdown
## Completion Summary

**Date:** October 13, 2025
**Work Completed:**
- All high priority items (return types, error handling, script execution)
- Medium priority items (constructors, cache patterns, unused exports)
- Full audit documented in docs/audit/2025-10-13-consistency-audit.md

**Results:**
- Build: ✅ Passing
- Typecheck: ✅ Passing
- Lint: ✅ [X] errors (acceptable)
- Unit Tests: ✅ 563/563 passing
- Integration Tests: ✅ 24/24 passing
```

**Step 4: Commit**

```bash
git add docs/STANDARDIZATION_PLAN.md
git commit -m "docs: mark STANDARDIZATION_PLAN as completed"
```

---

### Task 48: Update ARCHITECTURE.md If Needed

**Files:**
- Review: `docs/ARCHITECTURE.md`
- Modify if needed

**Step 1: Review for accuracy**

Check that all documented patterns match current code.

**Step 2: Add any new patterns discovered**

If audit revealed patterns not documented, add them.

**Step 3: Update helper function section**

Ensure getUnifiedHelpers() is documented as the standard approach.

**Step 4: Commit if changes made**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: update ARCHITECTURE.md based on audit findings"
```

---

### Task 49: Create Audit Summary Document

**Files:**
- Create: `docs/audit/SUMMARY.md`

**Step 1: Write executive summary**

```markdown
# Consistency Audit & Cleanup - Summary

**Date:** October 13, 2025
**Duration:** [X] hours
**Branch:** audit/consistency-cleanup-2025-10-13

## What Was Done

### Deep Audit
- Scanned entire codebase for pattern compliance
- Verified STANDARDIZATION_PLAN status
- Identified [X] critical issues, [Y] medium issues, [Z] low priority items
- Documented findings in 2025-10-13-consistency-audit.md

### Critical Fixes
- Fixed [X] whose() violations for 250x performance improvement
- Replaced [Y] deprecated helper functions with getUnifiedHelpers()
- Standardized error handling in [Z] tools with ErrorCode enum
- Fixed return types in [A] tools for better type safety
- Standardized script execution to execJson() in [B] tools

### Medium Priority Fixes
- Removed [X] unused exports
- Added explicit constructors to [Y] tools
- Created cache key utilities (if implemented)
- Fixed [Z] unnecessary type casts

## Results

**Before Audit:**
- Inconsistent error handling patterns
- Mix of deprecated and current helper functions
- Unknown return types reducing type safety
- [X] whose() violations causing performance issues

**After Cleanup:**
- ✅ Consistent error handling with ErrorCode enum
- ✅ All tools using getUnifiedHelpers()
- ✅ Specific return types throughout
- ✅ Zero whose() violations
- ✅ All tests passing (563 unit, 24 integration)
- ✅ CI:local passing

## Files Changed

**Tools Modified:** [count]
**Scripts Modified:** [count]
**Documentation Updated:** [count]
**Total Commits:** [count]

## Future Maintenance

To maintain consistency:
1. Follow ARCHITECTURE.md for all new code
2. Check PATTERNS.md when encountering issues
3. Review LESSONS_LEARNED.md for anti-patterns
4. Run `npm run ci:local` before committing
5. Use ts-prune periodically to catch unused exports
```

**Step 2: Commit summary**

```bash
git add docs/audit/SUMMARY.md
git commit -m "docs: create audit summary document"
```

---

### Task 50: Merge to Main

**Files:**
- None (git operations)

**Step 1: Push branch to remote**

```bash
git push origin audit/consistency-cleanup-2025-10-13
```

**Step 2: Create pull request (if using PRs)**

Or prepare for direct merge to main.

**Step 3: Final verification**

Review all commits, ensure nothing was missed.

**Step 4: Ready for merge**

Branch is ready to merge to main.

---

## Success Criteria

✅ All critical violations fixed (whose(), deprecated helpers, error handling)
✅ All medium priority items addressed (return types, unused exports)
✅ Full test suite passing (563 unit + 24 integration)
✅ CI:local passing (build, typecheck, lint, tests)
✅ Comprehensive audit documentation
✅ STANDARDIZATION_PLAN updated with completion status
✅ Ready to merge to main

---

*This plan provides systematic, bite-sized tasks for executing a deep consistency audit and cleanup. Each task is 2-5 minutes and can be executed by an engineer with zero context about the codebase.*
