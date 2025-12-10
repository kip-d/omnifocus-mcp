import { BaseQueryHandler } from './base-query-handler.js';
import { QueryTasksArgsV2 } from '../QueryTasksTool.js';
import { TasksResponseV2 } from '../../response-types-v2.js';
import { GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT } from '../../../omnifocus/scripts/date-range-queries.js';

/**
 * Handler for overdue tasks queries
 */
export class OverdueHandler extends BaseQueryHandler {
  async handle(args: QueryTasksArgsV2): Promise<TasksResponseV2> {
    const cacheKey = `tasks_overdue_${args.limit}_${args.completed}`;

    // Check cache for speed
    const cached = this.tool.cache.get<{ tasks: any[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return {
        success: true,
        tasks: projectedTasks,
        metadata: { ...this.timer.toMetadata(), from_cache: true, mode: 'overdue' },
      };
    }

    // Execute optimized overdue script
    const script = this.tool.omniAutomation.buildScript(GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT, {
      limit: args.limit,
      includeCompleted: args.completed || false,
    });

    const result = await this.tool.execJson(script);

    if (!result.success) {
      return this.handleScriptError(result, 'overdue');
    }

    // Parse and cache
    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);
    this.tool.cache.set('tasks', cacheKey, { tasks, summary: (result.data as { summary?: unknown }).summary });

    const projectedTasks = this.projectFields(tasks, args.fields);
    return {
      success: true,
      tasks: projectedTasks,
      metadata: { ...this.timer.toMetadata(), from_cache: false, mode: 'overdue' },
    };
  }
}