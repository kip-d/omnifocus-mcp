import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CreateTaskTool } from './CreateTaskTool.js';
import { UpdateTaskTool } from './UpdateTaskTool.js';
import { CompleteTaskTool } from './CompleteTaskTool.js';
import { DeleteTaskTool } from './DeleteTaskTool.js';
import { createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';

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

  private createTool: CreateTaskTool;
  private updateTool: UpdateTaskTool;
  private completeTool: CompleteTaskTool;
  private deleteTool: DeleteTaskTool;

  constructor(cache: any) {
    super(cache);
    // Initialize the individual tools
    this.createTool = new CreateTaskTool(cache);
    this.updateTool = new UpdateTaskTool(cache);
    this.completeTool = new CompleteTaskTool(cache);
    this.deleteTool = new DeleteTaskTool(cache);
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
          // Execute create operation
          console.error(`[MANAGE_TASK_DEBUG] Calling createTool.execute with params:`, JSON.stringify({
            name: params.name!,
            note: params.note,
            projectId: params.projectId,
            parentTaskId: params.parentTaskId,
            dueDate: params.dueDate,
            deferDate: params.deferDate,
            flagged: params.flagged,
            estimatedMinutes: params.estimatedMinutes,
            tags: params.tags,
            sequential: params.sequential,
            repeatRule: params.repeatRule,
          }, null, 2));
          
          // Filter out null/undefined values for CreateTaskTool
          const createParams: any = { name: params.name! };
          if (params.note) createParams.note = params.note;
          if (params.projectId) createParams.projectId = params.projectId;
          if (params.parentTaskId) createParams.parentTaskId = params.parentTaskId;
          if (params.dueDate) createParams.dueDate = params.dueDate;
          if (params.deferDate) createParams.deferDate = params.deferDate;
          if (params.flagged !== undefined) createParams.flagged = params.flagged;
          if (params.estimatedMinutes !== undefined) createParams.estimatedMinutes = params.estimatedMinutes;
          if (params.tags) createParams.tags = params.tags;
          if (params.sequential !== undefined) createParams.sequential = params.sequential;
          if (params.repeatRule) createParams.repeatRule = params.repeatRule;
          
          result = await this.createTool.execute(createParams);
          
          console.error(`[MANAGE_TASK_DEBUG] CreateTool returned result:`, JSON.stringify(result, null, 2));
          break;

        case 'update':
          // Execute update operation
          result = await this.updateTool.execute({
            taskId: taskId!,
            name: params.name,
            note: params.note,
            projectId: params.projectId,
            parentTaskId: params.parentTaskId,
            dueDate: params.dueDate,
            deferDate: params.deferDate,
            flagged: params.flagged,
            estimatedMinutes: params.estimatedMinutes,
            tags: params.tags,
            sequential: params.sequential,
            clearDueDate: params.clearDueDate,
            clearDeferDate: params.clearDeferDate,
            clearEstimatedMinutes: params.clearEstimatedMinutes,
            clearRepeatRule: params.clearRepeatRule,
            minimalResponse: params.minimalResponse,
            repeatRule: params.repeatRule,
          });
          break;

        case 'complete':
          // Execute complete operation
          result = await this.completeTool.execute({
            taskId: taskId!,
            completionDate: params.completionDate,
          });
          break;

        case 'delete':
          // Execute delete operation
          result = await this.deleteTool.execute({
            taskId: taskId!,
          });
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
