import { BaseTool } from '../base.js';
import { TaskFilter } from '../../omnifocus/types.js';
import { GET_TASK_COUNT_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';

export class GetTaskCountTool extends BaseTool {
  name = 'get_task_count';
  description = 'Get the count of tasks matching filters without returning the actual task data';
  
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
    },
  };

  async execute(args: TaskFilter): Promise<any> {
    const timer = new OperationTimer();
    
    try {
      // Create cache key from filter
      const cacheKey = `count_${JSON.stringify(args)}`;
      
      // Check cache
      const cached = this.cache.get<any>('tasks', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached task count');
        return createSuccessResponse(
          'get_task_count',
          {
            count: cached.count,
            filters_applied: cached.filters_applied
          },
          {
            ...timer.toMetadata(),
            from_cache: true,
            cached_query_time_ms: cached.query_time_ms
          }
        );
      }
      
      // Execute script
      const script = this.omniAutomation.buildScript(GET_TASK_COUNT_SCRIPT, { filter: args });
      const result = await this.omniAutomation.execute<any>(script);
      
      if (result.error) {
        return createErrorResponse(
          'get_task_count',
          'SCRIPT_ERROR',
          result.message || 'Failed to count tasks',
          { details: result.details },
          timer.toMetadata()
        );
      }
      
      const cacheData = {
        count: result.count,
        query_time_ms: result.query_time_ms,
        filters_applied: result.filters_applied
      };
      
      // Cache results
      this.cache.set('tasks', cacheKey, cacheData);
      
      return createSuccessResponse(
        'get_task_count',
        {
          count: result.count,
          filters_applied: result.filters_applied
        },
        {
          ...timer.toMetadata(),
          from_cache: false,
          query_time_ms: result.query_time_ms || timer.getElapsedMs()
        }
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}