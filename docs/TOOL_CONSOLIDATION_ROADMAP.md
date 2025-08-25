# Remaining Tool Consolidation Roadmap

## Purpose

This document outlines the design for consolidating the remaining OmniFocus MCP tools into streamlined "V2" super-tools. The goal is to further reduce tool count, provide consistent interfaces, and cut context usage for LLM clients.

## Design Principles

- **Single entry point per domain** – each consolidated tool exposes an `operation` (or `mode`) parameter
- **Zod schemas** – use the `schema` property from `BaseTool` for input validation
- **Shared caching** – each operation declares its own cache keys and invalidation strategy
- **Backward compatibility** – legacy tools remain available during migration

## Consolidated Tools

### 1. `tags` → `TagsToolV2`
Combines `ListTagsTool`, `ManageTagsTool`, and `GetActiveTagsTool`.

Operations:
- `list` – return all tags
- `manage` – create, rename, delete or merge tags
- `active` – fetch tags attached to current selection

Example:
```javascript
{ operation: "manage", action: "rename", tagName: "Home", newName: "House" }
```

### 2. `export` → `ExportToolV2`
Unifies `ExportTasksTool`, `ExportProjectsTool`, and `BulkExportTool`.

Operations:
- `tasks` – export selected tasks
- `projects` – export selected projects
- `bulk` – export both tasks and projects with shared filters

Shared parameters: `format`, `includeCompleted`, `tagFilter`.

### 3. `recurring` → `RecurringTasksToolV2`
Merges `AnalyzeRecurringTasksTool` and `GetRecurringPatternsTool`.

Operations:
- `analyze` – summarize recurring task health
- `patterns` – list detected recurrence patterns

### 4. `perspectives` → `PerspectivesToolV2`
Replaces `ListPerspectivesTool` and `QueryPerspectiveTool`.

Operations:
- `list` – enumerate available perspectives
- `query` – run a perspective and return tasks

### 5. `system` → `SystemToolV2`
Combines `GetVersionInfoTool` and `RunDiagnosticsTool`.

Operations:
- `version` – report server and OmniFocus versions
- `diagnostics` – run environment checks and return results

## Implementation Notes

1. Each new tool extends `BaseTool` and defines a single Zod schema covering all operations.
2. Switch logic inside `executeValidated` dispatches to operation-specific helpers.
3. Cache invalidation mirrors existing tools (e.g., tag changes invalidate both `tags` and `tasks`).
4. Update `src/tools/index.ts` to register these V2 tools and remove the legacy variants once validated.

## Testing Strategy

- Unit tests for each operation path
- Regression tests using the manual MCP inspector script
- Ensure `npm test` and `npm run test:integration` pass after migration

## Migration Guide

- LLMs should prefer the consolidated tool names: `tags`, `export`, `recurring_tasks`, `perspectives`, and `system`.
- Legacy names remain functional but are marked deprecated in tool descriptions.

## Timeline

1. ✅ Implement `TagsToolV2` (COMPLETED)
2. ✅ Introduce `PerspectivesToolV2` and `SystemToolV2` (COMPLETED)
3. Implement `ExportToolV2` and `RecurringTasksToolV2` (IN PROGRESS)
4. Update documentation and examples
5. Remove legacy tools in a subsequent major release

## Future Consolidation Opportunities

### Folder Tools
Currently we have `ManageFolderTool` (create/update/delete/move) and `QueryFoldersTool` (list/query).
These could potentially be consolidated into `FoldersToolV2` with operations:
- `list` - List all folders
- `query` - Query specific folders
- `manage` - Create/update/delete/move folders

**Priority**: Low - ManageFolderTool is already partially consolidated
**Estimated savings**: Minor (1 tool reduction)

