import { BaseQueryHandler } from './base-query-handler.js';
import { CountOnlyHandler } from './count-only-handler.js';
import { OverdueHandler } from './overdue-handler.js';
import { QueryTasksArgsV2 } from '../QueryTasksTool.js';
import { TasksResponseV2 } from '../../response-types-v2.js';
import { BaseTool } from '../../base.js';
import { QueryTasksToolSchemaV2 } from '../QueryTasksTool.js';
import { OperationTimerV2 } from '../../../utils/response-format.js';

/**
 * Factory for creating query handlers based on query mode
 */
export class QueryHandlerFactory {
  constructor(
    private tool: BaseTool<typeof QueryTasksToolSchemaV2, TasksResponseV2>,
    private timer: OperationTimerV2
  ) {}

  /**
   * Create the appropriate handler for the given query mode
   */
  createHandler(mode: string, args: QueryTasksArgsV2): BaseQueryHandler {
    switch (mode) {
      case 'count_only':
        return new CountOnlyHandler(this.tool, this.timer);
      case 'overdue':
        return new OverdueHandler(this.tool, this.timer);
      // Add more handlers here as they are implemented
      case 'upcoming':
      case 'today':
      case 'search':
      case 'available':
      case 'blocked':
      case 'flagged':
      case 'smart_suggest':
      case 'inbox':
      case 'all':
      case 'id_lookup':
      default:
        // For now, fall back to a generic handler for unimplemented modes
        // This will be replaced as we implement more specific handlers
        return new CountOnlyHandler(this.tool, this.timer);
    }
  }

  /**
   * Execute the appropriate handler for the given query
   */
  async executeHandler(mode: string, args: QueryTasksArgsV2): Promise<TasksResponseV2> {
    const handler = this.createHandler(mode, args);
    return handler.handle(args);
  }
}