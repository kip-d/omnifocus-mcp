import { LegacyBaseTool } from '../legacy-base.js';
import {
  BATCH_UPDATE_TASKS_SCRIPT,
  BATCH_COMPLETE_TASKS_SCRIPT,
  BATCH_DELETE_TASKS_SCRIPT,
  BATCH_MIXED_OPERATIONS_SCRIPT
} from '../../omnifocus/scripts/batch-operations.js';
import { StandardResponse, createSuccessResponse } from '../../utils/response-format.js';

interface BatchUpdateInput {
  updates: Array<{
    taskId: string;
    updates: {
      name?: string;
      note?: string;
      flagged?: boolean;
      dueDate?: string;
      deferDate?: string;
      estimatedMinutes?: number;
      projectId?: string;
    };
  }>;
}

interface BatchCompleteInput {
  taskIds: string[];
  completionDate?: string;
}

interface BatchDeleteInput {
  taskIds: string[];
}

interface BatchMixedInput {
  operations: Array<{
    taskId: string;
    action: 'complete' | 'delete' | 'update';
    data?: any;
  }>;
}

export class BatchUpdateTasksTool extends LegacyBaseTool<BatchUpdateInput, StandardResponse<any>> {
  name = 'batch_update_tasks';
  description = 'Update multiple tasks in a single operation. More efficient than individual updates.';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      updates: {
        type: 'array',
        description: 'Array of task updates',
        items: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'ID of the task to update'
            },
            updates: {
              type: 'object',
              description: 'Properties to update',
              properties: {
                name: { type: 'string', description: 'New task name' },
                note: { type: 'string', description: 'New task note' },
                flagged: { type: 'boolean', description: 'Flag status' },
                dueDate: { type: 'string', description: 'ISO date string or null to clear' },
                deferDate: { type: 'string', description: 'ISO date string or null to clear' },
                estimatedMinutes: { type: 'number', description: 'Estimated duration' },
                projectId: { type: 'string', description: 'Project ID or empty string for inbox' }
              }
            }
          },
          required: ['taskId', 'updates']
        }
      }
    },
    required: ['updates']
  };

  async execute(params: BatchUpdateInput): Promise<StandardResponse<any>> {
    try {
      const script = this.omniAutomation.buildScript(BATCH_UPDATE_TASKS_SCRIPT, { taskUpdates: params.updates });
      const result = await this.omniAutomation.execute<any>(script);

      // Parse the JSON result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse batch update result: ${result}`);
        throw new Error('Failed to parse batch update result');
      }

      if (parsedResult.error) {
        throw new Error(parsedResult.message || 'Batch update failed');
      }

      // Invalidate cache after successful batch update
      this.cache.invalidate('tasks');

      return createSuccessResponse('batch_update_tasks', parsedResult);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export class BatchCompleteTasksTool extends LegacyBaseTool<BatchCompleteInput, StandardResponse<any>> {
  name = 'batch_complete_tasks';
  description = 'Complete multiple tasks at once. More efficient than individual completions.';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskIds: {
        type: 'array',
        description: 'Array of task IDs to complete',
        items: {
          type: 'string'
        }
      },
      completionDate: {
        type: 'string',
        description: 'Optional ISO date string for completion date (defaults to now)'
      }
    },
    required: ['taskIds']
  };

  async execute(params: BatchCompleteInput): Promise<StandardResponse<any>> {
    try {
      const script = this.omniAutomation.buildScript(BATCH_COMPLETE_TASKS_SCRIPT, {
        taskIds: params.taskIds,
        completionDate: params.completionDate || null
      });
      const result = await this.omniAutomation.execute<any>(script);

      // Parse the JSON result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse batch complete result: ${result}`);
        throw new Error('Failed to parse batch complete result');
      }

      if (parsedResult.error) {
        throw new Error(parsedResult.message || 'Batch complete failed');
      }

      // Invalidate cache after successful batch complete
      this.cache.invalidate('tasks');

      return createSuccessResponse('batch_complete_tasks', parsedResult);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export class BatchDeleteTasksTool extends LegacyBaseTool<BatchDeleteInput, StandardResponse<any>> {
  name = 'batch_delete_tasks';
  description = 'Delete multiple tasks at once. Use with caution - this cannot be undone.';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      taskIds: {
        type: 'array',
        description: 'Array of task IDs to delete',
        items: {
          type: 'string'
        }
      }
    },
    required: ['taskIds']
  };

  async execute(params: BatchDeleteInput): Promise<StandardResponse<any>> {
    try {
      const script = this.omniAutomation.buildScript(BATCH_DELETE_TASKS_SCRIPT, { taskIds: params.taskIds });
      const result = await this.omniAutomation.execute<any>(script);

      // Parse the JSON result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse batch delete result: ${result}`);
        throw new Error('Failed to parse batch delete result');
      }

      if (parsedResult.error) {
        throw new Error(parsedResult.message || 'Batch delete failed');
      }

      // Invalidate cache after successful batch delete
      this.cache.invalidate('tasks');

      return createSuccessResponse('batch_delete_tasks', parsedResult);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export class BatchMixedOperationsTool extends LegacyBaseTool<BatchMixedInput, StandardResponse<any>> {
  name = 'batch_mixed_operations';
  description = 'Perform different operations on different tasks in one batch. Combines update, complete, and delete actions.';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      operations: {
        type: 'array',
        description: 'Array of operations to perform',
        items: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'ID of the task'
            },
            action: {
              type: 'string',
              enum: ['complete', 'delete', 'update'],
              description: 'Action to perform'
            },
            data: {
              type: 'object',
              description: 'Data for the action (required for update, optional for complete)',
              properties: {
                completionDate: { type: 'string', description: 'For complete action' },
                name: { type: 'string', description: 'For update action' },
                note: { type: 'string', description: 'For update action' },
                flagged: { type: 'boolean', description: 'For update action' },
                dueDate: { type: 'string', description: 'For update action' },
                deferDate: { type: 'string', description: 'For update action' }
              }
            }
          },
          required: ['taskId', 'action']
        }
      }
    },
    required: ['operations']
  };

  async execute(params: BatchMixedInput): Promise<StandardResponse<any>> {
    try {
      const script = this.omniAutomation.buildScript(BATCH_MIXED_OPERATIONS_SCRIPT, { operations: params.operations });
      const result = await this.omniAutomation.execute<any>(script);

      // Parse the JSON result
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse batch operations result: ${result}`);
        throw new Error('Failed to parse batch operations result');
      }

      if (parsedResult.error) {
        throw new Error(parsedResult.message || 'Batch operations failed');
      }

      // Invalidate cache after successful batch operations
      this.cache.invalidate('tasks');

      return createSuccessResponse('batch_mixed_operations', parsedResult);
    } catch (error) {
      return this.handleError(error);
    }
  }
}