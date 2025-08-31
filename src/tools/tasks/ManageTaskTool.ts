import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CreateTaskTool } from './CreateTaskTool.js';
import { UpdateTaskTool } from './UpdateTaskTool.js';
import { CompleteTaskTool } from './CompleteTaskTool.js';
import { DeleteTaskTool } from './DeleteTaskTool.js';
import { createErrorResponse, OperationTimer } from '../../utils/response-format.js';

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
  
  projectId: z.string()
    .optional()
    .nullable()
    .describe('Project ID to assign the task to (null/empty to move to inbox)'),
  
  parentTaskId: z.string()
    .optional()
    .describe('Parent task ID to create this as a subtask'),
  
  dueDate: z.string()
    .optional()
    .nullable()
    .describe('Due date (YYYY-MM-DD or YYYY-MM-DD HH:mm format)'),
  
  deferDate: z.string()
    .optional()
    .nullable()
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
  completionDate: z.string()
    .optional()
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
      steps: z.number()
    }).optional()
  }).optional()
    .describe('Repeat/recurrence rule for the task')
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
    const timer = new OperationTimer();
    const { operation, taskId, ...params } = args;

    try {
      // Validate required parameters based on operation
      if (operation !== 'create' && !taskId) {
        return createErrorResponse(
          'manage_task',
          'MISSING_PARAMETER',
          `taskId is required for ${operation} operation`,
          { operation },
          timer.toMetadata()
        );
      }

      if (operation === 'create' && !params.name) {
        return createErrorResponse(
          'manage_task',
          'MISSING_PARAMETER',
          'name is required for create operation',
          { operation },
          timer.toMetadata()
        );
      }

      // Route to appropriate tool based on operation
      switch (operation) {
        case 'create':
          // Execute create operation
          return await this.createTool.execute({
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
            repeatRule: params.repeatRule
          });

        case 'update':
          // Execute update operation
          return await this.updateTool.execute({
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
            repeatRule: params.repeatRule
          });

        case 'complete':
          // Execute complete operation
          return await this.completeTool.execute({
            taskId: taskId!,
            completionDate: params.completionDate
          });

        case 'delete':
          // Execute delete operation
          return await this.deleteTool.execute({
            taskId: taskId!
          });

        default:
          return createErrorResponse(
            'manage_task',
            'INVALID_OPERATION',
            `Invalid operation: ${operation}`,
            { operation },
            timer.toMetadata()
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }
}