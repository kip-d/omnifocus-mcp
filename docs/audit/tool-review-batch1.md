# V2 Tool Review - Batch 1
**Date:** October 13, 2025
**Tools Reviewed:** QueryTasksToolV2, ManageTaskTool, ProjectsToolV2, TagsToolV2

---

## QueryTasksToolV2 (`src/tools/tasks/QueryTasksToolV2.ts`)

### Checklist

#### Error Handling
- [x] Uses `createErrorResponseV2()` consistently
- [ ] **ISSUE:** Line 315 throws error instead of returning: `throw new Error('Search mode requires...')`
- [x] Has specific error detection (permission, OmniFocus not running, timeout)
- [x] Provides actionable suggestions in error messages
- **Status:** MEDIUM - One throw statement that should be error response

#### Script Execution
- [x] Uses `execJson()` (primary pattern) - 9 calls
- [ ] **INCONSISTENCY:** Line 629 uses `executeTyped()` (1 call)
- [x] Checks `isScriptError()` and `isScriptSuccess()`
- **Status:** MEDIUM - Mostly standardized, one executeTyped call

#### Return Types
- [x] Return type: `TasksResponseV2` (properly typed)
- [x] Uses `createTaskResponseV2()` helper
- [x] Consistent response format
- **Status:** GOOD

#### Cache Patterns
- [x] Uses cache manager correctly
- [x] Cache keys include relevant filters
- [x] Invalidates cache appropriately (via `invalidateForTaskChange()`)
- [x] Cache keys have consistent format
- **Status:** GOOD

#### Code Quality
- [x] Type safety (no `any` types visible)
- [x] Error messages are descriptive
- [x] Helper methods are well-organized
- [x] Follows BaseTool pattern
- **Status:** GOOD

### Issues Summary
1. **MEDIUM:** Line 315 - throws error instead of returning error response
2. **MEDIUM:** Line 629 - uses `executeTyped()` instead of `execJson()`

---

## ManageTaskTool (`src/tools/tasks/ManageTaskTool.ts`)

### Checklist

#### Error Handling
- [x] Uses `createErrorResponseV2()` consistently
- [x] No throw statements for user-facing errors
- [x] Has specific error detection
- [x] Provides actionable suggestions
- **Status:** GOOD

#### Script Execution
- [x] Uses `execJson()` consistently - 7 calls
- [x] Checks `isScriptError()` and `isScriptSuccess()`
- [x] Handles script errors appropriately
- **Status:** GOOD

#### Return Types
- [x] Return type: `TaskOperationResponseV2` (properly typed)
- [x] Uses `createSuccessResponseV2()` helper
- [x] Consistent response format
- **Status:** GOOD

#### Cache Patterns
- [x] Uses cache manager correctly
- [x] Smart invalidation via `invalidateForTaskChange()`
- [x] Invalidates after create/update/delete/complete
- [x] Includes operation context in invalidation
- **Status:** GOOD

#### Code Quality
- [x] Type safety (proper type guards)
- [x] Complex operation routing is clear
- [x] Helper methods well-organized
- [x] Follows BaseTool pattern
- **Status:** GOOD

### Issues Summary
**NONE** - This tool is a good example of proper V2 implementation

---

## ProjectsToolV2 (`src/tools/projects/ProjectsToolV2.ts`)

### Checklist

#### Error Handling
- [x] Uses `createErrorResponseV2()` consistently
- [ ] **ISSUE:** Lines 219, 222 throw errors instead of returning: `throw new Error('Operation requires...')`
- [x] Has specific error detection method (`getSpecificErrorResponse`)
- [x] Provides actionable suggestions
- **Status:** MEDIUM - Two throw statements that should be error responses

#### Script Execution
- [x] Uses `execJson()` - 3 calls (lines 268, 344, 425)
- [ ] **INCONSISTENCY:** Uses `executeJson()` directly - 3 calls (lines 563, 620, 668)
- [x] Checks `isScriptError()` and `isScriptSuccess()`
- **Status:** MEDIUM - Mixed execution methods

#### Return Types
- [x] Return type: `ProjectsResponseV2 | ProjectOperationResponseV2` (properly typed)
- [x] Uses response helpers consistently
- [x] Consistent response format
- **Status:** GOOD

#### Cache Patterns
- [x] Uses cache manager correctly
- [x] Cache keys include filters
- [x] Invalidates with `invalidateProject()` and `invalidate()`
- [x] Operation-specific cache keys
- **Status:** GOOD

#### Code Quality
- [x] Type safety (proper type guards)
- [x] Helper method `getSpecificErrorResponse` is useful
- [x] Operation routing is clear
- [x] Follows BaseTool pattern
- **Status:** GOOD

### Issues Summary
1. **MEDIUM:** Lines 219, 222 - throw errors instead of returning error responses
2. **MEDIUM:** Lines 563, 620, 668 - use `executeJson()` instead of `execJson()`

---

## TagsToolV2 (`src/tools/tags/TagsToolV2.ts`)

### Checklist

#### Error Handling
- [x] Uses `createErrorResponseV2()` consistently
- [x] No throw statements for user-facing errors
- [ ] **INCONSISTENCY:** Only uses generic `handleErrorV2()` for catch blocks (lines 165, 212, 305)
- [x] Validates required parameters before execution
- **Status:** LOW - Could add specific error detection like other tools

#### Script Execution
- [ ] **INCONSISTENCY:** Uses `executeJson()` directly - 3 calls (lines 137, 184, 277)
- [x] Checks `isScriptSuccess()`
- [x] Uses proper schema validation
- **Status:** MEDIUM - Needs migration to `execJson()`

#### Return Types
- [x] Return type: `TagsResponseV2 | TagOperationResponseV2` (properly typed)
- [x] Uses response helpers consistently
- [x] Consistent response format
- **Status:** GOOD

#### Cache Patterns
- [x] Uses cache manager correctly
- [x] Cache keys include operation modes
- [x] Invalidates with `invalidateTag()` for changes
- [x] Smart invalidation for rename/merge operations
- **Status:** GOOD

#### Code Quality
- [x] Type safety (proper type guards)
- [x] Clean operation routing
- [x] Helper methods well-organized
- [x] Follows BaseTool pattern
- **Status:** GOOD

### Issues Summary
1. **MEDIUM:** Lines 137, 184, 277 - use `executeJson()` instead of `execJson()`
2. **LOW:** Catch blocks only use generic `handleErrorV2()`, missing specific error detection

---

## Batch 1 Summary

### Critical Issues
**NONE**

### Medium Priority Issues
1. **QueryTasksToolV2:** Line 315 throws error (should return error response)
2. **QueryTasksToolV2:** Line 629 uses `executeTyped()` (should use `execJson()`)
3. **ProjectsToolV2:** Lines 219, 222 throw errors (should return error responses)
4. **ProjectsToolV2:** Lines 563, 620, 668 use `executeJson()` (should use `execJson()`)
5. **TagsToolV2:** Lines 137, 184, 277 use `executeJson()` (should use `execJson()`)

### Low Priority Issues
1. **TagsToolV2:** Missing specific error detection in catch blocks

### Good Patterns Found
- **ManageTaskTool** is an excellent example of V2 compliance
- All tools use cache invalidation correctly
- All tools have proper type safety
- Response helpers are used consistently
- Operation routing is clear and maintainable

### Statistics
- **Tools with throw statements:** 2 (QueryTasksToolV2, ProjectsToolV2)
- **Tools using executeJson() instead of execJson():** 2 (ProjectsToolV2, TagsToolV2)
- **Tools using executeTyped():** 1 (QueryTasksToolV2)
- **Fully compliant tools:** 1 (ManageTaskTool)
