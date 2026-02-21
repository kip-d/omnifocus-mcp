import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { WriteSchema, type WriteInput } from './schemas/write-schema.js';
import { MutationCompiler, type CompiledMutation } from './compilers/MutationCompiler.js';
import { TempIdResolver } from './utils/tempid-resolver.js';
import { DependencyGraph, DependencyGraphError } from './utils/dependency-graph.js';
import type { BatchItem } from './schemas/batch-schemas.js';
import { MANAGE_TAGS_SCRIPT } from '../../omnifocus/scripts/tags/manage-tags.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import { TaskId } from '../../utils/branded-types.js';
import {
  buildUpdateProjectScript,
  buildCreateProjectScript,
  buildCompleteScript,
  buildDeleteScript,
  buildCreateTaskScript,
  buildUpdateTaskScript,
  markProjectAsValidated,
  markTaskAsValidated,
} from '../../contracts/ast/mutation-script-builder.js';
import type {
  ProjectUpdateData,
  ProjectCreateData,
  RepetitionRule,
  TaskCreateData,
} from '../../contracts/mutations.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import type { ScriptExecutionResult, TaskCreationArgs } from '../../omnifocus/script-response-types.js';
import type { TaskOperationDataV2 } from '../response-types-v2.js';
import { COMPLETE_TASK_SCRIPT, DELETE_TASK_SCRIPT, BULK_DELETE_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { localToUTC } from '../../utils/timezone.js';
import { parsingError, formatErrorWithRecovery, invalidDateError } from '../../utils/error-messages.js';
import { sanitizeTaskUpdates } from './utils/task-sanitizer.js';
import type { TaskOperationResult } from '../../omnifocus/script-response-types.js';

// Convert string IDs to branded types for type safety (compile-time only, no runtime validation)
const convertToTaskId = (id: string): TaskId => id as TaskId;

interface BatchItemCreationResult {
  tempId: string;
  realId: string | null;
  success: boolean;
  error?: string;
  type: 'project' | 'task';
}

export class OmniFocusWriteTool extends BaseTool<typeof WriteSchema, unknown> {
  name = 'omnifocus_write';
  description = `Create, update, complete, or delete OmniFocus tasks and projects.

OPERATIONS:
- create: New task/project with data
- update: Modify existing (provide id + changes)
- complete: Mark done (provide id)
- delete: Remove permanently (provide id)
- batch: Multiple operations in one call
- bulk_delete: Delete multiple items by IDs
- tag_manage: Manage tag hierarchy (create, rename, delete, merge, nest, unnest, reparent)

BATCH OPERATIONS:
- operations: Array of create, update, complete, and delete operations
- Execution order: creates first, then updates, completes, deletes last
- tempId: Optional for creates (auto-generated if not provided)
- parentTempId: Reference parent by tempId for hierarchies
- Updates/completes can reference tempIds from creates in the same batch
- createSequentially: true (respects dependencies)
- returnMapping: true (returns tempId → realId map)
- stopOnError: true (halt on first failure)

TAG OPERATIONS:
- tags: [...] - Replace all tags
- addTags: [...] - Add to existing
- removeTags: [...] - Remove from existing
- Nested tags use " : " path syntax: "Parent : Child : Leaf" (creates hierarchy, assigns leaf)

TAG MANAGEMENT (tag_manage operation):
- create: Create new tag (tagName required). Supports " : " path syntax for nested hierarchies.
- rename: Rename tag (tagName + newName required)
- delete: Delete tag (tagName required)
- merge: Merge source into target (tagName + targetTag required)
- nest: Move tag under parent (tagName + parentTag required)
- unnest: Move tag to root level (tagName required)
- reparent: Move tag to different parent (tagName + parentTag required)

DATE FORMATS:
- Date only: "YYYY-MM-DD" (defaults: due=5pm, defer=8am, planned=8am)
- Date+time: "YYYY-MM-DD HH:mm" (local time)
- Clear date: null or clearDueDate/clearDeferDate/clearPlannedDate: true

MOVE TO INBOX: Set project: null

SAFETY:
- Delete is permanent - confirm with user first
- Batch supports up to 100 operations`;

  schema = WriteSchema;
  meta = {
    category: 'Task Management' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['unified', 'write', 'mutations', 'tags'],
    capabilities: ['create', 'update', 'complete', 'delete', 'batch', 'tag_manage'],
  };

  annotations = {
    title: 'Manage OmniFocus Tasks',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  };

  private compiler: MutationCompiler;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new MutationCompiler();
  }

  async executeValidated(args: WriteInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    // Tag management operations
    if (compiled.operation === 'tag_manage') {
      return this.handleTagManage(compiled);
    }

    // Handle dry-run for batch operations
    if (compiled.operation === 'batch' && compiled.dryRun) {
      return this.previewBatch(compiled);
    }

    // Handle dry-run for bulk_delete
    if (compiled.operation === 'bulk_delete' && compiled.dryRun) {
      return this.previewBulkDelete(compiled);
    }

    // Route to batch tool if batch operation
    if (compiled.operation === 'batch') {
      return this.routeToBatch(compiled);
    }

    // Route bulk_delete — direct execution for tasks, delegate for projects
    if (compiled.operation === 'bulk_delete') {
      return this.handleBulkDelete(compiled);
    }

    // Route based on target: task vs project
    if (compiled.target === 'project') {
      return this.handleProjectOperation(compiled);
    }

    // Route task operations to inline handlers
    let taskResult: unknown;
    try {
      switch (compiled.operation) {
        case 'create':
          taskResult = await this.handleTaskCreate(compiled);
          break;
        case 'update':
          taskResult = await this.handleTaskUpdate(compiled);
          break;
        case 'complete':
          taskResult = await this.handleTaskComplete(compiled);
          break;
        case 'delete':
          taskResult = await this.handleTaskDelete(compiled);
          break;
        default:
          return createErrorResponseV2(
            'omnifocus_write',
            'INVALID_OPERATION',
            `Invalid task operation: ${String((compiled as { operation: string }).operation)}`,
            undefined,
            { operation: (compiled as { operation: string }).operation },
            new OperationTimerV2().toMetadata(),
          );
      }

      const isSuccess = taskResult && typeof taskResult === 'object' && (taskResult as { success?: boolean }).success;
      return this.formatForCLI(taskResult, compiled.operation, isSuccess ? 'success' : 'error');
    } catch (error) {
      const errorResult = this.handleErrorV2<TaskOperationDataV2>(error);
      return this.formatForCLI(errorResult, compiled.operation, 'error');
    }
  }

  // ─── Task Create ────────────────────────────────────────────────────

  private async handleTaskCreate(compiled: Extract<CompiledMutation, { operation: 'create' }>): Promise<unknown> {
    const timer = new OperationTimerV2();
    const data = compiled.data;

    // Build creation args, filtering out null/undefined values
    const createArgs: Partial<TaskCreationArgs> = { name: data.name };
    if (data.note) createArgs.note = data.note;
    if (data.project !== undefined && data.project !== null) {
      createArgs.projectId = data.project;
    }
    if (data.parentTaskId) createArgs.parentTaskId = data.parentTaskId;
    if (data.dueDate) createArgs.dueDate = data.dueDate;
    if (data.deferDate) createArgs.deferDate = data.deferDate;
    if (data.plannedDate) createArgs.plannedDate = data.plannedDate;
    if (data.flagged !== undefined) createArgs.flagged = data.flagged;
    if (data.estimatedMinutes !== undefined) createArgs.estimatedMinutes = data.estimatedMinutes;
    if (data.tags) createArgs.tags = data.tags;
    if (data.sequential !== undefined) createArgs.sequential = data.sequential;

    // Handle repetition rules - prefer unified API format (repetitionRule) over legacy format
    let repetitionRuleForCreate: RepetitionRule | undefined;
    if (data.repetitionRule && typeof data.repetitionRule === 'object') {
      // Unified API format - use directly
      repetitionRuleForCreate = data.repetitionRule as RepetitionRule;
      this.logger.debug('Using unified API repetitionRule for creation', {
        repetitionRule: repetitionRuleForCreate,
      });
    }

    // Convert local dates to UTC for OmniFocus with error handling
    let convertedTaskData;
    try {
      convertedTaskData = {
        ...createArgs,
        dueDate: createArgs.dueDate ? localToUTC(createArgs.dueDate, 'due') : undefined,
        deferDate: createArgs.deferDate ? localToUTC(createArgs.deferDate, 'defer') : undefined,
        plannedDate: createArgs.plannedDate ? localToUTC(createArgs.plannedDate, 'planned') : undefined,
        // Map projectId to project for mutation contract compatibility
        project: createArgs.projectId,
      };
      // Remove projectId since mutation contract uses 'project'
      delete convertedTaskData.projectId;
    } catch (dateError) {
      const fieldName =
        dateError instanceof Error && dateError.message.includes('defer')
          ? 'deferDate'
          : dateError instanceof Error && dateError.message.includes('planned')
            ? 'plannedDate'
            : 'dueDate';
      const providedValue =
        fieldName === 'deferDate'
          ? createArgs.deferDate
          : fieldName === 'plannedDate'
            ? createArgs.plannedDate
            : createArgs.dueDate;
      const errorDetails = invalidDateError(fieldName, providedValue || '');
      return createErrorResponseV2(
        'omnifocus_write',
        'INVALID_DATE_FORMAT',
        errorDetails.message,
        formatErrorWithRecovery(errorDetails),
        {
          recovery: errorDetails.recovery,
          providedValue,
        },
        timer.toMetadata(),
      );
    }

    this.logger.debug('Converted task data for script execution', { convertedTaskData });

    // Use AST-powered mutation builder
    const script = (await buildCreateTaskScript(convertedTaskData as TaskCreateData)).script;
    let createResult: unknown;

    try {
      const scriptResult = await this.execJson(script);
      this.logger.debug('execJson returned result', { scriptResult });

      if (isScriptError(scriptResult)) {
        return createErrorResponseV2(
          'omnifocus_write',
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

    if (
      createResult &&
      typeof createResult === 'object' &&
      'error' in createResult &&
      (createResult as { error: unknown }).error
    ) {
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
        'omnifocus_write',
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
        'omnifocus_write',
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

    // Handle v3 envelope format - unwrap if present
    // Scripts return: {ok: true, v: "3", data: {...}}
    // execJson wraps it: {success: true, data: {ok: true, v: "3", data: {...}}}
    // After extracting .data we have: {ok: true, v: "3", data: {...}}
    // We need to unwrap to: {...}
    if (parsedCreateResult && typeof parsedCreateResult === 'object') {
      const envelope = parsedCreateResult as { ok?: boolean; v?: string; data?: unknown };
      if (envelope.ok === true && envelope.v === '3' && envelope.data !== undefined) {
        this.logger.debug('Unwrapping v3 envelope', { envelope });
        parsedCreateResult = envelope.data;
      }
    }

    // Check if parsedResult is valid
    if (
      !parsedCreateResult ||
      typeof parsedCreateResult !== 'object' ||
      (!(parsedCreateResult as Record<string, unknown>).taskId && !(parsedCreateResult as Record<string, unknown>).id)
    ) {
      return createErrorResponseV2(
        'omnifocus_write',
        'INTERNAL_ERROR',
        'Invalid response from create task script',
        'Have the script return an object with id/taskId',
        { received: parsedCreateResult as unknown },
        timer.toMetadata(),
      );
    }

    const createdTaskId =
      (parsedCreateResult as { taskId?: string; id?: string }).taskId ||
      (parsedCreateResult as { id?: string }).id ||
      null;
    this.logger.debug('Post-create task ID', { createdTaskId });

    if (repetitionRuleForCreate && createdTaskId) {
      try {
        this.logger.debug('Applying repeat rule via update', { repetitionRule: repetitionRuleForCreate });
        // Use AST-powered mutation builder - repetitionRuleForCreate is already in contract format
        const repeatOnlyScript = (
          await buildUpdateTaskScript(createdTaskId, { repetitionRule: repetitionRuleForCreate })
        ).script;
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
      affectsToday: createArgs.dueDate ? this.isDueSoon(createArgs.dueDate) : false,
      affectsOverdue: false, // New tasks can't be overdue
    });

    this.logger.debug('Returning success response', { parsedCreateResult });

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        task: parsedCreateResult,
        id: createdTaskId, // Expose id at top level for convenience
        name: (parsedCreateResult as Record<string, unknown>).name, // Expose name at top level
        operation: 'create' as const,
      },
      undefined,
      {
        ...timer.toMetadata(),
        created_id: createdTaskId,
        project_id: createArgs.projectId || null,
        input_params: {
          name: createArgs.name,
          has_project: !!createArgs.projectId,
          has_due_date: !!createArgs.dueDate,
          has_planned_date: !!createArgs.plannedDate,
          has_tags: !!(createArgs.tags && createArgs.tags.length > 0),
          has_repeat_rule: !!repetitionRuleForCreate,
        },
      },
    );
  }

  // ─── Task Update ────────────────────────────────────────────────────

  private async handleTaskUpdate(compiled: Extract<CompiledMutation, { operation: 'update' }>): Promise<unknown> {
    const timer = new OperationTimerV2();
    const taskId = compiled.taskId!;
    const minimalResponse = compiled.minimalResponse ?? false;

    // Sanitize and validate updates using shared utility
    const safeUpdates = sanitizeTaskUpdates(compiled.changes as Record<string, unknown>);

    // If no valid updates, return early
    if (Object.keys(safeUpdates).length === 0) {
      return createSuccessResponseV2(
        'omnifocus_write',
        { task: { id: taskId, name: '', updated: false as const, changes: {} } },
        undefined,
        { ...timer.toMetadata(), input_params: { taskId }, message: 'No valid updates provided' },
      );
    }

    this.logger.debug('Sending to update script:', {
      taskId,
      safeUpdates,
      safeUpdatesKeys: Object.keys(safeUpdates),
    });

    // Use AST-powered mutation builder
    const updateScript = (await buildUpdateTaskScript(taskId, safeUpdates)).script;
    const updateResult = await this.execJson(updateScript);
    if (isScriptError(updateResult)) {
      this.logger.error(`Update task script error: ${updateResult.error}`);
      return createErrorResponseV2(
        'omnifocus_write',
        'SCRIPT_ERROR',
        updateResult.error || 'Script execution failed',
        'Verify task exists and params are valid',
        updateResult.details,
        timer.toMetadata(),
      );
    }

    if (isScriptSuccess(updateResult)) {
      const rawData = updateResult.data as { success?: unknown; error?: unknown; message?: unknown } | undefined;
      if (rawData && typeof rawData === 'object') {
        const errorValue = rawData.error;
        const subSuccess = rawData.success;
        if (errorValue || subSuccess === false) {
          const errorMessage =
            typeof rawData.message === 'string'
              ? rawData.message
              : typeof errorValue === 'string'
                ? errorValue
                : 'Script execution failed';
          return createErrorResponseV2(
            'omnifocus_write',
            'SCRIPT_ERROR',
            errorMessage,
            'Verify task exists and params are valid',
            rawData,
            timer.toMetadata(),
          );
        }
      }
    }
    let parsedUpdateResult = (updateResult as ScriptExecutionResult).data;

    // Handle v3 envelope format - unwrap if present
    if (parsedUpdateResult && typeof parsedUpdateResult === 'object') {
      const envelope = parsedUpdateResult as { ok?: boolean; v?: string; data?: unknown };
      if (envelope.ok === true && envelope.v === '3' && envelope.data !== undefined) {
        this.logger.debug('Unwrapping v3 envelope for update', { envelope });
        parsedUpdateResult = envelope.data;
      }
    }

    // Smart cache invalidation after successful update
    // Collect all affected tags (tags, addTags, removeTags)
    const affectedTags: string[] = [];
    if (isStringArray(safeUpdates.tags)) affectedTags.push(...safeUpdates.tags);
    if (isStringArray(safeUpdates.addTags)) affectedTags.push(...safeUpdates.addTags);
    if (isStringArray(safeUpdates.removeTags)) affectedTags.push(...safeUpdates.removeTags);

    this.cache.invalidateForTaskChange({
      operation: 'update',
      projectId: typeof safeUpdates.project === 'string' ? safeUpdates.project : undefined,
      tags: affectedTags.length > 0 ? affectedTags : undefined,
      affectsToday: typeof safeUpdates.dueDate === 'string' ? this.isDueSoon(safeUpdates.dueDate) : false,
      affectsOverdue: false, // Updates don't automatically make things overdue
    });

    this.logger.info(`Updated task: ${taskId}`);

    // Handle response levels for context optimization
    if (minimalResponse) {
      return {
        success: true,
        id: taskId,
        operation: 'update_task',
        task_id: taskId, // Keep for backwards compatibility
        fields_updated: Object.keys(safeUpdates),
      };
    }

    // Transform new schema-validated result to expected format
    const taskData = (parsedUpdateResult as { task?: Record<string, unknown> })?.task ||
      parsedUpdateResult || { id: taskId, name: 'Unknown' };
    const transformedResult = {
      id: (taskData as { id?: string }).id || taskId,
      name: (taskData as { name?: string }).name || 'Unknown',
      updated: true,
      changes: Object.keys(safeUpdates).reduce(
        (acc, key) => {
          acc[key] = safeUpdates[key];
          return acc;
        },
        {} as Record<string, unknown>,
      ),
    };

    return createSuccessResponseV2('omnifocus_write', { task: transformedResult }, undefined, {
      ...timer.toMetadata(),
      updated_id: taskId,
      input_params: {
        taskId,
        fields_updated: Object.keys(safeUpdates),
        has_date_changes: !!(
          safeUpdates.dueDate ||
          safeUpdates.deferDate ||
          safeUpdates.clearDueDate ||
          safeUpdates.clearDeferDate
        ),
        has_project_change: safeUpdates.project !== undefined,
      },
    });
  }

  // ─── Task Complete ──────────────────────────────────────────────────

  private async handleTaskComplete(compiled: Extract<CompiledMutation, { operation: 'complete' }>): Promise<unknown> {
    const timer = new OperationTimerV2();
    const taskId = compiled.taskId!;

    // Convert completionDate if provided
    const processedArgs = {
      taskId,
      completionDate: compiled.completionDate ? localToUTC(compiled.completionDate, 'completion') : undefined,
    };

    try {
      const completeScript = this.omniAutomation.buildScript(
        COMPLETE_TASK_SCRIPT,
        processedArgs as unknown as Record<string, unknown>,
      );
      const res = await this.execJson(completeScript);
      const completeResult =
        res && typeof res === 'object' && 'success' in res
          ? (res as TaskOperationResult)
          : { success: true, data: res };

      if (typeof completeResult === 'object' && 'success' in completeResult && !completeResult.success) {
        const error = (completeResult as { error?: string }).error;
        if (error && typeof error === 'string' && this.isJxaAccessDenied(error)) {
          this.logger.info('JXA access denied for task completion');
          return this.jxaAccessDeniedError(timer);
        }
        const errorMsg = error || 'Unknown error';
        const details = (completeResult as { details?: unknown }).details;
        return createErrorResponseV2(
          'omnifocus_write',
          'SCRIPT_ERROR',
          errorMsg,
          'Verify task ID and OmniFocus state',
          details,
          timer.toMetadata(),
        );
      }

      this.logger.info(`Completed task via JXA: ${taskId}`);

      const parsedCompleteResult = (completeResult as { data?: unknown }).data;

      this.cache.invalidateForTaskChange({
        operation: 'complete',
        affectsToday: true,
        affectsOverdue: true,
      });

      return createSuccessResponseV2('omnifocus_write', { task: parsedCompleteResult }, undefined, {
        ...timer.toMetadata(),
        completed_id: taskId,
        method: 'jxa',
        input_params: { taskId },
      });
    } catch (jxaError: unknown) {
      const errorMessage = jxaError instanceof Error ? jxaError.message : String(jxaError);
      if (this.isJxaAccessDenied(errorMessage)) {
        this.logger.info('JXA failed for task completion');
        return this.jxaAccessDeniedError(timer);
      }
      return this.handleErrorV2<TaskOperationDataV2>(jxaError);
    }
  }

  // ─── Task Delete ────────────────────────────────────────────────────

  private async handleTaskDelete(compiled: Extract<CompiledMutation, { operation: 'delete' }>): Promise<unknown> {
    const timer = new OperationTimerV2();
    const taskId = compiled.taskId!;

    try {
      const deleteScript = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, {
        taskId,
      } as unknown as Record<string, unknown>);
      const res = await this.execJson(deleteScript);
      const deleteResult =
        res && typeof res === 'object' && 'success' in res
          ? (res as TaskOperationResult)
          : { success: true, data: res };

      if (typeof deleteResult === 'object' && 'success' in deleteResult && !deleteResult.success) {
        const error = (deleteResult as { error?: string }).error;
        if (error && typeof error === 'string' && this.isJxaAccessDenied(error)) {
          this.logger.info('JXA failed for task deletion');
          return this.jxaAccessDeniedError(timer);
        }
        const errorMsg = error || 'Unknown error';
        const details = (deleteResult as { details?: unknown }).details;
        return createErrorResponseV2(
          'omnifocus_write',
          'SCRIPT_ERROR',
          errorMsg,
          'Verify task ID and permissions',
          details,
          timer.toMetadata(),
        );
      }

      const parsedDeleteResult = (deleteResult as { data?: unknown }).data;

      // Conservative cache invalidation — we don't know which project/tags were affected
      this.cache.invalidateForTaskChange({
        operation: 'delete',
        affectsToday: true,
        affectsOverdue: true,
      });
      this.cache.invalidate('projects');
      this.cache.invalidate('tags');

      this.logger.info(`Deleted task via JXA: ${taskId}`);
      return createSuccessResponseV2('omnifocus_write', { task: parsedDeleteResult }, undefined, {
        ...timer.toMetadata(),
        deleted_id: taskId,
        method: 'jxa',
        input_params: { taskId },
      });
    } catch (jxaError: unknown) {
      const errorMessage = jxaError instanceof Error ? jxaError.message : String(jxaError);
      if (this.isJxaAccessDenied(errorMessage)) {
        this.logger.info('JXA failed for task deletion');
        return this.jxaAccessDeniedError(timer);
      }
      return this.handleErrorV2<TaskOperationDataV2>(jxaError);
    }
  }

  // ─── Bulk Delete ────────────────────────────────────────────────────

  private async handleBulkDelete(compiled: Extract<CompiledMutation, { operation: 'bulk_delete' }>): Promise<unknown> {
    const timer = new OperationTimerV2();

    if (compiled.target === 'project') {
      // Project bulk delete — iterate through individual delete operations
      const deleteResults: Array<{ projectId: string; status: string }> = [];
      const deleteErrors: unknown[] = [];

      for (const id of compiled.ids) {
        try {
          const deleteResult = await this.handleProjectDelete(id);
          const success =
            deleteResult && typeof deleteResult === 'object' && (deleteResult as { success?: boolean }).success;
          if (success) {
            deleteResults.push({ projectId: id, status: 'deleted' });
          } else {
            deleteErrors.push({ projectId: id, error: 'Delete failed' });
          }
        } catch (err) {
          deleteErrors.push({ projectId: id, error: String(err) });
        }
      }

      return createSuccessResponseV2(
        'omnifocus_write',
        {
          operation: 'bulk_delete',
          successCount: deleteResults.length,
          errorCount: deleteErrors.length,
          results: deleteResults,
          errors: deleteErrors.length > 0 ? deleteErrors : undefined,
        },
        undefined,
        timer.toMetadata(),
      );
    }

    // Task bulk delete — direct execution
    const taskIds = compiled.ids.map((id) => convertToTaskId(id));
    const results: Array<{ taskId: string; status: string }> = [];
    const errors: unknown[] = [];

    try {
      const script = this.omniAutomation.buildScript(BULK_DELETE_TASKS_SCRIPT, {
        taskIds: taskIds.map((id) => id as string),
      });
      const result = await this.execJson(script);

      if (isScriptError(result)) {
        errors.push({ error: result.error || 'Bulk delete failed' });
      } else if (result.data && typeof result.data === 'object') {
        const bulkResult = result.data as {
          deleted?: Array<{ id: string; name: string }>;
          errors?: Array<{ taskId: string; error: string }>;
        };

        if (Array.isArray(bulkResult.deleted)) {
          for (const item of bulkResult.deleted) {
            results.push({ taskId: item.id, status: 'deleted' });
          }
        }

        if (Array.isArray(bulkResult.errors)) {
          errors.push(...bulkResult.errors);
        }
      }

      // Invalidate task cache after bulk operation
      this.cache.clear('tasks');
    } catch (error) {
      errors.push({ error: String(error) });
    }

    const responseData = {
      operation: 'bulk_delete',
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };

    return createSuccessResponseV2('omnifocus_write', responseData, undefined, timer.toMetadata());
  }

  // ─── Project operations (inline) ────────────────────────────────────

  private async handleProjectOperation(
    compiled: Exclude<CompiledMutation, { operation: 'batch' | 'bulk_delete' }>,
  ): Promise<unknown> {
    // Route by operation type
    switch (compiled.operation) {
      case 'update':
        if ('projectId' in compiled && compiled.projectId) {
          return this.handleProjectUpdateDirect(compiled.projectId, compiled.changes as ProjectUpdateData);
        }
        return createErrorResponseV2(
          'omnifocus_write',
          'MISSING_PARAMETER',
          'Project ID is required for update',
          'Use omnifocus_read to find the project ID first',
          undefined,
          new OperationTimerV2().toMetadata(),
        );
      case 'create':
        return this.handleProjectCreate(compiled as Extract<CompiledMutation, { operation: 'create' }>);
      case 'complete':
        if ('projectId' in compiled && compiled.projectId) {
          return this.handleProjectComplete(compiled.projectId);
        }
        return createErrorResponseV2(
          'omnifocus_write',
          'MISSING_PARAMETER',
          'Project ID is required for complete',
          'Use omnifocus_read to find the project ID first',
          undefined,
          new OperationTimerV2().toMetadata(),
        );
      case 'delete':
        if ('projectId' in compiled && compiled.projectId) {
          return this.handleProjectDelete(compiled.projectId);
        }
        return createErrorResponseV2(
          'omnifocus_write',
          'MISSING_PARAMETER',
          'Project ID is required for delete',
          'Use omnifocus_read to find the project ID first',
          undefined,
          new OperationTimerV2().toMetadata(),
        );
      default:
        return createErrorResponseV2(
          'omnifocus_write',
          'INVALID_OPERATION',
          `Invalid project operation: ${String((compiled as { operation: string }).operation)}`,
          undefined,
          undefined,
          new OperationTimerV2().toMetadata(),
        );
    }
  }

  /**
   * Create a new project via buildCreateProjectScript (AST mutation builder).
   */
  private async handleProjectCreate(compiled: Extract<CompiledMutation, { operation: 'create' }>): Promise<unknown> {
    const timer = new OperationTimerV2();
    const data = compiled.data;

    if (!data.name) {
      return createErrorResponseV2(
        'omnifocus_write',
        'MISSING_PARAMETER',
        'Project name is required',
        'Add a name parameter with the project name',
        undefined,
        timer.toMetadata(),
      );
    }

    const projectData: ProjectCreateData = {
      name: data.name,
      note: data.note,
      dueDate: data.dueDate,
      flagged: data.flagged,
      tags: data.tags,
      sequential: data.sequential ?? false,
      folder: data.folder,
      status: data.status,
      reviewInterval: data.reviewInterval,
    };

    const generatedScript = buildCreateProjectScript(projectData);
    const result = await this.execJson(generatedScript.script);

    if (isScriptError(result)) {
      const errorMessage = result.error || 'Failed to create project';
      if (typeof errorMessage === 'string' && this.isJxaAccessDenied(errorMessage)) {
        return this.jxaAccessDeniedError(timer);
      }
      return createErrorResponseV2(
        'omnifocus_write',
        'CREATE_FAILED',
        typeof errorMessage === 'string' ? errorMessage : 'Script execution failed',
        'Check the project name and try again',
        result.details,
        timer.toMetadata(),
      );
    }

    // Invalidate cache
    this.cache.invalidate('projects');

    return createSuccessResponseV2('omnifocus_write', { project: result.data, operation: 'create' }, undefined, {
      ...timer.toMetadata(),
      operation: 'create',
    });
  }

  /**
   * Complete a project via buildCompleteScript (AST mutation builder).
   */
  private async handleProjectComplete(projectId: string): Promise<unknown> {
    const timer = new OperationTimerV2();

    const generatedScript = await buildCompleteScript('project', projectId);
    const result = await this.execJson(generatedScript.script);

    if (isScriptError(result)) {
      const errorMessage = result.error || 'Failed to complete project';
      if (typeof errorMessage === 'string' && this.isJxaAccessDenied(errorMessage)) {
        return this.jxaAccessDeniedError(timer);
      }
      return createErrorResponseV2(
        'omnifocus_write',
        'COMPLETE_FAILED',
        typeof errorMessage === 'string' ? errorMessage : 'Script execution failed',
        "Check the project ID and ensure it's not already completed",
        result.details,
        timer.toMetadata(),
      );
    }

    // Smart cache invalidation
    this.cache.invalidateProject(projectId);
    this.cache.invalidate('analytics');

    return createSuccessResponseV2('omnifocus_write', { project: result.data, operation: 'complete' }, undefined, {
      ...timer.toMetadata(),
      operation: 'complete',
    });
  }

  /**
   * Delete a project via buildDeleteScript (AST mutation builder).
   */
  private async handleProjectDelete(projectId: string): Promise<unknown> {
    const timer = new OperationTimerV2();

    const generatedScript = await buildDeleteScript('project', projectId);
    const result = await this.execJson(generatedScript.script);

    if (isScriptError(result)) {
      const errorMessage = result.error || 'Failed to delete project';
      if (typeof errorMessage === 'string' && this.isJxaAccessDenied(errorMessage)) {
        return this.jxaAccessDeniedError(timer);
      }
      return createErrorResponseV2(
        'omnifocus_write',
        'DELETE_FAILED',
        typeof errorMessage === 'string' ? errorMessage : 'Script execution failed',
        'Check the project ID and permissions',
        result.details,
        timer.toMetadata(),
      );
    }

    // Smart cache invalidation
    this.cache.invalidateProject(projectId);
    this.cache.invalidate('analytics');

    return createSuccessResponseV2('omnifocus_write', { project: { deleted: true }, operation: 'delete' }, undefined, {
      ...timer.toMetadata(),
      operation: 'delete',
    });
  }

  /**
   * Handle project updates directly via buildUpdateProjectScript.
   * This ensures all ProjectUpdateData fields are passed through without stripping.
   */
  private async handleProjectUpdateDirect(projectId: string, changes: ProjectUpdateData): Promise<unknown> {
    const timer = new OperationTimerV2();

    const script = (await buildUpdateProjectScript(projectId, changes)).script;
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'omnifocus_write',
        'UPDATE_FAILED',
        result.error || 'Failed to update project',
        'Check the project ID and try again',
        result.details,
        timer.toMetadata(),
      );
    }

    // Smart cache invalidation
    this.cache.invalidateProject(projectId);

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        operation: 'update',
        target: 'project',
        ...(result.data as Record<string, unknown>),
      },
      undefined,
      timer.toMetadata(),
    );
  }

  // ─── Batch routing ─────────────────────────────────────────────────

  private async routeToBatch(compiled: Extract<CompiledMutation, { operation: 'batch' }>): Promise<unknown> {
    // Partition operations by type
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');
    const completeOps = compiled.operations.filter((op) => op.operation === 'complete');
    const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

    const results: {
      created: unknown[];
      updated: unknown[];
      completed: unknown[];
      deleted: unknown[];
      errors: unknown[];
    } = { created: [], updated: [], completed: [], deleted: [], errors: [] };

    let tempIdMapping: Record<string, string> = {};
    let createdCount = 0;
    let hadError = false;

    // Phase 1: Creates (inline batch create with hierarchy support)
    if (createOps.length > 0 && !hadError) {
      try {
        let autoTempIdCounter = 0;
        const items: BatchItem[] = createOps.map((op) => {
          const item = { type: op.target as 'task' | 'project', ...op.data } as BatchItem;
          if (!item.tempId) {
            item.tempId = `auto_temp_${++autoTempIdCounter}`;
          }
          return item;
        });

        const createResult = await this.executeBatchCreates(items, {
          createSequentially: compiled.createSequentially ?? true,
          atomicOperation: compiled.atomicOperation ?? false,
          returnMapping: compiled.returnMapping ?? true,
          stopOnError: compiled.stopOnError ?? true,
        });

        if (createResult.success === false && createResult.rolledBack) {
          // Atomic operation failed and was rolled back
          results.errors.push(createResult);
          if (compiled.stopOnError) hadError = true;
        } else if (createResult.failed > 0 && compiled.stopOnError) {
          results.errors.push(createResult);
          hadError = true;
        } else {
          results.created.push(createResult);
        }

        // Extract tempId mapping for subsequent operations
        createdCount = createResult.created;
        if (createResult.mapping) {
          tempIdMapping = createResult.mapping;
        }
      } catch (err) {
        if (err instanceof DependencyGraphError) {
          results.errors.push({
            phase: 'create',
            error: err.message,
            details: err.details,
          });
        } else {
          results.errors.push({ phase: 'create', error: String(err) });
        }
        if (compiled.stopOnError) hadError = true;
      }
    }

    // Phase 2-4: Updates, completes, deletes — route through inline handlers
    const phases: Array<{
      name: string;
      ops: typeof updateOps;
      resultKey: 'updated' | 'completed' | 'deleted';
    }> = [
      { name: 'update', ops: updateOps, resultKey: 'updated' },
      { name: 'complete', ops: completeOps, resultKey: 'completed' },
      { name: 'delete', ops: deleteOps, resultKey: 'deleted' },
    ];

    for (const phase of phases) {
      if (hadError || phase.ops.length === 0) continue;

      for (const op of phase.ops) {
        try {
          // Resolve tempId references if the id matches a tempId from creates
          const resolvedId = op.id && tempIdMapping[op.id] ? tempIdMapping[op.id] : op.id;

          let result: unknown;
          if (op.target === 'project' && op.operation === 'update') {
            result = await this.handleProjectUpdateDirect(resolvedId!, op.changes as ProjectUpdateData);
          } else if (op.target === 'project') {
            // Route project operations through inline handlers
            if (op.operation === 'complete') {
              result = await this.handleProjectComplete(resolvedId!);
            } else if (op.operation === 'delete') {
              result = await this.handleProjectDelete(resolvedId!);
            } else {
              // Fallback: should not reach here for valid batch operations
              throw new Error(`Unsupported batch project operation: ${op.operation}`);
            }
          } else {
            // Task operations — use inline handlers via the main dispatch
            // Build a compiled mutation and dispatch it
            const taskCompiled = this.buildTaskCompiledForBatch(op, resolvedId);
            result = await this.dispatchTaskOperation(taskCompiled);
          }
          results[phase.resultKey].push(result);
        } catch (err) {
          results.errors.push({ phase: phase.name, id: op.id, error: String(err) });
          if (compiled.stopOnError) {
            hadError = true;
            break;
          }
        }
      }
    }

    return {
      success: results.errors.length === 0,
      data: {
        operation: 'batch',
        summary: {
          created: createdCount,
          updated: results.updated.length,
          completed: results.completed.length,
          deleted: results.deleted.length,
          errors: results.errors.length,
        },
        results,
        ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
      },
      metadata: {
        operation: 'batch',
        timestamp: new Date().toISOString(),
        ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
      },
    };
  }

  /**
   * Build a CompiledMutation-compatible object from a batch operation for inline dispatch.
   */
  private buildTaskCompiledForBatch(
    op: { operation: string; id?: string; changes?: unknown; completionDate?: string },
    resolvedId?: string,
  ): CompiledMutation {
    switch (op.operation) {
      case 'update':
        return {
          operation: 'update',
          target: 'task',
          taskId: resolvedId,
          changes: (op.changes || {}) as any,
        };
      case 'complete':
        return {
          operation: 'complete',
          target: 'task',
          taskId: resolvedId,
          completionDate: op.completionDate,
        };
      case 'delete':
        return {
          operation: 'delete',
          target: 'task',
          taskId: resolvedId,
        };
      default:
        throw new Error(`Unexpected batch task operation: ${op.operation}`);
    }
  }

  /**
   * Dispatch a task operation to the correct inline handler.
   */
  private async dispatchTaskOperation(compiled: CompiledMutation): Promise<unknown> {
    switch (compiled.operation) {
      case 'update':
        return this.handleTaskUpdate(compiled as Extract<CompiledMutation, { operation: 'update' }>);
      case 'complete':
        return this.handleTaskComplete(compiled as Extract<CompiledMutation, { operation: 'complete' }>);
      case 'delete':
        return this.handleTaskDelete(compiled as Extract<CompiledMutation, { operation: 'delete' }>);
      default:
        throw new Error(`Unexpected task operation for dispatch: ${(compiled as { operation: string }).operation}`);
    }
  }

  // ─── Batch create (inlined from BatchCreateTool) ────────────────────

  /**
   * Execute batch creates with dependency ordering, tempId resolution,
   * atomic rollback, and smart cache invalidation.
   */
  private async executeBatchCreates(
    items: BatchItem[],
    options: {
      createSequentially: boolean;
      atomicOperation: boolean;
      returnMapping: boolean;
      stopOnError: boolean;
    },
  ): Promise<{
    success: boolean;
    created: number;
    failed: number;
    totalItems: number;
    results: BatchItemCreationResult[];
    mapping?: Record<string, string>;
    rolledBack?: boolean;
  }> {
    const resolver = new TempIdResolver();
    const batchResults: BatchItemCreationResult[] = [];

    // Step 1: Validate and build dependency graph
    const graph = new DependencyGraph(items as BatchItem[]);
    const stats = graph.getStats();

    this.logger.info('Batch create initiated', {
      itemCount: stats.totalItems,
      projects: stats.projects,
      tasks: stats.tasks,
      maxDepth: stats.maxDepth,
      atomic: options.atomicOperation,
    });

    // Step 2: Register all temporary IDs
    for (const item of items) {
      resolver.register(item.tempId, item.type);
    }

    // Step 3: Get creation order (respects dependencies)
    const orderedItems = options.createSequentially ? graph.getCreationOrder() : items;

    // Step 4: Create items in order
    for (let i = 0; i < orderedItems.length; i++) {
      const item = orderedItems[i];
      try {
        const result = await this.createBatchItem(item, resolver);
        batchResults.push(result);

        if (result.success && result.realId) {
          resolver.resolve(item.tempId, result.realId);
        } else {
          resolver.markFailed(item.tempId, result.error || 'Creation failed');

          if (options.stopOnError) {
            break;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        resolver.markFailed(item.tempId, errorMsg);
        batchResults.push({
          tempId: item.tempId,
          realId: null,
          success: false,
          error: errorMsg,
          type: item.type,
        });

        if (options.stopOnError) {
          break;
        }
      }
    }

    // Step 5: Handle atomic operation rollback if needed
    const failedCount = resolver.getFailedCount();
    if (options.atomicOperation && failedCount > 0) {
      await this.rollbackBatchCreations(resolver);
      return {
        success: false,
        created: 0,
        failed: failedCount,
        totalItems: items.length,
        results: batchResults,
        rolledBack: true,
      };
    }

    // Step 6: Smart cache invalidation after successful batch creations
    const createdCount = resolver.getCreatedCount();
    if (createdCount > 0) {
      this.cache.invalidate('projects');

      const projectIds = new Set<string>();
      const tags = new Set<string>();

      for (const item of items) {
        if (item.type === 'project' && batchResults.find((r) => r.tempId === item.tempId)?.success) {
          const realId = resolver.getRealId(item.tempId);
          if (realId) projectIds.add(realId);
        }
        if (item.tags) {
          item.tags.forEach((tag: string) => tags.add(tag));
        }
      }

      projectIds.forEach((id) => this.cache.invalidateProject(id));
      tags.forEach((tag) => this.cache.invalidateTag(tag));
      this.cache.invalidateTaskQueries(['today', 'inbox']);
      this.cache.invalidate('analytics');
    }

    // Step 7: Build response
    const response: {
      success: boolean;
      created: number;
      failed: number;
      totalItems: number;
      results: BatchItemCreationResult[];
      mapping?: Record<string, string>;
    } = {
      success: createdCount > 0,
      created: createdCount,
      failed: failedCount,
      totalItems: items.length,
      results: batchResults,
    };

    if (options.returnMapping) {
      response.mapping = resolver.getMappings();
    }

    return response;
  }

  /**
   * Create a single batch item (project or task).
   */
  private async createBatchItem(item: BatchItem, resolver: TempIdResolver): Promise<BatchItemCreationResult> {
    this.logger.debug(`Creating ${item.type}: ${item.name}`, { tempId: item.tempId });

    try {
      if (item.type === 'project') {
        return await this.createBatchProject(item, resolver);
      } else {
        return await this.createBatchTask(item, resolver);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        tempId: item.tempId,
        realId: null,
        success: false,
        error: errorMsg,
        type: item.type,
      };
    }
  }

  /**
   * Create a project within a batch operation.
   */
  private async createBatchProject(item: BatchItem, _resolver: TempIdResolver): Promise<BatchItemCreationResult> {
    const projectData: ProjectCreateData = {
      name: item.name,
      note: item.note || '',
      flagged: item.flagged || false,
      status: (item.status as ProjectCreateData['status']) || 'active',
      sequential: item.sequential || false,
      tags: item.tags || [],
      folder: item.folder,
    };

    const generatedScript = buildCreateProjectScript(projectData);
    const result = await this.execJson(generatedScript.script);

    if (isScriptError(result)) {
      return {
        tempId: item.tempId,
        realId: null,
        success: false,
        error: result.error,
        type: 'project',
      };
    }

    if (isScriptSuccess(result) && result.data) {
      const data = result.data as { projectId?: string; project?: { id: string } };
      const realId = data.projectId || data.project?.id;

      if (realId) {
        markProjectAsValidated(realId);

        return {
          tempId: item.tempId,
          realId,
          success: true,
          type: 'project',
        };
      }
    }

    return {
      tempId: item.tempId,
      realId: null,
      success: false,
      error: 'No project ID returned from script',
      type: 'project',
    };
  }

  /**
   * Create a task within a batch operation.
   */
  private async createBatchTask(item: BatchItem, resolver: TempIdResolver): Promise<BatchItemCreationResult> {
    // Resolve parent reference if present
    let projectId: string | null = null;
    let parentTaskId: string | null = null;

    if (item.parentTempId) {
      const parentRealId = resolver.getRealId(item.parentTempId);
      if (!parentRealId) {
        return {
          tempId: item.tempId,
          realId: null,
          success: false,
          error: `Parent not yet created: ${item.parentTempId}`,
          type: 'task',
        };
      }

      // Determine if parent is a project or task
      const parentMapping = resolver.getDetailedStatus().find((m) => m.tempId === item.parentTempId);
      if (parentMapping?.type === 'project') {
        projectId = parentRealId;
      } else {
        parentTaskId = parentRealId;
      }
    }

    // Fall back to direct project assignment when parentTempId wasn't used
    if (!projectId && !parentTaskId) {
      if (item.project) {
        projectId = item.project;
      }
    }

    const taskData: TaskCreateData = {
      name: item.name,
      note: item.note || '',
      flagged: item.flagged || false,
      project: projectId || undefined,
      parentTaskId: parentTaskId || undefined,
      tags: item.tags || [],
      dueDate: item.dueDate ? localToUTC(item.dueDate, 'due') : undefined,
      deferDate: item.deferDate ? localToUTC(item.deferDate, 'defer') : undefined,
      plannedDate: item.plannedDate ? localToUTC(item.plannedDate, 'planned') : undefined,
      estimatedMinutes: item.estimatedMinutes,
    };

    const generatedScript = await buildCreateTaskScript(taskData);
    const result = await this.execJson(generatedScript.script);

    if (isScriptError(result)) {
      return {
        tempId: item.tempId,
        realId: null,
        success: false,
        error: result.error,
        type: 'task',
      };
    }

    if (isScriptSuccess(result) && result.data) {
      const data = result.data as { taskId?: string };
      const realId = data.taskId;

      if (realId) {
        markTaskAsValidated(realId);

        return {
          tempId: item.tempId,
          realId,
          success: true,
          type: 'task',
        };
      }
    }

    return {
      tempId: item.tempId,
      realId: null,
      success: false,
      error: 'No task ID returned from script',
      type: 'task',
    };
  }

  /**
   * Rollback all created items in reverse order (children first, parents last).
   */
  private async rollbackBatchCreations(resolver: TempIdResolver): Promise<void> {
    const createdItems = resolver.getCreatedIds();
    this.logger.warn(`Rolling back ${createdItems.length} created items`);

    for (let i = createdItems.length - 1; i >= 0; i--) {
      const item = createdItems[i];
      try {
        const generatedScript = await buildDeleteScript(item.type, item.realId);
        await this.execJson(generatedScript.script);
        this.logger.debug(`Rolled back ${item.type}: ${item.realId}`);
      } catch (error) {
        this.logger.error(`Failed to rollback ${item.type} ${item.realId}:`, error);
      }
    }
  }

  private async handleTagManage(compiled: Extract<CompiledMutation, { operation: 'tag_manage' }>): Promise<unknown> {
    const timer = new OperationTimerV2();

    // Map unified API action to script action
    // 'unnest' in unified API maps to 'unparent' in manage script
    const action = compiled.action === 'unnest' ? 'unparent' : compiled.action;
    const tagName = compiled.tagName;
    const newName = compiled.newName;
    const targetTag = compiled.targetTag;
    const parentTagName = compiled.parentTag;

    // Validate required parameters
    if (!action) {
      return createErrorResponseV2(
        'tags',
        'MISSING_PARAMETER',
        'action is required for manage operation',
        undefined,
        { operation: 'manage' },
        timer.toMetadata(),
      );
    }

    if (!tagName) {
      return createErrorResponseV2(
        'tags',
        'MISSING_PARAMETER',
        'tagName is required for manage operation',
        undefined,
        { operation: 'manage', action },
        timer.toMetadata(),
      );
    }

    // Validate action-specific requirements
    if (action === 'rename' && !newName) {
      return createErrorResponseV2(
        'tags',
        'MISSING_PARAMETER',
        'newName is required for rename action',
        undefined,
        { operation: 'manage', action },
        timer.toMetadata(),
      );
    }

    if (action === 'merge' && !targetTag) {
      return createErrorResponseV2(
        'tags',
        'MISSING_PARAMETER',
        'targetTag is required for merge action',
        undefined,
        { operation: 'manage', action },
        timer.toMetadata(),
      );
    }

    // Execute manage tags script
    const script = this.omniAutomation.buildScript(MANAGE_TAGS_SCRIPT, {
      action,
      tagName,
      newName,
      targetTag,
      parentTagName,
      parentTagId: undefined,
      mutuallyExclusive: undefined,
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tags',
        'SCRIPT_ERROR',
        (isScriptError(result) ? result.error : null) || 'Tag management failed',
        'Verify tag names and hierarchy constraints',
        isScriptError(result) ? { operation: 'manage', action, tagName, details: result.details } : undefined,
        timer.toMetadata(),
      );
    }

    // Unwrap double-wrapped data structure
    const envelope = result.data as unknown;
    const parsedResult =
      envelope && typeof envelope === 'object' && 'data' in envelope && (envelope as { data?: unknown }).data
        ? (envelope as { data: unknown }).data
        : envelope;

    // Smart cache invalidation for tag changes
    this.cache.invalidateTag(tagName);
    if (action === 'rename' && newName) {
      this.cache.invalidateTag(newName);
    }
    if (action === 'merge' && targetTag) {
      this.cache.invalidateTag(targetTag);
    }

    return createSuccessResponseV2(
      'tags',
      {
        action,
        tagName,
        ...(newName && { newName }),
        ...(targetTag && { targetTag }),
        result: parsedResult as { success: boolean; message?: string; data?: unknown },
      },
      undefined,
      { ...timer.toMetadata(), operation: 'manage', action },
    );
  }

  // ─── Preview methods (unchanged) ───────────────────────────────────

  /**
   * Preview batch operation without executing
   * Returns what would be created, with validation results
   */
  private previewBatch(compiled: Extract<CompiledMutation, { operation: 'batch' }>): unknown {
    const timer = new OperationTimerV2();

    // Partition operations
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');
    const completeOps = compiled.operations.filter((op) => op.operation === 'complete');
    const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

    // Build preview items for each type
    const createPreviewItems = createOps.map((op, index) => ({
      tempId: op.data?.tempId || `auto_temp_${index + 1}`,
      type: compiled.target,
      name: op.data?.name || 'Unnamed',
      action: 'create' as const,
      details: {
        project: op.data?.project,
        tags: op.data?.tags,
        dueDate: op.data?.dueDate,
        deferDate: op.data?.deferDate,
        flagged: op.data?.flagged,
        parentTempId: op.data?.parentTempId,
      },
    }));

    const updatePreviewItems = updateOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      name: op.changes?.name || `[Update to ${op.id}]`,
      action: 'update' as const,
      details: op.changes,
    }));

    const completePreviewItems = completeOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      action: 'complete' as const,
      details: { completionDate: op.completionDate },
    }));

    const deletePreviewItems = deleteOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      action: 'delete' as const,
    }));

    // Validation checks
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for duplicate tempIds
    const tempIds = createPreviewItems.map((item) => item.tempId);
    const duplicates = tempIds.filter((id, idx) => tempIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      errors.push(`Duplicate tempIds found: ${duplicates.join(', ')}`);
    }

    // Check for orphan parentTempIds
    const parentRefs = createPreviewItems
      .filter((item) => item.details.parentTempId)
      .map((item) => item.details.parentTempId);
    const orphanRefs = parentRefs.filter((ref) => !tempIds.includes(ref as string));
    if (orphanRefs.length > 0) {
      errors.push(`Parent references not found in batch: ${orphanRefs.join(', ')}`);
    }

    // Warning for large batches
    const totalOps = createOps.length + updateOps.length + completeOps.length + deleteOps.length;
    if (totalOps > 50) {
      warnings.push(`Large batch (${totalOps} operations) may take 30+ seconds to execute`);
    }

    // Warning for deletes
    if (deleteOps.length > 0) {
      warnings.push(`${deleteOps.length} item(s) will be permanently deleted`);
    }

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        dryRun: true,
        operation: 'batch',
        wouldAffect: {
          count: totalOps,
          creates: createPreviewItems.length,
          updates: updatePreviewItems.length,
          completes: completePreviewItems.length,
          deletes: deletePreviewItems.length,
          items: [...createPreviewItems, ...updatePreviewItems, ...completePreviewItems, ...deletePreviewItems],
        },
        validation: {
          passed: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      },
      undefined,
      {
        ...timer.toMetadata(),
        message: `DRY RUN: No changes made. ${createOps.length} create, ${updateOps.length} update, ${completeOps.length} complete, ${deleteOps.length} delete.`,
      },
    );
  }

  /**
   * Preview bulk delete operation without executing
   * Returns the IDs that would be deleted
   *
   * Note: Does not verify if IDs exist (that would require expensive lookups).
   * Verification happens at execution time.
   */
  private previewBulkDelete(compiled: Extract<CompiledMutation, { operation: 'bulk_delete' }>): unknown {
    const timer = new OperationTimerV2();

    // Build preview items from the IDs provided
    const previewItems = compiled.ids.map((id) => ({
      id,
      action: 'delete' as const,
    }));

    const warnings: string[] = [];

    // Warning for large deletes
    if (compiled.ids.length > 20) {
      warnings.push(`Large bulk delete (${compiled.ids.length} items). Double-check IDs before executing.`);
    }

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        dryRun: true,
        operation: 'bulk_delete',
        target: compiled.target,
        wouldAffect: {
          count: compiled.ids.length,
          items: previewItems,
        },
        validation: {
          passed: true,
          warnings: warnings.length > 0 ? warnings : undefined,
          note: 'ID existence not verified in dry-run. Invalid IDs will fail silently at execution.',
        },
      },
      undefined,
      {
        ...timer.toMetadata(),
        message: `DRY RUN: No changes made. ${compiled.ids.length} ${compiled.target}(s) would be permanently deleted.`,
      },
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /** Check if an error message indicates JXA access was denied. */
  private isJxaAccessDenied(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('parameter is missing') || lower.includes('access not allowed');
  }

  /** Build a standard access-denied error response. */
  private jxaAccessDeniedError(timer: OperationTimerV2): unknown {
    return createErrorResponseV2(
      'omnifocus_write',
      'SCRIPT_ERROR',
      'Access denied and URL scheme not implemented',
      'Grant OmniFocus automation access',
      {},
      timer.toMetadata(),
    );
  }

  /**
   * Check if a date is due soon (within next 3 days, matching OmniFocus "today" perspective).
   */
  private isDueSoon(dueDateStr: string): boolean {
    try {
      const dueDate = new Date(dueDateStr);
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      return dueDate <= threeDaysFromNow;
    } catch {
      return false;
    }
  }

  /**
   * Format response for CLI testing when MCP_CLI_TESTING environment variable is set.
   * This makes responses easier to parse in bash scripts.
   */
  private formatForCLI<T>(result: T, operation: string, type: 'success' | 'error'): T {
    // Only modify output if in CLI testing mode
    if (!process.env.MCP_CLI_TESTING) {
      return result;
    }

    // Add CLI-friendly debug output to stderr (won't interfere with JSON)
    if (type === 'success') {
      console.error(`[CLI_DEBUG] omnifocus_write ${operation} operation: SUCCESS`);

      const resultData = result as { data?: { task?: { taskId?: string; id?: string; name?: string } } };
      if (resultData?.data?.task?.taskId || resultData?.data?.task?.id) {
        const taskId = resultData.data.task.taskId || resultData.data.task.id;
        console.error(`[CLI_DEBUG] Task ID: ${taskId}`);
      }

      if (resultData?.data?.task?.name) {
        console.error(`[CLI_DEBUG] Task name: ${resultData.data.task.name}`);
      }

      console.error(
        `[CLI_DEBUG] Operation completed in ${(result as { metadata?: { query_time_ms?: number } })?.metadata?.query_time_ms || 'unknown'}ms`,
      );
    } else {
      console.error(`[CLI_DEBUG] omnifocus_write ${operation} operation: ERROR`);
      console.error(
        `[CLI_DEBUG] Error: ${(result as { error?: { message?: string } })?.error?.message || 'Unknown error'}`,
      );
    }

    return result;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
