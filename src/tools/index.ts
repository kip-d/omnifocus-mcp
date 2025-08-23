import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../cache/CacheManager.js';
import { createLogger } from '../utils/logger.js';

// Import task CRUD tools (still in active use)
import { CreateTaskTool } from './tasks/CreateTaskTool.js';
import { UpdateTaskTool } from './tasks/UpdateTaskTool.js';
import { CompleteTaskTool } from './tasks/CompleteTaskTool.js';
import { DeleteTaskTool } from './tasks/DeleteTaskTool.js';

// V1 legacy tools have been removed in v2.0.0

// Import v2.0.0 consolidated tools (alpha)
import { QueryTasksToolV2 } from './tasks/QueryTasksToolV2.js';
import { ProjectsToolV2 } from './projects/ProjectsToolV2.js';



// Import new consolidated folder tools
import { ManageFolderTool } from './folders/ManageFolderTool.js';
import { QueryFoldersTool } from './folders/QueryFoldersTool.js';


// Import v2 analytics tools
import { ProductivityStatsToolV2 } from './analytics/ProductivityStatsToolV2.js';
import { TaskVelocityToolV2 } from './analytics/TaskVelocityToolV2.js';
import { OverdueAnalysisToolV2 } from './analytics/OverdueAnalysisToolV2.js';

// Import tag tools
import { ListTagsTool } from './tags/ListTagsTool.js';
import { ManageTagsTool } from './tags/ManageTagsTool.js';
import { GetActiveTagsTool } from './tags/GetActiveTagsTool.js';

// Import export tools
import { ExportTasksTool } from './export/ExportTasksTool.js';
import { ExportProjectsTool } from './export/ExportProjectsTool.js';
import { BulkExportTool } from './export/BulkExportTool.js';

// Import recurring task tools
import { AnalyzeRecurringTasksTool } from './recurring/AnalyzeRecurringTasksTool.js';
import { GetRecurringPatternsTool } from './recurring/GetRecurringPatternsTool.js';


// Import system tools
import { GetVersionInfoTool } from './system/GetVersionInfoTool.js';

// Import diagnostic tools
import { RunDiagnosticsTool } from './diagnostic/RunDiagnosticsTool.js';

// LEGACY V1 REVIEW TOOLS - FROZEN
// V1 review tools removed - use ManageReviewsTool instead

// Import new consolidated tools
import { ManageReviewsTool } from './reviews/ManageReviewsTool.js';
import { BatchTaskOperationsTool } from './tasks/BatchTaskOperationsTool.js';

// Import perspective tools
import { ListPerspectivesTool } from './perspectives/ListPerspectivesTool.js';
import { QueryPerspectiveTool } from './perspectives/QueryPerspectiveTool.js';

const logger = createLogger('tools');

export async function registerTools(server: Server, cache: CacheManager): Promise<void> {
  // Check if legacy tools should be enabled
  logger.info('OmniFocus MCP v2.0.0 - Optimized tool set for reduced context usage');

  // Initialize tool arrays
  const v2Tools = [
    // v2.0.0 consolidated tools - STRONGLY RECOMMENDED
    new QueryTasksToolV2(cache),      // Single 'tasks' tool with modes
    new ProjectsToolV2(cache),         // Single 'projects' tool with operations
    
    // v2 analytics tools - Summary-first format
    new ProductivityStatsToolV2(cache), // 'productivity_stats' - GTD health metrics
    new TaskVelocityToolV2(cache),      // 'task_velocity' - Completion trends
    new OverdueAnalysisToolV2(cache),   // 'analyze_overdue' - Bottleneck analysis
  ];

  // Legacy tools have been completely removed in v2.0.0 for better performance
  // and reduced context window usage. All functionality is available through
  // the optimized V2 tool set.

  // Essential tools that are always included
  const essentialTools = [
    // Task write operations (no v2 consolidation yet)
    new CreateTaskTool(cache),
    new UpdateTaskTool(cache),
    new CompleteTaskTool(cache),
    new DeleteTaskTool(cache),

    // Consolidated tools (always included)
    new ManageFolderTool(cache),
    new QueryFoldersTool(cache),
    new ManageReviewsTool(cache),
    new BatchTaskOperationsTool(cache),

    // Analytics tools are in v2Tools, not needed here

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
    new RunDiagnosticsTool(cache),

    // Perspective tools
    new ListPerspectivesTool(cache),
    new QueryPerspectiveTool(cache),
  ];

  // Combine tools - legacy tools removed for better performance
  const tools = [
    ...v2Tools,
    ...essentialTools,
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
