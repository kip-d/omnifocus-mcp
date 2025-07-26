import { LegacyBaseTool } from '../legacy-base.js';
import { PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics.js';

export class ProductivityStatsTool extends LegacyBaseTool {
  name = 'get_productivity_stats';
  description = 'Get productivity statistics including completion rates, task velocity, and time distribution';

  inputSchema = {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string',
        enum: ['today', 'week', 'month', 'quarter', 'year'],
        description: 'Time period for analysis',
        default: 'week',
      },
      groupBy: {
        type: 'string',
        enum: ['project', 'tag', 'day', 'week'],
        description: 'How to group the statistics',
        default: 'project',
      },
      includeCompleted: {
        type: 'boolean',
        description: 'Include completed tasks in analysis',
        default: true,
      },
    },
  };

  async execute(args: { period?: string; groupBy?: string; includeCompleted?: boolean }): Promise<any> {
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
