import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ANALYZE_OVERDUE_OPTIMIZED_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue-optimized.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
} from '../../utils/response-format-v2.js';
import { OverdueAnalysisSchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { OverdueAnalysisDataV2 } from '../response-types-v2.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import { OverdueAnalysisData } from '../../omnifocus/script-response-types.js';

export class OverdueAnalysisToolV2 extends BaseTool<typeof OverdueAnalysisSchemaV2> {
  name = 'analyze_overdue';
  description = 'Analyze overdue tasks for patterns and bottlenecks. Returns summary with key findings first, then detailed analysis.';
  schema = OverdueAnalysisSchemaV2;

  async executeValidated(args: z.infer<typeof OverdueAnalysisSchemaV2>): Promise<any> {
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
      const cached = this.cache.get<OverdueAnalysisDataV2>('analytics', cacheKey);
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

      // Execute script (tests provide simplified shapes via executeJson)
      const script = this.omniAutomation.buildScript(ANALYZE_OVERDUE_OPTIMIZED_SCRIPT, {
        options: { includeRecentlyCompleted, groupBy, limit },
      });
      const result = await this.execJson<OverdueAnalysisData>(script);

      if (isScriptError(result)) {
        return createErrorResponseV2('analyze_overdue', 'ANALYSIS_ERROR', result.error || 'Script execution failed', undefined, result.details, timer.toMetadata());
      }

      const scriptData: OverdueAnalysisData = isScriptSuccess(result) ? result.data : {
        summary: {
          totalOverdue: 0,
          overduePercentage: 0,
          averageDaysOverdue: 0,
          oldestOverdueDate: '',
        },
        overdueTasks: [],
        patterns: [],
        groupedAnalysis: {},
      };
      // Remove unused total variable
      const responseData: OverdueAnalysisDataV2 = {
        stats: {
          summary: {
            totalOverdue: scriptData.summary.totalOverdue ?? 0,
            overduePercentage: scriptData.summary.overduePercentage ?? 0,
            averageDaysOverdue: Number(scriptData.summary.averageDaysOverdue ?? 0),
            oldestOverdueDate: scriptData.summary.oldestOverdueDate ?? '',
          },
          overdueTasks: (scriptData.overdueTasks ?? []).map(task => ({
            id: task.id || '',
            name: task.name || '',
            dueDate: task.dueDate ?? null,
            project: task.projectId ?? undefined,
            daysOverdue: 0, // Calculate if needed
          })),
          patterns: Array.isArray(scriptData.patterns)
            ? scriptData.patterns.map(p => ({
                category: p.type || 'unknown',
                count: p.count || 0,
                percentage: p.percentage || 0,
              }))
            : [],  // Simplified fallback for type safety
          insights: {},
        },
        groupedAnalysis: Object.fromEntries(
          Object.entries(scriptData.groupedAnalysis ?? {}).map(([key, value]) => [
            key,
            {
              count: typeof value === 'object' && value !== null && 'count' in value ? (value as any).count || 0 : 0,
              averageDaysOverdue: typeof value === 'object' && value !== null && 'averageDaysOverdue' in value ? (value as any).averageDaysOverdue : undefined,
              tasks: typeof value === 'object' && value !== null && 'tasks' in value ? (value as any).tasks : undefined,
            },
          ]),
        ),
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

  private extractKeyFindings(data: OverdueAnalysisDataV2): string[] {
    const findings: string[] = [];

    // Add summary findings
    if (data.stats?.summary) {
      const { totalOverdue, averageDaysOverdue, overduePercentage } = data.stats.summary;
      if ((totalOverdue ?? 0) > 0) {
        findings.push(`${totalOverdue ?? 0} tasks overdue (${(overduePercentage ?? 0).toFixed(1)}% of active tasks)`);
        findings.push(`Average ${Math.round(averageDaysOverdue ?? 0)} days overdue`);
      }
    }

    // Add pattern insights
    if (data.stats?.patterns && data.stats.patterns.length > 0) {
      const topPattern = data.stats.patterns[0];
      if (topPattern && topPattern.category && topPattern.count) {
        findings.push(`Most overdue in: ${topPattern.category} (${topPattern.count} tasks)`);
      }
    }

    // Add grouped analysis insights
    if (data.groupedAnalysis && Object.keys(data.groupedAnalysis).length > 0) {
      const groups = Object.entries(data.groupedAnalysis)
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 2);

      groups.forEach(([name, info]) => {
        if (info.count && info.count > 0) {
          findings.push(`${name}: ${info.count} overdue tasks`);
        }
      });
    }

    // Add recommendations if available
    if (data.stats?.insights?.topRecommendations && Array.isArray(data.stats.insights.topRecommendations) && data.stats.insights.topRecommendations.length > 0) {
      findings.push(data.stats.insights.topRecommendations[0]);
    }

    return findings.length > 0 ? findings : ['No overdue tasks found'];
  }

}
