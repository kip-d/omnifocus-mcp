import { LegacyBaseTool } from '../legacy-base.js';
import { COMPLETE_TASK_SCRIPT, COMPLETE_TASK_OMNI_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createEntityResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { CompleteTaskArgs } from '../types.js';
import { StandardResponse } from '../../utils/response-format.js';

export class CompleteTaskTool extends LegacyBaseTool<CompleteTaskArgs, StandardResponse<any>> {
  name = 'complete_task';
  description = 'Mark a task as completed in OmniFocus';

  inputSchema = {
    type: 'object' as const,
    properties: {
      taskId: {
        type: 'string',
        description: 'ID of the task to complete',
      },
    },
    required: ['taskId'],
  };

  async execute(args: CompleteTaskArgs): Promise<StandardResponse<any>> {
    const timer = new OperationTimer();

    try {
      // Try JXA first, fall back to URL scheme if access denied
      try {
        const script = this.omniAutomation.buildScript(COMPLETE_TASK_SCRIPT, args as unknown as Record<string, unknown>);
        const result = await this.omniAutomation.execute<any>(script);

        if (result && typeof result === 'object' && 'error' in result && result.error) {
          // If error contains "access not allowed", use URL scheme
          if ('message' in result && typeof result.message === 'string' && result.message.toLowerCase().includes('access not allowed')) {
            this.logger.info('JXA access denied, falling back to URL scheme for task completion');
            return await this.executeViaUrlScheme(args);
          }
          return result;
        }

        this.logger.info(`Completed task via JXA: ${args.taskId}`);

        // Parse the JSON result since the script returns a JSON string
        let parsedResult;
        try {
          parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
        } catch (parseError) {
          this.logger.error(`Failed to parse complete task result: ${result}`);
          return createErrorResponse(
            'complete_task',
            'PARSE_ERROR',
            'Failed to parse task completion response',
            { received: result, parseError: parseError instanceof Error ? parseError.message : String(parseError) },
            timer.toMetadata(),
          );
        }

        // Invalidate cache after successful completion
        this.cache.invalidate('tasks');
        this.cache.invalidate('analytics');

        return createEntityResponse(
          'complete_task',
          'task',
          parsedResult,
          {
            ...timer.toMetadata(),
            completed_id: args.taskId,
            method: 'jxa',
            input_params: { taskId: args.taskId },
          },
        );
      } catch (jxaError: any) {
        // If JXA fails with permission error, use URL scheme
        if (jxaError.message && jxaError.message.toLowerCase().includes('access not allowed')) {
          this.logger.info('JXA access denied, falling back to URL scheme for task completion');
          return await this.executeViaUrlScheme(args);
        }
        throw jxaError;
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async executeViaUrlScheme(args: { taskId: string }): Promise<any> {
    const timer = new OperationTimer();
    const omniScript = this.omniAutomation.buildScript(COMPLETE_TASK_OMNI_SCRIPT, args);
    await this.omniAutomation.executeViaUrlScheme(omniScript);

    // Invalidate cache after successful URL scheme execution
    this.cache.invalidate('tasks');
    this.cache.invalidate('analytics');

    this.logger.info(`Completed task via URL scheme: ${args.taskId}`);

    // Return standardized format since URL scheme doesn't return detailed results
    return createEntityResponse(
      'complete_task',
      'task',
      {
        id: args.taskId,
        completed: true,
        completionDate: new Date().toISOString(),
      },
      {
        ...timer.toMetadata(),
        completed_id: args.taskId,
        method: 'url_scheme',
        input_params: { taskId: args.taskId },
      },
    );
  }
}
