import { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
// import { RobustOmniAutomation } from '../omnifocus/RobustOmniAutomation.js';
import { createLogger, Logger, redactArgs } from '../utils/logger.js';
import { zodToJsonSchema as toJsonSchema } from 'zod-to-json-schema';
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
  private _omniAutomation: any;
  protected cache: CacheManager;
  protected logger: Logger;

  constructor(cache: CacheManager) {
    this.cache = cache;
    this._omniAutomation = new OmniAutomation();
    this.applyExecuteJsonShim(this._omniAutomation);
    this.logger = createLogger(this.constructor.name);
  }

  abstract name: string;
  abstract description: string;
  abstract schema: TSchema;

  /**
   * Get JSON Schema from Zod schema for MCP compatibility
   */
  get inputSchema(): any {
    // Use proper converter for accurate JSON Schema output
    // Avoid $ref for smaller, self-contained schemas (MCP-friendly)
    // Generate a flat JSON Schema object (no $ref/definitions) for MCP
    const schema: any = toJsonSchema(this.schema as any, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
      effectStrategy: 'input',
    });

    // Post-process to improve MCP compatibility:
    // 1) Collapse union types that include null (e.g., ["string","null"]) to just the base type
    // 2) Treat defaulted fields as required so clients know they are accepted at the top level
    const normalize = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj.type) && obj.type.includes('null')) {
        // Prefer the first non-null primitive if available
        const nonNull = obj.type.find((t: any) => t !== 'null');
        if (nonNull) obj.type = nonNull;
      }

      // Recurse into nested schemas
      if (obj.properties) {
        for (const key of Object.keys(obj.properties)) {
          normalize(obj.properties[key]);
        }
      }
      if (obj.items) normalize(obj.items);
      if (obj.anyOf) obj.anyOf.forEach((n: any) => normalize(n));
      if (obj.oneOf) obj.oneOf.forEach((n: any) => normalize(n));
      if (obj.allOf) obj.allOf.forEach((n: any) => normalize(n));
    };

    normalize(schema);

    // Ensure defaulted top-level properties are marked as required
    if (schema && schema.type === 'object' && schema.properties) {
      schema.required = schema.required || [];
      for (const [prop, def] of Object.entries<any>(schema.properties)) {
        if (def && Object.prototype.hasOwnProperty.call(def, 'default')) {
          if (!schema.required.includes(prop)) schema.required.push(prop);
        }
      }
    }

    return schema;
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

      // Re-throw McpErrors directly (from throwMcpError calls)
      if (error instanceof McpError) {
        throw error;
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
    validationErrors?: any,
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
        inputArgs: redactArgs(args),
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
   * Provide a fallback executeJson when tests inject a mock with only `execute`.
   */
  protected applyExecuteJsonShim(anyOmni: any): void {
    if (anyOmni && typeof anyOmni.executeJson !== 'function' && typeof anyOmni.execute === 'function') {
      anyOmni.executeJson = async (script: string, schema?: any) => {
        let raw = await anyOmni.execute(script);
        if (typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch { /* leave as string */ }
        }
        if (schema && typeof schema.safeParse === 'function') {
          let candidate = raw;
          let parsed = schema.safeParse(candidate);
          if (!parsed.success && raw && typeof raw === 'object') {
            // Legacy mapping: {projects|tasks: [...], summary?, metadata?} -> {items, summary, metadata}
            const obj: any = raw;
            if (Array.isArray(obj.projects) || Array.isArray(obj.tasks) || Array.isArray(obj.tags) || Array.isArray(obj.perspectives)) {
              candidate = {
                items: Array.isArray(obj.projects)
                  ? obj.projects
                  : Array.isArray(obj.tasks)
                    ? obj.tasks
                    : Array.isArray(obj.tags)
                      ? obj.tags
                      : obj.perspectives,
                summary: obj.summary,
                metadata: obj.metadata ?? (typeof obj.count === 'number' ? { count: obj.count } : undefined),
              };
              parsed = schema.safeParse(candidate);
            }
          }
          if (parsed.success) {
            return { success: true, data: parsed.data };
          }
          let errMsg = 'Script result validation failed';
          if (raw && typeof raw === 'object' && (raw as any).error && typeof (raw as any).message === 'string') {
            errMsg = (raw as any).message;
          }
          if (raw == null) {
            errMsg = 'NULL_RESULT';
          }
          return { success: false, error: errMsg, details: { errors: parsed.error.issues } };
        }
        return { success: true, data: raw };
      };
    }
  }

  get omniAutomation(): any {
    // Always ensure shim exists when accessed
    this.applyExecuteJsonShim(this._omniAutomation);
    return this._omniAutomation;
  }

  set omniAutomation(value: any) {
    this._omniAutomation = value;
    this.applyExecuteJsonShim(this._omniAutomation);
  }

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

}
