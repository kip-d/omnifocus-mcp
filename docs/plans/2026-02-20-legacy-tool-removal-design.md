# Legacy Tool Layer Removal Design

## Goal

Eliminate all 17 legacy tool classes and consolidate the OmniFocus MCP server into a clean pipeline: unified tool →
compiler → AST builder / direct script → OmniAutomation. One path, no intermediaries.

## Architecture

**Before (v3.1.0):**

```
MCP Client → Unified Tool → Compiler → Legacy Tool Class → Script → OmniAutomation
```

**After:**

```
MCP Client → Unified Tool → Compiler → AST Builder / Direct Script → OmniAutomation
```

The 3 unified tools (`OmniFocusReadTool`, `OmniFocusWriteTool`, `OmniFocusAnalyzeTool`) become the only tool layer. They
compile input, generate scripts (via AST builders or direct script imports for analytics), and execute against
OmniAutomation. No intermediary tool classes.

## Approach: Vertical Slices

Migrate one entity type at a time. Each phase completes the full pipeline: build AST → rewire unified tool → delete
legacy class → delete old scripts → tests. Each phase is independently testable and committable.

## Phase Plan

### Phase 1: Tasks (QueryTasksTool + ManageTaskTool)

**Delete:** `QueryTasksTool`, `ManageTaskTool`

Task queries already go through the AST path (`buildListTasksScriptV4`) — `QueryTasksTool` is dead code.
`ManageTaskTool` wraps AST mutation builders with sanitization logic (stripping undefined fields, mapping project names
to IDs). Move that sanitization into `OmniFocusWriteTool`.

### Phase 2: Projects (ProjectsTool)

**Delete:** `ProjectsTool`

Project queries use `buildFilteredProjectsScript()`. Project mutations use `buildUpdateProjectScript()`,
`buildCreateProjectScript()`, etc. The remaining ProjectsTool logic is stats aggregation (`includeStats`) — inline into
`OmniFocusReadTool`.

### Phase 3: Export (ExportTool)

**Delete:** `ExportTool`

Already uses `buildExportTasksScript()` from the AST builder internally. Inline the wrapper logic (format routing,
project export) into `OmniFocusReadTool`.

### Phase 4: Batch (BatchCreateTool)

**Delete:** `BatchCreateTool`

Owns `TempIdResolver` and dependency graph logic for ordering batch operations. This is non-trivial. Extract
`TempIdResolver` into a utility module, inline batch execution into `OmniFocusWriteTool`.

### Phase 5: Analytics (8 tool classes)

**Delete:** `ProductivityStatsTool`, `TaskVelocityTool`, `OverdueAnalysisTool`, `PatternAnalysisTool`,
`WorkflowAnalysisTool`, `RecurringTasksTool`, `ParseMeetingNotesTool`, `ManageReviewsTool`

Each follows the same pattern: validate → build script with parameters → execute → format response. Inline all 8
`execute()` methods as private methods in `OmniFocusAnalyzeTool`. Keep the hardcoded analytics scripts — they're
irreducible computation (loops, aggregates, insights), not query/filter/project patterns.

### Phase 6: Folders (FoldersTool)

**Delete:** `FoldersTool` + folder scripts in `src/omnifocus/scripts/folders/`

**Create:**

- `buildFilteredFoldersScript()` in `script-builder.ts` — folder listing with hierarchy
- `buildFolderMutationScript()` in `mutation-script-builder.ts` — folder create/update/delete

### Phase 7: Tags (TagsTool)

**Delete:** `TagsTool` + tag listing script in `src/omnifocus/scripts/tags/`

**Create:**

- `buildFilteredTagsScript()` in `script-builder.ts` — tag listing with hierarchy
- Tag mutations already exist via OmniJS bridge in `mutation-script-builder.ts` (manage operations:
  create/rename/delete/merge/nest/unnest/reparent)

### Phase 8: Perspectives (PerspectivesTool)

**Delete:** `PerspectivesTool` + perspective scripts in `src/omnifocus/scripts/perspectives/`

**Create:**

- `buildFilteredPerspectivesScript()` in `script-builder.ts` — perspective listing/query (read-only, no mutations)

## Deletion Inventory

| Phase     | Files Deleted                                                            | Classes        |
| --------- | ------------------------------------------------------------------------ | -------------- |
| 1         | `src/tools/tasks/QueryTasksTool.ts`, `src/tools/tasks/ManageTaskTool.ts` | 2              |
| 2         | `src/tools/projects/ProjectsTool.ts`                                     | 1              |
| 3         | `src/tools/export/ExportTool.ts`                                         | 1              |
| 4         | `src/tools/batch/BatchCreateTool.ts`                                     | 1              |
| 5         | 8 files in `src/tools/analytics/`, `capture/`, `reviews/`, `recurring/`  | 8              |
| 6         | `src/tools/folders/FoldersTool.ts`                                       | 1              |
| 7         | `src/tools/tags/TagsTool.ts`                                             | 1              |
| 8         | `src/tools/perspectives/PerspectivesTool.ts`                             | 1              |
| **Total** | **~20 files**                                                            | **17 classes** |

## New AST Builders

| Function                            | File                         | Entity       |
| ----------------------------------- | ---------------------------- | ------------ |
| `buildFilteredFoldersScript()`      | `script-builder.ts`          | Folders      |
| `buildFolderMutationScript()`       | `mutation-script-builder.ts` | Folders      |
| `buildFilteredTagsScript()`         | `script-builder.ts`          | Tags         |
| `buildFilteredPerspectivesScript()` | `script-builder.ts`          | Perspectives |

## What Stays Unchanged

- `src/contracts/ast/` — Extended, not replaced
- `src/tools/base.ts` — `BaseTool` abstract class (unified tools inherit from it)
- `src/tools/unified/schemas/` — MCP schemas unchanged (no external API change)
- `src/tools/unified/compilers/` — Extended for new entity routing
- `src/omnifocus/scripts/analytics/` — Hardcoded scripts stay (irreducible computation)
- `src/omnifocus/scripts/shared/` — Helpers, bridge helpers, tag bridge stay
- `src/cache/`, `src/utils/` — Shared infrastructure unchanged
- `src/tools/system/` — SystemTool unchanged

## Testing Strategy

Each phase follows TDD:

1. Write tests for the new inline behavior in the unified tool
2. Verify tests pass
3. Delete the legacy class and its dedicated test file
4. Verify the unified tool tests still pass
5. Run full test suite (`npm run test:unit`)

Test migration: legacy tool test files get deleted. Their test cases either already have equivalents in unified tool
tests, or get migrated to unified tool test files first. No coverage loss.

## Success Criteria

- Zero legacy tool classes in `src/tools/` (only `unified/`, `system/`, and `base.ts` remain)
- All MCP operations pass integration tests
- AST builders handle all entity types for read operations
- Analytics scripts execute directly from `OmniFocusAnalyzeTool`
- Test count stays the same or increases
- No external API changes (MCP clients see identical behavior)

## Risk Mitigation

| Risk                                                     | Mitigation                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| ManageTaskTool sanitization logic lost during inline     | Extract sanitization as a pure function, unit test independently                  |
| BatchCreateTool TempIdResolver breaks during move        | Extract as utility module with its own test file                                  |
| Analytics tool error handling patterns differ            | Audit each tool's error handling before inlining; standardize on BaseTool pattern |
| New AST builders for folders/tags/perspectives have bugs | TDD — write failing tests first, build to green                                   |
| Unified tool files grow too large                        | Extract private methods into focused modules under `src/tools/unified/`           |
