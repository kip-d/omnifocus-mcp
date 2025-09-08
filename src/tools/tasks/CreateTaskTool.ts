import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format-v2.js';
import { CreateTaskResponse } from '../types.js';
import { CreateTaskScriptResponse } from '../../omnifocus/script-types.js';
import { CreateTaskSchema } from '../schemas/task-schemas.js';
import { localToUTC } from '../../utils/timezone.js';
import {
  parsingError,
  formatErrorWithRecovery,
  invalidDateError,
} from '../../utils/error-messages.js';

export class CreateTaskTool extends BaseTool<typeof CreateTaskSchema> {
  name = 'create_task';
  description = 'Create a new task in OmniFocus. Supports project assignment via projectId or as subtask via parentTaskId. Set sequential=true for action groups where subtasks must be done in order. Tags can now be assigned during creation (v2.0.0-beta.1+). IMPORTANT: Use YYYY-MM-DD or "YYYY-MM-DD HH:mm" format for dates. Smart defaults: due dates → 5pm, defer dates → 8am (e.g., dueDate "2024-12-25" becomes 5pm, deferDate "2024-12-25" becomes 8am). Avoid ISO-8601 with Z suffix.';
  schema = CreateTaskSchema;

  async executeValidated(args: z.infer<typeof CreateTaskSchema>): Promise<any> {
    const timer = new OperationTimerV2();
    
    console.error(`[CREATE_TASK_DEBUG] Starting executeValidated with args:`, JSON.stringify(args, null, 2));

    try {
      // Convert local dates to UTC for OmniFocus with better error handling
      let convertedTaskData;
      try {
        convertedTaskData = {
          ...args,
          dueDate: args.dueDate ? localToUTC(args.dueDate, 'due') : undefined,
          deferDate: args.deferDate ? localToUTC(args.deferDate, 'defer') : undefined,
        };
      } catch (dateError) {
        const fieldName = dateError instanceof Error && dateError.message.includes('defer') ? 'deferDate' : 'dueDate';
        const errorDetails = invalidDateError(fieldName, args[fieldName] || '');
        return createErrorResponseV2(
          'create_task',
          'INVALID_DATE_FORMAT',
          errorDetails.message,
          formatErrorWithRecovery(errorDetails),
          {
            recovery: errorDetails.recovery,
            providedValue: args[fieldName],
          },
          timer.toMetadata(),
        );
      }

      console.error(`[CREATE_TASK_DEBUG] Converted task data:`, JSON.stringify(convertedTaskData, null, 2));
      
      const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData: convertedTaskData });
      console.error(`[CREATE_TASK_DEBUG] Built script length:`, script.length);
      console.error(`[CREATE_TASK_DEBUG] Script first 200 chars:`, script.substring(0, 200));
      
      const anyOmni: any = this.omniAutomation as any;
      let result: any;
      console.error(`[CREATE_TASK_DEBUG] About to execute script...`);
      
      try {
        // Prefer instance-level executeJson when available; fall back to execute.
        if (typeof anyOmni.executeJson === 'function' && Object.prototype.hasOwnProperty.call(anyOmni, 'executeJson')) {
          console.error(`[CREATE_TASK_DEBUG] Using executeJson method`);
          const sr = await anyOmni.executeJson(script);
          console.error(`[CREATE_TASK_DEBUG] executeJson returned:`, JSON.stringify(sr, null, 2));
          
          if (sr && typeof sr === 'object' && 'success' in sr) {
            if (!(sr as any).success) {
              // Return standardized script error without throwing
              return createErrorResponseV2(
                'create_task',
                'SCRIPT_ERROR',
                (sr as any).error || 'Script execution failed',
                undefined,
                (sr as any).details,
                timer.toMetadata(),
              ) as any;
            }
            result = (sr as any).data;
          } else {
            result = sr;
          }
        } else if (typeof anyOmni.executeJson === 'function') {
          // Some unit setups stub prototype methods; normalize their return shape
          const sr = await anyOmni.executeJson(script);
          if (sr && typeof sr === 'object' && 'success' in sr) {
            if (!(sr as any).success) {
              return createErrorResponseV2(
                'create_task',
                'SCRIPT_ERROR',
                (sr as any).error || 'Script execution failed',
                undefined,
                (sr as any).details,
                timer.toMetadata(),
              ) as any;
            }
            result = (sr as any).data;
          } else {
            result = sr;
          }
        } else {
          console.error(`[CREATE_TASK_DEBUG] Using fallback execute method`);
          result = await anyOmni.execute(script) as CreateTaskScriptResponse;
          console.error(`[CREATE_TASK_DEBUG] execute returned:`, JSON.stringify(result, null, 2));
        }
      } catch (e) {
        console.error(`[CREATE_TASK_DEBUG] Script execution threw error:`, e);
        // Map known errors like permission denied to standardized response
        return this.handleError(e) as any;
      }

      console.error(`[CREATE_TASK_DEBUG] Processing result:`, JSON.stringify(result, null, 2));
      
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

        return createErrorResponseV2(
          'create_task',
          'SCRIPT_ERROR',
          errorMessage,
          'Verify the inputs and OmniFocus state',
          { rawResult: result, recovery },
          timer.toMetadata(),
        );
      }

      // Parse the JSON result since the script may return a JSON string
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch (parseError) {
        this.logger.error(`Failed to parse create task result: ${result}`);
        const errorDetails = parsingError('task creation', String(result), 'valid JSON');
        return createErrorResponseV2(
          'create_task',
          'INTERNAL_ERROR',
          errorDetails.message,
          'Ensure script returns valid JSON',
          {
            received: result,
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
            recovery: errorDetails.recovery,
          },
          timer.toMetadata(),
        );
      }

      // Check if parsedResult is valid
      if (!parsedResult || typeof parsedResult !== 'object' || (!('taskId' in parsedResult) && !('id' in parsedResult))) {
        return createErrorResponseV2(
          'create_task',
          'INTERNAL_ERROR',
          'Invalid response from create task script',
          'Have the script return an object with id/taskId',
          { received: parsedResult },
          timer.toMetadata(),
        );
      }

      // Invalidate caches after successful task creation
      this.cache.invalidate('tasks');
      this.cache.invalidate('analytics');
      if (args.projectId !== undefined) this.cache.invalidate('projects');
      if (Array.isArray(args.tags) && args.tags.length > 0) this.cache.invalidate('tags');

      // Return standardized response
      console.error(`[CREATE_TASK_DEBUG] About to return success response with parsedResult:`, JSON.stringify(parsedResult, null, 2));
      
      const successResponse = createSuccessResponseV2(
        'create_task',
        { task: parsedResult as CreateTaskResponse },
        undefined,
        {
          ...timer.toMetadata(),
          created_id: (parsedResult as any).taskId || null,
          project_id: args.projectId || null,
          input_params: {
            name: args.name,
            has_project: !!args.projectId,
            has_due_date: !!args.dueDate,
            has_tags: !!(args.tags && args.tags.length > 0),
          },
        },
      );
      
      console.error(`[CREATE_TASK_DEBUG] Final success response:`, JSON.stringify(successResponse, null, 2));
      return successResponse;
      
    } catch (error) {
      console.error(`[CREATE_TASK_DEBUG] Outer catch block error:`, error);
      return this.handleError(error) as any;
    }
  }
}
