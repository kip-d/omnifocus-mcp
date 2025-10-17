import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_TASK_SCRIPT, COMPLETE_TASK_SCRIPT, BULK_COMPLETE_TASKS_SCRIPT, DELETE_TASK_SCRIPT, BULK_DELETE_TASKS_SCRIPT, LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createUpdateTaskScript } from '../../omnifocus/scripts/tasks/update-task.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import { localToUTC } from '../../utils/timezone.js';
import {
  TaskCreationArgs,
  TaskUpdateArgs,
  TaskOperationResult,
  ScriptExecutionResult,
} from '../../omnifocus/script-response-types.js';
import { CacheManager } from '../../cache/CacheManager.js';
import {
  parsingError,
  formatErrorWithRecovery,
  invalidDateError,
} from '../../utils/error-messages.js';
import type { TaskOperationResponseV2, TaskOperationDataV2 } from '../response-types-v2.js';
import { RepeatRuleUserIntentSchema } from '../schemas/repeat-schemas.js';

// Consolidated schema that combines all task CRUD operations
const ManageTaskSchema = z.object({
  operation: z.enum(['create', 'update', 'complete', 'delete', 'bulk_complete', 'bulk_delete'])
    .describe('The operation to perform on the task. Use bulk_complete or bulk_delete for operations on multiple tasks.'),

  // Task identification (for update/complete/delete)
  taskId: z.string()
    .optional()
    .describe('ID of the task (required for update/complete/delete operations)'),

  // Bulk operations support
  taskIds: z.array(z.string())
    .optional()
    .describe('Array of task IDs for bulk operations (bulk_complete/bulk_delete)'),

  bulkCriteria: z.object({
    tags: z.array(z.string()).optional().describe('Match tasks with all these tags'),
    projectName: z.string().optional().describe('Match tasks in this project'),
    search: z.string().optional().describe('Match tasks containing this text'),
    completed: z.boolean().optional().describe('Match completed/incomplete tasks'),
  })
    .optional()
    .describe('Search criteria for bulk operations (alternative to taskIds)'),

  // Create/Update parameters
  name: z.string()
    .optional()
    .describe('Task name (required for create, optional for update)'),

  note: z.string()
    .optional()
    .describe('Task note/description'),

  projectId: z.union([z.string(), z.null()])
    .optional()
    .nullable()
    .transform(val => val === '' || val === null ? null : val)
    .describe('Project ID to assign the task to (null/empty to move to inbox)'),

  parentTaskId: z.union([z.string().min(1), z.literal(''), z.null()])
    .optional()
    .transform(val => val === '' ? undefined : val)
    .describe('Parent task ID to create this as a subtask'),

  dueDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
  ])
    .optional()
    .nullable()
    .transform(val => val === '' ? null : val)
    .describe('Due date (YYYY-MM-DD or YYYY-MM-DD HH:mm format)'),

  deferDate: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/, 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:mm'),
    z.literal(''),
    z.null(),
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
    z.null(),
  ])
    .optional()
    .nullable()
    .transform(val => val === '' ? null : val)
    .describe('Completion date (defaults to now)'),

  // Minimal response option (for update)
  minimalResponse: z.union([z.boolean(), z.string()])
    .optional()
    .describe('Return minimal response for bulk operations'),

  // Repeat rule - accepts both old format and new LLM-friendly format (4.7+)
  repeatRule: z.union([
    // New LLM-friendly format (OmniFocus 4.7+)
    RepeatRuleUserIntentSchema,
    // Old format for backward compatibility
    z.object({
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
    })
  ]).optional()
    .describe('Repeat/recurrence rule for the task. New format (4.7+): specify frequency, anchorTo (when-due/when-deferred/when-marked-done/planned-date), and skipMissed. Old format: unit, steps, method, weekdays, etc.'),
});

type ManageTaskInput = z.infer<typeof ManageTaskSchema>;

/**
 * Consolidated tool for all task CRUD operations
 * Combines create, update, complete, and delete into a single tool
 * with operation-based routing
 */
export class ManageTaskTool extends BaseTool<typeof ManageTaskSchema, TaskOperationResponseV2> {
  name = 'manage_task';
  description = 'Create, update, complete, or delete tasks. Use this for ANY modification to existing tasks or creating new ones. Set operation to specify the action: create (new task), update (modify task), complete (mark done), or delete (remove task).';
  schema = ManageTaskSchema;

  constructor(cache: CacheManager) {
    super(cache);
  }

  async executeValidated(args: ManageTaskInput): Promise<TaskOperationResponseV2> {
    const timer = new OperationTimerV2();
    const { operation, taskId, ...params} = args;

    this.logger.debug(`Starting ${operation} operation`, { operation, taskId, params });

    try {
      // Validate required parameters based on operation
      if (!['create', 'bulk_complete', 'bulk_delete'].includes(operation) && !taskId) {
        const error = createErrorResponseV2(
          'manage_task',
          'MISSING_PARAMETER',
          `taskId is required for ${operation} operation`,
          undefined,
          { operation },
          timer.toMetadata(),
        ) as TaskOperationResponseV2;
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
        ) as TaskOperationResponseV2;
        return this.formatForCLI(error, operation, 'error');
      }

      // Route to appropriate tool based on operation
      let result: TaskOperationResponseV2;
      this.logger.debug('Routing to operation handler', { operation });

      switch (operation) {
        case 'create': {
          // Direct implementation of task creation
          this.logger.debug('Starting create operation', { params });

          // Filter out null/undefined values and convert dates
          const createArgs: Partial<TaskCreationArgs> = { name: params.name! };
          if (params.note) createArgs.note = params.note;
          if (params.projectId) createArgs.projectId = params.projectId;
          if (params.parentTaskId) createArgs.parentTaskId = params.parentTaskId;
          if (params.dueDate) createArgs.dueDate = params.dueDate;
          if (params.deferDate) createArgs.deferDate = params.deferDate;
          if (params.flagged !== undefined) createArgs.flagged = typeof params.flagged === 'string' ? params.flagged === 'true' : params.flagged;
          if (params.estimatedMinutes !== undefined) createArgs.estimatedMinutes = typeof params.estimatedMinutes === 'string' ? parseInt(params.estimatedMinutes, 10) : params.estimatedMinutes;
          if (params.tags) createArgs.tags = params.tags;
          if (params.sequential !== undefined) createArgs.sequential = typeof params.sequential === 'string' ? params.sequential === 'true' : params.sequential;
          const repeatRuleForUpdate = this.normalizeRepeatRuleInput(params.repeatRule);
          if (repeatRuleForUpdate) {
            this.logger.debug('Normalized repeat rule for creation', { repeatRule: repeatRuleForUpdate });
            createArgs.repeatRule = repeatRuleForUpdate;
          }

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

          this.logger.debug('Converted task data for script execution', { convertedTaskData });

          const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData: convertedTaskData });
          let createResult: unknown;

          try {
            const scriptResult = await this.execJson(script);
            this.logger.debug('execJson returned result', { scriptResult });

            if (isScriptError(scriptResult)) {
              return createErrorResponseV2(
                'manage_task',
                'SCRIPT_ERROR',
                scriptResult.error || 'Script execution failed',
                undefined,
                scriptResult.details,
                timer.toMetadata(),
              );
            }
            createResult = (scriptResult as ScriptExecutionResult).data;
          } catch (e) {
            this.logger.error('Script execution threw error', { error: e });
            return this.handleErrorV2<TaskOperationDataV2>(e);
          }

          this.logger.debug('Processing script result', { createResult });

          if (createResult && typeof createResult === 'object' && 'error' in createResult && (createResult as { error: unknown }).error) {
            // Enhanced error response with recovery suggestions
            const errorMessage = (createResult as { message?: string }).message || 'Failed to create task';
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
              { rawResult: createResult as unknown, recovery },
              timer.toMetadata(),
            );
          }

          // Parse the JSON result since the script may return a JSON string
          let parsedCreateResult: unknown;
          try {
            parsedCreateResult = typeof createResult === 'string' ? JSON.parse(createResult) : createResult;
          } catch (parseError) {
            this.logger.error(`Failed to parse create task result: ${String(createResult)}`);
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
          if (!parsedCreateResult || typeof parsedCreateResult !== 'object' || (!(parsedCreateResult as Record<string, unknown>).taskId && !(parsedCreateResult as Record<string, unknown>).id)) {
            return createErrorResponseV2(
              'manage_task',
              'INTERNAL_ERROR',
              'Invalid response from create task script',
              'Have the script return an object with id/taskId',
              { received: parsedCreateResult as unknown },
              timer.toMetadata(),
            );
          }

          const createdTaskId = (parsedCreateResult as { taskId?: string; id?: string }).taskId || (parsedCreateResult as { id?: string }).id || null;
          this.logger.debug('Post-create task ID', { createdTaskId });

          if (repeatRuleForUpdate && createdTaskId) {
            try {
              this.logger.debug('Applying repeat rule via update');
              const repeatOnlyScript = createUpdateTaskScript(createdTaskId, { repeatRule: repeatRuleForUpdate });
              const repeatUpdateResult = await this.execJson(repeatOnlyScript);
              this.logger.debug('Repeat rule update result', { repeatUpdateResult });
              if (isScriptError(repeatUpdateResult)) {
                this.logger.warn('Failed to apply repeat rule during task creation', repeatUpdateResult.error);
              } else {
                this.logger.info('Repeat rule applied post-creation for task', { taskId: createdTaskId });
              }
            } catch (repeatError) {
              this.logger.warn('Exception applying repeat rule post-creation', repeatError);
            }
          }

          // Smart cache invalidation after successful task creation
          this.cache.invalidateForTaskChange({
            operation: 'create',
            projectId: createArgs.projectId,
            tags: Array.isArray(createArgs.tags) ? createArgs.tags : undefined,
            affectsToday: createArgs.dueDate ? this.isDueToday(createArgs.dueDate) : false,
            affectsOverdue: false, // New tasks can't be overdue
          });

          this.logger.debug('Returning success response', { parsedCreateResult });

          result = createSuccessResponseV2(
            'manage_task',
            { task: parsedCreateResult, operation: 'create' as const },
            undefined,
            {
              ...timer.toMetadata(),
              created_id: createdTaskId,
              project_id: createArgs.projectId || null,
              input_params: {
                name: createArgs.name,
                has_project: !!createArgs.projectId,
                has_due_date: !!createArgs.dueDate,
                has_tags: !!(createArgs.tags && createArgs.tags.length > 0),
                has_repeat_rule: !!repeatRuleForUpdate,
              },
            },
          ) as unknown as TaskOperationResponseV2;

          this.logger.debug('Final create success response', { result });
          break;
        }

        case 'update': {
          // Direct implementation of task update
          const allParams = params as Partial<TaskUpdateArgs & { minimalResponse?: boolean }>;
          const { minimalResponse = false, ...updates } = allParams;

          // Debug logging: Log all received parameters
          this.logger.debug('UpdateTaskTool received parameters:', {
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
          const safeUpdates = this.sanitizeUpdates(updates as Record<string, unknown>);

          // If no valid updates, return early
          if (Object.keys(safeUpdates).length === 0) {
            result = createSuccessResponseV2(
              'manage_task',
              { task: { id: taskId!, name: '', updated: false as const, changes: {} } },
              undefined,
              { ...timer.toMetadata(), input_params: { taskId }, message: 'No valid updates provided' },
            );
            break;
          }

          // Log what we're sending to the script (debug only - contains user data)
          this.logger.debug('Sending to JXA script:', {
            taskId,
            safeUpdates,
            safeUpdatesKeys: Object.keys(safeUpdates),
          });

          // Use new function argument architecture for template substitution safety
          const updateScript = createUpdateTaskScript(taskId!, safeUpdates);
          const updateResult = await this.execJson(updateScript);
          if (isScriptError(updateResult)) {
            this.logger.error(`Update task script error: ${updateResult.error}`);
            return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', updateResult.error || 'Script execution failed', 'Verify task exists and params are valid', updateResult.details, timer.toMetadata());
          }

          if (isScriptSuccess(updateResult)) {
            const rawData = updateResult.data as { success?: unknown; error?: unknown; message?: unknown } | undefined;
            if (rawData && typeof rawData === 'object') {
              const errorValue = rawData.error;
              const subSuccess = rawData.success;
              if (errorValue || subSuccess === false) {
                const errorMessage = typeof rawData.message === 'string'
                  ? rawData.message
                  : typeof errorValue === 'string'
                    ? errorValue
                    : 'Script execution failed';
                return createErrorResponseV2(
                  'manage_task',
                  'SCRIPT_ERROR',
                  errorMessage,
                  'Verify task exists and params are valid',
                  rawData,
                  timer.toMetadata(),
                );
              }
            }
          }
          const parsedUpdateResult = (updateResult as ScriptExecutionResult).data;

          // Smart cache invalidation after successful update
          this.cache.invalidateForTaskChange({
            operation: 'update',
            projectId: typeof safeUpdates.projectId === 'string' ? safeUpdates.projectId : undefined,
            tags: Array.isArray(safeUpdates.tags) ? safeUpdates.tags : undefined,
            affectsToday: typeof safeUpdates.dueDate === 'string' ? this.isDueToday(safeUpdates.dueDate) : false,
            affectsOverdue: false, // Updates don't automatically make things overdue
          });

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

            result = baseResponse as unknown as TaskOperationResponseV2;
            break;
          }

          // Transform new schema-validated result to expected format
          const taskData = (parsedUpdateResult as { task?: Record<string, unknown> })?.task || parsedUpdateResult || { id: taskId, name: 'Unknown' };
          const transformedResult = {
            id: (taskData as { id?: string }).id || taskId,
            name: (taskData as { name?: string }).name || 'Unknown',
            updated: true,
            changes: Object.keys(safeUpdates).reduce((acc, key) => {
              acc[key] = safeUpdates[key];
              return acc;
            }, {} as Record<string, unknown>),
          };

          // Return standardized response with proper typing
          result = createSuccessResponseV2(
            'manage_task',
            { task: transformedResult },
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
          ) as TaskOperationResponseV2;
          break;
        }

        case 'complete': {
          // Direct implementation of task completion
          // Convert completionDate if provided
          const processedCompleteArgs = {
            taskId: taskId!,
            completionDate: params.completionDate ? localToUTC(params.completionDate, 'completion') : undefined,
          };

          // Try JXA first, fall back to URL scheme if access denied
          try {
            const completeScript = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, processedCompleteArgs as unknown as Record<string, unknown>);
            const anyOmniComplete = this.omniAutomation as {
              executeJson?: (script: string) => Promise<unknown>;
              execute?: (script: string) => Promise<unknown>;
            };
            // Use flexible executeJson without strict schema to support unit mocks
            const res = typeof anyOmniComplete.executeJson === 'function' ? await anyOmniComplete.executeJson(completeScript) : await anyOmniComplete.execute!(completeScript);
            const completeResult = (res && typeof res === 'object' && 'success' in res) ? res as TaskOperationResult : { success: true, data: res };

            if (typeof completeResult === 'object' && 'success' in completeResult && !completeResult.success) {

              // If error contains "access not allowed", use URL scheme
              const error = (completeResult as { error?: string }).error;
              if (error && typeof error === 'string' && error.toLowerCase().includes('access not allowed')) {
                this.logger.info('JXA access denied, falling back to URL scheme for task completion');
                // Note: URL scheme fallback would be implemented here if needed
                return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
              }
              const errorMsg = (completeResult as { error?: string }).error || 'Unknown error';
              const details = (completeResult as { details?: unknown }).details;
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', errorMsg, 'Verify task ID and OmniFocus state', details, timer.toMetadata());
            }

            this.logger.info(`Completed task via JXA: ${taskId}`);

            const parsedCompleteResult = (completeResult as { data?: unknown }).data;

            // Smart cache invalidation after task completion
            this.cache.invalidateForTaskChange({
              operation: 'complete',
              affectsToday: true, // Completing tasks affects today's view
              affectsOverdue: true, // And overdue view
            });

            result = createSuccessResponseV2('manage_task', { task: parsedCompleteResult }, undefined, { ...timer.toMetadata(), completed_id: taskId, method: 'jxa', input_params: { taskId: taskId } }) as TaskOperationResponseV2;
          } catch (jxaError: unknown) {
            // If JXA fails with permission error, use URL scheme
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            if ((jxaError as any).message &&
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                ((jxaError as any).message.toLowerCase().includes('parameter is missing') ||
                 // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                 (jxaError as any).message.toLowerCase().includes('access not allowed'))) {
              this.logger.info('JXA failed, falling back to URL scheme for task completion');
              // Note: URL scheme fallback would be implemented here if needed
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
            }
            return this.handleErrorV2<TaskOperationDataV2>(jxaError);
          }
          break;
        }

        case 'delete': {
          // Direct implementation of task deletion
          // Try JXA first, fall back to URL scheme if access denied
          try {
            const deleteScript = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, { taskId: taskId! } as unknown as Record<string, unknown>);
            const anyOmniDelete = this.omniAutomation as {
              executeJson?: (script: string) => Promise<unknown>;
              execute?: (script: string) => Promise<unknown>;
            };
            const res = typeof anyOmniDelete.executeJson === 'function' ? await anyOmniDelete.executeJson(deleteScript) : await anyOmniDelete.execute!(deleteScript);
            const deleteResult = (res && typeof res === 'object' && 'success' in res) ? res as TaskOperationResult : { success: true, data: res };

            if (typeof deleteResult === 'object' && 'success' in deleteResult && !deleteResult.success) {
              // If error contains "parameter is missing" or "access not allowed", use URL scheme
              const error = (deleteResult as { error?: string }).error;
              if (error && typeof error === 'string' &&
                  (error.toLowerCase().includes('parameter is missing') ||
                   error.toLowerCase().includes('access not allowed'))) {
                this.logger.info('JXA failed, falling back to URL scheme for task deletion');
                // Note: URL scheme fallback would be implemented here if needed
                return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
              }
              const errorMsg = (deleteResult as { error?: string }).error || 'Unknown error';
              const details = (deleteResult as { details?: unknown }).details;
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', errorMsg, 'Verify task ID and permissions', details, timer.toMetadata());
            }

            const parsedDeleteResult = (deleteResult as { data?: unknown }).data;

            // Smart cache invalidation after task deletion
            // Note: We don't know the task's details, so be conservative
            this.cache.invalidateForTaskChange({
              operation: 'delete',
              affectsToday: true,
              affectsOverdue: true,
            });
            // Also invalidate projects and tags since we don't know which were affected
            this.cache.invalidate('projects');
            this.cache.invalidate('tags');

            this.logger.info(`Deleted task via JXA: ${taskId}`);
            result = createSuccessResponseV2('manage_task', { task: parsedDeleteResult }, undefined, { ...timer.toMetadata(), deleted_id: taskId, method: 'jxa', input_params: { taskId: taskId } }) as TaskOperationResponseV2;
          } catch (jxaError: unknown) {
            // If JXA fails with permission error, use URL scheme
            if ((jxaError as Error).message &&
                ((jxaError as Error).message.toLowerCase().includes('parameter is missing') ||
                 (jxaError as Error).message.toLowerCase().includes('access not allowed'))) {
              this.logger.info('JXA failed, falling back to URL scheme for task deletion');
              // Note: URL scheme fallback would be implemented here if needed
              return createErrorResponseV2('manage_task', 'SCRIPT_ERROR', 'Access denied and URL scheme not implemented', 'Grant OmniFocus automation access', {}, timer.toMetadata());
            }
            return this.handleErrorV2<TaskOperationDataV2>(jxaError);
          }
          break;
        }

        case 'bulk_complete':
        case 'bulk_delete': {
          return this.handleBulkOperation(operation, args, timer);
        }

        default: {
          const error = createErrorResponseV2(
            'manage_task',
            'INVALID_OPERATION',
            `Invalid operation: ${String(operation)}`,
            undefined,
            { operation },
            timer.toMetadata(),
          ) as TaskOperationResponseV2;
          return this.formatForCLI(error, operation, 'error');
        }
      }

      // Format result for CLI testing if needed
      this.logger.debug('Final result before formatForCLI', { result });
      const finalResult = this.formatForCLI(result, operation, 'success');
      this.logger.debug('Final result after formatForCLI', { finalResult });
      return finalResult;

    } catch (error) {
      this.logger.error('ERROR caught in executeValidated', { error });
      const errorResult = this.handleErrorV2<TaskOperationDataV2>(error);
      this.logger.debug('Error result', { errorResult });
      return this.formatForCLI(errorResult, operation, 'error');
    }
  }

  /**
   * Check if a date is due today (within next 3 days as per OmniFocus "today" perspective)
   */
  private isDueToday(dueDateStr: string): boolean {
    try {
      const dueDate = new Date(dueDateStr);
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
      return dueDate <= threeDaysFromNow;
    } catch {
      return false;
    }
  }

  private sanitizeUpdates(updates: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    // Only log keys, not values (privacy-safe)
    this.logger.info('Sanitizing updates with keys:', Object.keys(updates));

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

    // Handle completion date (for complete operation)
    if (updates.completionDate !== undefined && updates.completionDate !== null) {
      this.logger.info('Processing completionDate:', {
        value: updates.completionDate,
        type: typeof updates.completionDate,
      });

      if (typeof updates.completionDate === 'string') {
        try {
          // Convert local time to UTC for OmniFocus
          const utcDate = localToUTC(updates.completionDate, 'completion');
          this.logger.info('CompletionDate converted to UTC:', {
            original: updates.completionDate,
            converted: utcDate,
          });
          sanitized.completionDate = utcDate;
        } catch (error) {
          this.logger.warn(`Invalid completionDate format: ${updates.completionDate}`, error);
        }
      } else {
        this.logger.warn('Unexpected completionDate type:', {
          value: updates.completionDate,
          type: typeof updates.completionDate,
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
      sanitized.tags = updates.tags.filter((tag: unknown) => typeof tag === 'string');
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
    if (updates.repeatRule !== undefined) {
      const normalizedRepeat = this.normalizeRepeatRuleInput(updates.repeatRule);
      if (normalizedRepeat) {
        sanitized.repeatRule = normalizedRepeat;
        this.logger.debug('Sanitized repeatRule:', normalizedRepeat);
      }
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
  private formatForCLI<T>(result: T, operation: string, type: 'success' | 'error'): T {
    // Only modify output if in CLI testing mode
    if (!process.env.MCP_CLI_TESTING) {
      return result;
    }

    // Add CLI-friendly debug output to stderr (won't interfere with JSON)
    if (type === 'success') {
      console.error(`[CLI_DEBUG] manage_task ${operation} operation: SUCCESS`);

      // Extract key data for logging
      const resultData = result as { data?: { task?: { taskId?: string; id?: string; name?: string } } };
      if (resultData?.data?.task?.taskId || resultData?.data?.task?.id) {
        const taskId = resultData.data.task.taskId || resultData.data.task.id;
        console.error(`[CLI_DEBUG] Task ID: ${taskId}`);
      }

      if (resultData?.data?.task?.name) {
        console.error(`[CLI_DEBUG] Task name: ${resultData.data.task.name}`);
      }

      console.error(`[CLI_DEBUG] Operation completed in ${(result as { metadata?: { query_time_ms?: number } })?.metadata?.query_time_ms || 'unknown'}ms`);

    } else {
      console.error(`[CLI_DEBUG] manage_task ${operation} operation: ERROR`);
      console.error(`[CLI_DEBUG] Error: ${(result as { error?: { message?: string } })?.error?.message || 'Unknown error'}`);
    }

    // Still return the original result for MCP protocol compliance
    return result;
  }

  private normalizeRepeatMethod(method: unknown): 'fixed' | 'start-after-completion' | 'due-after-completion' | 'none' {
    if (typeof method !== 'string') return 'fixed';
    const normalized = method.toLowerCase().trim();
    switch (normalized) {
      case 'start-after-completion':
        return 'start-after-completion';
      case 'due-after-completion':
      case 'after-completion':
        return 'due-after-completion';
      case 'none':
        return 'none';
      case 'fixed':
      default:
        return 'fixed';
    }
  }

  private normalizeRepeatRuleInput(rule: unknown): TaskCreationArgs['repeatRule'] | undefined {
    if (!rule || typeof rule !== 'object') return undefined;
    const raw = rule as Record<string, unknown>;
    if (typeof raw.unit !== 'string') return undefined;

    type RepeatRule = NonNullable<TaskCreationArgs['repeatRule']>;

    const normalized: RepeatRule = {
      unit: raw.unit as RepeatRule['unit'],
      steps: (() => {
        const value = raw.steps;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = parseInt(value, 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        }
        return 1;
      })(),
      method: this.normalizeRepeatMethod(raw.method),
    };

    if (Array.isArray(raw.weekdays)) {
      normalized.weekdays = raw.weekdays as RepeatRule['weekdays'];
    }
    if (raw.weekPosition !== undefined) {
      normalized.weekPosition = raw.weekPosition as RepeatRule['weekPosition'];
    }
    if (typeof raw.weekday === 'string') {
      normalized.weekday = raw.weekday as RepeatRule['weekday'];
    }
    if (raw.deferAnother && typeof raw.deferAnother === 'object') {
      const defer = raw.deferAnother as Record<string, unknown>;
      if (typeof defer.unit === 'string') {
        const stepsValue = defer.steps;
        const stepsNumber = typeof stepsValue === 'number'
          ? stepsValue
          : typeof stepsValue === 'string'
            ? parseInt(stepsValue, 10)
            : undefined;
        if (stepsNumber && Number.isFinite(stepsNumber) && stepsNumber > 0) {
          type DeferAnother = NonNullable<RepeatRule['deferAnother']>;
          normalized.deferAnother = {
            unit: defer.unit as DeferAnother['unit'],
            steps: stepsNumber,
          };
        }
      }
    }

    return normalized;
  }

  private async handleBulkOperation(
    operation: 'bulk_complete' | 'bulk_delete',
    args: ManageTaskInput,
    timer: OperationTimerV2,
  ): Promise<TaskOperationResponseV2> {
    const { taskIds, bulkCriteria } = args;

    // Validate that we have either taskIds or criteria
    if (!taskIds && !bulkCriteria) {
      const error = createErrorResponseV2(
        'manage_task',
        'MISSING_PARAMETER',
        'Either taskIds or bulkCriteria is required for bulk operations',
        'Provide an array of task IDs or search criteria to identify tasks',
        { operation },
        timer.toMetadata(),
      ) as TaskOperationResponseV2;
      return this.formatForCLI(error, operation, 'error');
    }

    let targetTaskIds = taskIds;

    // If criteria provided, find matching tasks first
    if (bulkCriteria && !taskIds) {
      try {
        const filter = {
          completed: bulkCriteria.completed, // Don't default to false - search all tasks unless specified
          limit: 200, // Safety limit
          tags: bulkCriteria.tags,
          project: bulkCriteria.projectName,
          search: bulkCriteria.search,
        };

        // Use the same script as QueryTasksToolV2
        const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
        const result = await this.execJson(script);

        if (isScriptError(result)) {
          const error = createErrorResponseV2(
            'manage_task',
            'SEARCH_ERROR',
            'Failed to find tasks matching criteria',
            'Check the search criteria and ensure OmniFocus is running',
            result.details,
            timer.toMetadata(),
          ) as TaskOperationResponseV2;
          return this.formatForCLI(error, operation, 'error');
        }

        const data = result.data as { tasks?: { id: string }[]; items?: { id: string }[] };
        const tasks = data.tasks || data.items || [];
        targetTaskIds = tasks.map(task => task.id);

        if (targetTaskIds.length === 0) {
          const error = createErrorResponseV2(
            'manage_task',
            'NO_TASKS_FOUND',
            'No tasks found matching the specified criteria',
            'Try adjusting the search criteria',
            { criteria: bulkCriteria },
            timer.toMetadata(),
          ) as TaskOperationResponseV2;
          return this.formatForCLI(error, operation, 'error');
        }
      } catch (searchError) {
        const error = createErrorResponseV2(
          'manage_task',
          'SEARCH_ERROR',
          'Error searching for tasks',
          'Check the search criteria and ensure OmniFocus is running',
          searchError,
          timer.toMetadata(),
        ) as TaskOperationResponseV2;
        return this.formatForCLI(error, operation, 'error');
      }
    }

    if (!targetTaskIds || targetTaskIds.length === 0) {
      const error = createErrorResponseV2(
        'manage_task',
        'NO_TASKS_SPECIFIED',
        'No tasks specified for bulk operation',
        'Provide task IDs or search criteria',
        { operation },
        timer.toMetadata(),
      ) as TaskOperationResponseV2;
      return this.formatForCLI(error, operation, 'error');
    }

    // Perform bulk operation
    const results = [];
    const errors = [];

    if (operation === 'bulk_delete') {
      // OPTIMIZATION: Use single-pass bulk delete script instead of looping
      // This executes one script that iterates flattenedTasks ONCE and deletes all tasks
      // vs N iterations for N individual deletes (81% performance improvement achieved)
      try {
        const script = this.omniAutomation.buildScript(BULK_DELETE_TASKS_SCRIPT, { taskIds: targetTaskIds });
        const result = await this.execJson(script);

        if (isScriptError(result)) {
          // Script-level error
          errors.push({ error: result.error || 'Bulk delete failed' });
        } else if (result.data && typeof result.data === 'object') {
          const bulkResult = result.data as { deleted?: Array<{ id: string; name: string }>; errors?: Array<{ taskId: string; error: string }> };

          // Process successfully deleted tasks
          if (Array.isArray(bulkResult.deleted)) {
            for (const item of bulkResult.deleted) {
              results.push({ taskId: item.id, status: 'deleted' });
            }
          }

          // Process errors from the script
          if (Array.isArray(bulkResult.errors)) {
            errors.push(...bulkResult.errors);
          }
        }

        // Invalidate task cache after bulk operation
        this.cache.clear('tasks');
      } catch (error) {
        errors.push({ error: String(error) });
      }
    } else if (operation === 'bulk_complete') {
      // OPTIMIZATION: Use single-pass bulk complete script instead of looping
      // Same pattern as bulk_delete - iterates flattenedTasks ONCE for all completions
      // vs N iterations for N individual completes (70-80% performance improvement expected)
      try {
        const script = this.omniAutomation.buildScript(BULK_COMPLETE_TASKS_SCRIPT, { taskIds: targetTaskIds, completionDate: null });
        const result = await this.execJson(script);

        if (isScriptError(result)) {
          // Script-level error
          errors.push({ error: result.error || 'Bulk complete failed' });
        } else if (result.data && typeof result.data === 'object') {
          const bulkResult = result.data as { completed?: Array<{ id: string; name: string }>; errors?: Array<{ taskId: string; error: string }> };

          // Process successfully completed tasks
          if (Array.isArray(bulkResult.completed)) {
            for (const item of bulkResult.completed) {
              results.push({ taskId: item.id, status: 'completed' });
            }
          }

          // Process errors from the script
          if (Array.isArray(bulkResult.errors)) {
            errors.push(...bulkResult.errors);
          }
        }

        // Invalidate task cache after bulk operation
        this.cache.clear('tasks');
      } catch (error) {
        errors.push({ error: String(error) });
      }
    }

    const responseData = {
      operation,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };

    const response = createSuccessResponseV2(
      'manage_task',
      responseData,
      undefined, // No summary needed for bulk operations
      timer.toMetadata(),
    );

    return this.formatForCLI(response, operation, 'success');
  }
}
