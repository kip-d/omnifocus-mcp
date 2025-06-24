import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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

// Import project tools
import { ListProjectsTool } from './projects/ListProjectsTool.js';
import { CreateProjectTool } from './projects/CreateProjectTool.js';
import { UpdateProjectTool } from './projects/UpdateProjectTool.js';
import { CompleteProjectTool } from './projects/CompleteProjectTool.js';
import { DeleteProjectTool } from './projects/DeleteProjectTool.js';

// Import analytics tools
import { ProductivityStatsTool } from './analytics/ProductivityStatsTool.js';
import { TaskVelocityTool } from './analytics/TaskVelocityTool.js';
import { OverdueAnalysisTool } from './analytics/OverdueAnalysisTool.js';

// Import tag tools
import { ListTagsTool } from './tags/ListTagsTool.js';
import { ManageTagsTool } from './tags/ManageTagsTool.js';

// Import export tools
import { ExportTasksTool } from './export/ExportTasksTool.js';
import { ExportProjectsTool } from './export/ExportProjectsTool.js';
import { BulkExportTool } from './export/BulkExportTool.js';

// Import recurring task tools
import { AnalyzeRecurringTasksTool } from './recurring/AnalyzeRecurringTasksTool.js';
import { GetRecurringPatternsTool } from './recurring/GetRecurringPatternsTool.js';

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
    
    // Project tools
    new ListProjectsTool(cache),
    new CreateProjectTool(cache),
    new UpdateProjectTool(cache),
    new CompleteProjectTool(cache),
    new DeleteProjectTool(cache),
    
    // Analytics tools
    new ProductivityStatsTool(cache),
    new TaskVelocityTool(cache),
    new OverdueAnalysisTool(cache),
    
    // Tag tools
    new ListTagsTool(cache),
    new ManageTagsTool(cache),
    
    // Export tools
    new ExportTasksTool(cache),
    new ExportProjectsTool(cache),
    new BulkExportTool(cache),
    
    // Recurring task tools
    new AnalyzeRecurringTasksTool(cache),
    new GetRecurringPatternsTool(cache),
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
      throw new Error(`Tool not found: ${name}`);
    }
    
    logger.debug(`Executing tool: ${name}`, args);
    const result = await tool.execute(args || {});
    
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