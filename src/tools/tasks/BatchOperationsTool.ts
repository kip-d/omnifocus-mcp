import { z } from 'zod';
import { BaseTool } from '../base.js';
import {
  BATCH_UPDATE_TASKS_SCRIPT,
  BATCH_COMPLETE_TASKS_SCRIPT,
  BATCH_DELETE_TASKS_SCRIPT,
  BATCH_MIXED_OPERATIONS_SCRIPT
} from '../../omnifocus/scripts/batch-operations.js';
import { StandardResponse, createSuccessResponse } from '../../utils/response-format.js';
import { 
  BatchUpdateTasksSchema, 
  BatchCompleteTasksSchema, 
  BatchDeleteTasksSchema, 
  BatchMixedOperationsSchema 
} from '../schemas/task-schemas.js';

// Type inference from Zod schemas
type BatchUpdateInput = z.infer<typeof BatchUpdateTasksSchema>;
type BatchCompleteInput = z.infer<typeof BatchCompleteTasksSchema>;
type BatchDeleteInput = z.infer<typeof BatchDeleteTasksSchema>;
type BatchMixedInput = z.infer<typeof BatchMixedOperationsSchema>;

export class BatchUpdateTasksTool extends BaseTool<typeof BatchUpdateTasksSchema> {
  name = 'batch_update_tasks';
  description = 'Update multiple tasks in a single operation. More efficient than individual updates.';
  schema = BatchUpdateTasksSchema;

  async executeValidated(params: BatchUpdateInput): Promise<StandardResponse<any>> {
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

export class BatchCompleteTasksTool extends BaseTool<typeof BatchCompleteTasksSchema> {
  name = 'batch_complete_tasks';
  description = 'Complete multiple tasks at once. More efficient than individual completions.';
  schema = BatchCompleteTasksSchema;

  async executeValidated(params: BatchCompleteInput): Promise<StandardResponse<any>> {
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

export class BatchDeleteTasksTool extends BaseTool<typeof BatchDeleteTasksSchema> {
  name = 'batch_delete_tasks';
  description = 'Delete multiple tasks at once. Use with caution - this cannot be undone.';
  schema = BatchDeleteTasksSchema;

  async executeValidated(params: BatchDeleteInput): Promise<StandardResponse<any>> {
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

export class BatchMixedOperationsTool extends BaseTool<typeof BatchMixedOperationsSchema> {
  name = 'batch_mixed_operations';
  description = 'Perform different operations on different tasks in one batch. Combines update, complete, and delete actions.';
  schema = BatchMixedOperationsSchema;

  async executeValidated(params: BatchMixedInput): Promise<StandardResponse<any>> {
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