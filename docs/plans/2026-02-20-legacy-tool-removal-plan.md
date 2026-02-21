# Legacy Tool Layer Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate 17 legacy tool classes, consolidating all logic into the 3 unified tools + AST builders.

**Architecture:** Vertical slices — one entity type at a time, each phase independently testable and committable. The
unified tools (`OmniFocusReadTool`, `OmniFocusWriteTool`, `OmniFocusAnalyzeTool`) become the only tool layer. Legacy
tool classes are deleted; their logic is either inlined or replaced by AST builders.

**Tech Stack:** TypeScript, Zod, Vitest, JXA/OmniJS scripts, AST builder pipeline (`src/contracts/ast/`)

**Key docs:**

- Design: `docs/plans/2026-02-20-legacy-tool-removal-design.md`
- AST patterns: `docs/dev/ARCHITECTURE.md`
- Process: `.claude/processes/CLAUDE-PROCESSES.dot`

---

## Pre-flight

Before starting any task, verify the baseline:

```bash
npm run build && npm run test:unit
```

Expected: 1580+ tests passing. If not, fix first.

---

## Task 1: Extract ManageTaskTool utilities into shared modules

ManageTaskTool (1590 lines) contains reusable logic that OmniFocusWriteTool will need after inlining. Extract these as
pure functions BEFORE deleting the class.

**Files:**

- Create: `src/tools/unified/utils/task-sanitizer.ts`
- Create: `src/tools/unified/utils/repeat-rule-normalizer.ts`
- Test: `tests/unit/tools/unified/utils/task-sanitizer.test.ts`
- Test: `tests/unit/tools/unified/utils/repeat-rule-normalizer.test.ts`
- Read: `src/tools/tasks/ManageTaskTool.ts:997-1218` (sanitizeUpdates)
- Read: `src/tools/tasks/ManageTaskTool.ts:1259-1389` (repeat rule methods)

**Step 1: Write failing tests for sanitizeUpdates**

Extract test cases from ManageTaskTool behavior. The function takes a raw `Record<string, unknown>` and returns a
sanitized version with:

- String coercion for booleans (`"true"` → `true`)
- Date conversion via `localToUTC()`
- Clear-field flags (`clearDueDate` → `dueDate: null`)
- Tag array filtering
- Project field mapping (`projectId` → `project`)

```typescript
// tests/unit/tools/unified/utils/task-sanitizer.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeTaskUpdates } from '../../../../src/tools/unified/utils/task-sanitizer.js';

describe('sanitizeTaskUpdates', () => {
  it('passes through string name', () => {
    expect(sanitizeTaskUpdates({ name: 'Test' })).toEqual({ name: 'Test' });
  });

  it('coerces string flagged to boolean', () => {
    expect(sanitizeTaskUpdates({ flagged: 'true' })).toEqual({ flagged: true });
  });

  it('converts dueDate via localToUTC', () => {
    const result = sanitizeTaskUpdates({ dueDate: '2026-03-01' });
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}/); // UTC date
  });

  it('clearDueDate sets dueDate to null', () => {
    expect(sanitizeTaskUpdates({ clearDueDate: true })).toEqual({ dueDate: null });
  });

  it('maps projectId to project', () => {
    expect(sanitizeTaskUpdates({ projectId: 'abc123' })).toEqual({ project: 'abc123' });
  });

  it('maps project field through', () => {
    expect(sanitizeTaskUpdates({ project: 'abc123' })).toEqual({ project: 'abc123' });
  });

  it('filters non-string tags', () => {
    expect(sanitizeTaskUpdates({ tags: ['valid', 123, null] })).toEqual({ tags: ['valid'] });
  });

  it('returns empty object for no valid updates', () => {
    expect(sanitizeTaskUpdates({})).toEqual({});
  });

  it('handles clearEstimatedMinutes', () => {
    expect(sanitizeTaskUpdates({ clearEstimatedMinutes: true })).toEqual({ estimatedMinutes: null });
  });

  it('coerces string estimatedMinutes to number', () => {
    expect(sanitizeTaskUpdates({ estimatedMinutes: '30' })).toEqual({ estimatedMinutes: 30 });
  });

  it('passes through repetitionRule object', () => {
    const rule = { frequency: 'weekly', interval: 1 };
    expect(sanitizeTaskUpdates({ repetitionRule: rule })).toEqual({ repetitionRule: rule });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest tests/unit/tools/unified/utils/task-sanitizer.test.ts --run
```

Expected: FAIL — module not found.

**Step 3: Implement sanitizeTaskUpdates**

Extract `ManageTaskTool.sanitizeUpdates()` (lines 997-1218) as a pure function. Remove `this.logger` calls (use the
`createLogger` utility instead). The function signature:

```typescript
// src/tools/unified/utils/task-sanitizer.ts
import { localToUTC } from '../../../utils/timezone.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('task-sanitizer');

/**
 * Sanitize raw task update parameters into a clean object for the AST mutation builder.
 * Handles MCP bridge string coercion, date conversion, clear-field flags, and field mapping.
 */
export function sanitizeTaskUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  // Copy the full sanitizeUpdates method body from ManageTaskTool.ts:997-1218
  // Replace this.logger with logger
  // Return sanitized object
}
```

Copy the method body from `ManageTaskTool.ts:997-1218`, replacing `this.logger` with `logger`.

**Step 4: Run tests to verify they pass**

```bash
npx vitest tests/unit/tools/unified/utils/task-sanitizer.test.ts --run
```

Expected: PASS

**Step 5: Write failing tests for repeat rule normalization**

```typescript
// tests/unit/tools/unified/utils/repeat-rule-normalizer.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeRepeatRuleInput,
  convertToRepetitionRule,
} from '../../../../src/tools/unified/utils/repeat-rule-normalizer.js';

describe('normalizeRepeatRuleInput', () => {
  it('normalizes a valid repeat rule', () => {
    const result = normalizeRepeatRuleInput({ unit: 'week', steps: 2, method: 'fixed' });
    expect(result).toEqual({ unit: 'week', steps: 2, method: 'fixed' });
  });

  it('returns undefined for null input', () => {
    expect(normalizeRepeatRuleInput(null)).toBeUndefined();
  });

  it('defaults steps to 1', () => {
    const result = normalizeRepeatRuleInput({ unit: 'day' });
    expect(result?.steps).toBe(1);
  });
});

describe('convertToRepetitionRule', () => {
  it('converts day unit to daily frequency', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'fixed' });
    expect(result?.frequency).toBe('daily');
  });

  it('converts week unit to weekly frequency', () => {
    const result = convertToRepetitionRule({ unit: 'week', steps: 2, method: 'fixed' });
    expect(result?.frequency).toBe('weekly');
    expect(result?.interval).toBe(2);
  });

  it('maps start-after-completion to defer-after-completion', () => {
    const result = convertToRepetitionRule({ unit: 'day', steps: 1, method: 'start-after-completion' });
    expect(result?.method).toBe('defer-after-completion');
    expect(result?.scheduleType).toBe('from-completion');
  });
});
```

**Step 6: Implement repeat rule normalizer**

```typescript
// src/tools/unified/utils/repeat-rule-normalizer.ts
// Extract normalizeRepeatRuleInput (lines 1276-1327) and convertToRepetitionRule (lines 1337-1389)
// from ManageTaskTool.ts as pure exported functions.
// Also extract normalizeRepeatMethod (lines 1259-1274).
```

**Step 7: Run all tests**

```bash
npx vitest tests/unit/tools/unified/utils/ --run
```

Expected: All PASS

**Step 8: Commit**

```bash
git add src/tools/unified/utils/ tests/unit/tools/unified/utils/
git commit -m "refactor: extract task-sanitizer and repeat-rule-normalizer utilities"
```

---

## Task 2: Inline ManageTaskTool into OmniFocusWriteTool

Replace ManageTaskTool delegation with direct execution in OmniFocusWriteTool. The unified tool already validates via
WriteSchema, so ManageTaskTool's Zod schema is redundant.

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Delete: `src/tools/tasks/ManageTaskTool.ts`
- Delete: `src/tools/tasks/QueryTasksTool.ts` (dead code — tasks already use AST path directly)
- Migrate: `tests/unit/tools/tasks/manage-task-errors.test.ts` → `tests/unit/tools/unified/OmniFocusWriteTool.test.ts`
- Migrate: `tests/unit/tools/tasks/manage-task-branded-types.test.ts` → same
- Delete: `tests/unit/tools/tasks/QueryTasksToolV2.test.ts`

**Step 1: Write integration tests for task operations through WriteTool**

Add tests to `tests/unit/tools/unified/OmniFocusWriteTool.test.ts` that cover:

- Task create (validates sanitization, date conversion, cache invalidation)
- Task update (validates sanitizeTaskUpdates is called, v3 envelope unwrapping)
- Task complete (validates COMPLETE_TASK_SCRIPT usage, cache invalidation)
- Task delete (validates DELETE_TASK_SCRIPT usage, cache invalidation)
- Bulk delete (validates BULK_DELETE_TASKS_SCRIPT usage)
- Error cases (missing taskId, script errors, v3 error envelopes)

Mock `execJson` on the tool's `omniAutomation` to return test data.

**Step 2: Run tests — they should pass against current delegation**

```bash
npx vitest tests/unit/tools/unified/OmniFocusWriteTool.test.ts --run
```

**Step 3: Replace routeToManageTask with direct implementation**

In `OmniFocusWriteTool.ts`:

1. Remove `import { ManageTaskTool }` and `private manageTaskTool` field
2. Add imports for utilities:
   ```typescript
   import { sanitizeTaskUpdates } from './utils/task-sanitizer.js';
   import { normalizeRepeatRuleInput, convertToRepetitionRule } from './utils/repeat-rule-normalizer.js';
   import { localToUTC } from '../../utils/timezone.js';
   import { buildCreateTaskScript, buildUpdateTaskScript } from '../../contracts/ast/mutation-script-builder.js';
   import {
     COMPLETE_TASK_SCRIPT,
     DELETE_TASK_SCRIPT,
     BULK_DELETE_TASKS_SCRIPT,
     buildBulkCompleteTasksScript,
     buildListTasksScriptV4,
   } from '../../omnifocus/scripts/tasks.js';
   ```
3. Replace `routeToManageTask()` with operation-specific private methods:
   - `handleTaskCreate(compiled)` — adapted from ManageTaskTool case 'create' (lines 331-589)
   - `handleTaskUpdate(compiled)` — adapted from ManageTaskTool case 'update' (lines 592-757)
   - `handleTaskComplete(compiled)` — adapted from ManageTaskTool case 'complete' (lines 760-854)
   - `handleTaskDelete(compiled)` — adapted from ManageTaskTool case 'delete' (lines 857-949)
4. Replace `routeToBulkDelete()` with direct bulk script execution (adapted from ManageTaskTool lines 1391-1584)
5. Use `sanitizeTaskUpdates()` in `handleTaskUpdate()` instead of the inline method
6. Use `normalizeRepeatRuleInput()` and `convertToRepetitionRule()` in `handleTaskCreate()` instead of inline methods

**Key behavior to preserve:**

- v3 envelope unwrapping: `if (envelope.ok === true && envelope.v === '3')` pattern
- Smart cache invalidation: `this.cache.invalidateForTaskChange(...)` after each operation
- `formatForCLI()` — only active when `MCP_CLI_TESTING` env var is set (can be dropped if not needed)
- Repeat rule application post-creation (create task, then apply repeat rule via update)

**Step 4: Run tests**

```bash
npx vitest tests/unit/tools/unified/OmniFocusWriteTool.test.ts --run
```

**Step 5: Delete ManageTaskTool and QueryTasksTool**

```bash
rm src/tools/tasks/ManageTaskTool.ts src/tools/tasks/QueryTasksTool.ts
```

Remove any imports of these in `src/tools/` (check with grep). Delete their test files:

```bash
rm tests/unit/tools/tasks/manage-task-errors.test.ts
rm tests/unit/tools/tasks/manage-task-branded-types.test.ts
rm tests/unit/tools/tasks/manage-task-project-mapping-simple.test.ts
rm tests/unit/tools/tasks/QueryTasksToolV2.test.ts
```

**Step 6: Run full test suite**

```bash
npm run build && npm run test:unit
```

Expected: All tests pass. Test count may decrease (deleted legacy tests) but no failures.

**Step 7: Commit**

```bash
git add -A && git commit -m "refactor: inline ManageTaskTool into OmniFocusWriteTool

Delete ManageTaskTool and QueryTasksTool. Task CRUD operations
now execute directly in OmniFocusWriteTool using AST builders
and extracted utility functions."
```

---

## Task 3: Inline ProjectsTool into unified tools

ProjectsTool is used by both ReadTool (list/query) and WriteTool (create/complete/delete). Project updates already
bypass it (direct AST path in WriteTool).

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts`
- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Delete: `src/tools/projects/ProjectsTool.ts`
- Migrate/Delete: `tests/unit/tools/projects/ProjectsToolV2.test.ts`

**Step 1: Write tests for project query through ReadTool**

Test that `routeToProjectsTool()` returns project data with correct fields, stats, filtering.

**Step 2: Replace ReadTool.routeToProjectsTool with direct AST execution**

The AST builder `buildFilteredProjectsScript()` already exists in `script-builder.ts`. ReadTool needs to:

1. Build filter from compiled query (status, folder, tags, search)
2. Call `buildFilteredProjectsScript(filter, { fields, limit, offset, includeStats })`
3. Execute script via `this.execJson()`
4. Apply `projectFieldsOnResult()` for field projection
5. Return formatted response

For the stats aggregation that ProjectsTool does internally: check if `buildFilteredProjectsScript` already supports
`includeStats`. If not, inline the logic.

**Step 3: Replace WriteTool.routeToProjectsTool with direct AST execution**

WriteTool already handles project updates directly. For create/complete/delete:

1. Use `buildCreateProjectScript()` for create
2. Use `buildCompleteScript('project', id)` for complete
3. Use `buildDeleteScript('project', id)` for delete

These are already in `mutation-script-builder.ts`.

**Step 4: Delete ProjectsTool**

```bash
rm src/tools/projects/ProjectsTool.ts
rm tests/unit/tools/projects/ProjectsToolV2.test.ts
```

**Step 5: Build and test**

```bash
npm run build && npm run test:unit
```

**Step 6: Commit**

```bash
git commit -m "refactor: inline ProjectsTool into unified read/write tools"
```

---

## Task 4: Inline ExportTool into OmniFocusReadTool

ExportTool already uses AST builder for task export. Project export uses `EXPORT_PROJECTS_SCRIPT`.

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts`
- Delete: `src/tools/export/ExportTool.ts`
- Migrate/Delete: `tests/unit/tools/export/export-tool.test.ts`

**Step 1: Replace routeToExportTool with direct execution**

1. For task export: call `buildExportTasksScript()` directly (already in `script-builder.ts`)
2. For project export: import and use `EXPORT_PROJECTS_SCRIPT` directly
3. For "all" export: combine both
4. Handle format conversion (JSON/CSV/markdown) — check if ExportTool does this or if the script handles it

**Step 2: Delete ExportTool, build and test**

```bash
rm src/tools/export/ExportTool.ts
rm tests/unit/tools/export/export-tool.test.ts
npm run build && npm run test:unit
```

**Step 3: Commit**

```bash
git commit -m "refactor: inline ExportTool into OmniFocusReadTool"
```

---

## Task 5: Inline BatchCreateTool into OmniFocusWriteTool

BatchCreateTool owns `TempIdResolver` and `DependencyGraph` — these are separate files that stay. The tool class itself
orchestrates the batch flow.

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Delete: `src/tools/batch/BatchCreateTool.ts`
- Keep: `src/tools/batch/tempid-resolver.ts` (move to `src/tools/unified/utils/`)
- Keep: `src/tools/batch/dependency-graph.ts` (move to `src/tools/unified/utils/`)
- Keep: `src/tools/batch/batch-schemas.ts` (move to `src/tools/unified/schemas/`)
- Migrate/Delete: `tests/unit/tools/batch/batch-create-project-field.test.ts`

**Step 1: Move batch utilities to unified directory**

```bash
mv src/tools/batch/tempid-resolver.ts src/tools/unified/utils/tempid-resolver.ts
mv src/tools/batch/dependency-graph.ts src/tools/unified/utils/dependency-graph.ts
mv src/tools/batch/batch-schemas.ts src/tools/unified/schemas/batch-schemas.ts
```

Update all imports. Run tests to verify nothing breaks.

**Step 2: Inline BatchCreateTool.executeValidated into WriteTool.routeToBatch**

The current `routeToBatch()` in WriteTool already does most of the orchestration for mixed batch operations. For
create-only batches, it delegates to `BatchCreateTool.execute()`. Replace that delegation with inline logic from
`BatchCreateTool.executeValidated()` (lines 68-210).

Key logic to preserve:

- `DependencyGraph` for validation and ordering
- `TempIdResolver` for tempId → realId mapping
- `markProjectAsValidated()` / `markTaskAsValidated()` for sandbox cache
- Atomic rollback via `buildDeleteScript()`
- Smart cache invalidation

**Step 3: Delete BatchCreateTool**

```bash
rm src/tools/batch/BatchCreateTool.ts
```

If `src/tools/batch/` is now empty, remove the directory.

**Step 4: Build and test**

```bash
npm run build && npm run test:unit
```

**Step 5: Commit**

```bash
git commit -m "refactor: inline BatchCreateTool into OmniFocusWriteTool

Move TempIdResolver and DependencyGraph to src/tools/unified/utils/.
Batch operations now execute directly in WriteTool."
```

---

## Task 6: Inline analytics tools into OmniFocusAnalyzeTool

8 analytics tools to inline. Each follows the same pattern: validate → build script → execute → format response. Keep
the hardcoded scripts (irreducible computation).

**Files:**

- Modify: `src/tools/unified/OmniFocusAnalyzeTool.ts`
- Delete: `src/tools/analytics/ProductivityStatsTool.ts`
- Delete: `src/tools/analytics/TaskVelocityTool.ts`
- Delete: `src/tools/analytics/OverdueAnalysisTool.ts`
- Delete: `src/tools/analytics/PatternAnalysisTool.ts`
- Delete: `src/tools/analytics/WorkflowAnalysisTool.ts`
- Delete: `src/tools/recurring/RecurringTasksTool.ts`
- Delete: `src/tools/capture/ParseMeetingNotesTool.ts`
- Delete: `src/tools/reviews/ManageReviewsTool.ts`
- Migrate: relevant test cases from `tests/unit/tools/analytics/*.test.ts`

**Step 1: Write tests for analytics operations through AnalyzeTool**

For each of the 8 analysis types, test that the unified tool:

- Builds the correct script with parameters
- Handles cache hits
- Handles script errors
- Returns properly formatted response

**Step 2: Inline each analytics tool as a private method**

For each tool, the pattern is:

```typescript
// In OmniFocusAnalyzeTool:
import { PRODUCTIVITY_STATS_SCRIPT_V3 } from '../../omnifocus/scripts/analytics/productivity-stats-v3.js';
// ... import all 8 scripts ...

private async executeProductivityStats(compiled: Extract<CompiledAnalysis, { type: 'productivity_stats' }>): Promise<unknown> {
  // Copy the core logic from ProductivityStatsTool.executeValidated()
  // Replace this.productivityTool.execute() call in routeToProductivityStats()
  // Use this.cache, this.execJson, this.omniAutomation directly
}
```

Repeat for all 8 types. The script import, cache logic, error handling, and response formatting all come from the legacy
tool.

**Key logic to preserve per tool:**

- **ProductivityStatsTool**: Cache key generation, v3 envelope unwrapping, `extractKeyFindings()`
- **TaskVelocityTool**: Date range calculation, groupBy mapping
- **OverdueAnalysisTool**: Tag/project scope filtering
- **PatternAnalysisTool**: Pattern type mapping (`insights` → `patterns`)
- **WorkflowAnalysisTool**: Script error structured response
- **RecurringTasksTool**: Operation/sortBy parameter mapping
- **ParseMeetingNotesTool**: `input`/`extractMode` parameter mapping
- **ManageReviewsTool**: Operation default (`list_for_review`)

**Step 3: Update route methods to call inline methods**

Replace each `return this.xxxTool.execute(args)` with `return this.executeXxx(compiled)`.

**Step 4: Delete all 8 legacy analytics tool files**

```bash
rm src/tools/analytics/ProductivityStatsTool.ts
rm src/tools/analytics/TaskVelocityTool.ts
rm src/tools/analytics/OverdueAnalysisTool.ts
rm src/tools/analytics/PatternAnalysisTool.ts
rm src/tools/analytics/WorkflowAnalysisTool.ts
rm src/tools/recurring/RecurringTasksTool.ts
rm src/tools/capture/ParseMeetingNotesTool.ts
rm src/tools/reviews/ManageReviewsTool.ts
```

Delete their test files (after migrating relevant cases):

```bash
rm tests/unit/tools/analytics/productivity-stats-tool.test.ts
rm tests/unit/tools/analytics/task-velocity-tool.test.ts
rm tests/unit/tools/analytics/overdue-analysis-tool.test.ts
rm tests/unit/tools/analytics/workflow-analysis-tool.test.ts
rm tests/unit/tools/capture/parse-meeting-notes.test.ts
rm tests/unit/tools/reviews/manage-reviews.test.ts
```

Note: Keep `tests/unit/tools/analytics/workflow-analysis-tool.test.ts` tests that verify script source code (the
`task.inInbox` and `!completed` guard assertions). Migrate these to the unified test file.

**Step 5: Build and test**

```bash
npm run build && npm run test:unit
```

**Step 6: Commit**

```bash
git commit -m "refactor: inline 8 analytics tools into OmniFocusAnalyzeTool

Delete ProductivityStatsTool, TaskVelocityTool, OverdueAnalysisTool,
PatternAnalysisTool, WorkflowAnalysisTool, RecurringTasksTool,
ParseMeetingNotesTool, ManageReviewsTool. Analytics scripts stay
(irreducible computation)."
```

---

## Task 7: Inline FoldersTool and convert folder scripts to AST

FoldersTool uses 5 legacy scripts. Create AST builders for folder operations.

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts`
- Modify: `src/tools/unified/OmniFocusWriteTool.ts` (if folder mutations via write tool)
- Modify: `src/contracts/ast/script-builder.ts` (add folder query builder)
- Modify: `src/contracts/ast/mutation-script-builder.ts` (add folder mutations)
- Delete: `src/tools/folders/FoldersTool.ts`
- Delete: `src/omnifocus/scripts/folders/*.ts` (after AST replacement)
- Create: `tests/unit/contracts/ast/folder-builders.test.ts`

**Step 1: Write failing tests for buildFilteredFoldersScript**

```typescript
// tests/unit/contracts/ast/folder-builders.test.ts
import { describe, it, expect } from 'vitest';
import { buildFilteredFoldersScript } from '../../../../src/contracts/ast/script-builder.js';

describe('buildFilteredFoldersScript', () => {
  it('generates script that lists all folders', () => {
    const script = buildFilteredFoldersScript({});
    expect(script).toContain('flattenedFolders');
    expect(script).toContain('JSON.stringify');
  });

  it('includes hierarchy fields (parent, path)', () => {
    const script = buildFilteredFoldersScript({ includeHierarchy: true });
    expect(script).toContain('parent');
  });
});
```

**Step 2: Implement buildFilteredFoldersScript**

Follow the pattern of `buildFilteredProjectsScript()`. Folders in OmniJS:

- `flattenedFolders` — all folders flattened
- Properties: `name`, `id.primaryKey`, `parent` (parent folder), `status`

```typescript
// In src/contracts/ast/script-builder.ts
export function buildFilteredFoldersScript(options: { includeHierarchy?: boolean; limit?: number }): string {
  // Build OmniJS script that iterates flattenedFolders,
  // projects fields (id, name, parent path), and returns JSON
}
```

**Step 3: Implement folder mutation builders**

For create/update/delete/move operations, add functions to `mutation-script-builder.ts`:

```typescript
export function buildCreateFolderScript(data: { name: string; parent?: string }): GeneratedMutationScript;
export function buildUpdateFolderScript(id: string, changes: { name?: string }): GeneratedMutationScript;
export function buildDeleteFolderScript(id: string): GeneratedMutationScript;
export function buildMoveFolderScript(id: string, newParentId: string): GeneratedMutationScript;
```

Adapt the JXA patterns from the existing folder scripts in `src/omnifocus/scripts/folders/`.

**Step 4: Replace ReadTool.routeToFoldersTool with AST call**

**Step 5: Add folder mutation support to WriteTool if needed**

Currently the unified API doesn't expose folder mutations via `omnifocus_write`. Check if the write schema needs
updating or if this is read-only.

**Step 6: Delete FoldersTool and legacy scripts**

```bash
rm src/tools/folders/FoldersTool.ts
rm src/omnifocus/scripts/folders/list-folders-v3.ts
rm src/omnifocus/scripts/folders/create-folder.ts
rm src/omnifocus/scripts/folders/update-folder.ts
rm src/omnifocus/scripts/folders/delete-folder.ts
rm src/omnifocus/scripts/folders/move-folder.ts
```

**Step 7: Build and test**

```bash
npm run build && npm run test:unit
```

**Step 8: Commit**

```bash
git commit -m "refactor: replace FoldersTool with AST-generated folder scripts"
```

---

## Task 8: Inline TagsTool into unified tools

TagsTool already has AST builders for list operations (`buildTagsScript`, `buildActiveTagsScript` from
`tag-script-builder.ts`). Tag management uses `MANAGE_TAGS_SCRIPT`.

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts`
- Modify: `src/tools/unified/OmniFocusWriteTool.ts`
- Delete: `src/tools/tags/TagsTool.ts`

**Step 1: Replace ReadTool.routeToTagsTool with direct AST call**

```typescript
private async routeToTagsTool(compiled: CompiledQuery): Promise<unknown> {
  const timer = new OperationTimerV2();
  const script = buildTagsScript(/* options from compiled */);
  const result = await this.execJson(script);
  // Format response
}
```

The AST tag builders already exist in `src/contracts/ast/tag-script-builder.ts`.

**Step 2: Replace WriteTool.routeToTagsTool with direct script execution**

For tag management (create/rename/delete/merge/nest/unnest/reparent), use `MANAGE_TAGS_SCRIPT` directly:

```typescript
private async handleTagManage(compiled): Promise<unknown> {
  const script = this.omniAutomation.buildScript(MANAGE_TAGS_SCRIPT, {
    action: compiled.action,
    tagName: compiled.tagName,
    // ... other params
  });
  return this.execJson(script);
}
```

**Step 3: Delete TagsTool**

```bash
rm src/tools/tags/TagsTool.ts
```

**Step 4: Build and test**

```bash
npm run build && npm run test:unit
```

**Step 5: Commit**

```bash
git commit -m "refactor: inline TagsTool into unified read/write tools"
```

---

## Task 9: Inline PerspectivesTool into OmniFocusReadTool

PerspectivesTool uses 2 legacy scripts: `LIST_PERSPECTIVES_SCRIPT` and `QUERY_PERSPECTIVE_SCRIPT`. Create AST builders
for these.

**Files:**

- Modify: `src/tools/unified/OmniFocusReadTool.ts`
- Modify: `src/contracts/ast/script-builder.ts` (add perspective builders)
- Delete: `src/tools/perspectives/PerspectivesTool.ts`
- Delete: `src/omnifocus/scripts/perspectives/list-perspectives.ts`
- Delete: `src/omnifocus/scripts/perspectives/query-perspective.ts`
- Create: `tests/unit/contracts/ast/perspective-builders.test.ts`

**Step 1: Write failing tests for buildFilteredPerspectivesScript**

```typescript
describe('buildFilteredPerspectivesScript', () => {
  it('generates script that lists perspectives', () => {
    const script = buildFilteredPerspectivesScript({});
    expect(script).toContain('Perspective.all');
    expect(script).toContain('JSON.stringify');
  });

  it('includes filter rules when requested', () => {
    const script = buildFilteredPerspectivesScript({ includeFilterRules: true });
    expect(script).toContain('filterRules');
  });
});
```

**Step 2: Implement perspective AST builder**

Perspectives in OmniJS:

- `Perspective.all` — all perspectives
- Properties: `name`, `id.primaryKey`, builtIn (Boolean)
- Custom perspectives have `fileOrder` and filter configuration

```typescript
export function buildFilteredPerspectivesScript(options: { includeFilterRules?: boolean; limit?: number }): string;
```

**Step 3: Replace routeToPerspectivesTool with AST call**

**Step 4: Delete PerspectivesTool and legacy scripts**

**Step 5: Build and test**

```bash
npm run build && npm run test:unit
```

**Step 6: Commit**

```bash
git commit -m "refactor: replace PerspectivesTool with AST-generated perspective scripts"
```

---

## Task 10: Cleanup and verification

Final cleanup after all legacy tools are removed.

**Files:**

- Modify: `src/tools/base.ts` (remove any legacy-only methods if unused)
- Delete: Empty directories under `src/tools/` (analytics/, batch/, capture/, export/, folders/, perspectives/,
  projects/, recurring/, reviews/, tags/, tasks/)
- Modify: `CLAUDE.md` (update architecture notes)
- Modify: `package.json` (bump to 4.0.0 — this IS a breaking internal change)

**Step 0: Remove dead `repeatRule` code**

The legacy `repeatRule` format (with `unit`, `steps`, `method`) is no longer reachable through the unified WriteSchema,
which only exposes `repetitionRule`. Clean up:

- Delete `convertToRepetitionRule()` from `src/tools/unified/utils/repeat-rule-normalizer.ts` (dead export, zero
  callers)
- Remove the `repeatRule` branch from `sanitizeTaskUpdates()` in `src/tools/unified/utils/task-sanitizer.ts`
- Remove `normalizeRepeatRuleInput()` if no longer called after the above cleanup
- Update tests accordingly
- Downgrade `logger.info` to `logger.debug` in `task-sanitizer.ts` for per-field processing messages

**Step 1: Verify no remaining references to deleted files**

```bash
grep -r "ManageTaskTool\|QueryTasksTool\|ProjectsTool\|ExportTool\|BatchCreateTool\|ProductivityStatsTool\|TaskVelocityTool\|OverdueAnalysisTool\|PatternAnalysisTool\|WorkflowAnalysisTool\|RecurringTasksTool\|ParseMeetingNotesTool\|ManageReviewsTool\|TagsTool\|PerspectivesTool\|FoldersTool" src/ tests/ --include="*.ts" -l
```

Expected: No results (or only the design doc / plan doc).

**Step 2: Remove empty directories**

```bash
find src/tools -type d -empty -delete
```

**Step 3: Run full test suite**

```bash
npm run build && npm run test:unit
```

Expected: All tests pass. Test count should be close to 1580 (some legacy tests deleted, some migrated).

**Step 4: Run integration tests**

```bash
npm run test:integration
```

Expected: All integration tests pass (they test MCP behavior, not internal tool classes).

**Step 5: Update CLAUDE.md**

Update the project structure and key files sections to reflect the new architecture. Remove references to legacy tool
classes.

**Step 6: Commit and tag**

```bash
git add -A && git commit -m "refactor: complete legacy tool layer removal

17 legacy tool classes eliminated. All operations now flow through
the unified API (omnifocus_read, omnifocus_write, omnifocus_analyze)
directly to AST builders or script execution. No intermediary classes."
```

---

## Summary

| Task | Phase             | Deletes                                    | Creates                  | Risk              |
| ---- | ----------------- | ------------------------------------------ | ------------------------ | ----------------- |
| 1    | Extract utilities | 0 classes                                  | 2 utility modules        | Low               |
| 2    | Tasks             | 2 classes (ManageTaskTool, QueryTasksTool) | Inline in WriteTool      | High (1590 LOC)   |
| 3    | Projects          | 1 class (ProjectsTool)                     | Inline in Read+WriteTool | Medium            |
| 4    | Export            | 1 class (ExportTool)                       | Inline in ReadTool       | Low               |
| 5    | Batch             | 1 class (BatchCreateTool)                  | Inline + move utilities  | Medium            |
| 6    | Analytics         | 8 classes                                  | Inline in AnalyzeTool    | Low (mechanical)  |
| 7    | Folders           | 1 class + 5 scripts                        | New AST builders         | High (new code)   |
| 8    | Tags              | 1 class                                    | Inline (AST exists)      | Low               |
| 9    | Perspectives      | 1 class + 2 scripts                        | New AST builder          | Medium (new code) |
| 10   | Cleanup           | Empty dirs                                 | Updated docs             | Low               |
