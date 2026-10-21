/**
 * Task update sanitization utilities
 *
 * Task update sanitization shared by OmniFocusWriteTool and any future consumers.
 * Originally extracted from the legacy ManageTaskTool.sanitizeUpdates().
 *
 * OMN-343 (slice 2) + OMN-362/364: this used to be the ONLY gate between
 * an arbitrary update payload and the mutation builder — it filtered out
 * malformed types (non-string name, non-numeric estimatedMinutes, a
 * target-mismatched field, …) by silently DROPPING them, which is exactly the
 * silent-data-loss anti-pattern OMN-343 closes. That filtering role now lives
 * at the schema boundary: UpdateChangesSchema validates every field's type
 * (strict, no unknown keys) and the WriteSchema superRefine rejects
 * target-mismatched fields and task on_hold (write-schema.ts) — all BEFORE
 * `compiled.changes` (this function's `updates` parameter) is ever
 * constructed. By the time this function runs, every value is already the
 * correctly-typed, schema-validated shape; there is nothing left to coerce or
 * filter here except:
 * - local-time date strings → UTC (the builder's public contract — see
 *   lowerDateSetClear's comment in mutation/defs.ts — expects either an ISO
 *   UTC string, null, or absent; it does NOT do its own timezone conversion)
 * - merging a clear-flag into its value (clearDueDate → dueDate: null)
 * - forwarding the rest verbatim
 *
 * No private coerceBoolean/coerceNumber here (OMN-364; the shared
 * coerceNumber's decimal-only-string fix is OMN-365, in
 * src/tools/schemas/coercion-helpers.ts, not this file) — trust the
 * Zod-validated input. A caller invoking this function directly with malformed types (as
 * only the unit tests now do, since production callers always pass
 * schema-validated `compiled.changes`) gets those values forwarded as-is,
 * not silently stripped.
 */

import { localToUTC } from '../../../utils/timezone.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('task-sanitizer');

/**
 * Sanitize a single date field with its corresponding clear flag.
 *
 * Handles: clear-flag → null, string → localToUTC conversion, explicit null passthrough.
 * Explicit null is always allowed (harmless for fields that also have a clear flag).
 *
 * OMN-343 (slice 2): UpdateChangesSchema's DATE_REGEX + calendar-validity
 * refine (write-schema.ts's `isCalendarValidDate`) now reject every
 * non-conforming FORMAT and every calendar-invalid value (month 13, hour 25,
 * "2026-02-30", …) before `updates` is ever built — there is no longer a
 * schema-validated string this function's `localToUTC` call can fail to
 * parse. A throw here means the schema let something through it shouldn't
 * have (a genuine bug, e.g. a schema/conversion drift), not a legitimate
 * user input to silently drop — so it RETHROWS instead of catching and
 * dropping the field. No silent data loss anywhere on this path.
 */
function sanitizeDateField(
  updates: Record<string, unknown>,
  sanitized: Record<string, unknown>,
  fieldName: string,
  clearFlagName: string,
  dateType: 'due' | 'defer' | 'planned',
): void {
  if (updates[clearFlagName]) {
    logger.debug(`Clearing ${fieldName} (${clearFlagName} flag set)`);
    sanitized[fieldName] = null;
  } else if (updates[fieldName] !== undefined) {
    const value = updates[fieldName];
    logger.debug(`Processing ${fieldName}:`, { value, type: typeof value });

    if (typeof value === 'string') {
      const utcDate = localToUTC(value, dateType);
      logger.debug(`${fieldName} converted to UTC:`, { original: value, converted: utcDate });
      sanitized[fieldName] = utcDate;
    } else if (value === null) {
      // Allow explicit null to clear the date
      sanitized[fieldName] = null;
    } else {
      logger.warn(`Unexpected ${fieldName} type:`, { value, type: typeof value });
    }
  }
}

// Fields forwarded verbatim: UpdateChangesSchema has already validated their
// types (coerceBoolean()/the estimatedMinutes number-union/etc. ran in the
// schema layer), and WriteSchema's superRefine has already rejected a
// target-mismatched field or an on_hold status before this function sees
// `updates`. `status` here is always one of completed|dropped|active for a
// task (on_hold is rejected upstream).
const PASSTHROUGH_FIELDS = ['name', 'note', 'flagged', 'sequential', 'project', 'parentTaskId', 'status'] as const;

export function sanitizeTaskUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  logger.debug('Sanitizing updates with keys:', Object.keys(updates));

  for (const field of PASSTHROUGH_FIELDS) {
    if (updates[field] !== undefined) sanitized[field] = updates[field];
  }

  // Date fields with separate clear flags
  sanitizeDateField(updates, sanitized, 'dueDate', 'clearDueDate', 'due');
  sanitizeDateField(updates, sanitized, 'deferDate', 'clearDeferDate', 'defer');
  sanitizeDateField(updates, sanitized, 'plannedDate', 'clearPlannedDate', 'planned');

  // Numeric field with clear flag (clear wins, matching the date fields above).
  if (updates.clearEstimatedMinutes) {
    logger.debug('Clearing estimatedMinutes (clearEstimatedMinutes flag set)');
    sanitized.estimatedMinutes = null;
  } else if (updates.estimatedMinutes !== undefined) {
    sanitized.estimatedMinutes = updates.estimatedMinutes;
  }

  // Tag arrays — already string[] per UpdateChangesSchema.
  if (Array.isArray(updates.tags)) sanitized.tags = updates.tags;
  if (Array.isArray(updates.addTags)) sanitized.addTags = updates.addTags;
  if (Array.isArray(updates.removeTags)) sanitized.removeTags = updates.removeTags;

  // Repetition rule (object = set, null = clear) — already validated by RepetitionRuleSchema.
  if (updates.repetitionRule !== undefined) {
    sanitized.repetitionRule = updates.repetitionRule;
    logger.debug('Forwarding repetitionRule:', updates.repetitionRule);
  }

  return sanitized;
}
