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
import { z as zod } from 'zod';

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

      // Execute optimized script using direct API methods
      const script = this.omniAutomation.buildScript(PRODUCTIVITY_STATS_OPTIMIZED_SCRIPT, {
        options: {
          period,
          includeProjectStats,
          includeTagStats,
          includeInactive: false,  // Only active projects by default for performance
        },
      });
      // Define schema for optimized productivity payload
      const ProjectStatsEntry = zod.object({
        total: zod.number(),
        completed: zod.number(),
        available: zod.number(),
        completionRate: zod.union([zod.number(), zod.string().transform((v) => parseFloat(v))]),
        status: zod.string().optional(),
        hadRecentActivity: zod.boolean().optional(),
      });
      const TagStatsEntry = zod.object({
        available: zod.number(),
        remaining: zod.number(),
        completionRate: zod.union([zod.number(), zod.string().transform((v) => parseFloat(v))]),
      });
      const ProductivityOptimizedSchema = zod.object({
        summary: zod.object({
          period: zod.string(),
          totalProjects: zod.number(),
          activeProjects: zod.number(),
          totalTasks: zod.number(),
          completedTasks: zod.number(),
          availableTasks: zod.number(),
          completionRate: zod.number(), // percent 0-100
          dailyAverage: zod.number(),
          daysInPeriod: zod.number(),
        }),
        projectStats: zod.record(ProjectStatsEntry),
        tagStats: zod.record(TagStatsEntry),
        insights: zod.array(zod.string()),
        metadata: zod.object({ generated_at: zod.string(), method: zod.string(), note: zod.string().optional() }).passthrough(),
      });

      const data = await this.omniAutomation.executeTyped(script, ProductivityOptimizedSchema);

      const overview = {
        totalTasks: data.summary.totalTasks,
        completedTasks: data.summary.completedTasks,
        completionRate: data.summary.completionRate / 100,
        activeProjects: data.summary.activeProjects,
        overdueCount: 0,
      };

      const projectStatsArray = includeProjectStats
        ? Object.entries(data.projectStats).map(([name, s]: [string, any]) => ({
            name,
            completedCount: s.completed,
            totalCount: s.total,
            completionRate: typeof s.completionRate === 'number' ? s.completionRate / 100 : Number(s.completionRate) / 100,
          }))
        : [];

      const tagStatsArray = includeTagStats
        ? Object.entries(data.tagStats).map(([name, s]: [string, any]) => ({ name, count: s.available + s.remaining }))
        : [];

      const responseData = {
        period,
        stats: {
          overview,
          daily: [],
          weekly: {},
          projectStats: projectStatsArray,
          tagStats: tagStatsArray,
        },
        insights: { recommendations: data.insights },
        healthScore: Math.max(0, Math.min(100, data.summary.completionRate)),
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
