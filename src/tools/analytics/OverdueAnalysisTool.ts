import { z } from 'zod';
import { BaseTool } from '../base.js';
import { OVERDUE_ANALYSIS_SCRIPT } from '../../omnifocus/scripts/analytics.js';
import { createSuccessResponse, OperationTimer } from '../../utils/response-format.js';
import { OverdueAnalysisSchema } from '../schemas/analytics-schemas.js';
import { OverdueAnalysisResponse, OverdueAnalysisResponseData } from '../response-types.js';

export class OverdueAnalysisTool extends BaseTool<typeof OverdueAnalysisSchema> {
  name = 'analyze_overdue_tasks';
  description = 'Analyze overdue tasks for patterns and bottlenecks. Set includeRecentlyCompleted=true for completed overdue tasks. Group by: project|tag|duration. Default limit=100. Cached 30 min.';
  schema = OverdueAnalysisSchema;

  async executeValidated(args: z.infer<typeof OverdueAnalysisSchema>): Promise<OverdueAnalysisResponse> {
    const timer = new OperationTimer();
    
    try {
      const {
        includeRecentlyCompleted = true,
        groupBy = 'project',
        limit = 100,
      } = args;

      // Create cache key
      const cacheKey = `overdue_${includeRecentlyCompleted}_${groupBy}_${limit}`;

      // Check cache (30 minutes TTL as per description)
      const cached = this.cache.get<OverdueAnalysisResponseData>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached overdue analysis');
        return createSuccessResponse(
          'analyze_overdue_tasks',
          cached,
          {
            from_cache: true,
            ...timer.toMetadata(),
            include_recently_completed: includeRecentlyCompleted,
            group_by: groupBy,
            limit,
          }
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(OVERDUE_ANALYSIS_SCRIPT, {
        options: { includeRecentlyCompleted, groupBy, limit },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result && result.error) {
        return this.handleError(new Error(result.message || 'Failed to analyze overdue tasks'));
      }

      const responseData: OverdueAnalysisResponseData = {
        stats: {
          summary: result.summary || {
            totalOverdue: 0,
            overduePercentage: 0,
            averageDaysOverdue: 0,
            oldestOverdueDate: new Date().toISOString(),
          },
          overdueTasks: result.overdueTasks || [],
          patterns: result.patterns || [],
          insights: result.recommendations || {},
        },
        summary: result.groupedAnalysis || {},
      };

      // Cache for 30 minutes (handled by CacheManager TTL configuration)
      this.cache.set('analytics', cacheKey, responseData);

      return createSuccessResponse(
        'analyze_overdue_tasks',
        responseData,
        {
          from_cache: false,
          ...timer.toMetadata(),
          include_recently_completed: includeRecentlyCompleted,
          group_by: groupBy,
          limit,
        }
      );
    } catch (error) {
      return this.handleError(error);
    }
  }
}