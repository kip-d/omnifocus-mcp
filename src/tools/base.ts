import { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
// import { RobustOmniAutomation } from '../omnifocus/RobustOmniAutomation.js';
import { createLogger, Logger } from '../utils/logger.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createErrorResponse, OperationTimer, StandardResponse } from '../utils/response-format.js';
import {
  permissionError,
  formatErrorWithRecovery,
  scriptTimeoutError,
  omniFocusNotRunningError,
  scriptExecutionError,
} from '../utils/error-messages.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Base class for all MCP tools with Zod schema validation
 * @template TSchema - The Zod schema type for input validation
 * @template TResponse - The response type returned by executeValidated (defaults to unknown for flexibility)
 */
export abstract class BaseTool<
  TSchema extends z.ZodType = z.ZodType,
  TResponse = StandardResponse<unknown> | unknown
> {
  protected omniAutomation: OmniAutomation;
  protected cache: CacheManager;
  protected logger: Logger;

  constructor(cache: CacheManager) {
    this.cache = cache;
    this.omniAutomation = new OmniAutomation();
    this.logger = createLogger(this.constructor.name);
  }

  abstract name: string;
  abstract description: string;
  abstract schema: TSchema;

  /**
   * Get JSON Schema from Zod schema for MCP compatibility
   */
  get inputSchema(): any {
    // Convert Zod schema to JSON Schema format
    // For now, we'll use a simplified conversion
    // In production, consider using a library like zod-to-json-schema
    return this.zodToJsonSchema(this.schema);
  }

  /**
   * Execute the tool with validation
   */
  async execute(args: unknown): Promise<TResponse> {
    try {
      // Validate input with Zod
      const validated = this.schema.parse(args);

      // Log the validated input
      this.logger.debug(`Executing ${this.name} with validated args:`, validated);

      // Execute the tool-specific logic
      return await this.executeValidated(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Convert Zod errors to MCP errors with helpful messages
        const issues = error.issues.map(issue => {
          const path = issue.path.join('.');
          return `${path}: ${issue.message}`;
        }).join(', ');

        // Log validation failure for analysis
        this.logToolFailure(args, 'VALIDATION_ERROR', issues, error.issues);

        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid parameters: ${issues}`,
          {
            validation_errors: error.issues,
          },
        );
      }

      // Log other failures for analysis
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logToolFailure(args, 'EXECUTION_ERROR', errorMessage);

      // Handle other errors - return standardized error response
      return this.handleError(error) as TResponse;
    }
  }

  /**
   * Log tool call failures for analysis and improvement
   */
  private logToolFailure(
    args: unknown,
    errorType: 'VALIDATION_ERROR' | 'EXECUTION_ERROR',
    errorMessage: string,
    validationErrors?: any
  ): void {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = join(homedir(), '.omnifocus-mcp', 'tool-failures');
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      // Create failure log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        tool: this.name,
        errorType,
        errorMessage,
        validationErrors,
        inputArgs: args,
        // Add schema information to help understand what was expected
        schemaDescription: this.description,
      };

      // Append to daily log file
      const today = new Date().toISOString().split('T')[0];
      const logFile = join(logsDir, `failures-${today}.jsonl`);
      
      // Append as JSON Lines format for easy parsing
      writeFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
      
      // Also log to debug for immediate visibility
      this.logger.debug(`Tool failure logged: ${this.name} - ${errorType}`);
    } catch (logError) {
      // Don't let logging failures break the tool
      this.logger.error('Failed to log tool failure:', logError);
    }
  }

  /**
   * Execute the tool with validated arguments
   * Returns the response type specified by the tool implementation
   */
  protected abstract executeValidated(args: z.infer<TSchema>): Promise<TResponse>;

  /**
   * Handle errors consistently across all tools
   * Returns a standardized error response instead of throwing
   */
  protected handleError(error: unknown): StandardResponse<unknown> {
    this.logger.error(`Error in ${this.name}:`, error);
    const timer = new OperationTimer();

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorString = errorMessage.toLowerCase();

    // Check for permission errors
    if (errorString.includes('-1743') || errorString.includes('not allowed') || errorString.includes('authorization')) {
      const errorDetails = permissionError(this.name);
      return createErrorResponse(
        this.name,
        'PERMISSION_DENIED',
        errorDetails.message,
        {
          recovery: errorDetails.recovery,
          formatted: formatErrorWithRecovery(errorDetails),
        },
        timer.toMetadata(),
      );
    }

    // Check for timeout errors
    if (errorString.includes('timeout') || errorString.includes('timed out')) {
      const errorDetails = scriptTimeoutError(this.name);
      return createErrorResponse(
        this.name,
        'SCRIPT_TIMEOUT',
        errorDetails.message,
        {
          recovery: errorDetails.recovery,
          formatted: formatErrorWithRecovery(errorDetails),
        },
        timer.toMetadata(),
      );
    }

    // Check if OmniFocus is not running
    if (errorString.includes('not running') || errorString.includes('can\'t find process')) {
      const errorDetails = omniFocusNotRunningError(this.name);
      return createErrorResponse(
        this.name,
        'OMNIFOCUS_NOT_RUNNING',
        errorDetails.message,
        {
          recovery: errorDetails.recovery,
          formatted: formatErrorWithRecovery(errorDetails),
        },
        timer.toMetadata(),
      );
    }

    // OmniAutomation specific errors
    if (error instanceof Error && error.name === 'OmniAutomationError') {
      const errorDetails = scriptExecutionError(
        this.name,
        error.message || 'Script execution failed',
        'Check that OmniFocus is not showing any dialogs',
      );
      return createErrorResponse(
        this.name,
        'OMNIFOCUS_ERROR',
        errorDetails.message,
        {
          script: (error as any).script,
          stderr: (error as any).stderr,
          recovery: errorDetails.recovery,
          formatted: formatErrorWithRecovery(errorDetails),
        },
        timer.toMetadata(),
      );
    }

    // Generic error handling with improved suggestions
    return createErrorResponse(
      this.name,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unknown error occurred',
      {
        originalError: error,
        recovery: [
          'Try the operation again',
          'Check that OmniFocus is running and responsive',
          'Verify your parameters are correct',
          'If the issue persists, restart OmniFocus',
        ],
      },
      timer.toMetadata(),
    );
  }

  /**
   * Throw an MCP error for cases where we need to break execution flow
   * Use this sparingly - prefer returning handleError() for consistent response format
   */
  protected throwMcpError(error: unknown): never {
    this.logger.error(`Throwing MCP error in ${this.name}:`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('-1743') || errorMessage.includes('not allowed')) {
      throw new McpError(
        ErrorCode.InternalError,
        'Not authorized to send Apple events to OmniFocus',
        {
          code: 'PERMISSION_DENIED',
          instructions: `To grant permissions:
1. You may see a permission dialog - click "OK" to grant access
2. Or manually grant permissions:
   - Open System Settings → Privacy & Security → Automation
   - Find the app using this MCP server (Claude Desktop, Terminal, etc.)
   - Enable the checkbox next to OmniFocus
3. After granting permissions, try your request again`,
        },
      );
    }

    if (error instanceof Error && error.name === 'OmniAutomationError') {
      throw new McpError(
        ErrorCode.InternalError,
        error.message,
        {
          script: (error as any).script,
          stderr: (error as any).stderr,
        },
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'An unknown error occurred',
    );
  }

  /**
   * Simple Zod to JSON Schema converter
   * In production, use a proper library like zod-to-json-schema
   */
  private zodToJsonSchema(schema: z.ZodType): any {
    // This is a simplified implementation
    // For full compatibility, use a library like zod-to-json-schema

    // Handle refinements (e.g., z.object().refine())
    if (schema instanceof z.ZodEffects) {
      // Extract the inner schema from refinement
      return this.zodToJsonSchema(schema._def.schema);
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodTypeToJsonSchema(value as z.ZodType);

        // Check if field is required
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    return { type: 'object', properties: {} };
  }

  /**
   * Convert individual Zod types to JSON Schema
   */
  private zodTypeToJsonSchema(schema: z.ZodType): any {
    if (schema instanceof z.ZodString) {
      return { type: 'string', description: schema.description };
    }
    if (schema instanceof z.ZodNumber) {
      return { type: 'number', description: schema.description };
    }
    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean', description: schema.description };
    }
    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodTypeToJsonSchema(schema._def.type),
        description: schema.description,
      };
    }
    if (schema instanceof z.ZodOptional) {
      const result = this.zodTypeToJsonSchema(schema._def.innerType);
      // Preserve the optional's description if it has one
      if (schema.description) {
        result.description = schema.description;
      }
      return result;
    }
    if (schema instanceof z.ZodUnion) {
      const options = schema._def.options;
      if (options.length === 2 && options.some((o: any) => o instanceof z.ZodNull)) {
        // Handle nullable fields
        const nonNull = options.find((o: any) => !(o instanceof z.ZodNull));
        const result = this.zodTypeToJsonSchema(nonNull);
        // Preserve the union's description if it has one
        if (schema.description) {
          result.description = schema.description;
        }
        return result;
      }
    }
    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema._def.values,
        description: schema.description,
      };
    }
    if (schema instanceof z.ZodLiteral) {
      return {
        type: typeof schema._def.value,
        const: schema._def.value,
        description: schema.description,
      };
    }
    if (schema instanceof z.ZodEffects) {
      // Handle refinements
      return this.zodTypeToJsonSchema(schema._def.schema);
    }
    if (schema instanceof z.ZodObject) {
      // Handle nested objects properly
      const shape = schema.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodTypeToJsonSchema(value as z.ZodType);

        // Check if field is required in nested object
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        description: schema.description,
      };
    }

    // Default fallback
    return { type: 'string', description: schema.description };
  }
}
