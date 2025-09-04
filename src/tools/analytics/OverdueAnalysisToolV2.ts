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
import { z as zod } from 'zod';

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
      // Define strict schema for the optimized analysis payload
      const NumFromStr = zod.union([zod.number(), zod.string().transform((v) => parseFloat(v))]);
      const OverdueTaskSchema = zod.object({
        id: zod.string(),
        name: zod.string(),
        dueDate: zod.string(),
        daysOverdue: zod.number(),
        project: zod.string(),
        tags: zod.array(zod.string()),
        blocked: zod.boolean(),
        isNext: zod.boolean(),
      });
      const OverdueOptimizedDataSchema = zod.object({
        summary: zod.object({
          totalOverdue: zod.number(),
          blockedCount: zod.number(),
          unblockedCount: zod.number(),
          blockedPercentage: NumFromStr,
          avgDaysOverdue: NumFromStr,
          mostOverdue: OverdueTaskSchema.nullable().optional(),
        }),
        insights: zod.array(zod.string()),
        groupedByUrgency: zod.object({
          critical: zod.array(OverdueTaskSchema),
          high: zod.array(OverdueTaskSchema),
          medium: zod.array(OverdueTaskSchema),
          low: zod.array(OverdueTaskSchema),
        }),
        projectBottlenecks: zod.array(zod.object({
          name: zod.string(),
          overdueCount: zod.number(),
          blockedCount: zod.number(),
          avgDaysOverdue: NumFromStr,
          blockageRate: NumFromStr.optional(),
        })),
        blockedTasks: zod.array(OverdueTaskSchema),
        metadata: zod.object({
          generated_at: zod.string(),
          method: zod.string(),
          tasksAnalyzed: zod.number(),
          note: zod.string().optional(),
        }).passthrough(),
      });

      const data = await this.omniAutomation.executeTyped(script, OverdueOptimizedDataSchema);

      const responseData = {
        stats: {
          summary: {
            totalOverdue: data.summary.totalOverdue,
            overduePercentage: Number(data.summary.blockedPercentage) + Number(data.summary.unblockedCount) * 0, // keep field in compatible shape
            averageDaysOverdue: Number(data.summary.avgDaysOverdue),
            oldestOverdueDate: data.blockedTasks[0]?.dueDate ?? new Date().toISOString(),
          },
          overdueTasks: data.blockedTasks.concat(
            data.groupedByUrgency.high.slice(0, Math.max(0, 10 - data.blockedTasks.length)),
          ),
          patterns: data.projectBottlenecks.map((p) => ({ category: p.name, count: p.overdueCount })),
          insights: { topRecommendations: data.insights.slice(0, 3) },
        },
        groupedAnalysis: {
          project: Object.fromEntries(
            data.projectBottlenecks.map((p) => [p.name, { count: p.overdueCount, blocked: p.blockedCount }]),
          ),
        },
      } as const;

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
