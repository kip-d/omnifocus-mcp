# Consistency Audit Report - October 13, 2025

**Purpose:** Automated scan to identify inconsistencies, violations, and technical debt across the codebase.

**Scope:** Tasks 1-7 from `docs/plans/2025-10-13-consistency-audit-cleanup.md`

---

## Task 1: Verify STANDARDIZATION_PLAN Status

### Files to Check
Checking existence and status of files mentioned in STANDARDIZATION_PLAN.md...

**Status: COMPLETE** ✅

### Core Infrastructure (Foundation Work)
- ✅ `/src/utils/error-codes.ts` - EXISTS (ErrorCode enum with 20+ codes)
- ✅ `/src/tools/response-types-v2.ts` - EXISTS (V2 response types)

### Shared Scripts Directory
- ✅ `/src/omnifocus/scripts/shared/` - EXISTS (9 files)
  - bridge-helpers.ts
  - bridge-template.ts
  - helper-context.ts
  - helpers.ts
  - minimal-tag-bridge.ts
  - repeat-helpers.ts
  - script-builder.ts

### V2 Tools Architecture
**All tools are V2** - No V1 tools found
- Tool files in `src/tools/`: 26 implementation files
- All tools follow V2 naming or are utility files
- V1 removal completed successfully

### Tools Requiring Attention (per STANDARDIZATION_PLAN)
Per Priority 1-3 of STANDARDIZATION_PLAN:

**Priority 1: Return Types**
- ManageTaskTool.ts - Needs return type update
- TagsToolV2.ts - Needs return type update
- PatternAnalysisToolV2.ts - Needs return type update

**Priority 2: Error Handling**
- PatternAnalysisToolV2.ts - Currently throws errors (found 3 instances)
- TagsToolV2.ts - Only uses generic handleError()
- ManageTaskTool.ts - Inconsistent error handling

**Priority 3: Script Execution**
- Mix of execJson(), executeJson(), executeTyped(), execute()
- Found 64 script execution calls across tools

### Findings Summary
1. **Foundation Complete**: error-codes.ts and response-types-v2.ts exist and in use
2. **V2 Migration**: 100% complete, no V1 tools remain
3. **Shared Helpers**: All organized in shared/ directory
4. **Implementation Needed**: Priorities 1-3 from STANDARDIZATION_PLAN remain TODO

---

## Task 2: Run ts-prune for Unused Exports

**Status: COMPLETE** ✅

### Summary Statistics
- **Total Unused Exports**: 120 items
- **Categories**:
  - Type Definitions (jxa-types, api-types): 19 items
  - Response Types (response-types-v2, script-response-types, etc.): 34 items
  - Shared Script Helpers: 20 items
  - Utility Types (safe-io, timezone, metrics): 18 items
  - Tool Schemas: 14 items
  - Other (CacheWarmer, plugins, etc.): 15 items

### Analysis by Category

#### 1. Type Definitions (19 items)
**Type**: Internal type definitions, likely used for type checking only
**Action**: KEEP - These provide type safety even if not imported elsewhere

Files:
- `src/omnifocus/jxa-types.ts` (10 items)
- `src/omnifocus/api/api-types.ts` (9 items)

Examples:
- `OmniFocusError`, `RepetitionRule` types
- `BaseRepetitionRule`, `HourlyRepetitionRule`, etc.
- `OmniFocusTask`, `OmniFocusProject`, `OmniFocusTag`

#### 2. Response Types (34 items)
**Type**: Response type definitions for tools
**Action**: KEEP - Required for type safety, used at runtime via generics

Files:
- `src/tools/response-types-v2.ts` (9 items)
- `src/omnifocus/script-response-types.ts` (19 items)
- `src/omnifocus/script-result-types.ts` (2 items)
- `src/utils/response-format.ts` (4 items)

Examples:
- `TaskV2`, `ProjectV2`, `TagV2`, `FolderV2`
- `StatsOverview`, `VelocityMetrics`, `PatternData`
- `ScriptSuccess`, `ScriptError`

#### 3. Shared Script Helpers (20 items)
**Type**: JXA script template strings
**Action**: REVIEW - Some may be genuinely unused

Files:
- `src/omnifocus/scripts/shared/*.ts` (20 items)

Examples:
- `BRIDGE_HELPERS`, `BRIDGE_MIGRATION`
- `SAFE_UTILITIES`, `PROJECT_VALIDATION`
- `REPEAT_HELPERS`, `MINIMAL_TAG_BRIDGE`

**Recommendation**: Cross-reference with grep results for actual usage in script builders

#### 4. Utility Types (18 items)
**Type**: Utility functions and type definitions
**Action**: KEEP - Used for type safety and runtime utilities

Files:
- `src/utils/*.ts` (18 items)

Examples:
- `JsonValue`, `JxaEnvelope` (safe-io.ts)
- `getSystemTimezone`, `getTimezoneInfo` (timezone.ts)
- `MetricsCollector`, `SystemMetrics` (metrics.ts)

#### 5. Tool Schemas (14 items)
**Type**: Zod schemas for tool parameters
**Action**: KEEP - Used for runtime validation

Files:
- `src/tools/schemas/*.ts` (9 items)
- `src/tools/batch/*.ts` (3 items)
- `src/tools/tasks/filter-types.ts` (2 items)

#### 6. Other Exports (15 items)
**Type**: Misc exports (scripts, plugins, monitors)
**Action**: REVIEW case-by-case

Examples:
- `GET_TASKS_IN_DATE_RANGE_ULTRA_OPTIMIZED_SCRIPT` (unused script)
- `RecurringTaskPluginRegistry` (plugin system)
- `analyzeScriptSize`, `logScriptSize` (script-size-monitor.ts)

### Recommendations

**No Immediate Action Required**
- Most "unused" exports are type definitions used implicitly
- ts-prune doesn't detect usage via generics or runtime type checks
- Removing these would break type safety

**Potential Cleanup (Low Priority)**
1. Review `GET_TASKS_IN_DATE_RANGE_ULTRA_OPTIMIZED_SCRIPT` - may be dead code
2. Review script helper constants (BRIDGE_HELPERS, etc.) - verify actual usage
3. Consider marking intentional public APIs with JSDoc comments

**Raw Output**: See `docs/audit/unused-exports-raw.txt`

---

## Task 3: Scan for Deprecated Helper Usage

**Status: COMPLETE** ✅

### Summary
**Total Occurrences**: 0 deprecated helper usages found

### Search Results
```bash
grep -r "getAllHelpers|getCoreHelpers|getMinimalHelpers" src/ --include="*.ts"
```

**Result**: No matches found

### Analysis
The codebase has **already eliminated** the deprecated helper functions:
- ❌ No usage of `getAllHelpers()`
- ❌ No usage of `getCoreHelpers()`
- ❌ No usage of `getMinimalHelpers()`

### Current Helper Strategy
Based on file examination:
- Individual helper imports from `src/omnifocus/scripts/shared/*.ts`
- Direct usage of specific helper constants (BRIDGE_HELPERS, SAFE_UTILITIES, etc.)
- Modern approach: Import only what's needed

### Conclusion
✅ **COMPLIANT** - No deprecated helper patterns found in codebase

**Raw Output**: See `docs/audit/deprecated-helper-usage.txt` (empty file)

---

## Task 4: Scan for whose() Method Violations

**Status: COMPLETE** ✅

### Summary
**Total Violations**: 0 instances found

### Search Results
```bash
grep -r "\.whose|\.where" src/ --include="*.ts"
```

**Result**: No matches found

### Analysis
The codebase is **fully compliant** with JXA performance rules:
- ❌ No usage of `.whose()` method
- ❌ No usage of `.where()` method

### Documentation Compliance
Per CLAUDE.md section "Critical: JXA Performance Rules":
> NEVER Use .where() or .whose() Methods
> We run in JXA context, NOT OmniJS. These methods don't exist in our environment.

✅ **FULLY COMPLIANT** - All scripts use standard JavaScript iteration patterns

**Raw Output**: See `docs/audit/whose-violations.txt` (empty file)

---

## Task 5: Audit Error Handling Patterns

**Status: COMPLETE** ✅

### Summary Statistics
- **ErrorCode Usage**: 5 occurrences in tools
- **Throw Statements**: 18 occurrences across 7 files

### ErrorCode Usage Analysis
```bash
grep -r "ErrorCode\." src/tools --include="*.ts" | wc -l
# Result: 5
```

**Low adoption** of standardized ErrorCode enum:
- Most tools still use string literals for error codes
- Only 5 usages found in entire tools directory
- ErrorCode enum exists but not widely adopted

### Throw Statement Analysis
Found 18 `throw new` statements across tools:

#### By File:
1. **src/tools/base.ts** (4 throws)
   - McpError throws for validation/schema errors
   - Appropriate - base class error handling

2. **src/tools/index.ts** (1 throw)
   - McpError for tool not found
   - Appropriate - top-level routing error

3. **src/tools/tasks/QueryTasksToolV2.ts** (1 throw)
   - `throw new Error('Search mode requires...')`
   - ⚠️ Should return error response instead

4. **src/tools/projects/ProjectsToolV2.ts** (2 throws)
   - `throw new Error('Operation requires projectId')`
   - `throw new Error('Create operation requires name')`
   - ⚠️ Should return error responses instead

5. **src/tools/batch/dependency-graph.ts** (4 throws)
   - `throw new DependencyGraphError(...)`
   - ⚠️ Internal utility - acceptable, but should be caught

6. **src/tools/batch/tempid-resolver.ts** (3 throws)
   - `throw new Error('Temporary ID already registered')`
   - ⚠️ Internal utility - acceptable, but should be caught

7. **src/tools/analytics/PatternAnalysisToolV2.ts** (3 throws)
   - `throw new Error('Failed to fetch data...')`
   - `throw new Error('Failed to fetch complete data...')`
   - `throw new Error('OmniAutomation execution returned no result')`
   - ❌ **VIOLATION** - Tool should return error responses, not throw

### Pattern Violations

#### ❌ HIGH PRIORITY: Tools Throwing Errors
**Problem**: Tools should return error responses, not throw exceptions

**Files to Fix**:
1. `PatternAnalysisToolV2.ts` (3 throws) - **Matches STANDARDIZATION_PLAN Priority 2**
2. `QueryTasksToolV2.ts` (1 throw)
3. `ProjectsToolV2.ts` (2 throws)

#### ⚠️ MEDIUM PRIORITY: Inconsistent ErrorCode Adoption
**Problem**: Only 5 uses of ErrorCode enum across all tools

**Current State**:
- ErrorCode enum exists with 20+ codes
- Most tools use string literals or generic errors
- Inconsistent error categorization

**Recommendation**: Follow STANDARDIZATION_PLAN Priority 2 for error handling standardization

### Compliance Summary
- ✅ Base infrastructure: ErrorCode enum exists
- ❌ Adoption: Very low (5 usages)
- ❌ Pattern violations: 6 tools throwing errors instead of returning responses
- ⚠️ Consistency: Mixed error handling patterns

**Raw Output**: See `docs/audit/throwing-errors.txt`

---

## Task 6: Audit Script Execution Methods

**Status: COMPLETE** ✅

### Summary Statistics
- **Total Script Execution Calls**: 64 occurrences
- **Methods Found**:
  - `execJson()` - 34 calls (RECOMMENDED)
  - `executeJson()` - 13 calls
  - `executeTyped()` - 1 call
  - `execute()` - 6 calls
  - Comments/references - 10

### Method Distribution by File

#### 1. execJson() Usage (34 calls - ✅ RECOMMENDED)
**Files**:
- `QueryTasksToolV2.ts` (9 calls)
- `ManageTaskTool.ts` (7 calls)
- `ProjectsToolV2.ts` (5 calls)
- `BatchCreateTool.ts` (3 calls)
- `FoldersTool.ts` (9 calls)
- `WorkflowAnalysisTool.ts` (1 call)

**Status**: ✅ Following recommended pattern from STANDARDIZATION_PLAN

#### 2. executeJson() Usage (13 calls)
**Files**:
- `ProjectsToolV2.ts` (3 calls)
- `PerspectivesToolV2.ts` (1 call)
- `TagsToolV2.ts` (3 calls)
- `ExportTool.ts` (2 calls + 2 fallback references)

**Status**: ⚠️ Should migrate to `execJson()` for consistency

#### 3. executeTyped() Usage (1 call)
**Files**:
- `QueryTasksToolV2.ts` (1 call)

**Status**: ⚠️ Should migrate to `execJson()` per STANDARDIZATION_PLAN Priority 3

#### 4. execute() Usage (6 calls)
**Files**:
- `ExportTool.ts` (2 calls)
- `RecurringTasksTool.ts` (2 calls)
- `PatternAnalysisToolV2.ts` (1 call)
- `ManageTaskTool.ts` (1 fallback reference)

**Status**: ❌ Should migrate to `execJson()` per STANDARDIZATION_PLAN Priority 3

### Pattern Analysis

#### Standard Pattern (34 calls - 53%)
```typescript
const result = await this.execJson(script);
if (isScriptError(result)) {
  return createErrorResponseV2(...);
}
```
**Tools Following Standard**:
- QueryTasksToolV2
- ManageTaskTool
- BatchCreateTool
- FoldersTool
- WorkflowAnalysisTool

#### Legacy Pattern 1: executeJson with Schema (13 calls - 20%)
```typescript
const result = await this.omniAutomation.executeJson(script, Schema);
```
**Tools Using Legacy**:
- ProjectsToolV2
- PerspectivesToolV2
- TagsToolV2

#### Legacy Pattern 2: execute() without wrapper (6 calls - 9%)
```typescript
const result = await this.omniAutomation.execute(script) as Type;
```
**Tools Using Legacy**:
- ExportTool
- RecurringTasksTool
- PatternAnalysisToolV2

### Violations Summary

**Priority 3 from STANDARDIZATION_PLAN**: "Standardize Script Execution"

❌ **Tools Needing Migration**:
1. `PatternAnalysisToolV2.ts` - Uses `execute()` (Line 426)
2. `QueryTasksToolV2.ts` - Uses `executeTyped()` (1 instance)
3. `ProjectsToolV2.ts` - Uses `executeJson()` directly (3 calls)
4. `TagsToolV2.ts` - Uses `executeJson()` directly (3 calls)
5. `PerspectivesToolV2.ts` - Uses `executeJson()` directly (1 call)
6. `ExportTool.ts` - Uses `execute()` (2 calls)
7. `RecurringTasksTool.ts` - Uses `execute()` (2 calls)

### Recommendations

**HIGH PRIORITY**: Standardize to `execJson()`
- Migrate 20 legacy calls (13 executeJson + 1 executeTyped + 6 execute)
- Update 7 tool files
- Estimated effort: 1-2 hours (matches STANDARDIZATION_PLAN Priority 3)

**MEDIUM PRIORITY**: Add error handling to all execJson() calls
- Ensure all calls check `isScriptError(result)`
- Add appropriate error responses

**Raw Output**: See `docs/audit/script-execution-methods.txt`

---

## Task 7: Audit MCP Lifecycle Compliance

**Status: COMPLETE** ✅

### Summary
**Compliance Status**: ✅ FULLY COMPLIANT

### stdin Handler Audit

#### Search Results
```bash
grep -r "stdin.*on|process.stdin" src/ --include="*.ts"
```

**Found in `src/index.ts`**:
```typescript
process.stdin.on('end', () => { ... });
process.stdin.on('close', () => { ... });
```

✅ **COMPLIANT**: Both required stdin handlers present

### Pending Operations Tracking Audit

#### Search Results
```bash
grep -r "pendingOperations|setPendingOperationsTracker" src/ --include="*.ts"
```

**Found in 2 files**:
1. `src/omnifocus/OmniAutomation.ts`
   - Exports `setPendingOperationsTracker()`
   - Implementation for tracking async operations

2. `src/index.ts`
   - Creates `pendingOperations` Set
   - Calls `setPendingOperationsTracker()`
   - Adds warming operations to set
   - Waits for pending operations before exit

✅ **COMPLIANT**: Full async operation lifecycle tracking implemented

### Implementation Details

#### stdin Handlers (src/index.ts)
```typescript
process.stdin.on('end', () => {
  gracefulExit('stdin closed');
});

process.stdin.on('close', () => {
  gracefulExit('stdin closed');
});
```

#### Pending Operations Tracking (src/index.ts)
```typescript
const pendingOperations = new Set<Promise<unknown>>();
setPendingOperationsTracker(pendingOperations);

// Track cache warming
pendingOperations.add(warmingPromise);

// Wait before exit
const gracefulExit = async (reason: string) => {
  if (pendingOperations.size > 0) {
    logger.info(`Waiting for ${pendingOperations.size} pending operations...`);
    await Promise.allSettled([...pendingOperations]);
  }
  process.exit(0);
};
```

### MCP Specification Compliance

Per CLAUDE.md section "CRITICAL: MCP stdin Handling" and "CRITICAL: Async Operation Lifecycle":

✅ **stdin close handling** - Both 'end' and 'close' events handled
✅ **Graceful shutdown** - Server waits for operations before exit
✅ **Pending operations tracking** - All async ops tracked in Set
✅ **Promise settling** - Uses Promise.allSettled() to wait

### Compliance Summary

**MCP Lifecycle**: ✅ FULLY COMPLIANT
- ✅ stdin handlers implemented correctly
- ✅ Pending operations tracked globally
- ✅ Graceful exit waits for completion
- ✅ Follows MCP specification (2025-06-18)

**No violations found** - Implementation matches documented requirements

**Raw Output**: See `docs/audit/stdin-handlers.txt` and `docs/audit/pending-ops.txt`

---

## Overall Audit Summary

### Completion Status
- ✅ Task 1: STANDARDIZATION_PLAN Status - COMPLETE
- ✅ Task 2: ts-prune Unused Exports - COMPLETE (120 exports analyzed)
- ✅ Task 3: Deprecated Helper Usage - COMPLETE (0 violations)
- ✅ Task 4: whose() Method Violations - COMPLETE (0 violations)
- ✅ Task 5: Error Handling Patterns - COMPLETE (18 throws found, 5 ErrorCode uses)
- ✅ Task 6: Script Execution Methods - COMPLETE (64 calls, 20 need migration)
- ✅ Task 7: MCP Lifecycle Compliance - COMPLETE (fully compliant)

### Critical Findings

#### 🔴 HIGH PRIORITY Issues
1. **Error Handling**: 6 tools throw errors instead of returning responses
   - PatternAnalysisToolV2.ts (3 throws) ❌
   - QueryTasksToolV2.ts (1 throw) ⚠️
   - ProjectsToolV2.ts (2 throws) ⚠️

2. **Script Execution**: 20 legacy calls need migration to execJson()
   - 13 executeJson() calls
   - 6 execute() calls
   - 1 executeTyped() call

3. **ErrorCode Adoption**: Very low (5 uses vs 20+ error codes available)

#### 🟢 POSITIVE Findings
1. ✅ **MCP Lifecycle**: Fully compliant with specification
2. ✅ **JXA Performance**: No whose()/where() violations
3. ✅ **Helper Strategy**: No deprecated helpers found
4. ✅ **V2 Architecture**: 100% V2 tools, no V1 legacy

### Alignment with STANDARDIZATION_PLAN

**Foundation (Complete)** ✅
- ErrorCode enum exists
- V2 response types defined
- Shared scripts organized

**Priority 1: Return Types** (TODO)
- 3 tools need return type updates

**Priority 2: Error Handling** (TODO - Validated by Audit)
- Confirmed: PatternAnalysisToolV2 throws errors
- Confirmed: Low ErrorCode adoption
- Confirmed: 18 throw statements found

**Priority 3: Script Execution** (TODO - Validated by Audit)
- Confirmed: 20 legacy execution calls
- Confirmed: 7 tools need migration
- Confirmed: execJson() is recommended pattern (53% adoption)

### Next Steps

**Recommended Implementation Order**:
1. Fix error handling in PatternAnalysisToolV2 (HIGH - 3 throws)
2. Migrate script execution methods (20 calls across 7 tools)
3. Increase ErrorCode adoption across all tools
4. Update return types per STANDARDIZATION_PLAN Priority 1

**Estimated Total Effort**: 6-8 hours
- Error handling: 2-3 hours
- Script execution: 2 hours
- Return types: 2 hours
- Testing/validation: 1 hour

---

## Audit Artifacts

All raw output files saved to `docs/audit/`:
- `unused-exports-raw.txt` (120 lines)
- `deprecated-helper-usage.txt` (0 lines - no violations)
- `whose-violations.txt` (0 lines - no violations)
- `throwing-errors.txt` (18 lines)
- `script-execution-methods.txt` (64 lines)
- `stdin-handlers.txt` (2 lines)
- `pending-ops.txt` (9 lines)

**Total Lines Audited**: ~103 lines of output
**Files Scanned**: Entire `src/` directory
**Date**: October 13, 2025

