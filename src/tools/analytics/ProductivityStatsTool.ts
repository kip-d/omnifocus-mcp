import { z } from 'zod';
import { BaseTool } from '../base.js';
import { PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics.js';
import { ProductivityStatsSchema } from '../schemas/analytics-schemas.js';

export class ProductivityStatsTool extends BaseTool<typeof ProductivityStatsSchema> {
  name = 'get_productivity_stats';
  description = 'Get productivity statistics including completion rates, task velocity, and time distribution. Valid period values: "today", "week", "month", "quarter", "year" (NOT "last_week" or other variations)';
  schema = ProductivityStatsSchema;

  async executeValidated(args: z.infer<typeof ProductivityStatsSchema>): Promise<any> {
    try {
      const {
        period = 'week',
        groupBy = 'project',
        includeCompleted = true,
      } = args;

      // Create cache key
      const cacheKey = `productivity_${period}_${groupBy}_${includeCompleted}`;

      // Check cache (shorter TTL for productivity stats - 15 minutes)
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached productivity stats');
        return {
          ...cached,
          from_cache: true,
        };
      }

      // Execute script
      const script = this.omniAutomation.buildScript(PRODUCTIVITY_STATS_SCRIPT, {
        options: { period, groupBy, includeCompleted },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return result;
      }

      const finalResult = {
        period: period,
        groupBy: groupBy,
        stats: result.stats,
        summary: result.summary,
        trends: result.trends,
        from_cache: false,
      };

      // Cache for 15 minutes
      this.cache.set('analytics', cacheKey, finalResult);

      return finalResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
