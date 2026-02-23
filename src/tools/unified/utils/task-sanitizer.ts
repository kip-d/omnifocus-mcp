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
  if (updates.clearDueDate) {
    logger.debug('Clearing dueDate (clearDueDate flag set)');
    sanitized.dueDate = null; // Clear the date
  } else if (updates.dueDate !== undefined) {
    logger.debug('Processing dueDate:', {
      value: updates.dueDate,
      type: typeof updates.dueDate,
    });

    if (typeof updates.dueDate === 'string') {
      try {
        // Convert local time to UTC for OmniFocus
        const utcDate = localToUTC(updates.dueDate, 'due');
        logger.debug('Date converted to UTC:', {
          original: updates.dueDate,
          converted: utcDate,
        });
        sanitized.dueDate = utcDate;
      } catch (error) {
        logger.warn(`Invalid dueDate format: ${updates.dueDate}`, error);
      }
    } else {
      logger.warn('Unexpected dueDate type:', {
        value: updates.dueDate,
        type: typeof updates.dueDate,
      });
    }
  }

  if (updates.clearDeferDate) {
    logger.debug('Clearing deferDate (clearDeferDate flag set)');
    sanitized.deferDate = null; // Clear the date
  } else if (updates.deferDate !== undefined) {
    logger.debug('Processing deferDate:', {
      value: updates.deferDate,
      type: typeof updates.deferDate,
    });

    if (typeof updates.deferDate === 'string') {
      try {
        // Convert local time to UTC for OmniFocus
        const utcDate = localToUTC(updates.deferDate, 'defer');
        logger.debug('DeferDate converted to UTC:', {
          original: updates.deferDate,
          converted: utcDate,
        });
        sanitized.deferDate = utcDate;
      } catch (error) {
        logger.warn(`Invalid deferDate format: ${updates.deferDate}`, error);
      }
    } else {
      logger.warn('Unexpected deferDate type:', {
        value: updates.deferDate,
        type: typeof updates.deferDate,
      });
    }
  }

  // Handle plannedDate (OmniFocus 4.7+ feature)
  if (updates.clearPlannedDate) {
    logger.debug('Clearing plannedDate (clearPlannedDate flag set)');
    sanitized.plannedDate = null; // Clear the date
  } else if (updates.plannedDate !== undefined) {
    logger.debug('Processing plannedDate:', {
      value: updates.plannedDate,
      type: typeof updates.plannedDate,
    });

    if (typeof updates.plannedDate === 'string') {
      try {
        // Convert local time to UTC for OmniFocus
        const utcDate = localToUTC(updates.plannedDate, 'planned');
        logger.debug('PlannedDate converted to UTC:', {
          original: updates.plannedDate,
          converted: utcDate,
        });
        sanitized.plannedDate = utcDate;
      } catch (error) {
        logger.warn(`Invalid plannedDate format: ${updates.plannedDate}`, error);
      }
    } else if (updates.plannedDate === null) {
      // Allow explicit null to clear the date
      sanitized.plannedDate = null;
    } else {
      logger.warn('Unexpected plannedDate type:', {
        value: updates.plannedDate,
        type: typeof updates.plannedDate,
      });
    }
  }

  // Handle completion date (for complete operation)
  if (updates.completionDate !== undefined && updates.completionDate !== null) {
    logger.debug('Processing completionDate:', {
      value: updates.completionDate,
      type: typeof updates.completionDate,
    });

    if (typeof updates.completionDate === 'string') {
      try {
        // Convert local time to UTC for OmniFocus
        const utcDate = localToUTC(updates.completionDate, 'completion');
        logger.debug('CompletionDate converted to UTC:', {
          original: updates.completionDate,
          converted: utcDate,
        });
        sanitized.completionDate = utcDate;
      } catch (error) {
        logger.warn(`Invalid completionDate format: ${updates.completionDate}`, error);
      }
    } else {
      logger.warn('Unexpected completionDate type:', {
        value: updates.completionDate,
        type: typeof updates.completionDate,
      });
    }
  }

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
