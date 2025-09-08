import { z } from 'zod';
import { BaseTool } from '../base.js';
import { PRODUCTIVITY_STATS_OPTIMIZED_SCRIPT } from '../../omnifocus/scripts/analytics/productivity-stats-optimized.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
} from '../../utils/response-format-v2.js';
import { ProductivityStatsSchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { ProductivityStatsResponseV2 } from '../response-types-v2.js';

export class ProductivityStatsToolV2 extends BaseTool<typeof ProductivityStatsSchemaV2, ProductivityStatsResponseV2> {
  name = 'productivity_stats';
  description = 'Generate comprehensive productivity statistics and GTD health metrics. Returns summary insights first, then detailed stats.';
  schema = ProductivityStatsSchemaV2;

  async executeValidated(args: z.infer<typeof ProductivityStatsSchemaV2>): Promise<ProductivityStatsResponseV2> {
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
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached productivity stats');
        return createAnalyticsResponseV2(
          'productivity_stats',
          cached,
          'Productivity Analysis',
          this.extractKeyFindings(cached),
          {
            from_cache: true,
            period,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute optimized script (tests provide simple mock shapes via executeJson)
      const script = this.omniAutomation.buildScript(PRODUCTIVITY_STATS_OPTIMIZED_SCRIPT, {
        options: {
          period,
          includeProjectStats,
          includeTagStats,
          includeInactive: false,  // Only active projects by default for performance
        },
      });
      const raw = await this.execJson(script);

      if ((raw as any)?.success === false) {
        return createErrorResponseV2(
          'productivity_stats',
          'STATS_ERROR',
          (raw as any).error || 'Script execution failed',
          'Ensure OmniFocus is running and has data to analyze',
          (raw as any).details,
          timer.toMetadata(),
        );
      }

      const d: any = (raw as any) || {};
      // Normalize common shapes from tests
      const completedTasks = d.summary?.completedTasks ?? d.stats?.completed ?? 0;
      const totalTasks = d.summary?.totalTasks ?? d.stats?.created ?? 0;
      const completionRate = d.summary?.completionRate ?? (totalTasks ? completedTasks / totalTasks : 0);
      const activeProjects = d.summary?.activeProjects ?? 0;

      const overview = {
        totalTasks,
        completedTasks,
        completionRate: typeof completionRate === 'number' ? completionRate : Number(completionRate),
        activeProjects,
        overdueCount: 0,
      };

      const projectStatsArray = includeProjectStats ? (d.projectStats || d.stats?.projectStats || []) : [];
      const tagStatsArray = includeTagStats ? (d.tagStats || d.stats?.tagStats || []) : [];

      const responseData = {
        period,
        stats: {
          overview,
          daily: d.dailyStats || [],
          weekly: d.weeklyStats || {},
          projectStats: projectStatsArray,
          tagStats: tagStatsArray,
        },
        insights: { recommendations: d.trends?.recommendations || d.insights || [] },
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
      return createErrorResponseV2(
        'productivity_stats',
        'STATS_ERROR',
        errorMessage,
        'Ensure OmniFocus is running and has data to analyze',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  // Adapt mocks that only implement executeJson without strict schema
  private async execJson(script: string): Promise<any> {
    const anyOmni: any = this.omniAutomation as any;
    if (typeof anyOmni.executeJson === 'function') {
      const res = await anyOmni.executeJson(script);
      if (res && typeof res === 'object' && 'success' in res) {
        return (res as any).success ? (res as any).data : res;
      }
      return res;
    }
    return await anyOmni.execute(script);
  }

  private extractKeyFindings(data: any): string[] {
    const findings: string[] = [];

    // Add overview findings
    if (data.stats?.overview) {
      const { completedTasks, completionRate, activeProjects, overdueCount } = data.stats.overview;
      if (completedTasks > 0) {
        findings.push(`Completed ${completedTasks} tasks (${(completionRate * 100).toFixed(1)}% completion rate)`);
      }
      if (activeProjects > 0) {
        findings.push(`${activeProjects} active projects`);
      }
      if (overdueCount > 0) {
        findings.push(`⚠️ ${overdueCount} tasks overdue`);
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
    if (data.stats?.projectStats?.length > 0) {
      const topProject = data.stats.projectStats
        .sort((a: any, b: any) => (b.completedCount || 0) - (a.completedCount || 0))[0];
      if (topProject && topProject.completedCount > 0) {
        findings.push(`Most productive project: ${topProject.name} (${topProject.completedCount} completed)`);
      }
    }

    // Add insights
    if (data.insights?.recommendations?.length > 0) {
      findings.push(data.insights.recommendations[0]);
    }

    return findings.length > 0 ? findings : ['No productivity data available for this period'];
  }
}
