import { z } from 'zod';
import { BaseTool } from '../../base.js';
import { TASK_VELOCITY_SCRIPT } from '../../../omnifocus/scripts/analytics.js';
import { createSuccessResponse, OperationTimer } from '../../../utils/response-format.js';
import { TaskVelocitySchema } from '../../schemas/analytics-schemas.js';
import { TaskVelocityResponse, TaskVelocityResponseData } from '../../response-types.js';

export class TaskVelocityTool extends BaseTool<typeof TaskVelocitySchema> {
  name = 'get_task_velocity';
  description = 'Analyze task completion velocity and throughput. Period: today|week|month|quarter|year. Filter by projectId or tags. Returns completion rate, average time, and patterns. Cached 1 hour.';
  schema = TaskVelocitySchema;

  async executeValidated(args: z.infer<typeof TaskVelocitySchema>): Promise<TaskVelocityResponse> {
    const timer = new OperationTimer();
    try {
      const {
        period = 'week',
        projectId,
        tags,
      } = args;

      // Create cache key
      const cacheKey = `velocity_${period}_${projectId || 'all'}_${JSON.stringify(tags || [])}`;

      // Check cache (1 hour TTL as per description)
      const cached = this.cache.get<TaskVelocityResponseData>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached velocity data');
        return createSuccessResponse(
          'get_task_velocity',
          cached,
          {
            from_cache: true,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(TASK_VELOCITY_SCRIPT, {
        options: { period, projectId, tags },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result && result.error) {
        return this.handleError(new Error(result.message || 'Failed to get task velocity')) as TaskVelocityResponse;
      }

      const responseData: TaskVelocityResponseData = {
        stats: {
          averageTimeToComplete: result.averageTimeToComplete || {
            overall: 0,
            byProject: {},
            byTag: {},
          },
          completionRates: result.completionRates || {
            overall: 0,
            byProject: {},
            byTag: {},
          },
          velocity: result.velocity || {
            tasksPerDay: 0,
            tasksPerWeek: 0,
            trend: 'stable',
          },
        },
        summary: result.summary || {},
      };

      // Cache for 1 hour (handled by CacheManager TTL configuration)
      this.cache.set('analytics', cacheKey, responseData);

      return createSuccessResponse(
        'get_task_velocity',
        responseData,
        {
          from_cache: false,
          ...timer.toMetadata(),
        },
      );
    } catch (error) {
      return this.handleError(error) as TaskVelocityResponse;
    }
  }
}
