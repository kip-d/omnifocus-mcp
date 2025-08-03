import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { parsingError } from '../../utils/error-messages.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { CreateTaskResponse } from '../types.js';
import { StandardResponse } from '../../utils/response-format.js';
import { CreateTaskScriptResponse } from '../../omnifocus/script-types.js';
import { CreateTaskSchema } from '../schemas/task-schemas.js';
import { localToUTC } from '../../utils/timezone.js';

export class CreateTaskTool extends BaseTool<typeof CreateTaskSchema> {
  name = 'create_task';
  description = 'Create a new task in OmniFocus (can be assigned to a project using projectId from list_projects)';
  schema = CreateTaskSchema;

  async executeValidated(args: z.infer<typeof CreateTaskSchema>): Promise<StandardResponse<{ task: CreateTaskResponse }>> {
    const timer = new OperationTimer();

    try {
      // Convert local dates to UTC for OmniFocus
      const taskData = {
        ...args,
        dueDate: args.dueDate ? localToUTC(args.dueDate) : undefined,
        deferDate: args.deferDate ? localToUTC(args.deferDate) : undefined,
      };
      
      const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData });
      const result = await this.omniAutomation.execute<CreateTaskScriptResponse>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        throw new McpError(ErrorCode.InternalError, result.message || 'Unknown error');
      }

      // Parse the JSON result since the script returns a JSON string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse create task result: ${result}`);
        throw new McpError(
          ErrorCode.InternalError,
          parsingError('task creation', String(result), 'valid JSON'),
          { received: result, parseError: parseError instanceof Error ? parseError.message : String(parseError) },
        );
      }

      // Check if parsedResult is valid
      if (!parsedResult || typeof parsedResult !== 'object') {
        throw new McpError(
          ErrorCode.InternalError,
          'Invalid response from create task script',
          { received: parsedResult }
        );
      }

      // Invalidate cache after successful task creation
      this.cache.invalidate('tasks');

      // Return standardized response
      return createSuccessResponse(
        'create_task',
        { task: parsedResult as CreateTaskResponse },
        {
          ...timer.toMetadata(),
          created_id: parsedResult.taskId || null,
          project_id: args.projectId || null,
          input_params: {
            name: args.name,
            has_project: !!args.projectId,
            has_due_date: !!args.dueDate,
            has_tags: !!(args.tags && args.tags.length > 0),
          },
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
