import { z } from 'zod';
import { BaseTool } from '../base.js';
import { TASK_VELOCITY_SCRIPT } from '../../omnifocus/scripts/analytics/task-velocity.js';
import {
  createAnalyticsResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  StandardResponseV2,
} from '../../utils/response-format.js';
import { TaskVelocitySchemaV2 } from '../schemas/analytics-schemas-v2.js';
import { isScriptError, isScriptSuccess } from '../../omnifocus/script-result-types.js';

// V3 script response structure
interface TaskVelocityV3Data {
  velocity: {
    period: string;
    averageCompleted: string;
    averageCreated: string;
    dailyVelocity: string;
    backlogGrowthRate: string;
  };
  throughput: {
    intervals: Array<{
      start: Date;
      end: Date;
      created: number;
      completed: number;
      label: string;
    }>;
    totalCompleted: number;
    totalCreated: number;
  };
  breakdown: {
    medianCompletionHours: string;
    tasksAnalyzed: number;
  };
  projections: {
    tasksPerDay: string;
    tasksPerWeek: string;
    tasksPerMonth: string;
  };
  optimization: string;
}

export class TaskVelocityTool extends BaseTool<typeof TaskVelocitySchemaV2> {
  name = 'task_velocity';
  description = 'Analyze task completion velocity and predict workload capacity. Returns key velocity metrics first, then detailed trends.';
  schema = TaskVelocitySchemaV2;
  meta = {
    // Phase 1: Essential metadata
    category: 'Analytics' as const,
    stability: 'stable' as const,
    complexity: 'complex' as const,
    performanceClass: 'moderate' as const,
    tags: ['analytics', 'read-only', 'trends', 'velocity'],
    capabilities: ['completion-trends', 'velocity-metrics', 'forecast'],

    // Phase 2: Capability & Performance Documentation
    maxResults: null, // Returns single aggregated result
    maxQueryDuration: 30000, // 30 seconds
    requiresPermission: true,
    requiredCapabilities: ['read'],
    limitations: [
      'Analyzes entire OmniFocus database - can take 10-30 seconds',
      'Requires minimum 10 completed tasks in period for meaningful velocity',
      'Grouping options: day, week, month, quarter, year',
      'Forecasts are probabilistic, not guaranteed',
    ],
  };

  async executeValidated(args: z.infer<typeof TaskVelocitySchemaV2>): Promise<StandardResponseV2<unknown>> {
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
      // Cached velocity data structure matches our response interface
      const cached = this.cache.get<{
        velocity?: { period?: string; tasksCompleted?: number; averagePerDay?: number };
        patterns?: unknown;
        insights?: string[];
      }>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached task velocity');
        return createAnalyticsResponseV2(
          'task_velocity',
          cached,
          'Task Velocity Analysis',
          this.extractKeyFindings(cached as Parameters<typeof this.extractKeyFindings>[0]),
          {
            from_cache: true,
            days,
            ...timer.toMetadata(),
          },
        );
      }

      // Execute script - V3 uses period instead of groupBy
      const script = this.omniAutomation.buildScript(TASK_VELOCITY_SCRIPT, {
        options: { period: groupBy },
      });

      // Schema matching the V3 velocity payload
      const result = await this.execJson<TaskVelocityV3Data>(script);

      if (isScriptError(result)) {
        return createErrorResponseV2('task_velocity', 'VELOCITY_ERROR', result.error || 'Script execution failed', undefined, result.details, timer.toMetadata());
      }

      // V3 response structure
      const scriptData = isScriptSuccess(result) ? result.data : null;

      // Extract V3 data or use defaults
      const tasksCompleted = scriptData?.throughput?.totalCompleted || 0;
      const averagePerDay = parseFloat(scriptData?.velocity?.dailyVelocity || '0');
      const predictedCapacity = parseFloat(scriptData?.projections?.tasksPerWeek || '0');

      // V3 doesn't track trend/peak - use defaults
      const peak = { date: null, count: 0 };
      const trend = 'stable' as const;
      const daily = scriptData?.throughput?.intervals || [];

      const responseData = {
        velocity: {
          period: groupBy,
          tasksCompleted,
          averagePerDay: typeof averagePerDay === 'number' ? averagePerDay : Number(averagePerDay) || 0,
          peakDay: peak,
          trend,
          predictedCapacity: typeof predictedCapacity === 'number' ? predictedCapacity : Number(predictedCapacity) || 0,
        },
        daily,
        patterns: {
          byDayOfWeek: {},
          byTimeOfDay: {},
          byProject: [],
        },
        insights: [], // V3 doesn't include insights in script output
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


  private extractKeyFindings(data: {
    velocity?: {
      period?: string;
      tasksCompleted?: number;
      averagePerDay?: number;
      peakDay?: {
        date: string | null;
        count: number;
      };
      trend?: string;
      predictedCapacity?: number;
    };
    patterns?: {
      byDayOfWeek?: Record<string, number>;
      byProject?: Array<{
        name: string;
        completed: number;
      }>;
    };
    insights?: string[];
  }): string[] {
    const findings: string[] = [];

    // Add velocity summary
    if (data.velocity) {
      const { tasksCompleted, averagePerDay, trend, predictedCapacity } = data.velocity;
      if (tasksCompleted && tasksCompleted > 0) {
        const avgPerDay = averagePerDay || 0;
        findings.push(`Completed ${tasksCompleted} tasks (avg ${avgPerDay.toFixed(1)}/day)`);
      }

      // Add trend insight
      if (trend === 'increasing') {
        findings.push('📈 Velocity trending upward');
      } else if (trend === 'decreasing') {
        findings.push('📉 Velocity trending downward');
      } else {
        findings.push('➡️ Velocity stable');
      }

      if (predictedCapacity && predictedCapacity > 0) {
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
        .sort((a, b) => {
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
    if (data.patterns?.byProject && Array.isArray(data.patterns.byProject) && data.patterns.byProject.length > 0) {
      const topProject = data.patterns.byProject[0];
      if (topProject && topProject.completed > 0) {
        findings.push(`Fastest moving project: ${topProject.name}`);
      }
    }

    // Add insights
    if (data.insights && Array.isArray(data.insights) && data.insights.length > 0) {
      findings.push(data.insights[0]);
    }

    return findings.length > 0 ? findings : ['No velocity data available for this period'];
  }
}
