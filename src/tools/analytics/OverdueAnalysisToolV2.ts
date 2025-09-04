import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ANALYZE_OVERDUE_OPTIMIZED_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue-optimized.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
} from '../../utils/response-format-v2.js';
import { OverdueAnalysisSchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { OverdueAnalysisResponseV2 } from '../response-types-v2.js';
import { isScriptSuccess, AnalyticsResultSchema } from '../../omnifocus/script-result-types.js';

export class OverdueAnalysisToolV2 extends BaseTool<typeof OverdueAnalysisSchemaV2, OverdueAnalysisResponseV2> {
  name = 'analyze_overdue';
  description = 'Analyze overdue tasks for patterns and bottlenecks. Returns summary with key findings first, then detailed analysis.';
  schema = OverdueAnalysisSchemaV2;

  async executeValidated(args: z.infer<typeof OverdueAnalysisSchemaV2>): Promise<OverdueAnalysisResponseV2> {
    const timer = new OperationTimerV2();

    try {
      const {
        includeRecentlyCompleted = true,
        groupBy = 'project',
        limit = 100,
      } = args;

      // Create cache key
      const cacheKey = `overdue_v2_${includeRecentlyCompleted}_${groupBy}_${limit}`;

      // Check cache (30 minutes TTL)
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached overdue analysis');
        return createAnalyticsResponseV2(
          'analyze_overdue',
          cached,
          'Overdue Task Analysis',
          this.extractKeyFindings(cached),
          {
            from_cache: true,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute optimized script using blocked() API method
      const script = this.omniAutomation.buildScript(ANALYZE_OVERDUE_OPTIMIZED_SCRIPT, {
        options: { includeRecentlyCompleted, groupBy, limit },
      });
      const result = await this.omniAutomation.executeJson(script, AnalyticsResultSchema);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'analyze_overdue',
          'ANALYSIS_FAILED',
          result.error,
          'Check that OmniFocus has overdue tasks to analyze',
          result.details,
          timer.toMetadata(),
        );
      }

      const responseData = {
        stats: {
          summary: (result.data as any).summary || {
            totalOverdue: 0,
            overduePercentage: 0,
            averageDaysOverdue: 0,
            oldestOverdueDate: new Date().toISOString(),
          },
          overdueTasks: (result.data as any).overdueTasks || [],
          patterns: (result.data as any).patterns || [],
          insights: (result.data as any).recommendations || {},
        },
        groupedAnalysis: (result.data as any).groupedAnalysis || {},
      };

      // Cache for 30 minutes
      this.cache.set('analytics', cacheKey, responseData);

      // Generate key findings
      const keyFindings = this.extractKeyFindings(responseData);

      return createAnalyticsResponseV2(
        'analyze_overdue',
        responseData,
        'Overdue Task Analysis',
        keyFindings,
        {
          from_cache: false,
          groupBy,
          includeCompleted: includeRecentlyCompleted,
          ...timer.toMetadata(),
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createErrorResponseV2(
        'analyze_overdue',
        'ANALYSIS_ERROR',
        errorMessage,
        'Ensure OmniFocus is running and has data to analyze',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  private extractKeyFindings(data: any): string[] {
    const findings: string[] = [];

    // Add summary findings
    if (data.stats?.summary) {
      const { totalOverdue, averageDaysOverdue, overduePercentage } = data.stats.summary;
      if (totalOverdue > 0) {
        findings.push(`${totalOverdue} tasks overdue (${overduePercentage.toFixed(1)}% of active tasks)`);
        findings.push(`Average ${Math.round(averageDaysOverdue)} days overdue`);
      }
    }

    // Add pattern insights
    if (data.stats?.patterns?.length > 0) {
      const topPattern = data.stats.patterns[0];
      if (topPattern) {
        findings.push(`Most overdue in: ${topPattern.category} (${topPattern.count} tasks)`);
      }
    }

    // Add grouped analysis insights
    if (data.groupedAnalysis && Object.keys(data.groupedAnalysis).length > 0) {
      const groups = Object.entries(data.groupedAnalysis)
        .sort((a: any, b: any) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 2);

      groups.forEach(([name, info]: any) => {
        if (info.count > 0) {
          findings.push(`${name}: ${info.count} overdue tasks`);
        }
      });
    }

    // Add recommendations if available
    if (data.stats?.insights?.topRecommendations?.length > 0) {
      findings.push(data.stats.insights.topRecommendations[0]);
    }

    return findings.length > 0 ? findings : ['No overdue tasks found'];
  }
}
