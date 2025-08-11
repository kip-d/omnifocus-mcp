import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { 
  parsingError, 
  tagCreationLimitationError, 
  formatErrorWithRecovery,
  invalidDateError
} from '../../utils/error-messages.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { CreateTaskResponse } from '../types.js';
import { StandardResponse } from '../../utils/response-format.js';
import { CreateTaskScriptResponse } from '../../omnifocus/script-types.js';
import { CreateTaskSchema } from '../schemas/task-schemas.js';
import { localToUTC } from '../../utils/timezone.js';

export class CreateTaskTool extends BaseTool<typeof CreateTaskSchema> {
  name = 'create_task';
  description = 'Create a new task in OmniFocus. Supports project assignment via projectId or as subtask via parentTaskId. Set sequential=true for action groups where subtasks must be done in order. Note: Tags cannot be assigned during creation due to JXA limits - use update_task after. Dates should be in local time format.';
  schema = CreateTaskSchema;

  async executeValidated(args: z.infer<typeof CreateTaskSchema>): Promise<StandardResponse<{ task: CreateTaskResponse }>> {
    const timer = new OperationTimer();

    try {
      // Check for tag limitation upfront
      if (args.tags && args.tags.length > 0) {
        const errorDetails = tagCreationLimitationError();
        return createErrorResponse(
          'create_task',
          'TAGS_NOT_SUPPORTED',
          errorDetails.message,
          {
            recovery: errorDetails.recovery,
            formatted: formatErrorWithRecovery(errorDetails),
            tags: args.tags,
          },
          timer.toMetadata(),
        );
      }

      // Convert local dates to UTC for OmniFocus with better error handling
      let convertedTaskData;
      try {
        convertedTaskData = {
          ...args,
          dueDate: args.dueDate ? localToUTC(args.dueDate) : undefined,
          deferDate: args.deferDate ? localToUTC(args.deferDate) : undefined,
        };
      } catch (dateError) {
        const fieldName = dateError instanceof Error && dateError.message.includes('defer') ? 'deferDate' : 'dueDate';
        const errorDetails = invalidDateError(fieldName, args[fieldName] || '');
        return createErrorResponse(
          'create_task',
          'INVALID_DATE_FORMAT',
          errorDetails.message,
          {
            recovery: errorDetails.recovery,
            formatted: formatErrorWithRecovery(errorDetails),
            providedValue: args[fieldName],
          },
          timer.toMetadata(),
        );
      }

      const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData: convertedTaskData });
      const result = await this.omniAutomation.execute<CreateTaskScriptResponse>(script);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        // Enhanced error response with recovery suggestions
        const errorMessage = result.message || 'Failed to create task';
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

        return createErrorResponse(
          'create_task',
          'SCRIPT_ERROR',
          errorMessage,
          { 
            rawResult: result,
            recovery,
          },
          timer.toMetadata(),
        );
      }

      // Parse the JSON result since the script returns a JSON string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse create task result: ${result}`);
        const errorDetails = parsingError('task creation', String(result), 'valid JSON');
        throw new McpError(
          ErrorCode.InternalError,
          errorDetails.message,
          { 
            received: result, 
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            recovery: errorDetails.recovery,
          },
        );
      }

      // Check if parsedResult is valid
      if (!parsedResult || typeof parsedResult !== 'object') {
        throw new McpError(
          ErrorCode.InternalError,
          'Invalid response from create task script',
          { received: parsedResult },
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
