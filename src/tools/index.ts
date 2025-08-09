import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../cache/CacheManager.js';
import { createLogger } from '../utils/logger.js';

// Import task tools
import { ListTasksTool } from './tasks/ListTasksTool.js';
import { GetTaskCountTool } from './tasks/GetTaskCountTool.js';
import { TodaysAgendaTool } from './tasks/TodaysAgendaTool.js';
import { CreateTaskTool } from './tasks/CreateTaskTool.js';
import { UpdateTaskTool } from './tasks/UpdateTaskTool.js';
import { CompleteTaskTool } from './tasks/CompleteTaskTool.js';
import { DeleteTaskTool } from './tasks/DeleteTaskTool.js';
import { NextActionsTool } from './tasks/NextActionsTool.js';
import { BlockedTasksTool } from './tasks/BlockedTasksTool.js';
import { AvailableTasksTool } from './tasks/AvailableTasksTool.js';

// Import new consolidated task query tool
import { QueryTasksTool } from './tasks/QueryTasksTool.js';

// Import project tools
import { ListProjectsTool } from './projects/ListProjectsTool.js';
import { CreateProjectTool } from './projects/CreateProjectTool.js';
import { UpdateProjectTool } from './projects/UpdateProjectTool.js';
import { CompleteProjectTool } from './projects/CompleteProjectTool.js';
import { DeleteProjectTool } from './projects/DeleteProjectTool.js';

// Import folder tools
import { ListFoldersTool } from './folders/ListFoldersTool.js';
import { CreateFolderTool } from './folders/CreateFolderTool.js';
import { UpdateFolderTool } from './folders/UpdateFolderTool.js';
import { DeleteFolderTool } from './folders/DeleteFolderTool.js';
import { MoveFolderTool } from './folders/MoveFolderTool.js';

// Import new consolidated folder tools
import { ManageFolderTool } from './folders/ManageFolderTool.js';
import { QueryFoldersTool } from './folders/QueryFoldersTool.js';

// Import analytics tools
import { ProductivityStatsTool } from './analytics/ProductivityStatsTool.js';
import { TaskVelocityTool } from './analytics/TaskVelocityTool.js';
import { OverdueAnalysisTool } from './analytics/OverdueAnalysisTool.js';

// Import tag tools
import { ListTagsTool } from './tags/ListTagsTool.js';
import { ManageTagsTool } from './tags/ManageTagsTool.js';
import { GetActiveTagsTool } from './tags/GetActiveTagsTool.js';

// Import export tools
import { ExportTasksTool } from './export/ExportTasksTool.js';
import { ExportProjectsTool } from './export/ExportProjectsTool.js';
import { BulkExportTool } from './export/BulkExportTool.js';

// Batch operations removed - OmniFocus JXA API doesn't support bulk operations
// Individual operations work perfectly and are recommended for all workflows

// Import date range query tools
import { DateRangeQueryTool, OverdueTasksTool, UpcomingTasksTool } from './tasks/DateRangeQueryTool.js';

// Import recurring task tools
import { AnalyzeRecurringTasksTool } from './recurring/AnalyzeRecurringTasksTool.js';
import { GetRecurringPatternsTool } from './recurring/GetRecurringPatternsTool.js';

// Import system tools
import { GetVersionInfoTool } from './system/GetVersionInfoTool.js';

// Import diagnostic tools
import { RunDiagnosticsTool } from './diagnostic/RunDiagnosticsTool.js';

// Import review tools
import { ProjectsForReviewTool } from './reviews/ProjectsForReviewTool.js';
import { MarkProjectReviewedTool } from './reviews/MarkProjectReviewedTool.js';
import { SetReviewScheduleTool } from './reviews/SetReviewScheduleTool.js';

// Import new consolidated tools
import { ManageReviewsTool } from './reviews/ManageReviewsTool.js';
import { BatchTaskOperationsTool } from './tasks/BatchTaskOperationsTool.js';

const logger = createLogger('tools');

export async function registerTools(server: Server, cache: CacheManager): Promise<void> {
  // Initialize all tools
  const tools = [
    // New consolidated task query tool (recommended for all query operations)
    new QueryTasksTool(cache),
    
    // Task tools - Read operations (legacy tools - use query_tasks instead)
    new ListTasksTool(cache),          // Deprecated: use query_tasks with queryType: "list"
    new GetTaskCountTool(cache),
    new TodaysAgendaTool(cache),

    // Task tools - Write operations (now enabled with correct JXA syntax)
    new CreateTaskTool(cache),
    new UpdateTaskTool(cache),
    new CompleteTaskTool(cache),
    new DeleteTaskTool(cache),

    // Advanced status tools (legacy - use query_tasks instead)
    new NextActionsTool(cache),        // Deprecated: use query_tasks with queryType: "next_actions"
    new BlockedTasksTool(cache),       // Deprecated: use query_tasks with queryType: "blocked"
    new AvailableTasksTool(cache),     // Deprecated: use query_tasks with queryType: "available"

    // Batch operations removed due to OmniFocus JXA limitations
    // Use individual task operations which work perfectly

    // Date range query tools (legacy - use query_tasks instead)
    new DateRangeQueryTool(cache),     // For complex date range queries
    new OverdueTasksTool(cache),       // Deprecated: use query_tasks with queryType: "overdue"
    new UpcomingTasksTool(cache),      // Deprecated: use query_tasks with queryType: "upcoming"

    // Project tools
    new ListProjectsTool(cache),
    new CreateProjectTool(cache),
    new UpdateProjectTool(cache),
    new CompleteProjectTool(cache),
    new DeleteProjectTool(cache),

    // Folder tools - new consolidated tools (recommended)
    new ManageFolderTool(cache),
    new QueryFoldersTool(cache),

    // Legacy folder tools (deprecated but kept for backward compatibility)
    new ListFoldersTool(cache),
    new CreateFolderTool(cache),
    new UpdateFolderTool(cache),
    new DeleteFolderTool(cache),
    new MoveFolderTool(cache),

    // Analytics tools
    new ProductivityStatsTool(cache),
    new TaskVelocityTool(cache),
    new OverdueAnalysisTool(cache),

    // Tag tools
    new ListTagsTool(cache),
    new ManageTagsTool(cache),
    new GetActiveTagsTool(cache),

    // Export tools
    new ExportTasksTool(cache),
    new ExportProjectsTool(cache),
    new BulkExportTool(cache),

    // Recurring task tools
    new AnalyzeRecurringTasksTool(cache),
    new GetRecurringPatternsTool(cache),

    // System tools
    new GetVersionInfoTool(cache),
    
    // Diagnostic tools
    new RunDiagnosticsTool(cache),
    
    // New consolidated tools (recommended for better LLM usage)
    new ManageReviewsTool(cache),
    new BatchTaskOperationsTool(cache),
    
    // Legacy review tools (deprecated but kept for backward compatibility)
    new ProjectsForReviewTool(cache),    // Deprecated: use manage_reviews with operation: "list_for_review"
    new MarkProjectReviewedTool(cache),  // Deprecated: use manage_reviews with operation: "mark_reviewed"
    new SetReviewScheduleTool(cache),    // Deprecated: use manage_reviews with operation: "set_schedule"
  ];

  // Register handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    // Enhanced logging to debug parameter issues
    logger.info(`Executing tool: ${name}`, {
      rawArgs: args,
      argsType: typeof args,
      argsKeys: args ? Object.keys(args) : [],
      serializedArgs: JSON.stringify(args, null, 2),
    });

    // Special logging for update_task to debug date parameter issues
    if (name === 'update_task' && args) {
      logger.info('UpdateTask specific debug:', {
        taskId: args.taskId,
        dueDate: {
          provided: 'dueDate' in args,
          value: args.dueDate,
          type: typeof args.dueDate,
          isNull: args.dueDate === null,
          isUndefined: args.dueDate === undefined,
        },
        allParams: Object.entries(args).map(([key, value]) => ({
          key,
          value,
          type: typeof value,
          isNull: value === null,
          isUndefined: value === undefined,
        })),
      });
    }

    const result = await (tool as any).execute(args || {});

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

}
