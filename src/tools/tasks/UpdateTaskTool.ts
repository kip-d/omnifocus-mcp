import { z } from 'zod';
import { BaseTool } from '../base.js';
import { createUpdateTaskScript } from '../../omnifocus/scripts/tasks/update-task.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { UpdateTaskSchema } from '../schemas/task-schemas.js';
import { localToUTC } from '../../utils/timezone.js';

export class UpdateTaskTool extends BaseTool<typeof UpdateTaskSchema> {
  name = 'update_task';
  description = 'Update an existing task in OmniFocus. Can move between projects (projectId) or into/out of action groups (parentTaskId). Set sequential for action groups. Tags work properly. Use clearDueDate=true to remove dates. IMPORTANT: Use YYYY-MM-DD or "YYYY-MM-DD HH:mm" format for dates. Smart defaults: due dates → 5pm, defer dates → 8am. Avoid ISO-8601 with Z suffix. CONTEXT OPTIMIZATION: Use responseLevel="ultra" for 83% token reduction (success + ID only) when updating 10+ tasks, or responseLevel="minimal" for backwards compatibility. Essential for bulk operations to avoid context window exhaustion.';
  schema = UpdateTaskSchema;

  async executeValidated(args: z.infer<typeof UpdateTaskSchema>): Promise<any> {
    const timer = new OperationTimerV2();

    try {
      const { taskId, minimalResponse = false, responseLevel = 'standard', ...updates } = args;

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
        return createErrorResponseV2(
          'update_task',
          'INVALID_PARAMS',
          'Task ID is required and must be a string',
          'Provide a non-empty string taskId',
          { provided_taskId: taskId },
          timer.toMetadata(),
        );
      }

      // Sanitize and validate updates object
      const safeUpdates = this.sanitizeUpdates(updates);

      // If no valid updates, return early
      if (Object.keys(safeUpdates).length === 0) {
        return createSuccessResponseV2(
          'update_task',
          { task: { id: taskId, name: '', updated: false as const, changes: {} } as any },
          undefined,
          { ...timer.toMetadata(), input_params: { taskId }, message: 'No valid updates provided' },
        );
      }

      // Log what we're sending to the script
      this.logger.info('Sending to JXA script:', {
        taskId,
        safeUpdates,
        safeUpdatesKeys: Object.keys(safeUpdates),
      });

      // Use new function argument architecture for template substitution safety
      const script = createUpdateTaskScript(taskId, safeUpdates);
      const anyOmni: any = this.omniAutomation as any;
      let parsedResult: any;
      if (typeof anyOmni.executeJson === 'function') {
        const res = await anyOmni.executeJson(script);
        if (res && typeof res === 'object' && 'success' in res) {
          if (!(res as any).success) {
            this.logger.error(`Update task script error: ${(res as any).error}`);
            return createErrorResponseV2('update_task', 'SCRIPT_ERROR', (res as any).error || 'Script execution failed', 'Verify task exists and params are valid', (res as any).details, timer.toMetadata());
          }
          parsedResult = (res as any).data;
        } else {
          parsedResult = res;
        }
      } else {
        // Fallback to execute() returning JSON string or object
        const raw = await anyOmni.execute(script);
        parsedResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }

      // Invalidate caches after successful update
      this.cache.invalidate('tasks');
      // Invalidate analytics when dates/flags may affect summaries
      if (safeUpdates.dueDate !== undefined || safeUpdates.deferDate !== undefined || safeUpdates.clearDueDate || safeUpdates.clearDeferDate || safeUpdates.flagged !== undefined) {
        this.cache.invalidate('analytics');
      }
      // Invalidate related collections when relationships changed
      if (safeUpdates.projectId !== undefined) this.cache.invalidate('projects');
      if (safeUpdates.tags !== undefined) this.cache.invalidate('tags');

      this.logger.info(`Updated task: ${taskId}`);

      // Handle response levels for context optimization
      if (minimalResponse || responseLevel === 'minimal' || responseLevel === 'ultra') {
        const baseResponse = {
          success: true,
          id: taskId,
          operation: 'update_task',
        };

        // Level 2 Ultra-minimal: Just success + ID (83% token reduction)
        if (responseLevel === 'ultra') {
          return baseResponse as any;
        }

        // Minimal: success + ID + key changes (for backwards compatibility)
        return {
          ...baseResponse,
          task_id: taskId, // Keep for backwards compatibility
          fields_updated: Object.keys(safeUpdates),
        } as any;
      }

      // Transform new schema-validated result to expected format
      const taskData = (parsedResult as any)?.data?.task || (parsedResult as any)?.task || parsedResult || { id: taskId, name: 'Unknown' };
      const transformedResult = {
        id: taskData.id || taskId,
        name: taskData.name || 'Unknown',
        updated: true,
        changes: Object.keys(safeUpdates).reduce((acc, key) => {
          acc[key] = safeUpdates[key];
          return acc;
        }, {} as Record<string, unknown>),
      };

      // Return standardized response with proper typing
      return createSuccessResponseV2(
        'update_task',
        { task: transformedResult as any },
        undefined,
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
      return this.handleError(error) as any;
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
    parentTaskId?: string | null;
    sequential?: boolean;
    repeatRule?: any;
    clearRepeatRule?: boolean;
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
          // Convert local time to UTC for OmniFocus
          const utcDate = localToUTC(updates.dueDate, 'due');
          this.logger.info('Date converted to UTC:', {
            original: updates.dueDate,
            converted: utcDate,
          });
          sanitized.dueDate = utcDate;
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
          // Convert local time to UTC for OmniFocus
          const utcDate = localToUTC(updates.deferDate, 'defer');
          this.logger.info('DeferDate converted to UTC:', {
            original: updates.deferDate,
            converted: utcDate,
          });
          sanitized.deferDate = utcDate;
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

    // Handle parent task ID (allow null/empty string)
    if (updates.parentTaskId !== undefined) {
      sanitized.parentTaskId = updates.parentTaskId;
    }

    // Handle sequential flag
    if (typeof updates.sequential === 'boolean') {
      sanitized.sequential = updates.sequential;
    }

    // Handle repeat rule
    if (updates.repeatRule && typeof updates.repeatRule === 'object') {
      sanitized.repeatRule = updates.repeatRule;
    }

    // Handle clear repeat rule flag
    if (updates.clearRepeatRule === true) {
      sanitized.clearRepeatRule = true;
    }

    return sanitized;
  }
}
