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

const logger = createLogger('tools');

export async function registerTools(server: Server, cache: CacheManager): Promise<void> {
  // Initialize all tools
  const tools = [
    // Task tools - Read operations
    new ListTasksTool(cache),
    new GetTaskCountTool(cache),
    new TodaysAgendaTool(cache),

    // Task tools - Write operations (now enabled with correct JXA syntax)
    new CreateTaskTool(cache),
    new UpdateTaskTool(cache),
    new CompleteTaskTool(cache),
    new DeleteTaskTool(cache),

    // Advanced status tools
    new NextActionsTool(cache),
    new BlockedTasksTool(cache),
    new AvailableTasksTool(cache),

    // Batch operations removed due to OmniFocus JXA limitations
    // Use individual task operations which work perfectly

    // Date range query tools
    new DateRangeQueryTool(cache),
    new OverdueTasksTool(cache),
    new UpcomingTasksTool(cache),

    // Project tools
    new ListProjectsTool(cache),
    new CreateProjectTool(cache),
    new UpdateProjectTool(cache),
    new CompleteProjectTool(cache),
    new DeleteProjectTool(cache),

    // Folder tools
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
    
    // Review tools (GTD project review workflows)
    new ProjectsForReviewTool(cache),
    new MarkProjectReviewedTool(cache),
    new SetReviewScheduleTool(cache),
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
