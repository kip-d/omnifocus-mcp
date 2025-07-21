import { BaseTool } from '../base.js';
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { parsingError } from '../../utils/error-messages.js';
import { createEntityResponse, OperationTimer } from '../../utils/response-format.js';

export class CreateTaskTool extends BaseTool {
  name = 'create_task';
  description = 'Create a new task in OmniFocus (can be assigned to a project using projectId from list_projects)';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Task name',
      },
      note: {
        type: 'string',
        description: 'Task note/description',
      },
      projectId: {
        description: 'Project ID to add task to - use full alphanumeric ID from list_projects tool (e.g., "az5Ieo4ip7K", not "547"). Claude Desktop may incorrectly extract numbers from IDs (if not provided, task goes to inbox)',
      },
      flagged: {
        type: 'boolean',
        description: 'Whether task is flagged',
        default: false,
      },
      dueDate: {
        type: 'string',
        format: 'date-time',
        description: 'Due date for the task',
      },
      deferDate: {
        type: 'string',
        format: 'date-time',
        description: 'Defer date for the task',
      },
      estimatedMinutes: {
        type: 'number',
        description: 'Estimated time in minutes',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the task',
      },
    },
    required: ['name'],
  };

  async execute(args: any): Promise<any> {
    const timer = new OperationTimer();
    
    try {
      const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData: args });
      const result = await this.omniAutomation.execute(script);
      
      if (result.error) {
        throw new McpError(ErrorCode.InternalError, result.message, result.details);
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
          { received: result, parseError: parseError instanceof Error ? parseError.message : String(parseError) }
        );
      }
      
      // Invalidate cache after successful task creation
      this.cache.invalidate('tasks');
      
      // Return standardized response
      return createEntityResponse(
        'create_task',
        'task',
        parsedResult,
        {
          ...timer.toMetadata(),
          created_id: parsedResult.id,
          project_id: args.projectId || null,
          input_params: {
            name: args.name,
            has_project: !!args.projectId,
            has_due_date: !!args.dueDate,
            has_tags: !!(args.tags && args.tags.length > 0)
          }
        }
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}