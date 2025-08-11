import { z } from 'zod';
import { BaseTool } from '../base.js';
import { PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { ProductivityStatsSchema } from '../schemas/analytics-schemas.js';
import { ProductivityStatsResponse, ProductivityStatsResponseData } from '../response-types.js';

export class ProductivityStatsTool extends BaseTool<typeof ProductivityStatsSchema> {
  name = 'get_productivity_stats';
  description = 'Get productivity statistics with completion rates and velocity. Period must be: today|week|month|quarter|year (not "last_week"). Group by: project|tag|none. Set includeCompleted=true for historical analysis. Cached 1 hour.';
  schema = ProductivityStatsSchema;

  async executeValidated(args: z.infer<typeof ProductivityStatsSchema>): Promise<ProductivityStatsResponse> {
    const timer = new OperationTimer();
    try {
      const {
        period = 'week',
        groupBy = 'project',
        includeCompleted = true,
      } = args;

      // Create cache key
      const cacheKey = `productivity_${period}_${groupBy}_${includeCompleted}`;

      // Check cache (1 hour TTL as per description)
      const cached = this.cache.get<ProductivityStatsResponseData>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached productivity stats');
        return createSuccessResponse(
          'get_productivity_stats',
          cached,
          {
            from_cache: true,
            ...timer.toMetadata(),
            period,
            group_by: groupBy,
            include_completed: includeCompleted,
          }
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(PRODUCTIVITY_STATS_SCRIPT, {
        options: { period, groupBy, includeCompleted },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result && result.error) {
        return this.handleError(new Error(result.message || 'Failed to get productivity stats'));
      }

      const responseData: ProductivityStatsResponseData = {
        stats: result.stats || {
          today: { completed: 0, created: 0, netProgress: 0 },
          week: { completed: 0, created: 0, avgPerDay: 0 },
          month: { completed: 0, created: 0, avgPerDay: 0 },
        },
        summary: result.summary || {},
      };

      if (result.trends) {
        responseData.stats.trends = result.trends;
      }
      if (result.insights) {
        responseData.stats.insights = result.insights;
      }

      // Cache for 1 hour (handled by CacheManager TTL configuration)
      this.cache.set('analytics', cacheKey, responseData);

      return createSuccessResponse(
        'get_productivity_stats',
        responseData,
        {
          from_cache: false,
          ...timer.toMetadata(),
          period,
          group_by: groupBy,
          include_completed: includeCompleted,
        }
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}
