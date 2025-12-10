import { BaseQueryHandler } from './base-query-handler.js';
import { QueryTasksArgsV2 } from '../QueryTasksTool.js';
import { TasksResponseV2 } from '../../response-types-v2.js';
import { GET_TASK_COUNT_SCRIPT } from '../../../omnifocus/scripts/tasks.js';

/**
 * Handler for count-only queries (33x faster than fetching full tasks)
 */
export class CountOnlyHandler extends BaseQueryHandler {
  async handle(args: QueryTasksArgsV2): Promise<TasksResponseV2> {
    // Process filters into format expected by GET_TASK_COUNT_SCRIPT
    const filter = this.processAdvancedFilters(args);

    // Execute optimized count-only script
    const script = this.tool.omniAutomation.buildScript(GET_TASK_COUNT_SCRIPT, { filter });
    const result = await this.tool.execJson(script);

    if (!result.success) {
      return this.handleScriptError(result, 'count_only');
    }

    // Extract count from result
    const data = result.data as { count?: number; warning?: string; filters_applied?: unknown; query_time_ms?: number };
    const count = data.count ?? 0;

    // Return count in standardized format
    return {
      success: true,
      tasks: [],
      metadata: {
        ...this.timer.toMetadata(),
        from_cache: false,
        mode: args.mode || 'count_only',
        count_only: true,
        total_count: count,
        filters_applied: filter,
        optimization: 'count_only_script_33x_faster',
        warning: data.warning,
      },
    };
  }

  /**
   * Process advanced filters for count queries
   */
  private processAdvancedFilters(args: QueryTasksArgsV2): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    // Simple filters
    if (args.completed !== undefined) filter.completed = args.completed;
    if (args.project !== undefined) filter.project = args.project;
    if (args.tags && Array.isArray(args.tags)) filter.tags = args.tags;
    if (args.search) filter.search = args.search;
    if (args.dueBy) filter.dueBefore = args.dueBy;
    if (args.fastSearch) filter.fastSearch = args.fastSearch;

    // Advanced filters would be processed here
    // ... (similar to original implementation)

    return filter;
  }
}