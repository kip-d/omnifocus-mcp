import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../cache/CacheManager.js';
import { createLogger } from '../utils/logger.js';

// Import v2.0.0 CONSOLIDATED tools (reduced from 22 to 14 tools)

// Task operations - Consolidated
import { QueryTasksToolV2 } from './tasks/QueryTasksToolV2.js';
import { ManageTaskTool } from './tasks/ManageTaskTool.js';

// Project operations - Already consolidated
import { ProjectsToolV2 } from './projects/ProjectsToolV2.js';

// Folder operations - Consolidated
import { FoldersTool } from './folders/FoldersTool.js';

// Tag operations - Already consolidated
import { TagsToolV2 } from './tags/TagsToolV2.js';

// Export operations - Consolidated
import { ExportTool } from './export/ExportTool.js';

// Recurring task operations - Consolidated
import { RecurringTasksTool } from './recurring/RecurringTasksTool.js';

// Analytics tools - Keep separate for clarity
import { ProductivityStatsToolV2 } from './analytics/ProductivityStatsToolV2.js';
import { TaskVelocityToolV2 } from './analytics/TaskVelocityToolV2.js';
import { OverdueAnalysisToolV2 } from './analytics/OverdueAnalysisToolV2.js';
import { LifeAnalysisTool } from './analytics/LifeAnalysisTool.js';
import { PatternAnalysisTool } from './analytics/PatternAnalysisTool.js';

// Review operations - Already consolidated
import { ManageReviewsTool } from './reviews/ManageReviewsTool.js';

// Perspective operations - Already consolidated
import { PerspectivesToolV2 } from './perspectives/PerspectivesToolV2.js';

// System operations - Already consolidated
import { SystemToolV2 } from './system/SystemToolV2.js';

const logger = createLogger('tools');

export async function registerTools(server: Server, cache: CacheManager): Promise<void> {
  logger.info('OmniFocus MCP v2.0.0 - CONSOLIDATED tool set (14 tools, reduced from 22)');

  // All tools are now consolidated for optimal LLM usage
  const tools = [
    // Task operations (2 tools)
    new QueryTasksToolV2(cache),        // 'tasks' - Query/search tasks
    new ManageTaskTool(cache),          // 'manage_task' - Create/update/complete/delete tasks

    // Project operations (1 tool)
    new ProjectsToolV2(cache),           // 'projects' - All project operations

    // Organization (3 tools)
    new FoldersTool(cache),             // 'folders' - All folder operations
    new TagsToolV2(cache),              // 'tags' - All tag operations
    new ManageReviewsTool(cache),       // 'manage_reviews' - Project review operations

    // Analytics (5 tools - kept separate for clarity)
    new ProductivityStatsToolV2(cache), // 'productivity_stats' - GTD health metrics
    new TaskVelocityToolV2(cache),      // 'task_velocity' - Completion trends
    new OverdueAnalysisToolV2(cache),   // 'analyze_overdue' - Bottleneck analysis
    new LifeAnalysisTool(cache),        // 'life_analysis' - Deep dataset analysis
    new PatternAnalysisTool(cache),     // 'pattern_analysis' - Database-wide pattern detection

    // Utility operations (4 tools)
    new ExportTool(cache),              // 'export' - All export operations
    new RecurringTasksTool(cache),      // 'recurring_tasks' - Recurring task analysis
    new PerspectivesToolV2(cache),      // 'perspectives' - Perspective operations
    new SystemToolV2(cache),            // 'system' - Version & diagnostics
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
