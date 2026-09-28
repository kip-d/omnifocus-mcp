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
  /** OMN-137: best-effort failures from the create script (tags, repetitionRule, …). Present only when non-empty. */
  warnings?: string[];
}

/**
 * OMN-137: lift non-empty script warnings off an envelope into a spreadable
 * fragment. Non-string elements are dropped (scripts only ever emit strings;
 * anything else is a malformed envelope). Empty or missing warnings produce {}
 * so the response key stays omitted entirely (no noise on clean creates).
 *
 * Canonical omit-when-empty implementation — shared by OmniFocusWriteTool
 * (single create + batch slow path) and flattenCreateItem below.
 */
export function liftWarnings(source: unknown): { warnings?: string[] } {
  const w = (source as { warnings?: unknown } | null | undefined)?.warnings;
  if (!Array.isArray(w)) return {};
  const strings = w.filter((x): x is string => typeof x === 'string');
  return strings.length > 0 ? { warnings: strings } : {};
}

/** Fallback `error` text for a failure that carries no usable message — one string on every path. */
const UNKNOWN_ERROR = 'Unknown error';

/** The message of an `error` field: a string, or an object's string `message`. */
function errorMessageOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : undefined;
}

/**
 * OMN-333: the failure message of a handler result that reports `success: false`,
 * or null when it succeeded. Batch handlers RETURN an error envelope
 * (createErrorResponseV2: `{ success: false, error: { code, message } }`) rather
 * than throwing, so the batch must inspect what comes back, not only catch.
 */
export function returnedFailureMessage(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { success?: unknown; error?: unknown };
  if (r.success !== false) return null;
  return errorMessageOf(r.error) ?? UNKNOWN_ERROR;
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
    const batch = createBatch as { results?: CreateItemResult[] };
    for (const item of batch.results ?? []) {
      flat.push(flattenCreateItem(item));
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
    const err = errorItem as { phase?: string; id?: string; tempId?: string; error?: string | { message?: string } };
    const errorFallback = typeof err.error === 'object' ? err.error?.message : String(err.error);
    const errorMsg = typeof err.error === 'string' ? err.error : errorFallback;
    flat.push({
      operation: err.phase || 'unknown',
      success: false as const,
      // Phase-level errors (OMN-141: stopOnError halt, atomic rollback) have no
      // item id — null is honest where the string 'unknown' was a lie.
      id: err.id ?? null,
      // OMN-333: a follow-up op addressed by a resolved tempId names both.
      ...(err.tempId ? { tempId: err.tempId } : {}),
      error: errorMsg || UNKNOWN_ERROR,
    });
  }

  return flat;
}

/** Per-item shape produced by executeBatchCreates. */
interface CreateItemResult {
  tempId: string;
  realId: string | null;
  success: boolean;
  type: string;
  error?: string;
  warnings?: string[];
}

/** Project one batch-create item into the flat shape (error/warnings only when present/non-empty). */
function flattenCreateItem(item: CreateItemResult): FlatBatchResult {
  const entry: FlatBatchResult = {
    operation: 'create' as const,
    success: item.success,
    id: item.realId,
    tempId: item.tempId,
    type: item.type,
  };
  if (item.error) {
    entry.error = item.error;
  }
  // OMN-137: per-item script warnings survive the projection (non-empty only).
  Object.assign(entry, liftWarnings(item));
  return entry;
}

/**
 * Extract id, name, and operation-specific fields from a per-operation result.
 *
 * Handles two shapes:
 * 1. StandardResponseV2 envelope. The entity sits in one of (OMN-333):
 *    - `data.task` — `{ id, name, changes }` (task update) or the script's
 *      `{ taskId, name, ... }` (task complete/delete)
 *    - `data.project` — the script's `{ projectId, name, ... }` (project complete/delete)
 *    - `data` itself — `{ projectId, name, ... }` spread in (project update)
 * 2. minimalResponse: { success, id, fields_updated: [...] }
 *
 * Reading only `data.task.id` gave every complete/delete row and every project
 * row `id: 'unknown'`. A row with no id anywhere now gets null (OMN-141).
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
    if (!entry.success) {
      entry.error = errorMessageOf(result.error) ?? UNKNOWN_ERROR;
    }
    // OMN-137: minimalResponse updates carry warnings at the top level — keep them (non-empty only).
    Object.assign(entry, liftWarnings(result));
    return entry;
  }

  const data = result.data as Record<string, unknown> | undefined;
  const task = data?.task as Record<string, unknown> | undefined;
  const entity = task ?? (data?.project as Record<string, unknown> | undefined) ?? data;
  const id = firstString(entity?.id, entity?.taskId, entity?.projectId);
  const name = firstString(entity?.name);

  const entry: FlatBatchResult = {
    operation,
    success: result.success !== false,
    id: id ?? null,
  };

  if (name) {
    entry.name = name;
  }

  // Failures are routed to errors[] before flattening (OMN-333); if one reaches
  // this path anyway, keep its message rather than dropping it.
  if (!entry.success) {
    entry.error = errorMessageOf(result.error) ?? UNKNOWN_ERROR;
  }

  if (operation === 'update' && task?.changes) {
    entry.changes = Object.keys(task.changes as Record<string, unknown>);
  }

  // OMN-137: envelope-level warnings (data.warnings) survive the flatten (non-empty only).
  Object.assign(entry, liftWarnings(data));

  return entry;
}

/** First non-empty string among the candidates. */
function firstString(...candidates: unknown[]): string | undefined {
  return candidates.find((c): c is string => typeof c === 'string' && c.length > 0);
}
