import { LegacyBaseTool } from '../legacy-base.js';
import { OVERDUE_ANALYSIS_SCRIPT } from '../../omnifocus/scripts/analytics.js';

export class OverdueAnalysisTool extends LegacyBaseTool {
  name = 'analyze_overdue_tasks';
  description = 'Analyze overdue tasks to identify patterns and bottlenecks';

  inputSchema = {
    type: 'object' as const,
    properties: {
      includeRecentlyCompleted: {
        type: 'boolean',
        description: 'Include tasks completed after their due date',
        default: true,
      },
      groupBy: {
        type: 'string',
        enum: ['project', 'tag', 'age', 'priority'],
        description: 'How to group overdue analysis',
        default: 'project',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of overdue tasks to analyze',
        default: 100,
        maximum: 500,
      },
    },
  };

  async execute(args: { includeRecentlyCompleted?: boolean; groupBy?: string; limit?: number }): Promise<any> {
    try {
      const {
        includeRecentlyCompleted = true,
        groupBy = 'project',
        limit = 100,
      } = args;

      // Create cache key
      const cacheKey = `overdue_${includeRecentlyCompleted}_${groupBy}_${limit}`;

      // Check cache (shorter TTL - 10 minutes)
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached overdue analysis');
        return {
          ...cached,
          from_cache: true,
        };
      }

      // Execute script
      const script = this.omniAutomation.buildScript(OVERDUE_ANALYSIS_SCRIPT, {
        options: { includeRecentlyCompleted, groupBy, limit },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return result;
      }

      const finalResult = {
        summary: result.summary,
        overdueTasks: result.overdueTasks,
        patterns: result.patterns,
        recommendations: result.recommendations,
        groupedAnalysis: result.groupedAnalysis,
        from_cache: false,
      };

      // Cache for 10 minutes
      this.cache.set('analytics', cacheKey, finalResult);

      return finalResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
