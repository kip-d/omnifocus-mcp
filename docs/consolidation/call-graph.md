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

## Next Steps

Continue to Task 2: Map backend tools → scripts to complete the full call graph.
