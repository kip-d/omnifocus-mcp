import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_TASK_SCRIPT, COMPLETE_TASK_SCRIPT, DELETE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createUpdateTaskScript } from '../../omnifocus/scripts/tasks/update-task.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { CreateTaskResponse } from '../types.js';
import { CreateTaskScriptResponse } from '../../omnifocus/script-types.js';
import { localToUTC } from '../../utils/timezone.js';
import {
  parsingError,
  formatErrorWithRecovery,
  invalidDateError,
} from '../../utils/error-messages.js';

// Consolidated schema that combines all task CRUD operations
const ManageTaskSchema = z.object({
  operation: z.enum(['create', 'update', 'complete', 'delete'])
    .describe('The operation to perform on the task'),

  // Task identification (for update/complete/delete)
  taskId: z.string()
    .optional()
    .describe('ID of the task (required for update/complete/delete operations)'),

  // Create/Update parameters
  name: z.string()
    .optional()
    .describe('Task name (required for create, optional for update)'),

  note: z.string()
    .optional()
    .describe('Task note/description'),

  projectId: z.union([z.string().min(1), z.literal(''), z.null()])
    .optional()
    .nullable()
    .transform(val => val === '' ? null : val)
    .describe('Project ID to assign the task to (null/empty to move to inbox)'),

  parentTaskId: z.union([z.string().min(1), z.literal(''), z.null()])
    .optional()
    .transform(val => val === '' ? undefined : val)
    .describe('Parent task ID to create this as a subtask'),

  dueDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null()
  ])
    .optional()
    .nullable()
    .transform(val => val === '' ? null : val)
    .describe('Due date (YYYY-MM-DD or YYYY-MM-DD HH:mm format)'),

  deferDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null()
  ])
    .optional()
    .nullable()
    .transform(val => val === '' ? null : val)
    .describe('Defer date (YYYY-MM-DD or YYYY-MM-DD HH:mm format)'),

  flagged: z.union([z.boolean(), z.string()])
    .optional()
    .describe('Whether the task is flagged'),

  estimatedMinutes: z.union([z.number(), z.string()])
    .optional()
    .describe('Estimated duration in minutes'),

  tags: z.array(z.string())
    .optional()
    .describe('Tags to assign to the task'),

  sequential: z.union([z.boolean(), z.string()])
    .optional()
    .describe('Whether subtasks must be completed in order'),

  // Clear field options (for update)
  clearDueDate: z.boolean()
    .optional()
    .describe('Clear the existing due date'),

  clearDeferDate: z.boolean()
    .optional()
    .describe('Clear the existing defer date'),

  clearEstimatedMinutes: z.boolean()
    .optional()
    .describe('Clear the existing time estimate'),

  clearRepeatRule: z.boolean()
    .optional()
    .describe('Remove the existing repeat rule'),

  // Completion date (for complete operation)
  completionDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null()
  ])
    .optional()
    .nullable()
    .transform(val => val === '' ? null : val)
    .describe('Completion date (defaults to now)'),

  // Minimal response option (for update)
  minimalResponse: z.union([z.boolean(), z.string()])
    .optional()
    .describe('Return minimal response for bulk operations'),

  // Repeat rule
  repeatRule: z.object({
    unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']),
    steps: z.union([z.number(), z.string()]),
    method: z.string(),
    weekdays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
      .optional(),
    weekPosition: z.union([z.string(), z.array(z.string())])
      .optional(),
    weekday: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      .optional(),
    deferAnother: z.object({
      unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']),
      steps: z.number(),
    }).optional(),
  }).optional()
    .describe('Repeat/recurrence rule for the task'),
});

type ManageTaskInput = z.infer<typeof ManageTaskSchema>;

/**
 * Consolidated tool for all task CRUD operations
 * Combines create, update, complete, and delete into a single tool
 * with operation-based routing
 */
export class ManageTaskTool extends BaseTool<typeof ManageTaskSchema> {
  name = 'manage_task';
  description = 'Create, update, complete, or delete tasks. Use this for ANY modification to existing tasks or creating new ones. Set operation to specify the action: create (new task), update (modify task), complete (mark done), or delete (remove task).';
  schema = ManageTaskSchema;

  constructor(cache: any) {
    super(cache);
  }

  async executeValidated(args: ManageTaskInput): Promise<any> {
    const timer = new OperationTimerV2();
    const { operation, taskId, ...params } = args;

    console.error(`[MANAGE_TASK_DEBUG] Starting ${operation} operation with args:`, JSON.stringify(args, null, 2));

    try {
      // Validate required parameters based on operation
      if (operation !== 'create' && !taskId) {
        const error = createErrorResponseV2(
          'manage_task',
          'MISSING_PARAMETER',
          `taskId is required for ${operation} operation`,
          undefined,
          { operation },
          timer.toMetadata(),
        );
        return this.formatForCLI(error, operation, 'error');
      }

      if (operation === 'create' && !params.name) {
        const error = createErrorResponseV2(
          'manage_task',
          'MISSING_PARAMETER',
          'name is required for create operation',
          undefined,
          { operation },
          timer.toMetadata(),
        );
        return this.formatForCLI(error, operation, 'error');
      }

      // Route to appropriate tool based on operation
      let result: any;
      console.error(`[MANAGE_TASK_DEBUG] Routing to ${operation} tool`);
      
      switch (operation) {
        case 'create':
          // Direct implementation of task creation
          console.error(`[MANAGE_TASK_DEBUG] Starting create operation with params:`, JSON.stringify(params, null, 2));
          
          // Filter out null/undefined values and convert dates
          const createArgs: any = { name: params.name! };
          if (params.note) createArgs.note = params.note;
          if (params.projectId) createArgs.projectId = params.projectId;
          if (params.parentTaskId) createArgs.parentTaskId = params.parentTaskId;
          if (params.dueDate) createArgs.dueDate = params.dueDate;
          if (params.deferDate) createArgs.deferDate = params.deferDate;
          if (params.flagged !== undefined) createArgs.flagged = params.flagged;
          if (params.estimatedMinutes !== undefined) createArgs.estimatedMinutes = params.estimatedMinutes;
          if (params.tags) createArgs.tags = params.tags;
          if (params.sequential !== undefined) createArgs.sequential = params.sequential;
          if (params.repeatRule) createArgs.repeatRule = params.repeatRule;
          
          // Convert local dates to UTC for OmniFocus with error handling
          let convertedTaskData;
          try {
            convertedTaskData = {
              ...createArgs,
              dueDate: createArgs.dueDate ? localToUTC(createArgs.dueDate, 'due') : undefined,
              deferDate: createArgs.deferDate ? localToUTC(createArgs.deferDate, 'defer') : undefined,
            };
          } catch (dateError) {
            const fieldName = dateError instanceof Error && dateError.message.includes('defer') ? 'deferDate' : 'dueDate';
            const errorDetails = invalidDateError(fieldName, createArgs[fieldName] || '');
            return createErrorResponseV2(
              'manage_task',
              'INVALID_DATE_FORMAT',
              errorDetails.message,
              formatErrorWithRecovery(errorDetails),
              {
                recovery: errorDetails.recovery,
                providedValue: createArgs[fieldName],
              },
              timer.toMetadata(),
            );
          }
          
          console.error(`[MANAGE_TASK_DEBUG] Converted task data:`, JSON.stringify(convertedTaskData, null, 2));
          
          const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData: convertedTaskData });
          const anyOmni: any = this.omniAutomation as any;
          let createResult: any;
          
          try {
            // Prefer instance-level executeJson when available
            if (typeof anyOmni.executeJson === 'function' && Object.prototype.hasOwnProperty.call(anyOmni, 'executeJson')) {
              console.error(`[MANAGE_TASK_DEBUG] Using executeJson method`);
              const sr = await anyOmni.executeJson(script);
              console.error(`[MANAGE_TASK_DEBUG] executeJson returned:`, JSON.stringify(sr, null, 2));
              
              if (sr && typeof sr === 'object' && 'success' in sr) {
                if (!(sr as any).success) {
                  return createErrorResponseV2(
                    'manage_task',
                    'SCRIPT_ERROR',
                    (sr as any).error || 'Script execution failed',
                    undefined,
                    (sr as any).details,
                    timer.toMetadata(),
                  );
                }
                createResult = (sr as any).data;
              } else {
                createResult = sr;
              }
            } else if (typeof anyOmni.executeJson === 'function') {
              const sr = await anyOmni.executeJson(script);
              if (sr && typeof sr === 'object' && 'success' in sr) {
                if (!(sr as any).success) {
                  return createErrorResponseV2(
                    'manage_task',
                    'SCRIPT_ERROR',
                    (sr as any).error || 'Script execution failed',
                    undefined,
                    (sr as any).details,
                    timer.toMetadata(),
                  );
                }
                createResult = (sr as any).data;
              } else {
                createResult = sr;
              }
            } else {
              console.error(`[MANAGE_TASK_DEBUG] Using fallback execute method`);
              createResult = await anyOmni.execute(script) as CreateTaskScriptResponse;
              console.error(`[MANAGE_TASK_DEBUG] execute returned:`, JSON.stringify(createResult, null, 2));
            }
          } catch (e) {
            console.error(`[MANAGE_TASK_DEBUG] Script execution threw error:`, e);
            return this.handleError(e);
          }
          
          console.error(`[MANAGE_TASK_DEBUG] Processing result:`, JSON.stringify(createResult, null, 2));
          
          if (createResult && typeof createResult === 'object' && 'error' in createResult && createResult.error) {
            // Enhanced error response with recovery suggestions
            const errorMessage = createResult.message || 'Failed to create task';
            const recovery = [];
            
            if (errorMessage.toLowerCase().includes('project')) {
              recovery.push('Use list_projects to find valid project IDs');
              recovery.push('Ensure the project exists and is not completed');
            } else if (errorMessage.toLowerCase().includes('parent')) {
              recovery.push('Use list_tasks to find valid parent task IDs');
              recovery.push('Ensure the parent task exists and can have subtasks');
            } else {
              recovery.push('Check that all required parameters are provided');
              recovery.push('Verify OmniFocus is running and not showing dialogs');
            }
            
            return createErrorResponseV2(
              'manage_task',
              'SCRIPT_ERROR',
              errorMessage,
              'Verify the inputs and OmniFocus state',
              { rawResult: createResult, recovery },
              timer.toMetadata(),
            );
          }
          
          // Parse the JSON result since the script may return a JSON string
          let parsedCreateResult;
          try {
            parsedCreateResult = typeof createResult === 'string' ? JSON.parse(createResult) : createResult;
          } catch (parseError) {
            this.logger.error(`Failed to parse create task result: ${createResult}`);
            const errorDetails = parsingError('task creation', String(createResult), 'valid JSON');
            return createErrorResponseV2(
              'manage_task',
              'INTERNAL_ERROR',
              errorDetails.message,
              'Ensure script returns valid JSON',
              {
                received: createResult,
                parseError: parseError instanceof Error ? parseError.message : String(parseError),
                recovery: errorDetails.recovery,
              },
              timer.toMetadata(),
            );
          }
          
          // Check if parsedResult is valid
          if (!parsedCreateResult || typeof parsedCreateResult !== 'object' || (!('taskId' in parsedCreateResult) && !('id' in parsedCreateResult))) {
            return createErrorResponseV2(
              'manage_task',
              'INTERNAL_ERROR',
              'Invalid response from create task script',
              'Have the script return an object with id/taskId',
              { received: parsedCreateResult },
              timer.toMetadata(),
            );
          }
          
          // Invalidate caches after successful task creation
          this.cache.invalidate('tasks');
          this.cache.invalidate('analytics');
          if (createArgs.projectId !== undefined) this.cache.invalidate('projects');
          if (Array.isArray(createArgs.tags) && createArgs.tags.length > 0) this.cache.invalidate('tags');
          
          console.error(`[MANAGE_TASK_DEBUG] About to return success response with parsedResult:`, JSON.stringify(parsedCreateResult, null, 2));
          
          result = createSuccessResponseV2(
            'manage_task',
            { task: parsedCreateResult as CreateTaskResponse },
            undefined,
            {
              ...timer.toMetadata(),
              created_id: (parsedCreateResult as any).taskId || null,
              project_id: createArgs.projectId || null,
              input_params: {
                name: createArgs.name,
                has_project: !!createArgs.projectId,
                has_due_date: !!createArgs.dueDate,
                has_tags: !!(createArgs.tags && createArgs.tags.length > 0),
              },
            },
          );
          
          console.error(`[MANAGE_TASK_DEBUG] Final create success response:`, JSON.stringify(result, null, 2));
          break;

        case 'update':
          // Direct implementation of task update
          const { minimalResponse = false, ...updates } = params;

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

          // Sanitize and validate updates object
          const safeUpdates = this.sanitizeUpdates(updates);

          // If no valid updates, return early
          if (Object.keys(safeUpdates).length === 0) {
            result = createSuccessResponseV2(
              'manage_task',
              { task: { id: taskId!, name: '', updated: false as const, changes: {} } as any },
              undefined,
              { ...timer.toMetadata(), input_params: { taskId }, message: 'No valid updates provided' },
            );
            break;
          }

          // Log what we're sending to the script
          this.logger.info('Sending to JXA script:', {
            taskId,
            safeUpdates,
            safeUpdatesKeys: Object.keys(safeUpdates),
          });

          // Use new function argument architecture for template substitution safety
          const updateScript = createUpdateTaskScript(taskId!, safeUpdates);
          const anyOmniUpdate: any = this.omniAutomation as any;
          let parsedUpdateResult: any;
          if (typeof anyOmniUpdate.executeJson === 'function') {
            const res = await anyOmniUpdate.executeJson(updateScript);
            if (res && typeof res === 'object' && 'success' in res) {
              if (!(res as any).success) {
                this.logger.error(`Update task script error: ${(res as any).error}`);
                return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', (res as any).error || 'Script execution failed', 'Verify task exists and params are valid', (res as any).details, timer.toMetadata());
              }
              parsedUpdateResult = (res as any).data;
            } else {
              parsedUpdateResult = res;
            }
          } else {
            // Fallback to execute() returning JSON string or object
            const raw = await anyOmniUpdate.execute(updateScript);
            parsedUpdateResult = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
          if (minimalResponse) {
            const baseResponse = {
              success: true,
              id: taskId,
              operation: 'update_task',
              task_id: taskId, // Keep for backwards compatibility
              fields_updated: Object.keys(safeUpdates),
            };

            result = baseResponse as any;
            break;
          }

          // Transform new schema-validated result to expected format
          const taskData = (parsedUpdateResult as any)?.task || parsedUpdateResult || { id: taskId, name: 'Unknown' };
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
          result = createSuccessResponseV2(
            'manage_task',
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
          break;

        case 'complete':
          // Direct implementation of task completion
          // Convert completionDate if provided
          const processedCompleteArgs = {
            taskId: taskId!,
            completionDate: params.completionDate ? localToUTC(params.completionDate, 'completion') : undefined,
          };

          // Try JXA first, fall back to URL scheme if access denied
          try {
            const completeScript = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, processedCompleteArgs as unknown as Record<string, unknown>);
            const anyOmniComplete: any = this.omniAutomation as any;
            // Use flexible executeJson without strict schema to support unit mocks
            const res = typeof anyOmniComplete.executeJson === 'function' ? await anyOmniComplete.executeJson(completeScript) : await anyOmniComplete.execute(completeScript);
            const completeResult = (res && typeof res === 'object' && 'success' in res) ? res as any : { success: true, data: res };

            if (!completeResult.success) {
              // If error contains "access not allowed", use URL scheme
              if (completeResult.error && typeof completeResult.error === 'string' && completeResult.error.toLowerCase().includes('access not allowed')) {
                this.logger.info('JXA access denied, falling back to URL scheme for task completion');
                // Note: URL scheme fallback would be implemented here if needed
                return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
              }
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', completeResult.error, 'Verify task ID and OmniFocus state', (completeResult as any).details, timer.toMetadata());
            }

            this.logger.info(`Completed task via JXA: ${taskId}`);

            const parsedCompleteResult = (completeResult as any).data;

            // Invalidate cache after successful completion
            this.cache.invalidate('tasks');
            this.cache.invalidate('analytics');

            result = createSuccessResponseV2('manage_task', { task: parsedCompleteResult }, undefined, { ...timer.toMetadata(), completed_id: taskId, method: 'jxa', input_params: { taskId: taskId } });
          } catch (jxaError: any) {
            // If JXA fails with permission error, use URL scheme
            if (jxaError.message &&
                (jxaError.message.toLowerCase().includes('parameter is missing') ||
                 jxaError.message.toLowerCase().includes('access not allowed'))) {
              this.logger.info('JXA failed, falling back to URL scheme for task completion');
              // Note: URL scheme fallback would be implemented here if needed
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
            }
            return this.handleError(jxaError);
          }
          break;

        case 'delete':
          // Direct implementation of task deletion
          // Try JXA first, fall back to URL scheme if access denied
          try {
            const deleteScript = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, { taskId: taskId! } as unknown as Record<string, unknown>);
            const anyOmniDelete: any = this.omniAutomation as any;
            const res = typeof anyOmniDelete.executeJson === 'function' ? await anyOmniDelete.executeJson(deleteScript) : await anyOmniDelete.execute(deleteScript);
            const deleteResult = (res && typeof res === 'object' && 'success' in res) ? res as any : { success: true, data: res };

            if (!deleteResult.success) {
              // If error contains "parameter is missing" or "access not allowed", use URL scheme
              if (deleteResult.error && typeof deleteResult.error === 'string' &&
                  (deleteResult.error.toLowerCase().includes('parameter is missing') ||
                   deleteResult.error.toLowerCase().includes('access not allowed'))) {
                this.logger.info('JXA failed, falling back to URL scheme for task deletion');
                // Note: URL scheme fallback would be implemented here if needed
                return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
              }
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', deleteResult.error, 'Verify task ID and permissions', (deleteResult as any).details, timer.toMetadata());
            }

            const parsedDeleteResult = (deleteResult as any).data;

            // Invalidate caches after successful deletion
            this.cache.invalidate('tasks');
            this.cache.invalidate('analytics');
            this.cache.invalidate('projects');
            this.cache.invalidate('tags');

            this.logger.info(`Deleted task via JXA: ${taskId}`);
            result = createSuccessResponseV2('manage_task', { task: parsedDeleteResult }, undefined, { ...timer.toMetadata(), deleted_id: taskId, method: 'jxa', input_params: { taskId: taskId } });
          } catch (jxaError: any) {
            // If JXA fails with permission error, use URL scheme
            if (jxaError.message &&
                (jxaError.message.toLowerCase().includes('parameter is missing') ||
                 jxaError.message.toLowerCase().includes('access not allowed'))) {
              this.logger.info('JXA failed, falling back to URL scheme for task deletion');
              // Note: URL scheme fallback would be implemented here if needed
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
            }
            return this.handleError(jxaError);
          }
          break;

        default:
          const error = createErrorResponseV2(
            'manage_task',
            'INVALID_OPERATION',
            `Invalid operation: ${operation}`,
            undefined,
            { operation },
            timer.toMetadata(),
          );
          return this.formatForCLI(error, operation, 'error');
      }

      // Format result for CLI testing if needed
      console.error(`[MANAGE_TASK_DEBUG] Final result before formatForCLI:`, JSON.stringify(result, null, 2));
      const finalResult = this.formatForCLI(result, operation, 'success');
      console.error(`[MANAGE_TASK_DEBUG] Final result after formatForCLI:`, JSON.stringify(finalResult, null, 2));
      return finalResult;

    } catch (error) {
      console.error(`[MANAGE_TASK_DEBUG] ERROR caught in executeValidated:`, error);
      const errorResult = this.handleError(error);
      console.error(`[MANAGE_TASK_DEBUG] Error result:`, JSON.stringify(errorResult, null, 2));
      return this.formatForCLI(errorResult, operation, 'error');
    }
  }

  private sanitizeUpdates(updates: any): Record<string, unknown> {
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

    // Handle boolean fields (with MCP bridge coercion support)
    if (typeof updates.flagged === 'boolean') {
      sanitized.flagged = updates.flagged;
    } else if (typeof updates.flagged === 'string') {
      // Handle MCP bridge string coercion
      sanitized.flagged = updates.flagged === 'true';
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
    if (updates.projectId !== undefined) {
      sanitized.projectId = updates.projectId;
    }

    // Handle tags array
    if (Array.isArray(updates.tags)) {
      sanitized.tags = updates.tags.filter((tag: any) => typeof tag === 'string');
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

  /**
   * Format response for CLI testing when MCP_CLI_TESTING environment variable is set
   * This makes responses easier to parse in bash scripts
   */
  private formatForCLI(result: any, operation: string, type: 'success' | 'error'): any {
    // Only modify output if in CLI testing mode
    if (!process.env.MCP_CLI_TESTING) {
      return result;
    }

    // Add CLI-friendly debug output to stderr (won't interfere with JSON)
    if (type === 'success') {
      console.error(`[CLI_DEBUG] manage_task ${operation} operation: SUCCESS`);
      
      // Extract key data for logging
      if (result?.data?.task?.taskId || result?.data?.task?.id) {
        const taskId = result.data.task.taskId || result.data.task.id;
        console.error(`[CLI_DEBUG] Task ID: ${taskId}`);
      }
      
      if (result?.data?.task?.name) {
        console.error(`[CLI_DEBUG] Task name: ${result.data.task.name}`);
      }
      
      console.error(`[CLI_DEBUG] Operation completed in ${result?.metadata?.query_time_ms || 'unknown'}ms`);
      
    } else {
      console.error(`[CLI_DEBUG] manage_task ${operation} operation: ERROR`);
      console.error(`[CLI_DEBUG] Error: ${result?.error?.message || 'Unknown error'}`);
    }

    // Still return the original result for MCP protocol compliance
    return result;
  }
}
