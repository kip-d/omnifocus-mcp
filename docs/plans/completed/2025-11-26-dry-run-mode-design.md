# Dry-Run Mode for Bulk Operations

**Date:** 2025-11-26 **Status:** Design Complete **Priority:** MEDIUM **Effort:** LOW-MEDIUM (1-2 hours)

## Problem Statement

Bulk operations (`batch`, `bulk_delete`, `bulk_complete`) execute immediately without preview capability. Users cannot
verify what will be affected before committing destructive changes.

**Risk Scenarios:**

- `bulk_delete` with wrong criteria permanently removes tasks
- `batch` create with 100 items creates unwanted hierarchy
- `bulk_complete` marks wrong tasks as done

## Proposed Solution

Add `dryRun: boolean` flag to mutation schema. When `true`:

1. Validate all inputs normally
2. Resolve criteria to concrete items (if using bulkCriteria)
3. Build preview response without executing changes
4. Return what WOULD happen

## Implementation Design

### Schema Changes (`write-schema.ts`)

Add `dryRun` field to operations that benefit from preview:

```typescript
// Batch operation
z.object({
  operation: z.literal('batch'),
  target: z.enum(['task', 'project']),
  operations: z.array(BatchOperationSchema),
  dryRun: z.boolean().optional().default(false),  // NEW
  // ... existing fields
}),

// Bulk delete
z.object({
  operation: z.literal('bulk_delete'),
  target: z.enum(['task', 'project']),
  ids: z.array(z.string()).min(1).max(100),
  dryRun: z.boolean().optional().default(false),  // NEW
}),
```

### Response Format

```typescript
// Dry-run response structure
interface DryRunResponse {
  success: true;
  data: {
    dryRun: true;
    operation: string;
    wouldAffect: {
      count: number;
      items: Array<{
        id?: string; // For existing items
        tempId?: string; // For batch creates
        name: string;
        action: 'create' | 'update' | 'complete' | 'delete';
        details?: Record<string, unknown>; // Proposed changes
      }>;
    };
    validation: {
      passed: boolean;
      errors?: string[];
      warnings?: string[];
    };
  };
  metadata: {
    query_time_ms: number;
    message: string; // "DRY RUN: No changes made"
  };
}
```

### Implementation in OmniFocusWriteTool

```typescript
async executeValidated(args: WriteInput): Promise<unknown> {
  const compiled = this.compiler.compile(args);

  // Handle dry-run for batch operations
  if (compiled.dryRun) {
    return this.handleDryRun(compiled);
  }

  // ... existing routing logic
}

private async handleDryRun(compiled: CompiledMutation): Promise<DryRunResponse> {
  const timer = new OperationTimerV2();

  if (compiled.operation === 'batch') {
    return this.previewBatch(compiled, timer);
  }

  if (compiled.operation === 'bulk_delete') {
    return this.previewBulkDelete(compiled, timer);
  }

  // ... other operations
}

private async previewBulkDelete(
  compiled: Extract<CompiledMutation, { operation: 'bulk_delete' }>,
  timer: OperationTimerV2
): Promise<DryRunResponse> {
  // Fetch task details for the IDs to be deleted
  const taskDetails = await this.fetchTaskDetails(compiled.ids);

  return {
    success: true,
    data: {
      dryRun: true,
      operation: 'bulk_delete',
      wouldAffect: {
        count: compiled.ids.length,
        items: taskDetails.map(t => ({
          id: t.id,
          name: t.name,
          action: 'delete',
          details: {
            project: t.project,
            tags: t.tags,
            dueDate: t.dueDate,
          }
        })),
      },
      validation: { passed: true },
    },
    metadata: {
      query_time_ms: timer.toMetadata().query_time_ms,
      message: 'DRY RUN: No changes made. Review items above before executing.',
    },
  };
}
```

### Usage Examples

```json
// Preview bulk delete
{
  "mutation": {
    "operation": "bulk_delete",
    "target": "task",
    "ids": ["id1", "id2", "id3"],
    "dryRun": true
  }
}

// Response
{
  "success": true,
  "data": {
    "dryRun": true,
    "operation": "bulk_delete",
    "wouldAffect": {
      "count": 3,
      "items": [
        { "id": "id1", "name": "Task A", "action": "delete", "details": { "project": "Work" } },
        { "id": "id2", "name": "Task B", "action": "delete", "details": { "project": "Personal" } },
        { "id": "id3", "name": "Task C", "action": "delete", "details": { "project": null } }
      ]
    },
    "validation": { "passed": true }
  },
  "metadata": {
    "message": "DRY RUN: No changes made. 3 tasks would be deleted."
  }
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (30 min)

1. Add `dryRun` field to `write-schema.ts` for batch and bulk_delete
2. Add `handleDryRun()` method to OmniFocusWriteTool
3. Update MutationCompiler to pass through dryRun flag

### Phase 2: Preview Implementation (45 min)

1. Implement `previewBulkDelete()` - fetch task details for IDs
2. Implement `previewBatch()` - validate hierarchy, return planned items
3. Implement `previewBulkComplete()` (optional - lower risk operation)

### Phase 3: Testing (30 min)

1. Unit tests for dry-run response format
2. Integration test: dry-run → verify → execute pattern
3. Update TESTING_PROMPT_LIGHTWEIGHT.md with dry-run scenario

## Files to Modify

1. `src/tools/unified/schemas/write-schema.ts` - Add dryRun field
2. `src/tools/unified/compilers/MutationCompiler.ts` - Pass dryRun through
3. `src/tools/unified/OmniFocusWriteTool.ts` - Add dry-run handling
4. `tests/unit/tools/unified/write-dry-run.test.ts` - New test file
5. `tests/integration/tools/unified/write-dry-run.test.ts` - Integration tests

## Success Criteria

1. `dryRun: true` returns preview without making changes
2. Response includes all items that would be affected
3. Response includes enough detail to make informed decision
4. Same validation runs as non-dry-run (catches errors early)
5. Performance: dry-run should be faster than execution

## Risks & Mitigations

| Risk                                  | Mitigation                               |
| ------------------------------------- | ---------------------------------------- |
| Dry-run state differs from execution  | Use same validation code path            |
| Preview fetches slow for many items   | Limit preview to 100 items, warn if more |
| User forgets to execute after preview | Response message prompts next action     |

## Future Enhancements

- Add `dryRun` to update operations with criteria-based selection
- Add confirmation workflow: dry-run returns token, execute requires token
- Add diff view for update operations (current vs proposed)
