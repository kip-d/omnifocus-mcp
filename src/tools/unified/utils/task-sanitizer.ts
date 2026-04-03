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

export function sanitizeTaskUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  // Only log keys, not values (privacy-safe)
  logger.debug('Sanitizing updates with keys:', Object.keys(updates));

  // Handle string fields
  if (typeof updates.name === 'string') {
    sanitized.name = updates.name;
  }
  if (typeof updates.note === 'string') {
    sanitized.note = updates.note;
  }

  // Handle boolean fields (with MCP bridge coercion support)
  if (typeof updates.flagged === 'boolean') {
    sanitized.flagged = updates.flagged;
  } else if (typeof updates.flagged === 'string') {
    // Handle MCP bridge string coercion
    sanitized.flagged = updates.flagged === 'true';
  }

  // Handle date fields with separate clear flags
  sanitizeDateField(updates, sanitized, 'dueDate', 'clearDueDate', 'due');
  sanitizeDateField(updates, sanitized, 'deferDate', 'clearDeferDate', 'defer');
  sanitizeDateField(updates, sanitized, 'plannedDate', 'clearPlannedDate', 'planned');

  // Handle completion date (for complete operation) — no clear flag, reuse helper with empty key
  sanitizeDateField(updates, sanitized, 'completionDate', 'clearCompletionDate', 'completion');

  // Handle numeric fields with separate clear flag
  if (updates.clearEstimatedMinutes) {
    logger.debug('Clearing estimatedMinutes (clearEstimatedMinutes flag set)');
    sanitized.estimatedMinutes = null; // Clear the estimate
  } else if (updates.estimatedMinutes !== undefined) {
    // Handle MCP bridge string coercion
    if (typeof updates.estimatedMinutes === 'string') {
      const parsed = parseInt(updates.estimatedMinutes, 10);
      if (!isNaN(parsed)) {
        sanitized.estimatedMinutes = parsed;
      }
    } else if (typeof updates.estimatedMinutes === 'number') {
      sanitized.estimatedMinutes = updates.estimatedMinutes;
    }
  }

  // Handle project ID (allow null/empty string)
  // Support both 'projectId' (legacy) and 'project' (unified API)
  // Note: downstream mutation-script-builder.ts expects 'project' field
  if (updates.projectId !== undefined) {
    sanitized.project = updates.projectId;
  } else if (updates.project !== undefined) {
    sanitized.project = updates.project;
  }

  // Handle tags array (replaces all tags)
  if (Array.isArray(updates.tags)) {
    sanitized.tags = updates.tags.filter((tag: unknown) => typeof tag === 'string');
  }

  // Handle addTags array (adds to existing tags)
  if (Array.isArray(updates.addTags)) {
    sanitized.addTags = updates.addTags.filter((tag: unknown) => typeof tag === 'string');
  }

  // Handle removeTags array (removes from existing tags)
  if (Array.isArray(updates.removeTags)) {
    sanitized.removeTags = updates.removeTags.filter((tag: unknown) => typeof tag === 'string');
  }

  // Handle parent task ID (allow null/empty string)
  if (updates.parentTaskId !== undefined) {
    sanitized.parentTaskId = updates.parentTaskId;
  }

  // Handle sequential flag (with MCP bridge coercion support)
  if (typeof updates.sequential === 'boolean') {
    sanitized.sequential = updates.sequential;
  } else if (typeof updates.sequential === 'string') {
    // Handle MCP bridge string coercion
    sanitized.sequential = updates.sequential === 'true';
  }

  // Handle repetitionRule (unified API format - OmniFocus 4.7+)
  // Object = set/update rule, null = clear rule (matches dueDate: null pattern)
  if (updates.repetitionRule === null) {
    sanitized.repetitionRule = null;
    logger.debug('Clearing repetitionRule (null)');
  } else if (updates.repetitionRule !== undefined && typeof updates.repetitionRule === 'object') {
    sanitized.repetitionRule = updates.repetitionRule;
    logger.debug('Passing through repetitionRule:', updates.repetitionRule);
  }

  // Handle status field (completed/dropped)
  if (updates.status === 'completed' || updates.status === 'dropped') {
    sanitized.status = updates.status;
  }

  return sanitized;
}
