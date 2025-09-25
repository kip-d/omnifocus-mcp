import { z } from 'zod';
import { BaseTool } from '../base.js';
import { PRODUCTIVITY_STATS_SCRIPT } from '../../omnifocus/scripts/analytics/productivity-stats.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  StandardResponseV2,
} from '../../utils/response-format-v2.js';
import { ProductivityStatsSchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { isScriptError } from '../../omnifocus/script-result-types.js';
import { ProductivityStatsData } from '../../omnifocus/script-response-types.js';

export class ProductivityStatsToolV2 extends BaseTool<typeof ProductivityStatsSchemaV2> {
  name = 'productivity_stats';
  description = 'Generate comprehensive productivity statistics and GTD health metrics. Returns summary insights first, then detailed stats.';
  schema = ProductivityStatsSchemaV2;

  async executeValidated(args: z.infer<typeof ProductivityStatsSchemaV2>): Promise<StandardResponseV2<unknown>> {
    const timer = new OperationTimerV2();

    try {
      const {
        period = 'week',
        includeProjectStats = true,
        includeTagStats = true,
      } = args;

      // Create cache key
      const cacheKey = `productivity_v2_${period}_${includeProjectStats}_${includeTagStats}`;

      // Check cache (1 hour TTL for analytics)
      const cached = this.cache.get<{ period?: string; stats?: Record<string, unknown>; healthScore?: number }>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached productivity stats');
        return createAnalyticsResponseV2(
          'productivity_stats',
          cached,
          'Productivity Analysis',
          this.extractKeyFindings(cached as { period?: string; stats?: Record<string, unknown>; healthScore?: number }),
          {
            from_cache: true,
            period,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute optimized script (tests provide simple mock shapes via executeJson)
      const script = this.omniAutomation.buildScript(PRODUCTIVITY_STATS_SCRIPT, {
        options: {
          period,
          includeProjectStats,
          includeTagStats,
          includeInactive: false,  // Only active projects by default for performance
        },
      });
      const result = await this.execJson<ProductivityStatsData>(script);

      if (isScriptError(result)) {
        return createErrorResponseV2(
          'productivity_stats',
          'STATS_ERROR',
          result.error || 'Script execution failed',
          'Ensure OmniFocus is running and has data to analyze',
          result.details,
          timer.toMetadata(),
        );
      }

      // Handle the script result properly - omniAutomation returns the script data directly
      interface ScriptOverview {
        totalTasks?: number;
        completedTasks?: number;
        completionRate?: number;
        activeProjects?: number;
        overdueCount?: number;
      }

      interface ScriptData {
        summary?: ScriptOverview;
        projectStats?: Record<string, unknown>;
        tagStats?: Record<string, unknown>;
        insights?: string[];
      }

      // Handle the script result - it returns {ok: true, data: {summary, projectStats, tagStats, insights}}
      let actualData: unknown;
      if (result && typeof result === 'object' && result !== null) {
        if ('ok' in result && 'data' in result) {
          // Script success format: {ok: true, data: {...}}
          actualData = (result as {ok: boolean, data: unknown}).data;
        } else if ('data' in result) {
          // Standard wrapper: {data: {...}}
          actualData = (result as {data: unknown}).data;
        } else {
          // Direct data
          actualData = result;
        }
      } else {
        actualData = result;
      }

      // Handle the actual script response format
      let overview: ScriptOverview;
      let projectStatsArray: Array<{ name: string; completedCount: number; }> | Record<string, unknown>;
      let tagStatsArray: Record<string, unknown>;
      let insights: string[];

      // Type guard for script response format (now looking in actualData)
      if (actualData && typeof actualData === 'object' && actualData !== null && 'summary' in actualData) {
        // Script returns: {summary: {...}, projectStats: {...}, tagStats: {...}, insights: [...]}
        const typedScriptData = actualData as ScriptData;
        const summary = typedScriptData.summary!;
        overview = {
          totalTasks: summary.totalTasks || 0,
          completedTasks: summary.completedTasks || 0,
          completionRate: summary.completionRate || 0,
          activeProjects: summary.activeProjects || 0,
          overdueCount: summary.overdueCount || 0,
        };

        projectStatsArray = includeProjectStats ? (typedScriptData.projectStats || []) : [];
        tagStatsArray = includeTagStats ? (typedScriptData.tagStats || {}) : {};
        insights = typedScriptData.insights || [];
      } else {
        // Fallback for empty/error cases
        overview = {
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          activeProjects: 0,
          overdueCount: 0,
        };
        projectStatsArray = [];
        tagStatsArray = {};
        insights = [];
      }

      const responseData = {
        period,
        stats: {
          overview,
          daily: [],
          weekly: {},
          projectStats: Array.isArray(projectStatsArray) ? projectStatsArray : Object.entries(projectStatsArray || {}).map(([name, data]) => ({
            name,
            completedCount: (data && typeof data === 'object' && 'completedCount' in data) ? Number(data.completedCount) || 0 : 0,
            ...(data && typeof data === 'object' ? data as Record<string, unknown> : {}),
          })),
          tagStats: tagStatsArray,
        },
        insights: { recommendations: insights },
        healthScore: Math.max(0, Math.min(100, Math.round((overview.completionRate || 0) * 100))),
      };

      // Cache for 1 hour
      this.cache.set('analytics', cacheKey, responseData);

      // Generate key findings
      const keyFindings = this.extractKeyFindings(responseData);

      return createAnalyticsResponseV2(
        'productivity_stats',
        responseData,
        'Productivity Analysis',
        keyFindings,
        {
          from_cache: false,
          period,
          includeProjectStats,
          includeTagStats,
          ...timer.toMetadata(),
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide specific error handling based on error type
      let suggestion = 'Ensure OmniFocus is running and has data to analyze';
      let errorCode = 'STATS_ERROR';

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorCode = 'SCRIPT_TIMEOUT';
        suggestion = 'Try reducing the analysis period or exclude project/tag stats for faster results';
      } else if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        errorCode = 'OMNIFOCUS_NOT_RUNNING';
        suggestion = 'Start OmniFocus and ensure it is running';
      } else if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        errorCode = 'PERMISSION_DENIED';
        suggestion = 'Enable automation access in System Settings > Privacy & Security > Automation';
      } else if (errorMessage.includes('no data') || errorMessage.includes('empty database')) {
        errorCode = 'NO_DATA';
        suggestion = 'Add some tasks to OmniFocus before running productivity analysis';
      }

      return createErrorResponseV2(
        'productivity_stats',
        errorCode,
        errorMessage,
        suggestion,
        error instanceof Error ? { stack: error.stack } : undefined,
        timer.toMetadata(),
      );
    }
  }


  private extractKeyFindings(data: {
    period?: string;
    stats?: {
      overview?: {
        totalTasks?: number;
        completedTasks?: number;
        completionRate?: number;
        activeProjects?: number;
        overdueCount?: number;
      };
      projectStats?: Array<{
        name: string;
        completedCount: number;
      }>;
    };
    healthScore?: number;
    insights?: {
      recommendations?: string[];
    };
  }): string[] {
    const findings: string[] = [];

    // Add overview findings
    if (data.stats?.overview) {
      const { completedTasks, completionRate } = data.stats.overview;
      if (completedTasks && completedTasks > 0) {
        const rate = completionRate || 0;
        findings.push(`Completed ${completedTasks} tasks (${(rate * 100).toFixed(1)}% completion rate)`);
      }
    }

    // Add health score
    if (data.healthScore) {
      const score = Math.round(data.healthScore);
      let assessment = 'Needs attention';
      if (score >= 80) assessment = 'Excellent';
      else if (score >= 60) assessment = 'Good';
      else if (score >= 40) assessment = 'Fair';

      findings.push(`GTD Health Score: ${score}/100 (${assessment})`);
    }

    // Add top performing project
    if (data.stats?.projectStats && data.stats.projectStats.length > 0) {
      const topProject = data.stats.projectStats
        .sort((a, b) => (b.completedCount || 0) - (a.completedCount || 0))[0];
      if (topProject && topProject.completedCount > 0) {
        findings.push(`Most productive project: ${topProject.name} (${topProject.completedCount} completed)`);
      }
    }

    // Add insights
    if (data.insights && Array.isArray(data.insights.recommendations) && data.insights.recommendations.length > 0) {
      findings.push(data.insights.recommendations[0]);
    }

    return findings.length > 0 ? findings : ['No productivity data available for this period'];
  }
}
