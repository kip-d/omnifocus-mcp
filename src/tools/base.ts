import { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
// Remove conflicting import
// import { RobustOmniAutomation } from '../omnifocus/RobustOmniAutomation.js';
import { createLogger, Logger, redactArgs } from '../utils/logger.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createErrorResponseV2, OperationTimerV2, StandardResponseV2 } from '../utils/response-format.js';
import {
  ScriptErrorType,
  CategorizedScriptError,
  categorizeError,
  getErrorMessage,
  isRecoverableError,
  getErrorSeverity,
} from '../utils/error-taxonomy.js';
import {
  recordToolExecution,
  ToolExecutionMetrics,
} from '../utils/metrics.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ScriptResult, createScriptSuccess, createScriptError } from '../omnifocus/script-result-types.js';

// Type for raw data structure from OmniFocus scripts (used in execJson)
interface RawOmniFocusData {
  projects?: unknown[];
  tasks?: unknown[];
  tags?: unknown[];
  perspectives?: unknown[];
  summary?: unknown;
  metadata?: unknown;
  count?: number;
  error?: unknown;
  message?: string;
}

/**
 * Base class for all MCP tools with Zod schema validation
 * @template TSchema - The Zod schema type for input validation
 * @template TResponse - The response type returned by executeValidated (defaults to unknown for flexibility)
 */
export abstract class BaseTool<
  TSchema extends z.ZodType = z.ZodType,
  TResponse = unknown
> {
  private _omniAutomation: OmniAutomation;
  protected cache: CacheManager;
  protected logger: Logger;

  constructor(cache: CacheManager, private correlationId?: string) {
    this.cache = cache;
    this._omniAutomation = new OmniAutomation();

    // Create logger with correlation context if available
    if (correlationId) {
      this.logger = createLogger(this.constructor.name, { correlationId });
    } else {
      this.logger = createLogger(this.constructor.name);
    }
  }

  abstract name: string;
  abstract description: string;
  abstract schema: TSchema;

  // Optional meta fields for tool discovery and capability declaration
  abstract meta?: {
    category: 'Task Management' | 'Organization' | 'Analytics' | 'Utility' | 'Capture';
    stability: 'stable' | 'beta' | 'experimental';
    complexity: 'simple' | 'moderate' | 'complex';
    performanceClass: 'fast' | 'moderate' | 'slow';
    tags?: string[];
    capabilities?: string[];
  };

  /**
   * Get JSON Schema from Zod schema for MCP compatibility
   */
  get inputSchema(): Record<string, unknown> {
    // Convert Zod schema to JSON Schema format
    // For now, we'll use a simplified conversion
    // In production, consider using a library like zod-to-json-schema
    return this.zodToJsonSchema(this.schema);
  }

  /**
   * Simple Zod to JSON Schema converter
   * In production, use a proper library like zod-to-json-schema
   */
  private zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    // This is a simplified implementation
    // For full compatibility, use a library like zod-to-json-schema

    // Handle refinements (e.g., z.object().refine())
    if (schema instanceof z.ZodEffects) {
      // Extract the inner schema from refinement
      return this.zodToJsonSchema(schema._def.schema as z.ZodTypeAny);
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape as Record<string, z.ZodType>;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodTypeToJsonSchema(value as z.ZodTypeAny);

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
  private zodTypeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
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
        items: this.zodTypeToJsonSchema(schema._def.type as z.ZodTypeAny),
        description: schema.description,
      };
    }
    if (schema instanceof z.ZodOptional) {
      const result = this.zodTypeToJsonSchema(schema._def.innerType as z.ZodTypeAny);
      // Preserve the optional's description if it has one
      if (schema.description) {
        result.description = schema.description;
      }
      return result;
    }
    if (schema instanceof z.ZodUnion) {
      const options = schema._def.options as z.ZodTypeAny[];
      if (options.length === 2 && options.some((o: z.ZodTypeAny) => o instanceof z.ZodNull)) {
        // Handle nullable fields
        const nonNull = options.find((o: z.ZodTypeAny) => !(o instanceof z.ZodNull));
        if (nonNull) {
          const result = this.zodTypeToJsonSchema(nonNull);
          // Preserve the union's description if it has one
          if (schema.description) {
            result.description = schema.description;
          }
          return result;
        }
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
      return this.zodTypeToJsonSchema(schema._def.schema as z.ZodTypeAny);
    }
    if (schema instanceof z.ZodObject) {
      // Handle nested objects properly
      const shape = schema.shape as Record<string, z.ZodType>;
      const properties: Record<string, unknown> = {};
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

  /**
   * Execute the tool with validation and metrics collection
   */
  async execute(args: unknown): Promise<TResponse> {
    const startTime = Date.now();
    let errorType: string | undefined;
    let resultSize: number | undefined;

    try {
      // Validate input with Zod
      const validated = this.schema.parse(args) as z.infer<TSchema>;

      // Count parameters for metrics
      const parameterCount = typeof args === 'object' && args !== null
        ? Object.keys(args).length
        : 0;

      // Log the validated input
      this.logger.debug(`Executing ${this.name} with validated args:`, validated);

      // Execute the tool-specific logic
      const result = await this.executeValidated(validated);

      // Calculate result size for metrics (approximate JSON size)
      try {
        resultSize = JSON.stringify(result).length;
      } catch {
        resultSize = undefined; // Skip if result is not serializable
      }

      // Record successful execution metrics
      this.recordExecutionMetrics({
        toolName: this.name,
        executionTime: Date.now() - startTime,
        success: true,
        timestamp: startTime,
        correlationId: this.correlationId,
        resultSize,
        parameterCount,
      });

      return result;
    } catch (error) {

      if (error instanceof z.ZodError) {
        errorType = 'VALIDATION_ERROR';

        // Convert Zod errors to MCP errors with helpful messages
        const issues = error.issues.map(issue => {
          const path = issue.path.join('.');
          return `${path}: ${issue.message}`;
        }).join(', ');

        // Log validation failure for analysis
        this.logToolFailure(args, 'VALIDATION_ERROR', issues, error.issues);

        // Record validation error metrics
        this.recordExecutionMetrics({
          toolName: this.name,
          executionTime: Date.now() - startTime,
          success: false,
          errorType,
          timestamp: startTime,
          correlationId: this.correlationId,
          parameterCount: typeof args === 'object' && args !== null ? Object.keys(args).length : 0,
        });

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
        errorType = 'MCP_ERROR';

        // Record MCP error metrics
        this.recordExecutionMetrics({
          toolName: this.name,
          executionTime: Date.now() - startTime,
          success: false,
          errorType,
          timestamp: startTime,
          correlationId: this.correlationId,
          parameterCount: typeof args === 'object' && args !== null ? Object.keys(args).length : 0,
        });

        throw error;
      }

      // Categorize the error for metrics
      const categorizedError = categorizeError(error, this.name);
      errorType = categorizedError.errorType;

      // Log other failures for analysis
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logToolFailure(args, 'EXECUTION_ERROR', errorMessage, undefined, categorizedError);

      // Record execution error metrics
      this.recordExecutionMetrics({
        toolName: this.name,
        executionTime: Date.now() - startTime,
        success: false,
        errorType,
        timestamp: startTime,
        correlationId: this.correlationId,
        parameterCount: typeof args === 'object' && args !== null ? Object.keys(args).length : 0,
      });

      // Handle other errors - return standardized V2 error response
      return this.handleErrorV2<TResponse>(error) as TResponse;
    }
  }

  /**
   * Record execution metrics for this tool
   */
  private recordExecutionMetrics(metrics: ToolExecutionMetrics): void {
    try {
      recordToolExecution(metrics);
    } catch (error) {
      // Don't let metrics recording break tool execution
      this.logger.debug('Failed to record execution metrics:', error);
    }
  }

  /**
   * Log tool call failures for analysis and improvement with enhanced categorization
   */
  private logToolFailure(
    args: unknown,
    errorType: 'VALIDATION_ERROR' | 'EXECUTION_ERROR' | ScriptErrorType,
    errorMessage: string,
    validationErrors?: z.ZodIssue[],
    categorizedError?: CategorizedScriptError,
  ): void {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = join(homedir(), '.omnifocus-mcp', 'tool-failures');
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      // Create enhanced failure log entry with categorization
      const logEntry = {
        timestamp: new Date().toISOString(),
        tool: this.name,
        errorType,
        errorMessage,
        validationErrors,
        inputArgs: redactArgs(args),
        schemaDescription: this.description,
        // Enhanced categorization data
        categorization: categorizedError ? {
          errorType: categorizedError.errorType,
          severity: getErrorSeverity(categorizedError.errorType),
          recoverable: isRecoverableError(categorizedError.errorType),
          actionable: categorizedError.actionable,
          context: categorizedError.context,
        } : undefined,
      };

      // Append to daily log file
      const today = new Date().toISOString().split('T')[0];
      const logFile = join(logsDir, `failures-${today}.jsonl`);

      // Append as JSON Lines format for easy parsing
      writeFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });

      // Enhanced debug logging with categorization
      const severity = categorizedError ? getErrorSeverity(categorizedError.errorType) : 'unknown';
      this.logger.debug(`Tool failure logged: ${this.name} - ${errorType} [${severity}]`, {
        recoverable: categorizedError ? isRecoverableError(categorizedError.errorType) : undefined,
        actionable: categorizedError?.actionable,
      });
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
   * Create a new instance of this tool with correlation context
   */
  withCorrelation(correlationId: string): this {
    // Create a new instance of the same tool class with correlation ID
    const ctor = this.constructor as new (cache: CacheManager, correlationId?: string) => this;
    return new ctor(this.cache, correlationId);
  }


  get omniAutomation(): OmniAutomation {
    return this._omniAutomation;
  }

  set omniAutomation(value: OmniAutomation) {
    this._omniAutomation = value;
  }

  /**
   * Type-safe wrapper for script execution that returns ScriptResult<T>
   * Centralizes the logic from individual tool execJson helpers
   */
  protected async execJson<T = unknown>(script: string): Promise<ScriptResult<T>> {
    try {
      const omni = this.omniAutomation as { executeJson?: (script: string) => Promise<unknown>; execute?: (script: string) => Promise<unknown> };
      const res = typeof omni.executeJson === 'function'
        ? await omni.executeJson(script)
        : typeof omni.execute === 'function'
        ? await omni.execute(script)
        : null;

      // Handle null/undefined results
      if (res === null || res === undefined) {
        return createScriptError('NULL_RESULT', 'Script returned null or undefined');
      }

      // If already in ScriptResult format, inspect for nested legacy errors before returning
      if (res && typeof res === 'object' && 'success' in res) {
        const scriptResult = res as ScriptResult<T>;

        if (scriptResult.success === true) {
          const data = scriptResult.data as unknown;
          if (data && typeof data === 'object') {
            const maybeError = data as { error?: unknown; success?: unknown; message?: unknown };
            const errorValue = maybeError.error;
            if (errorValue === true || errorValue === 'true' || maybeError.success === false) {
              const message = typeof maybeError.message === 'string'
                ? maybeError.message
                : 'Script execution failed';
              return createScriptError(message, 'Legacy script error', data);
            }
          }
        }

        return scriptResult;
      }

      // Handle raw string results (try to parse JSON)
      if (typeof res === 'string') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const parsed = JSON.parse(res);

          if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            const errorValue = (parsed as { error?: unknown }).error;
            if (errorValue === true || errorValue === 'true') {
              const message = typeof (parsed as { message?: unknown }).message === 'string'
                ? (parsed as { message: string }).message
                : 'Script execution failed';
              return createScriptError(message, 'Legacy script error', parsed);
            }
          }

          if (parsed && typeof parsed === 'object' && 'success' in parsed && (parsed as { success?: unknown }).success === false) {
            const message = typeof (parsed as { message?: unknown }).message === 'string'
              ? (parsed as { message: string }).message
              : 'Script execution failed';
            const parsedRecord = parsed as Record<string, unknown>;
            const details: unknown = parsedRecord.details !== undefined ? parsedRecord.details : parsed;
            return createScriptError(message, 'Legacy script error', details);
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return createScriptSuccess<T>(parsed);
        } catch {
          return createScriptSuccess<T>(res as T);
        }
      }

      // Handle object responses that indicate success patterns
      if (res && typeof res === 'object') {
        const obj = res as RawOmniFocusData & { folders?: unknown[]; items?: unknown[]; ok?: boolean; updated?: number; success?: boolean; context?: unknown; details?: unknown };
        // Check for common success indicators
        if (Array.isArray(obj.folders) || Array.isArray(obj.items) ||
            obj.ok === true || typeof obj.updated === 'number' ||
            Array.isArray(obj.tasks) || Array.isArray(obj.projects)) {
          return createScriptSuccess<T>(obj as T);
        }
        // Check for explicit error indication
        if (obj.success === false || obj.error) {
          return createScriptError(
            (typeof obj.error === 'string' ? obj.error : obj.message) || 'Script execution failed',
            obj.context as string | undefined,
            obj.details,
          );
        }
      }

      // Default: wrap as success
      return createScriptSuccess<T>(res as T);
    } catch (error) {
      return createScriptError(
        error instanceof Error ? error.message : String(error),
        'Script execution exception',
        error,
      );
    }
  }


  /**
   * V2 error handler: enhanced categorization with V2 response format
   */
  protected handleErrorV2<T = unknown>(error: unknown): StandardResponseV2<T> {
    this.logger.error(`Error in ${this.name}:`, error);
    const timer = new OperationTimerV2();

    // Categorize the error using the enhanced taxonomy
    const categorizedError = categorizeError(error, this.name);

    // Log the failure with categorization information
    this.logToolFailure(
      {},
      categorizedError.errorType,
      categorizedError.message,
      undefined,
      categorizedError,
    );

    // Merge original error details with enhanced categorization
    const originalErrorDetails = categorizedError.originalError && typeof categorizedError.originalError === 'object' &&
      'details' in categorizedError.originalError && categorizedError.originalError.details ?
      categorizedError.originalError.details as Record<string, unknown> : {};

    // Return enhanced V2 error response with categorization
    return createErrorResponseV2<T>(
      this.name,
      categorizedError.errorType,
      categorizedError.message,
      getErrorMessage(categorizedError),
      {
        ...originalErrorDetails, // Preserve original error details (script, stderr, etc.)
        errorType: categorizedError.errorType,
        severity: getErrorSeverity(categorizedError.errorType),
        recoverable: isRecoverableError(categorizedError.errorType),
        actionable: categorizedError.actionable,
        recovery: categorizedError.recovery,
        context: categorizedError.context,
        originalError: categorizedError.originalError,
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
      const omniError = error as { details?: { script?: string; stderr?: string } }; // Type assertion for OmniAutomationError
      throw new McpError(
        ErrorCode.InternalError,
        error.message,
        {
          script: omniError.details?.script,
          stderr: omniError.details?.stderr,
        },
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'An unknown error occurred',
    );
  }

}
