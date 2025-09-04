import { z } from 'zod';
import { BaseTool } from '../base.js';
import { TASK_VELOCITY_SCRIPT } from '../../omnifocus/scripts/analytics.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
} from '../../utils/response-format-v2.js';
import { TaskVelocitySchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { TaskVelocityResponseV2 } from '../response-types-v2.js';
import { isScriptSuccess, AnalyticsResultSchema } from '../../omnifocus/script-result-types.js';

export class TaskVelocityToolV2 extends BaseTool<typeof TaskVelocitySchemaV2, TaskVelocityResponseV2> {
  name = 'task_velocity';
  description = 'Analyze task completion velocity and predict workload capacity. Returns key velocity metrics first, then detailed trends.';
  schema = TaskVelocitySchemaV2;

  async executeValidated(args: z.infer<typeof TaskVelocitySchemaV2>): Promise<TaskVelocityResponseV2> {
    const timer = new OperationTimerV2();

    try {
      const {
        days = 7,
        groupBy = 'day',
        includeWeekends = true,
      } = args;

      // Create cache key
      const cacheKey = `velocity_v2_${days}_${groupBy}_${includeWeekends}`;

      // Check cache (1 hour TTL for analytics)
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached task velocity');
        return createAnalyticsResponseV2(
          'task_velocity',
          cached,
          'Task Velocity Analysis',
          this.extractKeyFindings(cached),
          {
            from_cache: true,
            days,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(TASK_VELOCITY_SCRIPT, {
        options: { days, groupBy, includeWeekends },
      });
      const result = await this.omniAutomation.executeJson(script, AnalyticsResultSchema);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'task_velocity',
          'VELOCITY_FAILED',
          result.error,
          'Check that OmniFocus has completion data for the requested period',
          result.details,
          timer.toMetadata(),
        );
      }

      const responseData = {
        velocity: {
          period: `${days} days`,
          tasksCompleted: (result.data as any).totalCompleted || 0,
          averagePerDay: (result.data as any).averagePerDay || 0,
          peakDay: (result.data as any).peakDay || { date: null, count: 0 },
          trend: (result.data as any).trend || 'stable',
          predictedCapacity: (result.data as any).predictedCapacity || 0,
        },
        daily: (result.data as any).dailyData || [],
        patterns: {
          byDayOfWeek: (result.data as any).dayOfWeekPatterns || {},
          byTimeOfDay: (result.data as any).timeOfDayPatterns || {},
          byProject: (result.data as any).projectVelocity || [],
        },
        insights: (result.data as any).insights || [],
      };

      // Cache for 1 hour
      this.cache.set('analytics', cacheKey, responseData);

      // Generate key findings
      const keyFindings = this.extractKeyFindings(responseData);

      return createAnalyticsResponseV2(
        'task_velocity',
        responseData,
        'Task Velocity Analysis',
        keyFindings,
        {
          from_cache: false,
          days,
          groupBy,
          includeWeekends,
          ...timer.toMetadata(),
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createErrorResponseV2(
        'task_velocity',
        'VELOCITY_ERROR',
        errorMessage,
        'Ensure OmniFocus is running and has completion data',
        undefined,
        timer.toMetadata(),
      );
    }
  }

  private extractKeyFindings(data: any): string[] {
    const findings: string[] = [];

    // Add velocity summary
    if (data.velocity) {
      const { tasksCompleted, averagePerDay, trend, predictedCapacity } = data.velocity;
      if (tasksCompleted > 0) {
        findings.push(`Completed ${tasksCompleted} tasks (avg ${averagePerDay.toFixed(1)}/day)`);
      }

      // Add trend insight
      if (trend === 'increasing') {
        findings.push('📈 Velocity trending upward');
      } else if (trend === 'decreasing') {
        findings.push('📉 Velocity trending downward');
      } else {
        findings.push('➡️ Velocity stable');
      }

      if (predictedCapacity > 0) {
        findings.push(`Predicted capacity: ${Math.round(predictedCapacity)} tasks/week`);
      }
    }

    // Add peak day
    if (data.velocity?.peakDay?.date && data.velocity.peakDay.count > 0) {
      findings.push(`Peak day: ${data.velocity.peakDay.date} (${data.velocity.peakDay.count} tasks)`);
    }

    // Add day of week pattern
    if (data.patterns?.byDayOfWeek) {
      const days = Object.entries(data.patterns.byDayOfWeek)
        .sort((a: [string, unknown], b: [string, unknown]) => {
          const aVal = typeof a[1] === 'number' ? a[1] : 0;
          const bVal = typeof b[1] === 'number' ? b[1] : 0;
          return bVal - aVal;
        });
      if (days.length > 0) {
        const dayCount = typeof days[0][1] === 'number' ? days[0][1] : 0;
        if (dayCount > 0) {
          findings.push(`Most productive: ${days[0][0]}s`);
        }
      }
    }

    // Add project velocity insight
    if (data.patterns?.byProject?.length > 0) {
      const topProject = data.patterns.byProject[0];
      if (topProject && topProject.completed > 0) {
        findings.push(`Fastest moving project: ${topProject.name}`);
      }
    }

    // Add insights
    if (data.insights?.length > 0) {
      findings.push(data.insights[0]);
    }

    return findings.length > 0 ? findings : ['No velocity data available for this period'];
  }
}
