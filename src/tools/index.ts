import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../cache/CacheManager.js';
import { createLogger } from '../utils/logger.js';

// Import task CRUD tools (still in active use)
import { CreateTaskTool } from './tasks/CreateTaskTool.js';
import { UpdateTaskTool } from './tasks/UpdateTaskTool.js';
import { CompleteTaskTool } from './tasks/CompleteTaskTool.js';
import { DeleteTaskTool } from './tasks/DeleteTaskTool.js';

// ============================================================================
// LEGACY V1 TOOLS - FROZEN - DO NOT MODIFY
// These imports are from the legacy-v1 directory and should NEVER be changed
// ============================================================================
import { ListTasksTool } from './legacy-v1/tasks/ListTasksTool.js';
import { GetTaskCountTool } from './legacy-v1/tasks/GetTaskCountTool.js';
import { TodaysAgendaTool } from './legacy-v1/tasks/TodaysAgendaTool.js';
import { NextActionsTool } from './legacy-v1/tasks/NextActionsTool.js';
import { BlockedTasksTool } from './legacy-v1/tasks/BlockedTasksTool.js';
import { AvailableTasksTool } from './legacy-v1/tasks/AvailableTasksTool.js';
import { QueryTasksTool } from './legacy-v1/tasks/QueryTasksTool.js';

// Import v2.0.0 consolidated tools (alpha)
import { QueryTasksToolV2 } from './tasks/QueryTasksToolV2.js';
import { ProjectsToolV2 } from './projects/ProjectsToolV2.js';

// LEGACY V1 PROJECT TOOLS - FROZEN
import { ListProjectsTool } from './legacy-v1/projects/ListProjectsTool.js';
import { CreateProjectTool } from './legacy-v1/projects/CreateProjectTool.js';
import { UpdateProjectTool } from './legacy-v1/projects/UpdateProjectTool.js';
import { CompleteProjectTool } from './legacy-v1/projects/CompleteProjectTool.js';
import { DeleteProjectTool } from './legacy-v1/projects/DeleteProjectTool.js';

// LEGACY V1 FOLDER TOOLS - FROZEN
import { ListFoldersTool } from './legacy-v1/folders/ListFoldersTool.js';
import { CreateFolderTool } from './legacy-v1/folders/CreateFolderTool.js';
import { UpdateFolderTool } from './legacy-v1/folders/UpdateFolderTool.js';
import { DeleteFolderTool } from './legacy-v1/folders/DeleteFolderTool.js';
import { MoveFolderTool } from './legacy-v1/folders/MoveFolderTool.js';

// Import new consolidated folder tools
import { ManageFolderTool } from './folders/ManageFolderTool.js';
import { QueryFoldersTool } from './folders/QueryFoldersTool.js';

// LEGACY V1 ANALYTICS TOOLS - FROZEN
import { ProductivityStatsTool } from './legacy-v1/analytics/ProductivityStatsTool.js';
import { TaskVelocityTool } from './legacy-v1/analytics/TaskVelocityTool.js';
import { OverdueAnalysisTool } from './legacy-v1/analytics/OverdueAnalysisTool.js';

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

// Batch operations removed - OmniFocus JXA API doesn't support bulk operations
// Individual operations work perfectly and are recommended for all workflows

// Import date range query tools
// LEGACY V1 DATE RANGE TOOLS - FROZEN
import { DateRangeQueryTool, OverdueTasksTool, UpcomingTasksTool } from './legacy-v1/tasks/DateRangeQueryTool.js';

// Import recurring task tools
import { AnalyzeRecurringTasksTool } from './recurring/AnalyzeRecurringTasksTool.js';
import { GetRecurringPatternsTool } from './recurring/GetRecurringPatternsTool.js';

// Import system tools
import { GetVersionInfoTool } from './system/GetVersionInfoTool.js';

// Import diagnostic tools
import { RunDiagnosticsTool } from './diagnostic/RunDiagnosticsTool.js';

// LEGACY V1 REVIEW TOOLS - FROZEN
import { ProjectsForReviewTool } from './legacy-v1/reviews/ProjectsForReviewTool.js';
import { MarkProjectReviewedTool } from './legacy-v1/reviews/MarkProjectReviewedTool.js';
import { SetReviewScheduleTool } from './legacy-v1/reviews/SetReviewScheduleTool.js';

// Import new consolidated tools
import { ManageReviewsTool } from './reviews/ManageReviewsTool.js';
import { BatchTaskOperationsTool } from './tasks/BatchTaskOperationsTool.js';

// Import perspective tools
import { ListPerspectivesTool } from './perspectives/ListPerspectivesTool.js';
import { QueryPerspectiveTool } from './perspectives/QueryPerspectiveTool.js';

const logger = createLogger('tools');

export async function registerTools(server: Server, cache: CacheManager): Promise<void> {
  // Check if legacy tools should be enabled
  const enableLegacyTools = process.env.OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS === 'true';
  
  if (!enableLegacyTools) {
    logger.info('Using v2.0.0 consolidated tools only. Set OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS=true to enable legacy tools.');
  } else {
    logger.warn('Legacy tools enabled for backward compatibility. Consider migrating to v2 tools.');
  }

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

  const legacyTools = [
    // ============================================================================
    // LEGACY V1 TOOLS - FROZEN - DO NOT MODIFY
    // These tools are preserved for backward compatibility only.
    // They are loaded from src/tools/legacy-v1/ and should NEVER be edited.
    // All new development must use V2 tools.
    // Only enabled when OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS=true
    // ============================================================================
    
    // Consolidated task query tool (deprecated - use 'tasks' tool instead)
    new QueryTasksTool(cache),

    // Task tools - Read operations (deprecated - use 'tasks' tool instead)
    new ListTasksTool(cache),          // Deprecated: use 'tasks' tool with mode: "list"
    new GetTaskCountTool(cache),       // Deprecated: use 'tasks' tool with mode: "count"
    new TodaysAgendaTool(cache),       // Deprecated: use 'tasks' tool with mode: "today"

    // Task tools - Write operations (now enabled with correct JXA syntax)
    new CreateTaskTool(cache),
    new UpdateTaskTool(cache),
    new CompleteTaskTool(cache),
    new DeleteTaskTool(cache),

    // Advanced status tools (deprecated - use 'tasks' tool instead)
    new NextActionsTool(cache),        // Deprecated: use 'tasks' tool with mode: "next_actions"
    new BlockedTasksTool(cache),       // Deprecated: use 'tasks' tool with mode: "blocked"
    new AvailableTasksTool(cache),     // Deprecated: use 'tasks' tool with mode: "available"

    // Batch operations removed due to OmniFocus JXA limitations
    // Use individual task operations which work perfectly

    // Date range query tools (deprecated - use 'tasks' tool instead)
    new DateRangeQueryTool(cache),     // Deprecated: use 'tasks' tool with mode: "date_range"
    new OverdueTasksTool(cache),       // Deprecated: use 'tasks' tool with mode: "overdue"
    new UpcomingTasksTool(cache),      // Deprecated: use 'tasks' tool with mode: "upcoming"

    // Project tools (deprecated - use 'projects' tool instead)
    new ListProjectsTool(cache),       // Deprecated: use 'projects' tool with operation: "list"
    new CreateProjectTool(cache),      // Deprecated: use 'projects' tool with operation: "create"
    new UpdateProjectTool(cache),      // Deprecated: use 'projects' tool with operation: "update"
    new CompleteProjectTool(cache),    // Deprecated: use 'projects' tool with operation: "complete"
    new DeleteProjectTool(cache),      // Deprecated: use 'projects' tool with operation: "delete"

    // Folder tools - new consolidated tools (recommended)
    new ManageFolderTool(cache),
    new QueryFoldersTool(cache),

    // Legacy folder tools (deprecated - use manage_folder and query_folders instead)
    new ListFoldersTool(cache),        // Deprecated: use query_folders with operation: "list"
    new CreateFolderTool(cache),       // Deprecated: use manage_folder with operation: "create"
    new UpdateFolderTool(cache),       // Deprecated: use manage_folder with operation: "update"
    new DeleteFolderTool(cache),       // Deprecated: use manage_folder with operation: "delete"
    new MoveFolderTool(cache),         // Deprecated: use manage_folder with operation: "move"

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

    // Perspective tools - NEW! Access user perspectives
    new ListPerspectivesTool(cache),
    new QueryPerspectiveTool(cache),

    // Legacy review tools (deprecated - use manage_reviews instead)
    new ProjectsForReviewTool(cache),    // Deprecated: use manage_reviews with operation: "list_for_review"
    new MarkProjectReviewedTool(cache),  // Deprecated: use manage_reviews with operation: "mark_reviewed"
    new SetReviewScheduleTool(cache),    // Deprecated: use manage_reviews with operation: "set_schedule"
  ];

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
    new RunDiagnosticsTool(cache),

    // Perspective tools
    new ListPerspectivesTool(cache),
    new QueryPerspectiveTool(cache),
  ];

  // Combine tools based on configuration
  const tools = [
    ...v2Tools,
    ...essentialTools,
    ...(enableLegacyTools ? legacyTools : []),
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
