# Type-Discriminated Fields Enum for Read Schema

**Date:** 2026-02-19 **Status:** Approved **Task:** `jPCM131m7we` in OmniFocus MCP Server ongoing work

## Problem

The `fields` parameter in `read-schema.ts` uses a single `TaskFieldEnum` for all query types. Querying projects with
`fields: ['id', 'name', 'status', 'folder']` returns MCP error -32602 because `status` and `folder` are not in the task
fields enum. Project responses include different fields (status, folder, folderPath, sequential, lastReviewDate, etc.)
that aren't represented.

## Approach: Discriminated Union with Shared Base

Extract shared parameters into a base schema and compose per-type schemas with `.merge()`. Uses Zod's
`discriminatedUnion` on `query.type`.

### New Enums

| Enum               | Fields                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskFieldEnum`    | id, name, completed, flagged, blocked, available, estimatedMinutes, dueDate, deferDate, plannedDate, completionDate, added, modified, dropDate, note, projectId, project, tags, repetitionRule, parentTaskId, parentTaskName, inInbox |
| `ProjectFieldEnum` | id, name, status, flagged, note, dueDate, deferDate, completedDate, folder, folderPath, folderId, sequential, lastReviewDate, nextReviewDate, defaultSingletonActionHolder                                                            |

### Schema Structure

```
BaseQuerySchema (shared)
  ├── filters, sort, limit, offset
  │
  ├── TaskQuerySchema = Base + type:'tasks' + fields:TaskFieldEnum + mode, countOnly, daysAhead, fastSearch, details
  ├── ProjectQuerySchema = Base + type:'projects' + fields:ProjectFieldEnum + details, includeStats
  ├── TagQuerySchema = Base + type:'tags'
  ├── PerspectiveQuerySchema = Base + type:'perspectives'
  ├── FolderQuerySchema = Base + type:'folders'
  └── ExportQuerySchema = Base + type:'export' + exportType, format, exportFields, outputDirectory, includeStats, includeCompleted
```

### QueryCompiler Changes

Use `'in' check` pattern for type-specific property access:

```typescript
mode: 'mode' in query ? query.mode : undefined,
countOnly: 'countOnly' in query ? query.countOnly : undefined,
```

No changes to `CompiledQuery` interface — `fields?: string[]` already works since Zod validates the enum at parse time.

### Project Field Projection

Post-hoc projection in `OmniFocusReadTool.routeToProjectsTool()`:

1. Delegate to `ProjectsTool.execute()` as before (full data)
2. If `compiled.fields` is set, strip project objects to requested fields only
3. Return projected result

This avoids modifying the legacy ProjectsTool. A future refactor (`ivxiPan66eX`) will wire project queries directly
through the AST pipeline, eliminating the legacy tool layer entirely.

### MCP Tool Description

Update the `RESPONSE CONTROL` section to list field options per type so LLM assistants know what's available.

## Files Changed

| File                                                   | Change                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/tools/unified/schemas/read-schema.ts`             | Add ProjectFieldEnum, BaseQuerySchema, per-type schemas, discriminated union |
| `src/tools/unified/compilers/QueryCompiler.ts`         | `'in' check` for type-specific properties on union output                    |
| `src/tools/unified/OmniFocusReadTool.ts`               | `projectFieldsOnResult()`, updated tool description                          |
| `tests/unit/tools/unified/schemas/read-schema.test.ts` | 6+ new tests for type discrimination                                         |

## Test Plan

1. Project fields accepted on project queries
2. Task fields rejected on project queries
3. Project fields rejected on task queries
4. Task-only params (countOnly) rejected on project queries
5. Shared params (limit, offset) work on both types
6. Export params only accepted on export queries
7. Field projection end-to-end on project query results
