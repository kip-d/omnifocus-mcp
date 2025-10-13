import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ANALYZE_OVERDUE_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  StandardResponseV2,
} from '../../utils/response-format.js';
import { OverdueAnalysisSchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { OverdueAnalysisDataV2 } from '../response-types-v2.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';
import { OverdueAnalysisData } from '../../omnifocus/script-response-types.js';

// Union type to support both production script format and test mock format
interface TestMockOverdueData {
  summary: {
    totalOverdue: number;
    overduePercentage: number;
    averageDaysOverdue: number;
    oldestOverdueDate: string;
  };
  overdueTasks: Array<{
    id: string;
    name: string;
    dueDate: string;
    daysOverdue: number;
    tags: string[];
    projectId?: string;
  }>;
  patterns: Array<{
    type: string;
    value: string;
    count: number;
    percentage: number;
  }>;
  recommendations: string[];
  groupedAnalysis?: Record<string, unknown>;
}

type OverdueDataUnion = OverdueAnalysisData | TestMockOverdueData;

// Type-safe helper functions
function isTestMockOverdueFormat(data: OverdueDataUnion): data is TestMockOverdueData {
  return 'recommendations' in data && Array.isArray(data.recommendations);
}

function getRecommendations(data: OverdueDataUnion): string[] {
  if (isTestMockOverdueFormat(data)) {
    return data.recommendations;
  }
  return data.recommendations || [];
}

function getPatternsWithValue(data: OverdueDataUnion): Array<{ type: string; value: string; count: number; percentage: number; }> {
  if (isTestMockOverdueFormat(data)) {
    return data.patterns;
  }

  // Production format has PatternData which already includes type and value
  return (data.patterns || []).map(p => ({
    type: p.type || 'unknown',
    value: p.value || 'unknown',
    count: p.count || 0,
    percentage: p.percentage || 0,
  }));
}

function getTaskProjectId(task: OverdueDataUnion['overdueTasks'][0]): string | undefined {
  if ('projectId' in task) {
    return task.projectId;
  }
  return undefined;
}

function getTaskDaysOverdue(task: OverdueDataUnion['overdueTasks'][0]): number {
  if ('daysOverdue' in task) {
    return task.daysOverdue;
  }
  return 0;
}

export class OverdueAnalysisToolV2 extends BaseTool<typeof OverdueAnalysisSchemaV2> {
  name = 'analyze_overdue';
  description = 'Analyze overdue tasks for patterns and bottlenecks. Returns summary with key findings first, then detailed analysis.';
  schema = OverdueAnalysisSchemaV2;

  async executeValidated(args: z.infer<typeof OverdueAnalysisSchemaV2>): Promise<StandardResponseV2<unknown>> {
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
      const script = this.omniAutomation.buildScript(ANALYZE_OVERDUE_SCRIPT, {
        options: { includeRecentlyCompleted, groupBy, limit },
      });
      const result = await this.execJson<OverdueDataUnion>(script);

      if (isScriptError(result)) {
        return createErrorResponseV2('analyze_overdue', 'ANALYSIS_ERROR', result.error || 'Script execution failed', undefined, result.details, timer.toMetadata());
      }

      const scriptData: OverdueDataUnion = isScriptSuccess(result) ? result.data : {
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
            id: String(task.id || ''),
            name: String(task.name || ''),
            dueDate: task.dueDate ?? null,
            project: getTaskProjectId(task) ? String(getTaskProjectId(task)) : undefined,
            daysOverdue: getTaskDaysOverdue(task),
          })),
          patterns: getPatternsWithValue(scriptData),
          insights: { topRecommendations: getRecommendations(scriptData) },
        },
        groupedAnalysis: Object.fromEntries(
          Object.entries(scriptData.groupedAnalysis ?? {}).map(([key, value]) => [
            key,
            {
              // OmniFocus script results are untyped, requiring unsafe operations for data extraction
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              count: typeof value === 'object' && value !== null && 'count' in value ? (value as any).count || 0 : 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              averageDaysOverdue: typeof value === 'object' && value !== null && 'averageDaysOverdue' in value ? (value as any).averageDaysOverdue : undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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

      // Provide specific error handling based on error type
      let suggestion = 'Ensure OmniFocus is running and has data to analyze';
      let errorCode = 'ANALYSIS_ERROR';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorCode = 'SCRIPT_TIMEOUT';
        suggestion = 'Try reducing the limit parameter or use basic analysis without grouping';
      } else if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        errorCode = 'OMNIFOCUS_NOT_RUNNING';
        suggestion = 'Start OmniFocus and ensure it is running';
      } else if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        errorCode = 'PERMISSION_DENIED';
        suggestion = 'Enable automation access in System Settings > Privacy & Security > Automation';
      } else if (errorMessage.includes('no overdue') || errorMessage.includes('no data')) {
        errorCode = 'NO_OVERDUE_TASKS';
        suggestion = 'No overdue tasks found - this is actually good news for your productivity!';
      }

      return createErrorResponseV2(
        'analyze_overdue',
        errorCode,
        errorMessage,
        suggestion,
        error instanceof Error ? { stack: error.stack } : undefined,
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

    // Add pattern insights with defensive null checks
    if (data?.stats?.patterns && Array.isArray(data.stats.patterns) && data.stats.patterns.length > 0) {
      const topPattern = data.stats.patterns[0];
      if (topPattern && typeof topPattern === 'object' && topPattern.type && typeof topPattern.count === 'number' && topPattern.count > 0) {
        findings.push(`Most overdue in: ${topPattern.type} (${topPattern.count} tasks)`);
      }
    }

    // Add grouped analysis insights with defensive null checks
    if (data?.groupedAnalysis && typeof data.groupedAnalysis === 'object' && Object.keys(data.groupedAnalysis).length > 0) {
      const groups = Object.entries(data.groupedAnalysis)
        .filter(([_, info]) => info && typeof info === 'object' && typeof info.count === 'number')
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .slice(0, 2);

      groups.forEach(([name, info]) => {
        if (info && typeof info.count === 'number' && info.count > 0) {
          findings.push(`${name}: ${info.count} overdue tasks`);
        }
      });
    }

    // Add recommendations if available with defensive null checks
    if (data?.stats?.insights?.topRecommendations && Array.isArray(data.stats.insights.topRecommendations) && data.stats.insights.topRecommendations.length > 0) {
      const recommendations = data.stats.insights.topRecommendations;
      // Type assertion is safe here - we've verified it's a non-empty array
      const firstRecommendation = recommendations[0] as unknown;
      if (firstRecommendation && typeof firstRecommendation === 'string') {
        findings.push(firstRecommendation);
      }
    }

    return findings.length > 0 ? findings : ['No overdue tasks found'];
  }

}
