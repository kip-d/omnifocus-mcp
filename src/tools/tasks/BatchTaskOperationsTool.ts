import { BaseTool } from '../base.js';
import { 
  UPDATE_TASK_SCRIPT, 
  COMPLETE_TASK_SCRIPT, 
  DELETE_TASK_SCRIPT 
} from '../../omnifocus/scripts/tasks.js';
import { createListResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { BatchTaskOperationsSchema, BatchTaskOperationsInput } from '../schemas/consolidated-schemas.js';

export class BatchTaskOperationsTool extends BaseTool<typeof BatchTaskOperationsSchema> {
  name = 'batch_task_operations';
  description = 'Consolidated tool for all batch task operations. Supports bulk update, complete, and delete operations on multiple tasks. Uses individual OmniFocus operations for reliability.';
  schema = BatchTaskOperationsSchema;

  async executeValidated(args: BatchTaskOperationsInput): Promise<any> {
    const timer = new OperationTimer();

    try {
      // Handle Claude Desktop sometimes sending stringified parameters
      const normalizedArgs = this.normalizeArgs(args);
      
      switch (normalizedArgs.operation) {
        case 'update':
          return this.batchUpdate(normalizedArgs, timer);
          
        case 'complete':
          return this.batchComplete(normalizedArgs, timer);
          
        case 'delete':
          return this.batchDelete(normalizedArgs, timer);
          
        default:
          // TypeScript should prevent this, but just in case
          return createErrorResponse(
            'batch_task_operations',
            'INVALID_OPERATION',
            `Unknown operation: ${(args as any).operation}`,
            { operation: (args as any).operation },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async batchUpdate(
    args: Extract<BatchTaskOperationsInput, { operation: 'update' }>,
    timer: OperationTimer
  ): Promise<any> {
    const { taskIds, updates } = args;
    const results = [];
    const errors = [];

    this.logger.info(`Starting batch update for ${taskIds.length} tasks`);

    for (const taskId of taskIds) {
      try {
        // Execute individual update script for each task
        const script = this.omniAutomation.buildScript(UPDATE_TASK_SCRIPT, {
          taskId,
          updates,
        });
        const result = await this.omniAutomation.execute<any>(script);

        if (result.error) {
          errors.push({
            taskId,
            error: result.message || result.error || 'Failed to update task',
            details: result.details,
          });
        } else {
          results.push({
            taskId,
            success: true,
            result: typeof result === 'string' ? JSON.parse(result) : result,
          });
        }
      } catch (error) {
        errors.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        });
      }
    }

    // Invalidate relevant caches after batch operation
    this.cache.invalidate('tasks');
    this.cache.invalidate('analytics');

    const summary = {
      total_requested: taskIds.length,
      successful: results.length,
      failed: errors.length,
      success_rate: results.length / taskIds.length,
    };

    this.logger.info(`Batch update completed: ${summary.successful}/${summary.total_requested} successful`);

    return createListResponse(
      'batch_task_operations',
      results,
      {
        ...timer.toMetadata(),
        operation: 'update',
        summary,
        errors: errors.length > 0 ? errors : undefined,
        input_params: {
          taskIds,
          updates,
        },
      },
    );
  }

  private async batchComplete(
    args: Extract<BatchTaskOperationsInput, { operation: 'complete' }>,
    timer: OperationTimer
  ): Promise<any> {
    const { taskIds, completionDate } = args;
    const results = [];
    const errors = [];

    const actualCompletionDate = completionDate || new Date().toISOString();

    this.logger.info(`Starting batch complete for ${taskIds.length} tasks`);

    for (const taskId of taskIds) {
      try {
        // Execute individual complete script for each task
        const script = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, {
          taskId,
          completionDate: actualCompletionDate,
        });
        const result = await this.omniAutomation.execute<any>(script);

        if (result.error) {
          errors.push({
            taskId,
            error: result.message || result.error || 'Failed to complete task',
            details: result.details,
          });
        } else {
          results.push({
            taskId,
            success: true,
            result: typeof result === 'string' ? JSON.parse(result) : result,
          });
        }
      } catch (error) {
        errors.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        });
      }
    }

    // Invalidate relevant caches after batch operation
    this.cache.invalidate('tasks');
    this.cache.invalidate('analytics');

    const summary = {
      total_requested: taskIds.length,
      successful: results.length,
      failed: errors.length,
      success_rate: results.length / taskIds.length,
    };

    this.logger.info(`Batch complete completed: ${summary.successful}/${summary.total_requested} successful`);

    return createListResponse(
      'batch_task_operations',
      results,
      {
        ...timer.toMetadata(),
        operation: 'complete',
        summary,
        errors: errors.length > 0 ? errors : undefined,
        completion_date: actualCompletionDate,
        input_params: {
          taskIds,
          completionDate: actualCompletionDate,
        },
      },
    );
  }

  private async batchDelete(
    args: Extract<BatchTaskOperationsInput, { operation: 'delete' }>,
    timer: OperationTimer
  ): Promise<any> {
    const { taskIds } = args;
    const results = [];
    const errors = [];

    this.logger.info(`Starting batch delete for ${taskIds.length} tasks`);

    for (const taskId of taskIds) {
      try {
        // Execute individual delete script for each task
        const script = this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, {
          taskId,
        });
        const result = await this.omniAutomation.execute<any>(script);

        if (result.error) {
          errors.push({
            taskId,
            error: result.message || result.error || 'Failed to delete task',
            details: result.details,
          });
        } else {
          results.push({
            taskId,
            success: true,
            result: typeof result === 'string' ? JSON.parse(result) : result,
          });
        }
      } catch (error) {
        errors.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        });
      }
    }

    // Invalidate relevant caches after batch operation
    this.cache.invalidate('tasks');
    this.cache.invalidate('analytics');

    const summary = {
      total_requested: taskIds.length,
      successful: results.length,
      failed: errors.length,
      success_rate: results.length / taskIds.length,
    };

    this.logger.info(`Batch delete completed: ${summary.successful}/${summary.total_requested} successful`);

    return createListResponse(
      'batch_task_operations',
      results,
      {
        ...timer.toMetadata(),
        operation: 'delete',
        summary,
        errors: errors.length > 0 ? errors : undefined,
        input_params: {
          taskIds,
        },
      },
    );
  }

  private normalizeArgs(args: any): BatchTaskOperationsInput {
    // Handle Claude Desktop sometimes sending stringified parameters
    const normalized = { ...args };
    
    // Parse taskIds if it's a string
    if (typeof normalized.taskIds === 'string') {
      try {
        normalized.taskIds = JSON.parse(normalized.taskIds);
      } catch (e) {
        this.logger.warn('Failed to parse taskIds string, keeping as-is');
      }
    }
    
    // Parse updates object if it's a string
    if (typeof normalized.updates === 'string') {
      try {
        normalized.updates = JSON.parse(normalized.updates);
      } catch (e) {
        this.logger.warn('Failed to parse updates string, keeping as-is');
      }
    }
    
    return normalized as BatchTaskOperationsInput;
  }
}