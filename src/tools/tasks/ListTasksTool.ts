import { BaseTool } from '../base.js';
import { TaskFilter } from '../../omnifocus/types.js';
import { LIST_TASKS_SCRIPT } from '../../omnifocus/scripts/tasks.js';

export class ListTasksTool extends BaseTool {
  name = 'list_tasks';
  description = 'List tasks from OmniFocus with advanced filtering options';
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      completed: {
        type: 'boolean',
        description: 'Filter by completion status',
      },
      flagged: {
        type: 'boolean',
        description: 'Filter by flagged status',
      },
      projectId: {
        type: 'string',
        description: 'Filter by project ID',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (all specified tags must be present)',
      },
      dueBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks due before this date',
      },
      dueAfter: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks due after this date',
      },
      deferBefore: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks deferred before this date',
      },
      deferAfter: {
        type: 'string',
        format: 'date-time',
        description: 'Filter tasks deferred after this date',
      },
      search: {
        type: 'string',
        description: 'Search in task name and notes',
      },
      inInbox: {
        type: 'boolean',
        description: 'Filter tasks in inbox',
      },
      available: {
        type: 'boolean',
        description: 'Filter available tasks (not completed, not dropped, not blocked, not deferred)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return (1-1000, default: 100)',
        default: 100,
        minimum: 1,
        maximum: 1000,
      },
    },
  };

  async execute(args: TaskFilter & { limit?: number }): Promise<any> {
    try {
      const { limit = 100, ...filter } = args;
      
      // Create cache key from filter
      const cacheKey = JSON.stringify(filter);
      
      // Check cache
      const cached = this.cache.get<any>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached tasks');
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            from_cache: true,
          }
        };
      }
      
      // Execute script - pass filter with limit included
      const scriptParams = { ...filter, limit };
      this.logger.debug('Script params:', scriptParams);
      const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter: scriptParams });
      this.logger.debug('Generated script length:', script.length);
      const result = await this.omniAutomation.execute<any>(script);
      
      if (result.error) {
        return result;
      }
      
      // Ensure tasks array exists
      if (!result.tasks || !Array.isArray(result.tasks)) {
        return {
          error: true,
          message: 'Invalid response from OmniFocus: tasks array not found',
          details: 'The script returned an unexpected format'
        };
      }
      
      // Parse dates in tasks
      const parsedTasks = result.tasks.map((task: any) => ({
        ...task,
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
        completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
      }));
      
      const finalResult = {
        tasks: parsedTasks,
        metadata: {
          ...result.metadata,
          from_cache: false,
        }
      };
      
      // Cache results
      this.cache.set('tasks', cacheKey, finalResult);
      
      return finalResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}