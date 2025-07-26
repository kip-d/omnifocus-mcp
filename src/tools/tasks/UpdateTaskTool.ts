import { z } from 'zod';
import { BaseTool } from '../base.js';
import { UPDATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createTaskResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { UpdateTaskResponse } from '../response-types.js';
import { UpdateTaskSchema } from '../schemas/task-schemas.js';

export class UpdateTaskTool extends BaseTool<typeof UpdateTaskSchema> {
  name = 'update_task';
  description = 'Update an existing task in OmniFocus (can move between projects using projectId)';
  schema = UpdateTaskSchema;

  async executeValidated(args: z.infer<typeof UpdateTaskSchema>): Promise<UpdateTaskResponse> {
    const timer = new OperationTimer();

    try {
      const { taskId, ...updates } = args;

      // Debug logging: Log all received parameters
      this.logger.info('UpdateTaskTool received parameters:', {
        taskId,
        updates: {
          ...updates,
          // Explicitly log the types and values of date fields
          dueDate: updates.dueDate !== undefined ? {
            value: updates.dueDate,
            type: typeof updates.dueDate,
            isNull: updates.dueDate === null,
            isUndefined: updates.dueDate === undefined,
          } : 'not provided',
          deferDate: updates.deferDate !== undefined ? {
            value: updates.deferDate,
            type: typeof updates.deferDate,
            isNull: updates.deferDate === null,
            isUndefined: updates.deferDate === undefined,
          } : 'not provided',
        },
      });

      // Validate required parameters
      if (!taskId || typeof taskId !== 'string') {
        return createErrorResponse(
          'update_task',
          'INVALID_PARAMS',
          'Task ID is required and must be a string',
          { provided_taskId: taskId },
          timer.toMetadata(),
        );
      }

      // Sanitize and validate updates object
      const safeUpdates = this.sanitizeUpdates(updates);

      // If no valid updates, return early
      if (Object.keys(safeUpdates).length === 0) {
        return createTaskResponse(
          'update_task',
          { id: taskId, name: '', updated: false as const, changes: {} },
          {
            query_time_ms: timer.getElapsedMs(),
            input_params: { taskId },
            message: 'No valid updates provided',
          },
        );
      }

      // Log what we're sending to the script
      this.logger.info('Sending to JXA script:', {
        taskId,
        safeUpdates,
        safeUpdatesKeys: Object.keys(safeUpdates),
      });

      // Use the full script for comprehensive update support
      const script = this.omniAutomation.buildScript(UPDATE_TASK_SCRIPT, {
        taskId,
        updates: safeUpdates,
      });

      const result = await this.omniAutomation.execute<string | { error: boolean; message: string; details?: string }>(script);

      // Handle script execution errors
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        const errorMessage = 'message' in result ? String(result.message) : 'Failed to update task';
        this.logger.error(`Update task script error: ${errorMessage}`);
        return createErrorResponse(
          'update_task',
          'SCRIPT_ERROR',
          errorMessage,
          'details' in result ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      // Parse the JSON result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse update task result: ${result}`);
        return createErrorResponse(
          'update_task',
          'PARSE_ERROR',
          'Failed to parse task update response',
          { received: result, parseError: parseError instanceof Error ? parseError.message : String(parseError) },
          timer.toMetadata(),
        );
      }

      // Check if the parsed result indicates an error
      if (parsedResult.error) {
        return createErrorResponse(
          'update_task',
          'UPDATE_FAILED',
          parsedResult.message || 'Update failed',
          parsedResult,
          timer.toMetadata(),
        );
      }

      // Invalidate cache after successful update
      this.cache.invalidate('tasks');

      this.logger.info(`Updated task: ${taskId}`);

      // Return standardized response with proper typing
      return createTaskResponse(
        'update_task',
        parsedResult,
        {
          ...timer.toMetadata(),
          updated_id: taskId,
          input_params: {
            taskId,
            fields_updated: Object.keys(safeUpdates),
            has_date_changes: !!(safeUpdates.dueDate || safeUpdates.deferDate || safeUpdates.clearDueDate || safeUpdates.clearDeferDate),
            has_project_change: safeUpdates.projectId !== undefined,
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  private sanitizeUpdates(updates: {
    name?: string;
    note?: string;
    flagged?: boolean;
    dueDate?: string;
    clearDueDate?: boolean;
    deferDate?: string;
    clearDeferDate?: boolean;
    estimatedMinutes?: number;
    clearEstimatedMinutes?: boolean;
    tags?: string[];
    projectId?: string | null;
  }): Record<string, unknown> {
    const sanitized: Record<string, any> = {};

    this.logger.info('Sanitizing updates:', {
      rawUpdates: updates,
      keys: Object.keys(updates),
    });

    // Handle string fields
    if (typeof updates.name === 'string') {
      sanitized.name = updates.name;
    }
    if (typeof updates.note === 'string') {
      sanitized.note = updates.note;
    }

    // Handle boolean fields
    if (typeof updates.flagged === 'boolean') {
      sanitized.flagged = updates.flagged;
    }

    // Handle date fields with separate clear flags
    if (updates.clearDueDate) {
      this.logger.info('Clearing dueDate (clearDueDate flag set)');
      sanitized.dueDate = null; // Clear the date
    } else if (updates.dueDate !== undefined) {
      this.logger.info('Processing dueDate:', {
        value: updates.dueDate,
        type: typeof updates.dueDate,
      });

      if (typeof updates.dueDate === 'string') {
        try {
          // Validate the date string but keep it as string (like create_task does)
          const parsedDate = new Date(updates.dueDate);
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date');
          }
          this.logger.info('Date string validated successfully:', {
            original: updates.dueDate,
            parsed: parsedDate.toISOString(),
          });
          sanitized.dueDate = updates.dueDate; // Keep as string for JXA script
        } catch (error) {
          this.logger.warn(`Invalid dueDate format: ${updates.dueDate}`, error);
        }
      } else {
        this.logger.warn('Unexpected dueDate type:', {
          value: updates.dueDate,
          type: typeof updates.dueDate,
        });
      }
    }

    if (updates.clearDeferDate) {
      this.logger.info('Clearing deferDate (clearDeferDate flag set)');
      sanitized.deferDate = null; // Clear the date
    } else if (updates.deferDate !== undefined) {
      this.logger.info('Processing deferDate:', {
        value: updates.deferDate,
        type: typeof updates.deferDate,
      });

      if (typeof updates.deferDate === 'string') {
        try {
          // Validate the date string but keep it as string (like create_task does)
          const parsedDate = new Date(updates.deferDate);
          if (isNaN(parsedDate.getTime())) {
            throw new Error('Invalid date');
          }
          this.logger.info('DeferDate string validated successfully:', {
            original: updates.deferDate,
            parsed: parsedDate.toISOString(),
          });
          sanitized.deferDate = updates.deferDate; // Keep as string for JXA script
        } catch (error) {
          this.logger.warn(`Invalid deferDate format: ${updates.deferDate}`, error);
        }
      } else {
        this.logger.warn('Unexpected deferDate type:', {
          value: updates.deferDate,
          type: typeof updates.deferDate,
        });
      }
    }

    // Handle numeric fields with separate clear flag
    if (updates.clearEstimatedMinutes) {
      this.logger.info('Clearing estimatedMinutes (clearEstimatedMinutes flag set)');
      sanitized.estimatedMinutes = null; // Clear the estimate
    } else if (updates.estimatedMinutes !== undefined) {
      sanitized.estimatedMinutes = updates.estimatedMinutes;
    }

    // Handle project ID (allow null/empty string)
    if (updates.projectId !== undefined) {
      sanitized.projectId = updates.projectId;
    }

    // Handle tags array
    if (Array.isArray(updates.tags)) {
      sanitized.tags = updates.tags.filter(tag => typeof tag === 'string');
    }

    return sanitized;
  }
}
