/**
 * Task update sanitization utilities
 *
 * Task update sanitization shared by OmniFocusWriteTool and any future consumers.
 * Originally extracted from the legacy ManageTaskTool.sanitizeUpdates().
 *
 * Handles:
 * - String coercion for booleans (MCP bridge sends "true"/"false")
 * - Date conversion via localToUTC()
 * - Clear-field flags (clearDueDate → dueDate: null)
 * - Tag array filtering (removes non-string entries)
 * - Project field mapping (projectId → project)
 * - Numeric field coercion (string → number)
 */

import { localToUTC } from '../../../utils/timezone.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('task-sanitizer');

/**
 * Sanitize a single date field with its corresponding clear flag.
 *
 * Handles: clear-flag → null, string → localToUTC conversion, explicit null passthrough.
 * Explicit null is always allowed (harmless for fields that also have a clear flag).
 */
function sanitizeDateField(
  updates: Record<string, unknown>,
  sanitized: Record<string, unknown>,
  fieldName: string,
  clearFlagName: string,
  dateType: 'due' | 'defer' | 'planned' | 'completion',
): void {
  if (updates[clearFlagName]) {
    logger.debug(`Clearing ${fieldName} (${clearFlagName} flag set)`);
    sanitized[fieldName] = null;
  } else if (updates[fieldName] !== undefined) {
    const value = updates[fieldName];
    logger.debug(`Processing ${fieldName}:`, { value, type: typeof value });

    if (typeof value === 'string') {
      try {
        const utcDate = localToUTC(value, dateType);
        logger.debug(`${fieldName} converted to UTC:`, { original: value, converted: utcDate });
        sanitized[fieldName] = utcDate;
      } catch (error) {
        logger.warn(`Invalid ${fieldName} format: ${value}`, error);
      }
    } else if (value === null) {
      // Allow explicit null to clear the date
      sanitized[fieldName] = null;
    } else {
      logger.warn(`Unexpected ${fieldName} type:`, { value, type: typeof value });
    }
  }
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function sanitizeStringTags(arr: unknown[]): string[] {
  return arr.filter((tag: unknown) => typeof tag === 'string') as string[];
}

export function sanitizeTaskUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  logger.debug('Sanitizing updates with keys:', Object.keys(updates));

  // String fields
  if (typeof updates.name === 'string') sanitized.name = updates.name;
  if (typeof updates.note === 'string') sanitized.note = updates.note;

  // Boolean fields (with MCP bridge coercion)
  const flagged = coerceBoolean(updates.flagged);
  if (flagged !== undefined) sanitized.flagged = flagged;

  // Date fields with separate clear flags
  sanitizeDateField(updates, sanitized, 'dueDate', 'clearDueDate', 'due');
  sanitizeDateField(updates, sanitized, 'deferDate', 'clearDeferDate', 'defer');
  sanitizeDateField(updates, sanitized, 'plannedDate', 'clearPlannedDate', 'planned');
  sanitizeDateField(updates, sanitized, 'completionDate', 'clearCompletionDate', 'completion');

  // Numeric fields with clear flag
  if (updates.clearEstimatedMinutes) {
    logger.debug('Clearing estimatedMinutes (clearEstimatedMinutes flag set)');
    sanitized.estimatedMinutes = null;
  } else if (updates.estimatedMinutes !== undefined) {
    const parsed = coerceNumber(updates.estimatedMinutes);
    if (parsed !== undefined) sanitized.estimatedMinutes = parsed;
  }

  // Project ID: support both 'projectId' (legacy) and 'project' (unified API)
  if (updates.projectId !== undefined) sanitized.project = updates.projectId;
  else if (updates.project !== undefined) sanitized.project = updates.project;

  // Tag arrays
  if (Array.isArray(updates.tags)) sanitized.tags = sanitizeStringTags(updates.tags);
  if (Array.isArray(updates.addTags)) sanitized.addTags = sanitizeStringTags(updates.addTags);
  if (Array.isArray(updates.removeTags)) sanitized.removeTags = sanitizeStringTags(updates.removeTags);

  // Parent task ID
  if (updates.parentTaskId !== undefined) sanitized.parentTaskId = updates.parentTaskId;

  // Sequential flag (with MCP bridge coercion)
  const sequential = coerceBoolean(updates.sequential);
  if (sequential !== undefined) sanitized.sequential = sequential;

  // Repetition rule (object = set, null = clear)
  if (updates.repetitionRule === null) {
    sanitized.repetitionRule = null;
    logger.debug('Clearing repetitionRule (null)');
  } else if (updates.repetitionRule !== undefined && typeof updates.repetitionRule === 'object') {
    sanitized.repetitionRule = updates.repetitionRule;
    logger.debug('Passing through repetitionRule:', updates.repetitionRule);
  }

  // Status field
  if (updates.status === 'completed' || updates.status === 'dropped') {
    sanitized.status = updates.status;
  }

  return sanitized;
}
