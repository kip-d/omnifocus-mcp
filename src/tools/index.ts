import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../cache/CacheManager.js';
import {
  createLogger,
  createCorrelatedLogger,
  redactArgs,
  generateCorrelationId,
} from '../utils/logger.js';

// v3.0.0 Unified Builder API - 3 tools + system diagnostics
import { OmniFocusReadTool } from './unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from './unified/OmniFocusWriteTool.js';
import { OmniFocusAnalyzeTool } from './unified/OmniFocusAnalyzeTool.js';
import { SystemTool } from './system/SystemTool.js';

const logger = createLogger('tools');

// Interface for tools that support correlation context
interface CorrelationCapable {
  withCorrelation: (correlationId: string) => CorrelationCapable & {
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  };
}

// Base tool interface
interface Tool {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// Type guard to check if a tool supports correlation
function supportsCorrelation(tool: Tool): tool is Tool & CorrelationCapable {
  return 'withCorrelation' in tool &&
         typeof (tool as Tool & Record<string, unknown>).withCorrelation === 'function';
}

export function registerTools(server: Server, cache: CacheManager, pendingOperations?: Set<Promise<unknown>>): void {
  logger.info('OmniFocus MCP v3.0.0 - Unified Builder API: 4 tools (omnifocus_read, omnifocus_write, omnifocus_analyze, system)');

  // Unified Builder API + system diagnostics
  const tools: Tool[] = [
    new OmniFocusReadTool(cache),       // 'omnifocus_read' - Query tasks, projects, tags, perspectives, folders
    new OmniFocusWriteTool(cache),      // 'omnifocus_write' - Create, update, complete, delete operations
    new OmniFocusAnalyzeTool(cache),    // 'omnifocus_analyze' - All analytics and analysis operations
    new SystemTool(cache),            // 'system' - Version info and diagnostics
  ];

  // Register handlers
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: tools.map(t => {
        const toolDef: Record<string, unknown> = {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        };
        // Include meta fields if the tool provides them
        if ('meta' in t && t.meta) {
          toolDef.meta = (t as Record<string, unknown>).meta;
        }
        return toolDef;
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Generate correlation ID for this request
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    // Create correlated logger for this tool execution
    const correlatedLogger = createCorrelatedLogger(
      'tools',
      correlationId,
      name,
      name,
      {
        requestId: correlationId,
        toolName: name,
        startTime: startTime,
      },
    );

    const tool = tools.find(t => t.name === name);
    if (!tool) {
      correlatedLogger.error(`Tool not found: ${name}`);
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    // Enhanced logging with correlation ID
    correlatedLogger.info(`Executing tool: ${name}`);
    correlatedLogger.debug(`Args for ${name}:`, redactArgs({
      argsType: typeof args,
      argsKeys: args ? Object.keys(args as Record<string, unknown>) : [],
      args,
    }));

    // Create execution promise and track it to prevent premature server exit
    const executionPromise = (async () => {
      try {
        // Pass correlation context to the tool if it supports it
        let result: unknown;
        if (supportsCorrelation(tool)) {
          // Tool supports correlation context
          const correlatedTool = tool.withCorrelation(correlationId);
          result = await correlatedTool.execute(args || {});
        } else {
          // Standard tool execution
          result = await tool.execute(args || {});
        }

        // Log successful execution with timing
        const executionTime = Date.now() - startTime;
        correlatedLogger.info(`Tool execution completed: ${name}`, {
          executionTime,
          success: true,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Log execution failure with timing and correlation
        const executionTime = Date.now() - startTime;
        correlatedLogger.error(`Tool execution failed: ${name}`, {
          executionTime,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });

        // Convert to McpError to prevent uncaught exceptions from crashing the server
        // McpError is the only exception type the MCP SDK properly handles
        if (error instanceof McpError) {
          throw error;
        }

        // Wrap all other errors as McpError with InternalError code
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error),
        );
      }
    })();

    // Track tool execution to prevent premature server exit
    if (pendingOperations) {
      pendingOperations.add(executionPromise);
      correlatedLogger.debug(`Added tool execution to pending operations (size: ${pendingOperations.size})`);

      // Remove from pending operations when done (success or failure)
      executionPromise.finally(() => {
        pendingOperations.delete(executionPromise);
        correlatedLogger.debug(`Removed tool execution from pending operations (size: ${pendingOperations.size})`);
      });
    }

    return executionPromise;
  });

}
