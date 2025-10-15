# Codebase Standardization Implementation Plan

**Created**: October 10, 2025
**Status**: ⚠️ PARTIALLY COMPLETED - October 15, 2025 (High Priority Items Only)
**Original Estimate**: 12-16 hours total
**Completed**: ~6 hours (Priorities 1-3)
**Remaining**: ~6-10 hours (Priorities 4-10) - See `docs/future-ideas/standardization-improvements.md`

## Completion Summary

### ✅ Completed (PR #26):
- **Priority 1**: Return Types - All tools using specific types (not `unknown`)
- **Priority 2**: Error Handling - Throw statements eliminated, ErrorCode enum adopted
- **Priority 3**: Script Execution - Standardized to `execJson()` pattern

### 📋 Remaining Work:
The uncompleted medium and low priority items (Priorities 4-10) have been moved to:
**`docs/future-ideas/standardization-improvements.md`**

These include: explicit constructors, cache key utilities, cache invalidation patterns, type cast cleanup, metadata standardization, and documentation.

---

## Executive Summary

This document outlines a systematic plan to standardize inconsistent coding patterns across the OmniFocus MCP codebase. The analysis identified significant inconsistencies in error handling, response types, script execution, and tool architecture that reduce code maintainability and type safety.

---

## ✅ Completed Foundation Work

### 1. Centralized Error Codes (DONE)
**File**: `/src/utils/error-codes.ts`
- ✅ Created `ErrorCode` enum with 20+ standardized error codes
- ✅ Added error metadata functions (`isErrorCode`, `getErrorMetadata`)
- ✅ Categorized errors: OmniFocus, Validation, Operation, Analytics, Generic
- ✅ Documented recovery suggestions for each error type

### 2. V2 Response Type Definitions (DONE)
**File**: `/src/tools/response-types-v2.ts`
- ✅ Added `TaskOperationResponseV2` for ManageTaskTool
- ✅ Added `TagsResponseV2` and `TagOperationResponseV2` for TagsToolV2
- ✅ Added `PatternAnalysisResponseV2` for PatternAnalysisToolV2
- ✅ Added response types for all other V2 tools:
  - `FoldersResponseV2`, `FolderOperationResponseV2`
  - `PerspectivesResponseV2`
  - `ExportResponseV2`
  - `RecurringTasksResponseV2`
  - `BatchCreateResponseV2`
  - `SystemResponseV2`
  - `ReviewsResponseV2`
  - `WorkflowAnalysisResponseV2`
  - `ParsedMeetingNotesResponseV2`

---

## 🔴 HIGH PRIORITY: Critical Fixes (4-6 hours)

### Priority 1: Standardize Tool Return Types (2 hours)

**Problem**: Many tools return `unknown` or `StandardResponseV2<unknown>` instead of specific types.

**Tools to Fix**:
1. `ManageTaskTool` - Change from `Promise<unknown>` to `Promise<TaskOperationResponseV2>`
2. `TagsToolV2` - Change from `Promise<StandardResponseV2<unknown>>` to `Promise<TagsResponseV2 | TagOperationResponseV2>`
3. `PatternAnalysisToolV2` - Change from `Promise<unknown>` to `Promise<PatternAnalysisResponseV2>`

**Implementation Steps**:

#### A. Update ManageTaskTool.ts

```typescript
// BEFORE (Line 161):
export class ManageTaskTool extends BaseTool<typeof ManageTaskSchema>

// AFTER:
import type { TaskOperationResponseV2 } from '../response-types-v2.js';

export class ManageTaskTool extends BaseTool<
  typeof ManageTaskSchema,
  TaskOperationResponseV2
>

// BEFORE (Line 171):
async executeValidated(args: ManageTaskInput): Promise<unknown> {

// AFTER:
async executeValidated(args: ManageTaskInput): Promise<TaskOperationResponseV2> {
```

#### B. Update TagsToolV2.ts

```typescript
// BEFORE (Line 75):
async executeValidated(args: TagsToolInput): Promise<StandardResponseV2<unknown>>

// AFTER:
import type { TagsResponseV2, TagOperationResponseV2 } from '../response-types-v2.js';

async executeValidated(args: TagsToolInput): Promise<TagsResponseV2 | TagOperationResponseV2>
```

#### C. Update PatternAnalysisToolV2.ts

```typescript
// BEFORE:
async executeValidated(params: PatternAnalysisParams): Promise<unknown>

// AFTER:
import type { PatternAnalysisResponseV2 } from '../response-types-v2.js';

async executeValidated(params: PatternAnalysisParams): Promise<PatternAnalysisResponseV2>
```

**Validation**: Run `npm run typecheck` - Should pass with no new errors.

---

### Priority 2: Standardize Error Handling (3-4 hours)

**Problem**: Three different error handling patterns exist across tools:
- ✅ **Best**: Specific error checks + fallback (QueryTasksToolV2, ProjectsToolV2)
- ⚠️ **Inconsistent**: Generic `handleError()` only (TagsToolV2, FoldersTool)
- ❌ **Wrong**: Throws instead of returning error responses (PatternAnalysisToolV2)

**Standard Pattern Template**:

```typescript
import { ErrorCode } from '../../utils/error-codes.js';

async executeValidated(args: Args): Promise<Response> {
  const timer = new OperationTimerV2();

  try {
    // ... operation logic
  } catch (error) {
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
        'Try reducing parameters or using simpler query',
        error,
        timer.toMetadata()
      );
    }

    // Provide operation-specific suggestions
    let suggestion = undefined;
    if (errorMessage.includes('projectId') || errorMessage.includes('project')) {
      suggestion = 'First use operation:"list" to find the correct project ID';
    } else if (errorMessage.includes('tagName') || errorMessage.includes('tag')) {
      suggestion = 'Use the tags tool to list available tags';
    }

    // Fall back to generic error
    return createErrorResponseV2(
      this.name,
      ErrorCode.EXECUTION_ERROR,
      errorMessage,
      suggestion,
      error,
      timer.toMetadata()
    );
  }
}
```

**Tools to Fix (in order)**:

1. **PatternAnalysisToolV2** (30 min) - Currently throws errors
   - File: `/src/tools/analytics/PatternAnalysisToolV2.ts`
   - Change: Lines 299-302, remove `throw error` and return error response

2. **TagsToolV2** (45 min) - Only uses generic `handleError()`
   - File: `/src/tools/tags/TagsToolV2.ts`
   - Change: Lines 163-165, add specific error checks

3. **ManageTaskTool** (1.5 hours) - Has some specific checks but inconsistent
   - File: `/src/tools/tasks/ManageTaskTool.ts`
   - Change: Consolidate error handling, use `ErrorCode` enum throughout
   - Lines to update: 239, 262, 295, 312, 328, 442, 551, 555, 580, 607, 611, 636

**Validation**:
```bash
npm run test:quick
# All tests should pass
```

---

### Priority 3: Standardize Script Execution (1-2 hours)

**Problem**: Five different script execution methods used inconsistently:
- `execJson()` (BaseTool method - RECOMMENDED)
- `omniAutomation.executeJson()`
- `omniAutomation.executeTyped()`
- `omniAutomation.execute()`
- Manual handling with `isScriptError()` checks

**Standard Pattern**:

```typescript
// ✅ RECOMMENDED PATTERN
const result = await this.execJson(script);

if (isScriptError(result)) {
  return createErrorResponseV2(
    this.name,
    ErrorCode.SCRIPT_ERROR,
    result.error,
    'Check error details and verify OmniFocus state',
    result.details,
    timer.toMetadata()
  );
}

if (isScriptSuccess(result)) {
  const data = result.data as ExpectedType;
  // ... process data
}
```

**Tools to Fix**:

1. **PatternAnalysisToolV2** (Line 426) - Uses `omniAutomation.execute()`
2. **Any tool using `executeTyped()`** - Switch to `execJson()`
3. **ManageTaskTool** (Lines 258-275) - Simplify manual error handling

**Files to Search**:
```bash
grep -r "omniAutomation.execute\(" src/tools --include="*.ts"
grep -r "omniAutomation.executeTyped\(" src/tools --include="*.ts"
grep -r "omniAutomation.executeJson\(" src/tools --include="*.ts"
```

**Validation**: Compare script execution times before/after to ensure no performance regression.

---

## 🟡 MEDIUM PRIORITY: Consistency Improvements (4-6 hours)

### Priority 4: Add Explicit Constructors (1 hour)

**Problem**: Some tools have explicit constructors, others rely on BaseTool defaults.

**Standard Pattern**:

```typescript
export class MyToolV2 extends BaseTool<typeof MyToolSchema, MyResponseV2> {
  constructor(cache: CacheManager) {
    super(cache);
  }

  // ... rest of tool
}
```

**Tools to Fix**:
- QueryTasksToolV2
- TagsToolV2
- Any other tools without explicit constructors

**Search Command**:
```bash
# Find tools without explicit constructors
grep -L "constructor(cache" src/tools/**/*Tool*.ts
```

---

### Priority 5: Standardize Cache Key Generation (2 hours)

**Problem**: Four different cache key generation patterns:
- Simple string concatenation
- JSON.stringify for complex filters
- Manual string building with sorted arrays
- Simple operation-based keys

**Solution**: Create cache key generator utility.

**New File**: `/src/cache/cache-key-generator.ts`

```typescript
/**
 * Generate consistent cache keys for all tools
 */
export function generateCacheKey(
  category: string,
  operation: string,
  params: Record<string, unknown>
): string {
  // Sort keys for consistent ordering
  const sortedKeys = Object.keys(params).sort();
  const parts = [category, operation];

  for (const key of sortedKeys) {
    const value = params[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      // Sort arrays for consistency
      parts.push(`${key}:${[...value].sort().join(',')}`);
    } else if (typeof value === 'object') {
      parts.push(`${key}:${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}:${String(value)}`);
    }
  }

  return parts.join('_');
}

/**
 * Generate cache key for task queries
 */
export function generateTaskCacheKey(mode: string, filters: Record<string, unknown>): string {
  return generateCacheKey('tasks', mode, filters);
}

/**
 * Generate cache key for project queries
 */
export function generateProjectCacheKey(operation: string, filters: Record<string, unknown>): string {
  return generateCacheKey('projects', operation, filters);
}

// ... similar helpers for other categories
```

**Implementation**:
1. Create utility file
2. Update all tools to use the utilities
3. Run integration tests to ensure cache still works

---

### Priority 6: Standardize Cache Invalidation (1-2 hours)

**Problem**: Mix of smart/blanket/specific invalidation approaches.

**Standard Pattern Hierarchy** (use in this order):

1. **Smart context-aware** (BEST):
   ```typescript
   this.cache.invalidateForTaskChange({
     operation: 'create',
     projectId: args.projectId,
     tags: args.tags,
     affectsToday: this.isDueToday(args.dueDate),
     affectsOverdue: false,
   });
   ```

2. **Specific invalidation** (GOOD):
   ```typescript
   this.cache.invalidateProject(projectId);
   this.cache.invalidateTag(tagName);
   this.cache.invalidateTaskQueries(['today', 'overdue']);
   ```

3. **Category invalidation** (ACCEPTABLE):
   ```typescript
   this.cache.invalidate('tasks');
   ```

4. **Category-wide clear** (AVOID):
   ```typescript
   this.cache.clear('tasks'); // Only use when absolutely necessary
   ```

**Tools to Review**:
- ManageTaskTool (Lines 624-625) - Uses blanket invalidation
- All write operations should use smart invalidation

---

### Priority 7: Remove Unnecessary Type Casts (30 min)

**Problem**: Unnecessary `as unknown as ResponseType` casts throughout ProjectsToolV2, TagsToolV2.

**Fix**: Update response helper return types to match expected types.

**Example**:

```typescript
// BEFORE:
return createListResponseV2(
  'projects',
  projects,
  'projects',
  metadata
) as unknown as ProjectsResponseV2;

// AFTER:
// Fix createListResponseV2 signature to return correct type
return createListResponseV2<ProjectsDataV2>(
  'projects',
  { projects },
  'projects',
  metadata
);
```

---

## 🟢 LOW PRIORITY: Nice to Have (2-3 hours)

### Priority 8: Standardize Metadata Fields

**Problem**: Inconsistent metadata field names (`executionTime` vs `query_time_ms`).

**Standard Fields** (always include):
- `operation: string`
- `query_time_ms: number` (NOT `executionTime`)
- `from_cache: boolean`
- `timestamp: string` (ISO 8601)

---

### Priority 9: Document Helper Function Usage

**Create**: `/docs/HELPER_FUNCTION_GUIDELINES.md`

**Guidelines**:
- Use `getCoreHelpers()` for simple CRUD operations
- Use `getAllHelpers()` for complex queries with filtering
- Use `getBridgeOperations()` when using JXA + evaluateJavascript() bridge
- Document script size budget for each helper level

---

### Priority 10: Document Test Patterns

**Create**: `/docs/TESTING_PATTERNS.md`

**Standard patterns**:
- Mock structure
- Test file organization
- Unit vs integration test guidelines
- Coverage expectations

---

## Implementation Order

### Week 1: High Priority (Critical for Type Safety)

**Day 1-2: Foundation** ✅ COMPLETE
- [x] Create error code enum
- [x] Create V2 response type definitions

**Day 3: Return Types** (2 hours)
- [ ] Update ManageTaskTool return type
- [ ] Update TagsToolV2 return type
- [ ] Update PatternAnalysisToolV2 return type
- [ ] Run typecheck validation

**Day 4-5: Error Handling** (3-4 hours)
- [ ] Fix PatternAnalysisToolV2 error handling
- [ ] Fix TagsToolV2 error handling
- [ ] Fix ManageTaskTool error handling
- [ ] Run integration tests

**Day 6: Script Execution** (2 hours)
- [ ] Audit all script execution patterns
- [ ] Standardize to `execJson()`
- [ ] Verify no performance regression

### Week 2: Medium Priority (Consistency)

**Day 1: Constructors + Cache Keys** (3 hours)
- [ ] Add explicit constructors
- [ ] Create cache key utilities
- [ ] Update tools to use utilities

**Day 2: Cache Invalidation + Type Casts** (2-3 hours)
- [ ] Audit invalidation patterns
- [ ] Fix blanket invalidations
- [ ] Remove unnecessary type casts

### Week 3: Low Priority (Documentation)

**Day 1: Documentation** (2-3 hours)
- [ ] Helper function guidelines
- [ ] Testing patterns
- [ ] Metadata standards

**Day 2: Final Validation** (2 hours)
- [ ] Full test suite run
- [ ] Performance benchmarks
- [ ] Code review

---

## Success Criteria

### Must Pass:
1. ✅ `npm run build` - No TypeScript errors
2. ✅ `npm run typecheck` - All type checks pass
3. ✅ `npm run lint` - Error count ≤ 50
4. ✅ `npm run test:quick` - All unit tests pass
5. ✅ `npm run test:integration` - All integration tests pass

### Quality Metrics:
- **Type Safety**: 100% of tools have specific return types (not `unknown`)
- **Error Handling**: 100% of tools use standard error pattern
- **Script Execution**: 100% of tools use `execJson()`
- **Constructors**: 100% of tools have explicit constructors
- **Cache Keys**: 100% of cache key generation uses utilities

---

## Rollback Plan

If issues arise during implementation:

1. **Git Branches**: Use feature branches for each priority
   ```bash
   git checkout -b standardize/return-types
   git checkout -b standardize/error-handling
   git checkout -b standardize/script-execution
   ```

2. **Commit Early, Commit Often**: One tool per commit
   ```bash
   git commit -m "fix: standardize ManageTaskTool return type"
   git commit -m "fix: standardize TagsToolV2 error handling"
   ```

3. **Test After Each Change**: Don't batch fixes
   ```bash
   npm run build && npm run test:quick
   ```

4. **Revert If Needed**:
   ```bash
   git revert <commit-hash>
   ```

---

## File Modification Checklist

### Core Infrastructure (✅ DONE)
- [x] `/src/utils/error-codes.ts` - Error code enum
- [x] `/src/tools/response-types-v2.ts` - Response type definitions

### To Create
- [ ] `/src/cache/cache-key-generator.ts` - Cache key utilities
- [ ] `/docs/HELPER_FUNCTION_GUIDELINES.md` - Helper usage guide
- [ ] `/docs/TESTING_PATTERNS.md` - Test standards

### High Priority Tools to Modify
- [ ] `/src/tools/tasks/ManageTaskTool.ts`
- [ ] `/src/tools/tags/TagsToolV2.ts`
- [ ] `/src/tools/analytics/PatternAnalysisToolV2.ts`

### Medium Priority Tools to Modify
- [ ] `/src/tools/tasks/QueryTasksToolV2.ts`
- [ ] `/src/tools/projects/ProjectsToolV2.ts`
- [ ] `/src/tools/folders/FoldersTool.ts`
- [ ] `/src/tools/perspectives/PerspectivesToolV2.ts`
- [ ] `/src/tools/export/ExportTool.ts`
- [ ] `/src/tools/recurring/RecurringTasksTool.ts`
- [ ] `/src/tools/batch/BatchCreateTool.ts`
- [ ] `/src/tools/system/SystemToolV2.ts`
- [ ] `/src/tools/reviews/ManageReviewsTool.ts`
- [ ] `/src/tools/analytics/WorkflowAnalysisTool.ts`
- [ ] `/src/tools/capture/ParseMeetingNotesTool.ts`

---

## Next Steps

**Decision Point**: Choose implementation approach:

1. **Full Implementation** - Complete all high priority items (4-6 hours)
2. **Phased Approach** - Start with return types only (2 hours)
3. **Pilot Project** - Fix one tool completely as example (1 hour)

**Recommended**: Start with Phased Approach (Option 2)
- Immediate type safety benefits
- Low risk
- Quick wins build momentum
- Can pause and assess before continuing

---

*This plan provides a systematic approach to eliminating technical debt while maintaining backward compatibility and minimizing risk.*
