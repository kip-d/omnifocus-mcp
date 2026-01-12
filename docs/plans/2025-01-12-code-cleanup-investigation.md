# Code Cleanup Investigation - January 2025

**Status:** Investigation Complete, Implementation Pending **Created:** 2025-01-12 **Agent:** code-simplifier

## Summary

A comprehensive analysis of the OmniFocus MCP codebase identified **~3,600+ lines** of potentially removable code across
8 categories. This document captures the findings and verification steps needed before removal.

## Investigation Methodology

1. **Git history analysis** - Checked recent commits and modification patterns
2. **Import tracing** - Used grep to find all imports of each module
3. **Export usage analysis** - Verified which exports are actually consumed
4. **Cross-reference with Unified API** - Confirmed the production API uses AST-based builders, not legacy patterns

---

## High-Priority Cleanup Opportunities

### 1. Unused Plugin System (188 lines)

**Files:**

- `src/omnifocus/plugins/PluginRegistry.ts` (114 lines)
- `src/omnifocus/plugins/types.ts` (74 lines)

**Evidence:** No imports found anywhere in the codebase. The plugin system for recurring task analysis was designed but
never integrated.

**Verification command:**

```bash
grep -r "from.*plugins" src/ --include="*.ts" | grep -v "plugins/"
grep -r "PluginRegistry\|RecurringTaskPlugin" src/ --include="*.ts"
```

**Action:** Remove entire `src/omnifocus/plugins/` directory.

---

### 2. Unused Legacy Generator Code (281 lines)

**File:** `src/contracts/generator.ts`

**Unused functions:**

- `generateTagFilterFunction`
- `generateTextFilterFunction`
- `generateDateFilterFunction`
- `generateCompletionFilterLogic`
- `generateFilterBlock`
- `generateTaskIterationScript`

**Evidence:** Only referenced by:

- `src/contracts/index.ts` (re-exports - check if these are consumed)
- `src/contracts/examples/migration-example.ts` (documentation only)

The codebase uses AST-based script builders in `contracts/ast/` instead.

**Verification command:**

```bash
grep -r "generateTagFilter\|generateTextFilter\|generateDateFilter\|generateFilterBlock\|generateTaskIterationScript" src/ --include="*.ts" | grep -v "generator.ts\|index.ts\|migration-example"
```

**Action:** Remove `src/contracts/generator.ts` and update `src/contracts/index.ts`.

---

### 3. Unused Migration Example (182 lines)

**File:** `src/contracts/examples/migration-example.ts`

**Evidence:** Documentation/example file that demonstrates migration patterns but is never imported or executed.

**Verification command:**

```bash
grep -r "migration-example\|examples/" src/ --include="*.ts"
```

**Action:** Remove `src/contracts/examples/` directory.

---

### 4. Unused Insights Module (~350 lines)

**Files:**

- `src/contracts/ast/insights/index.ts` (47 lines)
- `src/contracts/ast/insights/presets/workflow-insights.ts` (~300 lines)

**Unused exports:**

- `PRODUCTIVITY_INSIGHTS`
- `WORKFLOW_INSIGHTS`
- Other insight presets

**Evidence:** These presets are defined and exported but never imported by production code.

**Verification command:**

```bash
grep -r "PRODUCTIVITY_INSIGHTS\|WORKFLOW_INSIGHTS\|from.*insights" src/ --include="*.ts" | grep -v "insights/"
```

**Action:** Remove `src/contracts/ast/insights/` directory.

---

### 5. Unused API Types (57 lines)

**File:** `src/omnifocus/api/api-types.ts`

**Unused types:**

- `OmniFocusTask`
- `OmniFocusProject`
- `TaskWithAnalysis`
- `ScriptResult`
- `SafeAccessors`

**Evidence:** None of these are imported elsewhere in the codebase.

**Verification command:**

```bash
grep -r "from.*api-types\|OmniFocusTask\|TaskWithAnalysis\|ScriptResult\|SafeAccessors" src/ --include="*.ts" | grep -v "api-types.ts"
```

**Action:** Remove `src/omnifocus/api/api-types.ts`.

---

### 6. Unused Branded Type Functions (~90 lines)

**File:** `src/utils/branded-types.ts`

**Unused functions:**

- Type guards: `isTaskId`, `isProjectId`, `isTagId`, `isFolderId`
- Conversion functions: `asTaskId`, `asProjectId`, `tryAsTaskId`, `tryAsProjectId`, etc.

**Used (keep these):**

- Type definitions: `TaskId`, `ProjectId`, `TagId`, `FolderId`

**Evidence:** Only the type definitions are imported; the runtime functions are never called.

**Verification command:**

```bash
grep -r "isTaskId\|isProjectId\|asTaskId\|asProjectId\|tryAsTaskId" src/ --include="*.ts" | grep -v "branded-types.ts"
```

**Action:** Remove unused functions, keep type definitions only.

---

### 7. Duplicate OmniFocus Type Definition (2,224 lines)

**Files:**

- `src/omnifocus/api/OmniFocus-4.8.3-d.ts` (2,224 lines) - **older version**
- `src/omnifocus/api/OmniFocus-4.8.6-d.ts` (2,244 lines) - **current version**
- `src/omnifocus/api/OmniFocus.d.ts` - **main reference file**

**Evidence:** CLAUDE.md references version 4.8.6 as the current API. The 4.8.3 file appears to be a previous version
kept for reference.

**Verification steps:**

1. Check which file `OmniFocus.d.ts` references
2. Search for any imports of the 4.8.3 file specifically
3. Confirm no code depends on 4.8.3-specific types

**Verification command:**

```bash
cat src/omnifocus/api/OmniFocus.d.ts | head -20
grep -r "OmniFocus-4.8.3" src/ --include="*.ts"
```

**Action:** Remove `src/omnifocus/api/OmniFocus-4.8.3-d.ts` if unused.

---

### 8. Unused perspectives.ts Script (253 lines)

**File:** `src/omnifocus/scripts/perspectives.ts`

**Potentially redundant with:**

- `src/omnifocus/scripts/perspectives/list-perspectives.ts`
- `src/omnifocus/scripts/perspectives/query-perspective.ts`

**Evidence:** The `perspectives/` subdirectory contains more up-to-date implementations. The root-level
`perspectives.ts` may be legacy code.

**Verification steps:**

1. Check imports of both files
2. Compare implementations for differences
3. Confirm the subdirectory versions are used by production tools

**Verification command:**

```bash
grep -r "from.*scripts/perspectives['\"]" src/ --include="*.ts"
grep -r "from.*perspectives/list\|from.*perspectives/query" src/ --include="*.ts"
```

**Action:** Remove root-level `perspectives.ts` if the subdirectory is authoritative.

---

## Medium-Priority Simplification Opportunities

### 9. Consolidate Barrel Exports

**File:** `src/contracts/index.ts`

After removing dead code above, audit and simplify the barrel exports to only include actively used modules.

---

### 10. ManageTaskTool Complexity (1,589 lines)

**File:** `src/tools/tasks/ManageTaskTool.ts`

**Refactoring opportunities:**

- Extract `sanitizeUpdates` method (~220 lines) to utility module
- Extract `handleBulkOperation` (~180 lines) to separate helper
- Move `normalizeRepeatRuleInput` and `convertToRepetitionRule` to dedicated repeat-rule utilities

**Note:** This is refactoring, not removal. Lower priority than dead code removal.

---

### 11. Response Contracts Audit

**File:** `src/contracts/responses.ts` (333 lines)

**Known used exports:**

- `isScriptError`
- `isTaskListOutput`
- `isProjectListOutput`
- `buildSuccessResponse`
- `buildErrorResponse`

**Potentially unused:**

- `TaskListScriptOutput`
- `ProjectListScriptOutput`
- `TaskOperationScriptOutput`
- `MCPToolResponse`
- `unwrapScriptOutput`

**Action:** Audit each export and remove unused ones.

---

## Summary Table

| Priority | Category           | Location                                | Lines    | Status               |
| -------- | ------------------ | --------------------------------------- | -------- | -------------------- |
| High     | Plugin System      | `src/omnifocus/plugins/`                | 188      | Pending verification |
| High     | Legacy Generator   | `src/contracts/generator.ts`            | 281      | Pending verification |
| High     | Migration Example  | `src/contracts/examples/`               | 182      | Pending verification |
| High     | Insights Module    | `src/contracts/ast/insights/`           | ~350     | Pending verification |
| High     | Unused API Types   | `src/omnifocus/api/api-types.ts`        | 57       | Pending verification |
| High     | Branded Functions  | `src/utils/branded-types.ts`            | ~90      | Pending verification |
| High     | Duplicate Types    | `OmniFocus-4.8.3-d.ts`                  | 2,224    | Pending verification |
| High     | Perspectives.ts    | `src/omnifocus/scripts/perspectives.ts` | 253      | Pending verification |
| Medium   | Barrel Exports     | `src/contracts/index.ts`                | TBD      | After removals       |
| Medium   | ManageTaskTool     | `src/tools/tasks/ManageTaskTool.ts`     | refactor | Optional             |
| Medium   | Response Contracts | `src/contracts/responses.ts`            | TBD      | After removals       |

**Estimated total removable: ~3,600+ lines**

---

## Implementation Plan

### Phase 1: Verification (Required)

Run all verification commands above and document which items are confirmed safe to remove.

### Phase 2: Removal (After verification)

1. **Commit checkpoint** - Ensure clean git state
2. **Remove in order:**
   - Entire directories first (plugins, examples, insights)
   - Individual files second (generator.ts, api-types.ts, perspectives.ts, OmniFocus-4.8.3-d.ts)
   - Partial file edits last (branded-types.ts, index.ts, responses.ts)
3. **After each removal:**
   - Run `bun run build` to verify compilation
   - Run `npm run test:unit` to verify tests pass
4. **Final verification:**
   - Run `npm run test:integration` to verify production functionality

### Phase 3: Cleanup

- Update any documentation referencing removed files
- Archive removed code to omnifocus-mcp-archive repo if historically significant

---

## Notes

- The Unified API (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`) uses AST-based builders
  exclusively
- Legacy string-based generators were superseded but never removed
- Some "unused" code may be referenced only in tests - verify test files too
