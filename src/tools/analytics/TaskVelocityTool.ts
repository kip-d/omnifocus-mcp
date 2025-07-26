import { LegacyBaseTool } from '../legacy-base.js';
import { TASK_VELOCITY_SCRIPT } from '../../omnifocus/scripts/analytics.js';

export class TaskVelocityTool extends LegacyBaseTool {
  name = 'get_task_velocity';
  description = 'Analyze task completion velocity and throughput metrics';

  inputSchema = {
    type: 'object' as const,
    properties: {
      period: {
        type: 'string',
        enum: ['day', 'week', 'month'],
        description: 'Time period for velocity calculation',
        default: 'week',
      },
      projectId: {
        type: 'string',
        description: 'Filter by specific project (optional)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (optional)',
      },
    },
  };

  async execute(args: { period?: string; projectId?: string; tags?: string[] }): Promise<any> {
    try {
      const {
        period = 'week',
        projectId,
        tags,
      } = args;

      // Create cache key
      const cacheKey = `velocity_${period}_${projectId || 'all'}_${JSON.stringify(tags || [])}`;

      // Check cache
      const cached = this.cache.get<any>('analytics', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached velocity data');
        return {
          ...cached,
          from_cache: true,
        };
      }

      // Execute script
      const script = this.omniAutomation.buildScript(TASK_VELOCITY_SCRIPT, {
        options: { period, projectId, tags },
      });
      const result = await this.omniAutomation.execute<any>(script);

      if (result.error) {
        return result;
      }

      const finalResult = {
        period: period,
        velocity: result.velocity,
        throughput: result.throughput,
        breakdown: result.breakdown,
        projections: result.projections,
        from_cache: false,
      };

      // Cache for 30 minutes
      this.cache.set('analytics', cacheKey, finalResult);

      return finalResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
