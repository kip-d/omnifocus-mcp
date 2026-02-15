# Batch Mixed Operations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable batch operations to handle create, update, complete, and delete in a single call.

**Architecture:** Partition-and-delegate — `routeToBatch()` splits operations by type, executes creates via
`BatchCreateTool`, then routes updates/completes/deletes through existing single-item handlers sequentially.

**Tech Stack:** TypeScript, Zod schemas, Vitest

---

### Task 1: Fix UpdateChangesSchema coercion

**Files:**

- Modify: `src/tools/unified/schemas/write-schema.ts:46-67`
- Test: `tests/unit/tools/batch/batch-mixed-operations.test.ts` (create)

**Step 1: Write the failing test**

Create `tests/unit/tools/batch/batch-mixed-operations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Import the WriteSchema to test BatchOperationSchema indirectly
// (BatchOperationSchema is not exported, but is validated through WriteSchema)
import { WriteSchema } from '../../../../src/tools/unified/schemas/write-schema.js';

describe('UpdateChangesSchema MCP bridge coercion', () => {
  it('should coerce string "true" to boolean for flagged in batch update', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'update',
            target: 'task',
            id: 'test-id',
            changes: { flagged: 'true' },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const ops = (result.data.mutation as any).operations;
      expect(ops[0].changes.flagged).toBe(true);
    }
  });

  it('should coerce string booleans for clearDueDate and other clear flags', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'update',
            target: 'task',
            id: 'test-id',
            changes: {
              clearDueDate: 'true',
              clearDeferDate: 'false',
              clearPlannedDate: 'true',
              clearEstimatedMinutes: 'true',
              clearRepeatRule: 'false',
            },
          },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as any).operations[0].changes;
      expect(changes.clearDueDate).toBe(true);
      expect(changes.clearDeferDate).toBe(false);
      expect(changes.clearPlannedDate).toBe(true);
      expect(changes.clearEstimatedMinutes).toBe(true);
      expect(changes.clearRepeatRule).toBe(false);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: FAIL — `z.boolean()` rejects
string `"true"`

**Step 3: Fix UpdateChangesSchema coercion**

In `src/tools/unified/schemas/write-schema.ts`, replace lines 46-67:

```typescript
const UpdateChangesSchema = z
  .object({
    name: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    addTags: z.array(z.string()).optional(),
    removeTags: z.array(z.string()).optional(),
    dueDate: z.union([z.string(), z.null()]).optional(),
    deferDate: z.union([z.string(), z.null()]).optional(),
    plannedDate: z.union([z.string(), z.null()]).optional(),
    clearDueDate: coerceBoolean().optional(),
    clearDeferDate: coerceBoolean().optional(),
    clearPlannedDate: coerceBoolean().optional(),
    flagged: coerceBoolean().optional(),
    status: z.enum(['completed', 'dropped']).optional(),
    project: z.union([z.string(), z.null()]).optional(),
    parentTaskId: z.union([z.string(), z.null()]).optional(),
    estimatedMinutes: z
      .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
      .pipe(z.number())
      .optional(),
    clearEstimatedMinutes: coerceBoolean().optional(),
    clearRepeatRule: coerceBoolean().optional(),
  })
  .passthrough();
```

**Step 4: Run test to verify it passes**

Run: `npm run build && npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/unified/schemas/write-schema.ts tests/unit/tools/batch/batch-mixed-operations.test.ts
git commit -m "fix: add MCP bridge coercion to UpdateChangesSchema boolean fields"
```

---

### Task 2: Expand BatchOperationSchema with complete and delete

**Files:**

- Modify: `src/tools/unified/schemas/write-schema.ts:80-93`
- Test: `tests/unit/tools/batch/batch-mixed-operations.test.ts` (append)

**Step 1: Write the failing tests**

Append to `tests/unit/tools/batch/batch-mixed-operations.test.ts`:

```typescript
describe('BatchOperationSchema — all operation types', () => {
  it('should accept complete operations in a batch', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'complete', target: 'task', id: 'task-123' }],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept complete with optional completionDate', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'complete', target: 'task', id: 'task-123', completionDate: '2026-02-15' }],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept delete operations in a batch', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [{ operation: 'delete', target: 'task', id: 'task-456' }],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept mixed create+update+complete+delete in a single batch', () => {
    const input = {
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { name: 'New task' } },
          { operation: 'update', target: 'task', id: 'task-1', changes: { flagged: true } },
          { operation: 'complete', target: 'task', id: 'task-2' },
          { operation: 'delete', target: 'task', id: 'task-3' },
        ],
      },
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: FAIL — `complete` and
`delete` are not in the discriminated union

**Step 3: Expand BatchOperationSchema**

In `src/tools/unified/schemas/write-schema.ts`, replace lines 80-93:

```typescript
const BatchOperationSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create'),
    target: z.enum(['task', 'project']),
    data: BatchItemDataSchema,
  }),
  z.object({
    operation: z.literal('update'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    changes: UpdateChangesSchema,
  }),
  z.object({
    operation: z.literal('complete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
    completionDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional(),
  }),
  z.object({
    operation: z.literal('delete'),
    target: z.enum(['task', 'project']),
    id: z.string(),
  }),
]);
```

**Step 4: Run tests to verify they pass**

Run: `npm run build && npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/unified/schemas/write-schema.ts tests/unit/tools/batch/batch-mixed-operations.test.ts
git commit -m "feat: expand BatchOperationSchema to support complete and delete operations"
```

---

### Task 3: Extend MutationCompiler BatchOperation interface

**Files:**

- Modify: `src/tools/unified/compilers/MutationCompiler.ts:61-67`

**Step 1: No separate test needed** — the schema tests from Task 2 validate parsing. The compiler passes through the
operations array without transforming individual batch items (line 188). This task is a type-level change only.

**Step 2: Update the BatchOperation interface**

In `src/tools/unified/compilers/MutationCompiler.ts`, replace lines 61-67:

```typescript
interface BatchOperation {
  operation: 'create' | 'update' | 'complete' | 'delete';
  target: 'task' | 'project';
  data?: CreateData;
  id?: string;
  changes?: UpdateChanges;
  completionDate?: string;
}
```

**Step 3: Build to verify types compile**

Run: `npm run build` Expected: Clean compile, no errors

**Step 4: Run existing tests to verify no regressions**

Run: `npm run test:unit -- tests/unit/tools/batch/` Expected: All tests pass

**Step 5: Commit**

```bash
git add src/tools/unified/compilers/MutationCompiler.ts
git commit -m "refactor: extend BatchOperation interface for complete and delete"
```

---

### Task 4: Rewrite routeToBatch() — partition and delegate

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts:183-210`
- Test: `tests/unit/tools/batch/batch-mixed-operations.test.ts` (append)

**Step 1: Write the failing tests**

Append to `tests/unit/tools/batch/batch-mixed-operations.test.ts`:

```typescript
import { vi } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';

class StubCache {
  invalidate(): void {}
  invalidateProject(): void {}
  invalidateTag(): void {}
  invalidateTaskQueries(): void {}
}

describe('routeToBatch — partition and delegate', () => {
  it('should handle batch with only updates (original bug)', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    // Mock the internal ManageTaskTool.execute
    const manageTaskSpy = vi.spyOn((tool as any).manageTaskTool, 'execute').mockResolvedValue({
      success: true,
      data: { task: { id: 'task-1', name: 'Updated', updated: true } },
    });

    const result = await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'update', target: 'task', id: 'task-1', changes: { flagged: true } },
          { operation: 'update', target: 'task', id: 'task-2', changes: { name: 'Renamed' } },
        ],
      },
    });

    expect(manageTaskSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty('success', true);

    manageTaskSpy.mockRestore();
  });

  it('should execute operations in correct order: creates, updates, completes, deletes', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);
    const callOrder: string[] = [];

    // Mock BatchCreateTool
    vi.spyOn((tool as any).batchTool, 'execute').mockImplementation(async () => {
      callOrder.push('create');
      return {
        success: true,
        data: { results: [{ tempId: 'temp1', realId: 'real-1', success: true }] },
        metadata: { tempIdMapping: { temp1: 'real-1' } },
      };
    });

    // Mock ManageTaskTool
    vi.spyOn((tool as any).manageTaskTool, 'execute').mockImplementation(async (args: any) => {
      callOrder.push(args.operation);
      return { success: true, data: { task: { id: args.taskId, updated: true } } };
    });

    await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'delete', target: 'task', id: 'task-del' },
          { operation: 'update', target: 'task', id: 'task-upd', changes: { name: 'X' } },
          { operation: 'create', target: 'task', data: { name: 'New' } },
          { operation: 'complete', target: 'task', id: 'task-cmp' },
        ],
      },
    });

    // Regardless of input order, execution order should be: create, update, complete, delete
    expect(callOrder).toEqual(['create', 'update', 'complete', 'delete']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: FAIL — routeToBatch still
filters for creates only

**Step 3: Rewrite routeToBatch()**

In `src/tools/unified/OmniFocusWriteTool.ts`, replace the `routeToBatch` method (lines 183-210):

```typescript
  private async routeToBatch(compiled: Extract<CompiledMutation, { operation: 'batch' }>): Promise<unknown> {
    // Partition operations by type
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');
    const completeOps = compiled.operations.filter((op) => op.operation === 'complete');
    const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

    const results: {
      created: unknown[];
      updated: unknown[];
      completed: unknown[];
      deleted: unknown[];
      errors: unknown[];
    } = { created: [], updated: [], completed: [], deleted: [], errors: [] };

    let tempIdMapping: Record<string, string> = {};
    let hadError = false;

    // Phase 1: Creates (via BatchCreateTool for hierarchy support)
    if (createOps.length > 0 && !hadError) {
      try {
        let autoTempIdCounter = 0;
        const batchArgs: Record<string, unknown> = {
          items: createOps.map((op) => {
            const item = { type: op.target, ...op.data };
            if (!item.tempId) {
              item.tempId = `auto_temp_${++autoTempIdCounter}`;
            }
            return item;
          }),
          createSequentially: compiled.createSequentially ?? true,
          atomicOperation: compiled.atomicOperation ?? false,
          returnMapping: compiled.returnMapping ?? true,
          stopOnError: compiled.stopOnError ?? true,
        };

        const createResult = (await this.batchTool.execute(batchArgs)) as any;
        results.created.push(createResult);

        // Extract tempId mapping for subsequent operations
        if (createResult?.metadata?.tempIdMapping) {
          tempIdMapping = createResult.metadata.tempIdMapping;
        }
      } catch (err) {
        results.errors.push({ phase: 'create', error: String(err) });
        if (compiled.stopOnError) hadError = true;
      }
    }

    // Phase 2-4: Updates, completes, deletes — route through existing single-item handlers
    const phases: Array<{
      name: string;
      ops: typeof updateOps;
      resultKey: 'updated' | 'completed' | 'deleted';
    }> = [
      { name: 'update', ops: updateOps, resultKey: 'updated' },
      { name: 'complete', ops: completeOps, resultKey: 'completed' },
      { name: 'delete', ops: deleteOps, resultKey: 'deleted' },
    ];

    for (const phase of phases) {
      if (hadError || phase.ops.length === 0) continue;

      for (const op of phase.ops) {
        try {
          // Resolve tempId references if the id matches a tempId from creates
          const resolvedId = op.id && tempIdMapping[op.id] ? tempIdMapping[op.id] : op.id;

          // Build compiled mutation for routing
          const compiledOp: Exclude<CompiledMutation, { operation: 'batch' | 'bulk_delete' | 'tag_manage' }> = {
            operation: op.operation as 'update' | 'complete' | 'delete',
            target: op.target,
            ...(op.target === 'task' ? { taskId: resolvedId } : { projectId: resolvedId }),
            ...(op.changes ? { changes: op.changes } : {}),
            ...(op.completionDate ? { completionDate: op.completionDate } : {}),
          } as any;

          let result: unknown;
          if (op.target === 'project') {
            result = await this.routeToProjectsTool(compiledOp);
          } else {
            result = await this.routeToManageTask(compiledOp);
          }
          results[phase.resultKey].push(result);
        } catch (err) {
          results.errors.push({ phase: phase.name, id: op.id, error: String(err) });
          if (compiled.stopOnError) {
            hadError = true;
            break;
          }
        }
      }
    }

    return {
      success: results.errors.length === 0,
      data: {
        operation: 'batch',
        summary: {
          created: results.created.length > 0 ? createOps.length : 0,
          updated: results.updated.length,
          completed: results.completed.length,
          deleted: results.deleted.length,
          errors: results.errors.length,
        },
        results,
        ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
      },
      metadata: {
        operation: 'batch',
        timestamp: new Date().toISOString(),
        ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
      },
    };
  }
```

**Step 4: Build and run tests**

Run: `npm run build && npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: PASS

**Step 5: Run full test suite to check for regressions**

Run: `npm run test:unit` Expected: All tests pass

**Step 6: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts tests/unit/tools/batch/batch-mixed-operations.test.ts
git commit -m "feat: rewrite routeToBatch to partition and delegate all operation types"
```

---

### Task 5: Extend previewBatch() for complete and delete

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts:257-337`
- Test: `tests/unit/tools/batch/batch-mixed-operations.test.ts` (append)

**Step 1: Write the failing test**

Append to test file:

```typescript
describe('previewBatch — dry run', () => {
  it('should preview all four operation types', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    const result = (await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          { operation: 'create', target: 'task', data: { name: 'New task' } },
          { operation: 'update', target: 'task', id: 'task-1', changes: { name: 'Updated' } },
          { operation: 'complete', target: 'task', id: 'task-2' },
          { operation: 'delete', target: 'task', id: 'task-3' },
        ],
        dryRun: true,
      },
    })) as any;

    // Parse the response — it's wrapped in MCP content format
    const data = JSON.parse(result.content[0].text);
    expect(data.data.wouldAffect.count).toBe(4);
    expect(data.data.wouldAffect.creates).toBe(1);
    expect(data.data.wouldAffect.updates).toBe(1);
    expect(data.data.wouldAffect.completes).toBe(1);
    expect(data.data.wouldAffect.deletes).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: FAIL — previewBatch doesn't
count completes/deletes

**Step 3: Extend previewBatch()**

In `src/tools/unified/OmniFocusWriteTool.ts`, replace the `previewBatch` method:

```typescript
  private previewBatch(compiled: Extract<CompiledMutation, { operation: 'batch' }>): unknown {
    const timer = new OperationTimerV2();

    // Partition operations
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');
    const completeOps = compiled.operations.filter((op) => op.operation === 'complete');
    const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

    // Build preview items for each type
    const createPreviewItems = createOps.map((op, index) => ({
      tempId: op.data?.tempId || `auto_temp_${index + 1}`,
      type: compiled.target,
      name: op.data?.name || 'Unnamed',
      action: 'create' as const,
      details: {
        project: op.data?.project,
        tags: op.data?.tags,
        dueDate: op.data?.dueDate,
        deferDate: op.data?.deferDate,
        flagged: op.data?.flagged,
        parentTempId: op.data?.parentTempId,
      },
    }));

    const updatePreviewItems = updateOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      name: op.changes?.name || `[Update to ${op.id}]`,
      action: 'update' as const,
      details: op.changes,
    }));

    const completePreviewItems = completeOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      action: 'complete' as const,
      details: { completionDate: op.completionDate },
    }));

    const deletePreviewItems = deleteOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      action: 'delete' as const,
    }));

    // Validation checks
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for duplicate tempIds
    const tempIds = createPreviewItems.map((item) => item.tempId);
    const duplicates = tempIds.filter((id, idx) => tempIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      errors.push(`Duplicate tempIds found: ${duplicates.join(', ')}`);
    }

    // Check for orphan parentTempIds
    const parentRefs = createPreviewItems
      .filter((item) => item.details.parentTempId)
      .map((item) => item.details.parentTempId);
    const orphanRefs = parentRefs.filter((ref) => !tempIds.includes(ref as string));
    if (orphanRefs.length > 0) {
      errors.push(`Parent references not found in batch: ${orphanRefs.join(', ')}`);
    }

    // Warning for large batches
    const totalOps = createOps.length + updateOps.length + completeOps.length + deleteOps.length;
    if (totalOps > 50) {
      warnings.push(`Large batch (${totalOps} operations) may take 30+ seconds to execute`);
    }

    // Warning for deletes
    if (deleteOps.length > 0) {
      warnings.push(`${deleteOps.length} item(s) will be permanently deleted`);
    }

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        dryRun: true,
        operation: 'batch',
        wouldAffect: {
          count: totalOps,
          creates: createPreviewItems.length,
          updates: updatePreviewItems.length,
          completes: completePreviewItems.length,
          deletes: deletePreviewItems.length,
          items: [
            ...createPreviewItems,
            ...updatePreviewItems,
            ...completePreviewItems,
            ...deletePreviewItems,
          ],
        },
        validation: {
          passed: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      },
      undefined,
      {
        ...timer.toMetadata(),
        message: `DRY RUN: No changes made. ${createOps.length} create, ${updateOps.length} update, ${completeOps.length} complete, ${deleteOps.length} delete.`,
      },
    );
  }
```

**Step 4: Build and run tests**

Run: `npm run build && npm run test:unit -- tests/unit/tools/batch/batch-mixed-operations.test.ts` Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts tests/unit/tools/batch/batch-mixed-operations.test.ts
git commit -m "feat: extend previewBatch to preview complete and delete operations"
```

---

### Task 6: Update tool description

**Files:**

- Modify: `src/tools/unified/OmniFocusWriteTool.ts:18-59`

**Step 1: Update the batch section of the tool description**

In `OmniFocusWriteTool.ts`, update the `BATCH OPERATIONS` section of the description string:

```
BATCH OPERATIONS:
- operations: Array of create, update, complete, and delete operations
- Execution order: creates first, then updates, completes, deletes last
- tempId: Optional for creates (auto-generated if not provided)
- parentTempId: Reference parent by tempId for hierarchies
- Updates/completes can reference tempIds from creates in the same batch
- createSequentially: true (respects dependencies)
- returnMapping: true (returns tempId → realId map)
- stopOnError: true (halt on first failure)
```

**Step 2: Build to verify**

Run: `npm run build` Expected: Clean compile

**Step 3: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts
git commit -m "docs: update batch operation tool description for mixed operations"
```

---

### Task 7: Full test suite verification

**Step 1: Run all unit tests**

Run: `npm run test:unit` Expected: All ~1335 tests pass

**Step 2: Run integration tests**

Run: `npm run test:integration` Expected: All ~73 tests pass

**Step 3: Final commit with test count update if needed**

If test counts changed in CLAUDE.md, update accordingly.

```bash
git add CLAUDE.md
git commit -m "docs: update test counts after batch mixed operations feature"
```
