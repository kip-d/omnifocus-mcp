# Batch Mixed Operations Design

**Date:** 2026-02-15 **Status:** Approved **Approach:** Partition and delegate (Approach 1)

## Problem

`BatchOperationSchema` accepts both `create` and `update` operations, but `routeToBatch()` filters for creates only
(line 189). Updates are silently dropped. If a batch contains only non-create operations, the filtered array is empty
and `BatchCreateSchema.min(1)` produces a cryptic error: `"items: Array must contain at least 1 element(s)"`.

Additionally, `UpdateChangesSchema` lacks `coerceBoolean()` on boolean fields (`flagged`, `clearDueDate`, etc.), meaning
MCP bridge string coercion fails for batch updates.

## Design

### Schema Changes

**Expand `BatchOperationSchema`** (write-schema.ts) to support all four operation types:

| Operation | Fields                                    |
| --------- | ----------------------------------------- |
| create    | target, data (BatchItemDataSchema)        |
| update    | target, id, changes (UpdateChangesSchema) |
| complete  | target, id, completionDate?               |
| delete    | target, id                                |

**Fix `UpdateChangesSchema` coercion** — replace `z.boolean()` with `coerceBoolean()` on: `flagged`, `clearDueDate`,
`clearDeferDate`, `clearPlannedDate`, `clearEstimatedMinutes`, `clearRepeatRule`.

**Update `MutationCompiler`** — extend `BatchOperation` interface to include `'complete' | 'delete'` and add
`completionDate` field.

### Routing Logic

Rewrite `routeToBatch()` to partition operations by type and execute in order:

1. **Creates first** → `BatchCreateTool` (preserves tempId/parentTempId hierarchy)
2. **Updates second** → `routeToManageTask()` / `routeToProjectsTool()` per item
3. **Completes third** → same routing
4. **Deletes last** → same routing

Ordering rationale:

- Creates before updates: an update may reference a newly created item
- Deletes last: don't delete before another operation references it
- TempId → realId mapping from BatchCreateTool must be available to subsequent operations

**Return value:** Aggregate results from all phases into a single response with per-type sections and summary counts
(`created: N, updated: N, completed: N, deleted: N`).

**Error handling:** Respect `stopOnError` flag. If true and a create fails, skip all subsequent operations. If false,
continue and collect errors.

### Dry-Run Updates

Extend `previewBatch()` to preview `complete` and `delete` operations alongside existing create/update previews. Update
summary counts to include all four types.

### Testing

| Test                           | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| Schema validation              | All four operation types parse in BatchOperationSchema          |
| UpdateChangesSchema coercion   | String booleans coerce correctly                                |
| Routing partitioning           | Operations partition and route to correct handlers in order     |
| Mixed operations               | Batch with all four types executes correctly                    |
| TempId resolution              | Update referencing a create's tempId resolves to real ID        |
| StopOnError                    | Create failure prevents subsequent operations when flag is true |
| Empty partition (original bug) | Batch with only updates works correctly                         |

## Constraints

- Typical batch size: ≤12 operations in a conversational LLM context
- Sequential execution of updates/completes/deletes is acceptable at this scale
- No new JXA scripts required — reuse existing single-item handlers

## Files to Modify

| File                                              | Change                                                        |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `src/tools/unified/schemas/write-schema.ts`       | Expand BatchOperationSchema, fix UpdateChangesSchema coercion |
| `src/tools/unified/compilers/MutationCompiler.ts` | Extend BatchOperation interface                               |
| `src/tools/unified/OmniFocusWriteTool.ts`         | Rewrite routeToBatch(), extend previewBatch()                 |
| `tests/unit/tools/batch/`                         | New test file for mixed batch operations                      |
