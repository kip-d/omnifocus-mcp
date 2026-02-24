/**
 * Pure function to flatten nested batch operation results into a flat array.
 *
 * Transforms the grouped-by-type results from routeToBatch() into a single
 * flat array that preserves type ordering (creates → updates → completes → deletes → errors).
 *
 * This eliminates ~200 tokens/operation of redundant per-operation metadata envelopes.
 */

/** Flat batch result item — all fields optional except operation, success, id */
export interface FlatBatchResult {
  operation: string;
  success: boolean;
  id: string | null;
  name?: string;
  tempId?: string;
  type?: string;
  changes?: string[];
  error?: string;
}

/** Shape of the nested results object from routeToBatch() */
interface NestedBatchResults {
  created: unknown[];
  updated: unknown[];
  completed: unknown[];
  deleted: unknown[];
  errors: unknown[];
}

/**
 * Flatten nested batch results into a single array.
 *
 * Input shape (nested):
 *   created: [{ success, created, failed, totalItems, results: [{ tempId, realId, success, type }], mapping }]
 *   updated: [{ success, data: { task: { id, name, changes } }, metadata }]  or minimalResponse shape
 *   completed: [{ success, data: { task: { id, name } }, metadata }]
 *   deleted: [{ success, data: { task: { id, name } }, metadata }]
 *   errors: [{ phase, id, error }]
 *
 * Output shape (flat):
 *   [{ operation, success, id, name?, tempId?, type?, changes?, error? }]
 */
export function flattenBatchResults(results: NestedBatchResults): FlatBatchResult[] {
  const flat: FlatBatchResult[] = [];

  // Creates — unwrap from executeBatchCreates envelope
  for (const createBatch of results.created) {
    const batch = createBatch as {
      results?: Array<{
        tempId: string;
        realId: string | null;
        success: boolean;
        type: string;
        error?: string;
      }>;
    };
    if (batch.results) {
      for (const item of batch.results) {
        const entry: FlatBatchResult = {
          operation: 'create' as const,
          success: item.success,
          id: item.realId,
          tempId: item.tempId,
          type: item.type,
        };
        if (item.error) {
          (entry as { error?: string }).error = item.error;
        }
        flat.push(entry);
      }
    }
  }

  // Updates — unwrap from StandardResponseV2 or minimalResponse envelope
  for (const updateResult of results.updated) {
    const result = updateResult as Record<string, unknown>;
    flat.push(extractOperationResult('update', result));
  }

  // Completes — unwrap from StandardResponseV2 envelope
  for (const completeResult of results.completed) {
    const result = completeResult as Record<string, unknown>;
    flat.push(extractOperationResult('complete', result));
  }

  // Deletes — unwrap from StandardResponseV2 envelope
  for (const deleteResult of results.deleted) {
    const result = deleteResult as Record<string, unknown>;
    flat.push(extractOperationResult('delete', result));
  }

  // Errors — map from { phase, id, error } to flat format
  for (const errorItem of results.errors) {
    const err = errorItem as { phase?: string; id?: string; error?: string | { message?: string } };
    const errorMsg =
      typeof err.error === 'string'
        ? err.error
        : typeof err.error === 'object'
          ? err.error?.message
          : String(err.error);
    flat.push({
      operation: err.phase || 'unknown',
      success: false as const,
      id: err.id || 'unknown',
      error: errorMsg || 'Unknown error',
    });
  }

  return flat;
}

/**
 * Extract id, name, and operation-specific fields from a per-operation result.
 *
 * Handles two shapes:
 * 1. StandardResponseV2 envelope: { success, data: { task: { id, name, ... } }, metadata }
 * 2. minimalResponse: { success, id, fields_updated: [...] }
 */
function extractOperationResult(
  operation: 'update' | 'complete' | 'delete',
  result: Record<string, unknown>,
): FlatBatchResult {
  // Check for minimalResponse shape (flat object with id and fields_updated)
  if ('fields_updated' in result && typeof result.id === 'string') {
    const entry: FlatBatchResult = {
      operation,
      success: result.success !== false,
      id: result.id as string,
    };
    if (operation === 'update') {
      entry.changes = result.fields_updated as string[];
    }
    return entry;
  }

  // StandardResponseV2 envelope: { success, data: { task: { id, name, ... } }, metadata }
  const data = result.data as Record<string, unknown> | undefined;
  const task = data?.task as Record<string, unknown> | undefined;

  const entry: FlatBatchResult = {
    operation,
    success: result.success !== false,
    id: (task?.id as string) || 'unknown',
  };

  if (task?.name) {
    entry.name = task.name as string;
  }

  if (operation === 'update' && task?.changes) {
    entry.changes = Object.keys(task.changes as Record<string, unknown>);
  }

  return entry;
}
