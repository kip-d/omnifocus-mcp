# Call Graph: Unified API → Backend Tools

**Purpose:** Document the routing from unified API operations to backend tools.

**Date Created:** 2025-11-06

## Overview

The unified API consists of 3 main tools that route to 15+ backend tools:

- **omnifocus_read** → Routes to 5 backend tools (tasks, projects, tags, perspectives, folders)
- **omnifocus_write** → Routes to 2 backend tools (manage_task, batch_create)
- **omnifocus_analyze** → Routes to 8 backend tools (analytics, recurring, capture, reviews)

---

## omnifocus_read Routes

Routes to backend tools based on `query.type`:

| Query Type | Backend Tool | Implementation File | Routing Method |
|------------|--------------|---------------------|----------------|
| tasks | QueryTasksTool | src/tools/tasks/QueryTasksTool.ts | routeToTasksTool() |
| projects | ProjectsTool | src/tools/projects/ProjectsTool.ts | routeToProjectsTool() |
| tags | TagsTool | src/tools/tags/TagsTool.ts | routeToTagsTool() |
| perspectives | PerspectivesTool | src/tools/perspectives/PerspectivesTool.ts | routeToPerspectivesTool() |
| folders | FoldersTool | src/tools/folders/FoldersTool.ts | routeToFoldersTool() |

### Routing Logic Notes

**Tasks Routing:**
- `project: null` → maps to `mode: 'inbox'` in QueryTasksTool
- Uses advanced filters for complex queries (flagged, blocked, date ranges, logic operators)
- Maps builder filters to existing QueryTasksTool parameters

**Projects Routing:**
- Maps to `operation: 'list'` in ProjectsTool
- Handles `includeCompleted`, `folder`, and `tags` filters

**Tags/Perspectives/Folders Routing:**
- Simple routing to `operation: 'list'` for each tool
- No complex filter mapping required

---

## omnifocus_write Routes

Routes to backend tools based on `mutation.operation`:

| Operation | Target | Backend Tool | Implementation File | Routing Method |
|-----------|--------|--------------|---------------------|----------------|
| create | task/project | ManageTaskTool | src/tools/tasks/ManageTaskTool.ts | routeToManageTask() |
| update | task/project | ManageTaskTool | src/tools/tasks/ManageTaskTool.ts | routeToManageTask() |
| complete | task/project | ManageTaskTool | src/tools/tasks/ManageTaskTool.ts | routeToManageTask() |
| delete | task/project | ManageTaskTool | src/tools/tasks/ManageTaskTool.ts | routeToManageTask() |
| batch | task/project | BatchCreateTool | src/tools/batch/BatchCreateTool.ts | routeToBatch() |

### Routing Logic Notes

**ManageTask Routing (create/update/complete/delete):**
- Direct parameter pass-through: spreads `data` or `changes` fields
- Maps `id` to `taskId` for tasks (Note: projects don't use projectId in ManageTaskTool)
- Tags, dates, and other fields passed directly to backend tool

**Batch Routing:**
- Filters operations to include only `create` operations (batch update not supported yet)
- Auto-generates `tempId` if not provided: `auto_temp_${counter}`
- Maps builder format to existing BatchCreateTool format
- Default parameters: `createSequentially: true`, `returnMapping: true`, `stopOnError: true`

---

## omnifocus_analyze Routes

Routes to backend tools based on `analysis.type`:

| Analysis Type | Backend Tool | Implementation File | Routing Method |
|---------------|--------------|---------------------|----------------|
| productivity_stats | ProductivityStatsTool | src/tools/analytics/ProductivityStatsTool.ts | routeToProductivityStats() |
| task_velocity | TaskVelocityTool | src/tools/analytics/TaskVelocityTool.ts | routeToVelocity() |
| overdue_analysis | OverdueAnalysisTool | src/tools/analytics/OverdueAnalysisTool.ts | routeToOverdue() |
| pattern_analysis | PatternAnalysisTool | src/tools/analytics/PatternAnalysisTool.ts | routeToPattern() |
| workflow_analysis | WorkflowAnalysisTool | src/tools/analytics/WorkflowAnalysisTool.ts | routeToWorkflow() |
| recurring_tasks | RecurringTasksTool | src/tools/recurring/RecurringTasksTool.ts | routeToRecurring() |
| parse_meeting_notes | ParseMeetingNotesTool | src/tools/capture/ParseMeetingNotesTool.ts | routeToMeetingNotes() |
| manage_reviews | ManageReviewsTool | src/tools/reviews/ManageReviewsTool.ts | routeToReviews() |

### Routing Logic Notes

**ProductivityStats Routing:**
- Maps `params.groupBy` → `period` (day/week/month)
- Default period: 'week'
- Note: ProductivityStatsTool uses period enum, not custom date ranges

**Velocity Routing:**
- Maps `scope.dateRange` → `startDate` and `endDate`
- Maps `params.groupBy` → `interval`

**Overdue Routing:**
- Maps `scope.tags` → `tags`
- Maps `scope.projects` → `projects`

**Pattern Routing:**
- Maps `params.insights` → `patterns` (backend expects 'patterns' not 'insights')
- Default: `patterns: ['all']` if not specified

**Workflow Routing:**
- Maps `scope.dateRange` → `startDate` and `endDate`

**Recurring Routing:**
- Maps `params.operation` → `operation`
- Maps `params.sortBy` → `sortBy`

**MeetingNotes Routing:**
- Maps `params.text` → `input` (backend expects 'input' not 'text')
- Maps `params.extractTasks` → `extractMode` (true → 'action_items', false → 'both')
- Passes through `defaultProject` and `defaultTags`

**Reviews Routing:**
- Direct pass-through of `projectId` and `reviewDate`

---

## Compiler Architecture

Each unified tool uses a compiler to translate builder JSON to backend parameters:

### QueryCompiler (src/tools/unified/compilers/QueryCompiler.ts)
- **Input:** ReadInput (from read-schema.ts)
- **Output:** CompiledQuery with type, mode, filters, fields, sort, limit, offset
- **Key Logic:**
  - Determines mode: 'all', 'search', or 'smart_suggest'
  - Passes through filters as-is (existing tools can handle the structure)
  - No complex transformations in compiler (done in routing methods)

### MutationCompiler (src/tools/unified/compilers/MutationCompiler.ts)
- **Input:** WriteInput (from write-schema.ts)
- **Output:** CompiledMutation (discriminated union by operation)
- **Key Logic:**
  - Maps unified `id` field to `taskId` or `projectId` based on target
  - Separate compiled types for each operation (create/update/complete/delete/batch)
  - Type-safe handling via discriminated union

### AnalysisCompiler (src/tools/unified/compilers/AnalysisCompiler.ts)
- **Input:** AnalyzeInput (from analyze-schema.ts)
- **Output:** CompiledAnalysis (discriminated union by type)
- **Key Logic:**
  - Preserves scope and params structure
  - No parameter translation in compiler (done in routing methods)
  - Type-safe handling via discriminated union for 8 analysis types

---

## Design Patterns

### 1. Zero Backend Changes
All routing happens in unified tools - no modifications to backend tools required.

### 2. Discriminated Unions
Each compiler uses discriminated unions for type-safe operation/type-specific handling:
- QueryCompiler: type field discriminates between tasks/projects/tags/perspectives/folders
- MutationCompiler: operation field discriminates between create/update/complete/delete/batch
- AnalysisCompiler: type field discriminates between 8 analysis types

### 3. Routing Methods
Each unified tool implements private routing methods that:
- Map compiled output to backend tool parameters
- Handle parameter translation (e.g., 'insights' → 'patterns')
- Apply defaults where needed
- Execute backend tool via `execute()` method

### 4. Two-Stage Translation
- **Stage 1 (Compiler):** Validate and structure input (minimal transformation)
- **Stage 2 (Routing):** Map to backend parameters (parameter translation)

This separation keeps compilers simple and puts translation logic in routing methods.

---

## Backend Tools → Scripts

**Purpose:** Map which OmniFocus scripts each backend tool uses.

**Note:** Some tools use barrel exports (tasks.ts, recurring.ts, reviews.ts) which re-export from modular script files. This mapping shows both the import source and the actual script file location.

### QueryTasksTool
**File:** `src/tools/tasks/QueryTasksTool.ts`

**Script Imports:**
- `LIST_TASKS_SCRIPT` - from `scripts/tasks.ts` (barrel export)
  - Actual file: `scripts/tasks/list-tasks.ts` (JXA version)
- `LIST_TASKS_SCRIPT_V3` - from `scripts/tasks.ts` (barrel export)
  - Actual file: `scripts/tasks/list-tasks-omnijs.ts` (OmniJS version, 13-22x faster)
- `TODAYS_AGENDA_SCRIPT` - from `scripts/tasks.ts` (barrel export)
  - Actual file: `scripts/tasks/todays-agenda.ts`
- Date range scripts - from `scripts/date-range-queries.ts`
  - `GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT`
  - `GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT`
  - Note: `GET_TASKS_IN_DATE_RANGE_ULTRA_OPTIMIZED_SCRIPT` mentioned in docs but NOT imported
- `FLAGGED_TASKS_PERSPECTIVE_SCRIPT` - from `scripts/tasks/flagged-tasks-perspective.ts`

**Conditional Logic:**
- ✅ **DOES conditionally select scripts based on operation mode:**
  - **Uses LIST_TASKS_SCRIPT_V3 (OmniJS, 13-22x faster) for:**
    - `mode: 'inbox'` → handleInboxTasks() (line 1130)
    - `mode: 'search'` → handleSearchTasks() (line 909)
    - ID lookup → handleTaskById() (line 632)
  - **Uses LIST_TASKS_SCRIPT (JXA) for:**
    - `mode: 'available'` → handleAvailableTasks() (line 979)
    - `mode: 'blocked'` → handleBlockedTasks() (line 1040)
    - `mode: 'all'` → handleAllTasks() (line 1185)
    - `mode: 'smart_suggest'` → handleSmartSuggest() (line 1257)
  - **Uses specialized scripts for:**
    - `mode: 'today'` → TODAYS_AGENDA_SCRIPT (line 820)
    - `mode: 'overdue'` → GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT (line 712)
    - `mode: 'upcoming'` → GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT (line 761)
    - `mode: 'flagged'` → FLAGGED_TASKS_PERSPECTIVE_SCRIPT (line 1089)

---

### ManageTaskTool
**File:** `src/tools/tasks/ManageTaskTool.ts`

**Script Imports:**
- `CREATE_TASK_SCRIPT` - from `scripts/tasks.ts` (barrel export)
  - Actual file: `scripts/tasks/create-task.ts`
- `COMPLETE_TASK_SCRIPT` - from `scripts/tasks.ts`
  - Actual file: `scripts/tasks/complete-task.ts`
- `BULK_COMPLETE_TASKS_SCRIPT` - from `scripts/tasks.ts`
  - Actual file: `scripts/tasks/complete-tasks-bulk.ts`
- `DELETE_TASK_SCRIPT` - from `scripts/tasks.ts`
  - Actual file: `scripts/tasks/delete-task.ts`
- `BULK_DELETE_TASKS_SCRIPT` - from `scripts/tasks.ts`
  - Actual file: `scripts/tasks/delete-tasks-bulk.ts`
- `LIST_TASKS_SCRIPT` - from `scripts/tasks.ts`
  - Actual file: `scripts/tasks/list-tasks.ts`
- `createUpdateTaskScript` - from `scripts/tasks/update-task.ts` (function, not constant)

**Conditional Logic:**
- No conditional script selection observed
- Uses standard task scripts for all operations
- **Note on bridge variants:** ManageTaskTool uses regular `create-task.ts` (not the bridge variant). The bridge variant `create-task-with-bridge.ts` is ONLY used by BatchCreateTool. This suggests that ManageTaskTool may rely on bridge operations embedded within `create-task.ts` itself, while BatchCreateTool uses a separate bridge-specific version for batch tag assignment optimization

---

### ProjectsTool
**File:** `src/tools/projects/ProjectsTool.ts`

**Script Imports:**
- `LIST_PROJECTS_SCRIPT` - from `scripts/projects/list-projects.ts`
- `CREATE_PROJECT_SCRIPT` - from `scripts/projects/create-project.ts`
- `COMPLETE_PROJECT_SCRIPT` - from `scripts/projects/complete-project.ts`
- `DELETE_PROJECT_SCRIPT` - from `scripts/projects/delete-project.ts`
- `GET_PROJECT_STATS_SCRIPT` - from `scripts/projects/get-project-stats.ts`
- `createUpdateProjectScript` - from `scripts/projects/update-project.ts` (function)

**Conditional Logic:**
- No conditional script selection observed

---

### TagsTool
**File:** `src/tools/tags/TagsTool.ts`

**Script Imports:**
- `LIST_TAGS_SCRIPT` - from `scripts/tags/list-tags.ts`
- `GET_ACTIVE_TAGS_SCRIPT` - from `scripts/tags/list-tags.ts` (same file, different export)
- `MANAGE_TAGS_SCRIPT` - from `scripts/tags/manage-tags.ts`

**Conditional Logic:**
- No conditional script selection observed
- Note: Both `LIST_TAGS_SCRIPT` and `GET_ACTIVE_TAGS_SCRIPT` come from same file

---

### PerspectivesTool
**File:** `src/tools/perspectives/PerspectivesTool.ts`

**Script Imports:**
- `LIST_PERSPECTIVES_SCRIPT` - from `scripts/perspectives/list-perspectives.ts`
- `QUERY_PERSPECTIVE_SCRIPT` - from `scripts/perspectives/query-perspective.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### FoldersTool
**File:** `src/tools/folders/FoldersTool.ts`

**Script Imports:**
- `createListFoldersScript` - from `scripts/folders/list-folders.ts` (function)
- `CREATE_FOLDER_SCRIPT` - from `scripts/folders/create-folder.ts`
- `UPDATE_FOLDER_SCRIPT` - from `scripts/folders/update-folder.ts`
- `DELETE_FOLDER_SCRIPT` - from `scripts/folders/delete-folder.ts`
- `MOVE_FOLDER_SCRIPT` - from `scripts/folders/move-folder.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### BatchCreateTool
**File:** `src/tools/batch/BatchCreateTool.ts`

**Script Imports:**
- `CREATE_PROJECT_SCRIPT` - from `scripts/projects/create-project.ts`
- `DELETE_PROJECT_SCRIPT` - from `scripts/projects/delete-project.ts`
- `CREATE_TASK_SCRIPT` - from `scripts/tasks/create-task-with-bridge.ts` ⚠️
- `DELETE_TASK_SCRIPT` - from `scripts/tasks.ts` (barrel export)
  - Actual file: `scripts/tasks/delete-task.ts`

**Conditional Logic:**
- **IMPORTANT:** BatchCreateTool specifically uses `create-task-with-bridge.ts` instead of regular `create-task.ts`
- This is the ONLY tool that imports the bridge version for task creation
- Bridge version required for proper tag assignment during batch operations

---

### ProductivityStatsTool
**File:** `src/tools/analytics/ProductivityStatsTool.ts`

**Script Imports:**
- `PRODUCTIVITY_STATS_SCRIPT` - from `scripts/analytics/productivity-stats.ts`

**Conditional Logic:**
- No conditional script selection observed
- Note: Comment mentions "V3 optimized script with OmniJS bridge" but imports `productivity-stats.ts` not v3 variant

---

### TaskVelocityTool
**File:** `src/tools/analytics/TaskVelocityTool.ts`

**Script Imports:**
- `TASK_VELOCITY_SCRIPT` - from `scripts/analytics/task-velocity.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### OverdueAnalysisTool
**File:** `src/tools/analytics/OverdueAnalysisTool.ts`

**Script Imports:**
- `ANALYZE_OVERDUE_SCRIPT` - from `scripts/analytics/analyze-overdue.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### PatternAnalysisTool
**File:** `src/tools/analytics/PatternAnalysisTool.ts`

**Script Imports:**
- `analyzeReviewGaps` - from `scripts/analytics/review-gaps-analyzer.ts` (function)
- `analyzeNextActions` - from `scripts/analytics/next-actions-analyzer.ts` (function)
- `analyzeWipLimits` - from `scripts/analytics/wip-limits-analyzer.ts` (function)
- `analyzeDueDateBunching` - from `scripts/analytics/due-date-bunching-analyzer.ts` (function)

**Conditional Logic:**
- Uses different analyzer functions based on selected pattern types
- Not a script version selection, but functional composition pattern

---

### WorkflowAnalysisTool
**File:** `src/tools/analytics/WorkflowAnalysisTool.ts`

**Script Imports:**
- `WORKFLOW_ANALYSIS_SCRIPT` - from `scripts/analytics/workflow-analysis.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### RecurringTasksTool
**File:** `src/tools/recurring/RecurringTasksTool.ts`

**Script Imports:**
- `ANALYZE_RECURRING_TASKS_SCRIPT` - from `scripts/recurring.ts` (barrel export)
  - Actual file: `scripts/recurring/analyze-recurring-tasks.ts`
- `GET_RECURRING_PATTERNS_SCRIPT` - from `scripts/recurring.ts` (barrel export)
  - Actual file: `scripts/recurring/get-recurring-patterns.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### ManageReviewsTool
**File:** `src/tools/reviews/ManageReviewsTool.ts`

**Script Imports:**
- From `scripts/reviews.ts` (barrel export):
  - `PROJECTS_FOR_REVIEW_SCRIPT` - actual file: `scripts/reviews/projects-for-review.ts`
  - `MARK_PROJECT_REVIEWED_SCRIPT` - actual file: `scripts/reviews/mark-project-reviewed.ts`
  - `SET_REVIEW_SCHEDULE_SCRIPT` - actual file: `scripts/reviews/set-review-schedule.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### ExportTool
**File:** `src/tools/export/ExportTool.ts`

**Script Imports:**
- `EXPORT_TASKS_SCRIPT` - from `scripts/export/export-tasks.ts`
- `EXPORT_PROJECTS_SCRIPT` - from `scripts/export/export-projects.ts`

**Conditional Logic:**
- No conditional script selection observed

---

### ParseMeetingNotesTool
**File:** `src/tools/capture/ParseMeetingNotesTool.ts`

**Script Imports:**
- **None** - This tool is pure TypeScript and does not execute OmniFocus scripts
- Uses TypeScript functions: `detectContextTags()`, `extractDates()`

**Notes:**
- ParseMeetingNotesTool is a text parsing tool that generates batch operations
- No JXA/OmniJS scripts involved
- Output can be fed to BatchCreateTool for actual task creation

---

### SystemTool
**File:** `src/tools/system/SystemTool.ts`

**Script Imports:**
- **None** - System tool does not execute OmniFocus scripts
- Provides MCP server metadata and diagnostics

---

## Script Version Variants Discovered

During backend tool analysis, the following script variants were identified:

### Task Scripts

**list-tasks variants:**
- `scripts/tasks/list-tasks.ts` (JXA version - used by QueryTasksTool for: available, blocked, all, smart_suggest)
- `scripts/tasks/list-tasks-omnijs.ts` (OmniJS version - 13-22x faster, used by QueryTasksTool for: inbox, search, ID lookup)

**create-task variants:**
- `scripts/tasks/create-task.ts` (standard version - used by ManageTaskTool)
- `scripts/tasks/create-task-with-bridge.ts` (bridge version - used ONLY by BatchCreateTool)

### Analytics Scripts

**productivity-stats variants:**
- `scripts/analytics/productivity-stats.ts` (currently used)
- Possible v3 variant existence (comment mentions "V3 optimized" but imports don't show it)

**task-velocity variants:**
- `scripts/analytics/task-velocity.ts` (currently used)
- Possible v3 variant existence (based on pattern from inventory)

**list-tags variants:**
- `scripts/tags/list-tags.ts` (currently used)
- Possible v3 variant existence (based on pattern from inventory)

---

## Key Findings

### 1. Minimal Conditional Logic
- **No backend tools** dynamically choose between script versions at runtime
- All script imports are static
- The only "conditional" behavior is BatchCreateTool using a different create-task variant

### 2. Bridge Script Usage Pattern
- Only **BatchCreateTool** uses the bridge variant (`create-task-with-bridge.ts`)
- ManageTaskTool uses regular `create-task.ts` despite comments about bridge operations
- This suggests potential consolidation opportunity or inconsistency

### 3. Barrel Exports
Three barrel export files re-export from modular scripts:
- `scripts/tasks.ts` → re-exports from `scripts/tasks/*.ts`
- `scripts/recurring.ts` → re-exports from `scripts/recurring/*.ts`
- `scripts/reviews.ts` → re-exports from `scripts/reviews/*.ts`

### 4. Function Exports vs Constants
Most scripts export constants, but some export functions:
- `createUpdateTaskScript()` - generates script dynamically
- `createUpdateProjectScript()` - generates script dynamically
- `createListFoldersScript()` - generates script dynamically
- `analyzeReviewGaps()`, `analyzeNextActions()`, etc. - PatternAnalysisTool analyzers

### 5. Optimized Version Usage
- `list-tasks-omnijs.ts` (13-22x faster, exported as LIST_TASKS_SCRIPT_V3) **IS actively used** by QueryTasksTool
- Used for modes: inbox, search, and ID lookup (high-frequency operations)
- JXA version (LIST_TASKS_SCRIPT) still used for: available, blocked, all, smart_suggest
- This indicates a strategic choice: use OmniJS for simple queries, JXA for complex filtering that requires analysis

---

## Next Steps

Task 2 complete. Continue to Task 3: Identify dead code by cross-referencing this mapping with actual file system.
