import { z } from 'zod';
import { BaseTool } from '../base.js';
import { GET_TASK_COUNT_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { GetTaskCountSchema } from '../schemas/task-schemas.js';

export class GetTaskCountTool extends BaseTool<typeof GetTaskCountSchema> {
  name = 'get_task_count';
  description = 'Get count of tasks matching filters without full data (faster than list_tasks). Supports all list_tasks filters. Use skipAnalysis=true for 30% speed boost. Cached for performance.';
  schema = GetTaskCountSchema;

  async executeValidated(args: z.infer<typeof GetTaskCountSchema>): Promise<any> {
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
            filters_applied: cached.filters_applied,
          },
          {
            ...timer.toMetadata(),
            from_cache: true,
            cached_query_time_ms: cached.query_time_ms,
          },
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
          timer.toMetadata(),
        );
      }

      const cacheData = {
        count: result.count,
        query_time_ms: result.query_time_ms,
        filters_applied: result.filters_applied,
      };

      // Cache results
      this.cache.set('tasks', cacheKey, cacheData);

      return createSuccessResponse(
        'get_task_count',
        {
          count: result.count,
          filters_applied: result.filters_applied,
        },
        {
          ...timer.toMetadata(),
          from_cache: false,
          query_time_ms: result.query_time_ms || timer.getElapsedMs(),
        },
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
