import { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
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
import { recordToolExecution, ToolExecutionMetrics } from '../utils/metrics.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ScriptResult, createScriptSuccess, createScriptError } from '../omnifocus/script-result-types.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import { classifyErrorWithContext } from '../utils/error-recovery.js';

// Type for raw data structure from OmniFocus scripts (used in execJson)
interface RawOmniFocusData {
  projects?: unknown[];
  tasks?: unknown[];
  tags?: unknown[];
  perspectives?: unknown[];
  folders?: unknown[];
  items?: unknown[];
  summary?: unknown;
  metadata?: unknown;
  count?: number;
  ok?: boolean;
  updated?: number;
  success?: boolean;
  error?: unknown;
  message?: string;
  context?: unknown;
  details?: unknown;
}

/**
 * Legacy error format from older OmniFocus scripts.
 * Some scripts return { error: true, message: "..." } instead of ScriptResult.
 */
interface LegacyScriptError {
  error?: boolean | string;
  success?: boolean;
  message?: string;
  details?: unknown;
}

/**
 * Type guard: checks if an unknown value is a legacy script error object.
 * Matches objects with error flags (true/'true') or explicit success: false.
 */
export function isLegacyScriptError(value: unknown): value is LegacyScriptError {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return obj.error === true || obj.error === 'true' || obj.success === false;
}

/**
 * Safely extract error message from a legacy error object.
 */
export function getLegacyErrorMessage(error: LegacyScriptError): string {
  return typeof error.message === 'string' ? error.message : 'Script execution failed';
}

/**
 * Type guard: checks if an unknown value looks like a successful raw OmniFocus response
 * containing data arrays or success indicators.
 */
export function isRawSuccessResponse(value: unknown): value is RawOmniFocusData {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.folders) ||
    Array.isArray(obj.items) ||
    Array.isArray(obj.tasks) ||
    Array.isArray(obj.projects) ||
    obj.ok === true ||
    typeof obj.updated === 'number'
  );
}

/**
 * Base class for all MCP tools with Zod schema validation
 * @template TSchema - The Zod schema type for input validation
 * @template TResponse - The response type returned by executeValidated (defaults to unknown for flexibility)
 */
export abstract class BaseTool<TSchema extends z.ZodType = z.ZodType, TResponse = unknown> {
  private _omniAutomation: OmniAutomation;
  protected cache: CacheManager;
  protected logger: Logger;

  // Circuit breaker for OmniFocus connectivity
  private circuitBreaker: CircuitBreaker;

  constructor(
    cache: CacheManager,
    private correlationId?: string,
  ) {
    this.cache = cache;
    this._omniAutomation = new OmniAutomation();

    // Create logger with correlation context if available
    if (correlationId) {
      this.logger = createLogger(this.constructor.name, { correlationId });
    } else {
      this.logger = createLogger(this.constructor.name);
    }

    // Initialize circuit breaker with OmniFocus-specific configuration
    this.circuitBreaker = new CircuitBreaker({
      threshold: 3, // Open circuit after 3 consecutive failures
      timeout: 30000, // 30 seconds before attempting reset
      shouldCountError: (error) => {
        // Only count OmniFocus-specific errors toward circuit breaker threshold
        const errorMessage = String(error).toLowerCase();
        return (
          errorMessage.includes('not running') ||
          errorMessage.includes('not responding') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('-1743')
        ); // Permission error
      },
    });
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

  // MCP 2025-11-25 annotations - hints for LLM tool usage
  // See: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
  annotations?: {
    /** Human-readable title for the tool */
    title?: string;
    /** If true, the tool only reads data and has no side effects */
    readOnlyHint?: boolean;
    /** If true, the tool may perform destructive operations (delete, overwrite) */
    destructiveHint?: boolean;
    /** If true, calling the tool multiple times with same args has same effect as once */
    idempotentHint?: boolean;
    /** If true, the tool may interact with external systems beyond MCP server */
    openWorldHint?: boolean;
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

        // Check if field is required - need to unwrap effects/transformations
        if (!this.isOptionalField(value as z.ZodTypeAny)) {
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
   * Check if a Zod field is optional (unwrapping effects/transformations)
   */
  private isOptionalField(schema: z.ZodTypeAny): boolean {
    // Direct optional check
    if (schema instanceof z.ZodOptional) {
      return true;
    }

    // Unwrap ZodEffects (from .transform(), .refine(), etc.)
    if (schema instanceof z.ZodEffects) {
      return this.isOptionalField(schema._def.schema as z.ZodTypeAny);
    }

    // Unwrap ZodNullable
    // Type guard for schemas with innerType property
    if ('_def' in schema && schema._def && typeof schema._def === 'object' && 'innerType' in schema._def) {
      const defWithInnerType = schema._def as { innerType: z.ZodTypeAny };
      return this.isOptionalField(defWithInnerType.innerType);
    }

    // Check for nullable union (alternative form)
    if (schema instanceof z.ZodUnion) {
      const options = schema._def.options as z.ZodTypeAny[];
      // If it's a union with null, it's effectively optional
      if (options.some((o: z.ZodTypeAny) => o instanceof z.ZodNull)) {
        return true;
      }
    }

    return false;
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
    if (schema instanceof z.ZodDiscriminatedUnion) {
      // Handle discriminated unions (NESTED only - top-level breaks MCP)
      // Type the _def property properly
      const def = schema._def as {
        discriminator: string;
        options: z.ZodTypeAny[];
      };

      return {
        oneOf: def.options.map((option) => this.zodTypeToJsonSchema(option)),
        discriminator: {
          propertyName: def.discriminator,
        },
        description: schema.description,
      };
    }
    if (schema instanceof z.ZodObject) {
      // Handle nested objects properly
      const shape = schema.shape as Record<string, z.ZodType>;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodTypeToJsonSchema(value as z.ZodType);

        // Check if field is required - need to unwrap effects/transformations
        if (!this.isOptionalField(value)) {
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
      const parameterCount = typeof args === 'object' && args !== null ? Object.keys(args).length : 0;

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
        const issues = error.issues
          .map((issue) => {
            const path = issue.path.join('.');
            return `${path}: ${issue.message}`;
          })
          .join(', ');

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

        throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${issues}`, {
          validation_errors: error.issues,
        });
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
        categorization: categorizedError
          ? {
              errorType: categorizedError.errorType,
              severity: getErrorSeverity(categorizedError.errorType),
              recoverable: isRecoverableError(categorizedError.errorType),
              actionable: categorizedError.actionable,
              context: categorizedError.context,
            }
          : undefined,
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
   * Create an enhanced error response with recovery suggestions and technical details
   */
  protected createEnhancedErrorResponse(
    error: unknown,
    _operation: string,
    context: {
      toolName?: string;
      operationType?: string;
      inputSummary?: Record<string, unknown>;
    } = {},
  ): Error & { recovery_suggestions?: string[]; related_documentation?: string[] } {
    const enhancedError = new Error(error instanceof Error ? error.message : String(error)) as Error & {
      recovery_suggestions?: string[];
      related_documentation?: string[];
    };

    // Copy all properties from original error
    if (error instanceof Error) {
      Object.assign(enhancedError, error);
    }

    // Add enhanced context based on error type
    const errorMessage = String(error).toLowerCase();

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('-1743')) {
      enhancedError.recovery_suggestions = [
        'Grant OmniFocus automation permissions in System Settings',
        'Restart OmniFocus after granting permissions',
        'Ensure OmniFocus is not blocked by macOS privacy settings',
      ];
      enhancedError.related_documentation = ['https://docs.omnifocus.com/automation-permissions'];
    }

    // Timeout errors
    else if (errorMessage.includes('timeout')) {
      enhancedError.recovery_suggestions = [
        'Reduce the scope of your query',
        'Try again with smaller data sets',
        'Check system performance and available resources',
        'Restart OmniFocus if it becomes unresponsive',
      ];
    }

    // Connection errors
    else if (errorMessage.includes('connection') || errorMessage.includes('not running')) {
      enhancedError.recovery_suggestions = [
        'Ensure OmniFocus is running and responsive',
        'Close any blocking dialogs in OmniFocus',
        'Restart OmniFocus if needed',
        'Check Activity Monitor for OmniFocus process status',
      ];
    }

    // Circuit breaker errors
    else if (errorMessage.includes('circuit breaker')) {
      enhancedError.recovery_suggestions = [
        'Wait for the circuit breaker to reset automatically',
        'Check OmniFocus application status',
        'Restart OmniFocus to reset connectivity',
        'Reduce query complexity if failures persist',
      ];
    }

    // Add operation-specific context
    if (context.toolName || context.operationType) {
      const operationDetails = [];
      if (context.toolName) operationDetails.push(`Tool: ${context.toolName}`);
      if (context.operationType) operationDetails.push(`Operation: ${context.operationType}`);

      enhancedError.message += ` (${operationDetails.join(', ')})`;
    }

    return enhancedError;
  }

  /**
   * Execute an operation with retry logic for transient errors
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      isTransientError?: (error: unknown) => boolean;
      onRetry?: (attempt: number, error: unknown) => void;
    } = {},
  ): Promise<T> {
    const {
      maxRetries = 2,
      initialDelay = 200,
      maxDelay = 2000,
      isTransientError = (error) => {
        const errorMessage = String(error).toLowerCase();
        return (
          errorMessage.includes('timeout') ||
          errorMessage.includes('busy') ||
          errorMessage.includes('not responding') ||
          errorMessage.includes('temporarily unavailable')
        );
      },
      onRetry = (attempt, error) => {
        this.logger.warn(`Retry attempt ${attempt} for operation`, {
          error: error instanceof Error ? error.message : String(error),
          attempt,
        });
      },
    } = options;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry if this is the last attempt or error is not transient
        if (attempt > maxRetries || !isTransientError(error)) {
          throw error;
        }

        // Calculate exponential backoff delay
        const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);

        // Call onRetry callback
        onRetry(attempt, error);

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but makes TypeScript happy
    throw lastError;
  }

  /**
   * Type-safe wrapper for script execution that returns ScriptResult<T>
   * Centralizes the logic from individual tool execJson helpers
   * Now includes circuit breaker protection and error recovery
   */
  protected async execJson<T = unknown>(script: string): Promise<ScriptResult<T>> {
    // Extract the core execution logic for circuit breaker wrapping
    const executeCoreOperation = async (): Promise<ScriptResult<T>> => {
      try {
        const omni = this.omniAutomation as {
          executeJson?: (script: string) => Promise<unknown>;
          execute?: (script: string) => Promise<unknown>;
        };
        const res =
          typeof omni.executeJson === 'function'
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

          if (scriptResult.success === true && isLegacyScriptError(scriptResult.data)) {
            return createScriptError(
              getLegacyErrorMessage(scriptResult.data),
              'Legacy script error',
              scriptResult.data,
            );
          }

          return scriptResult;
        }

        // Handle raw string results (try to parse JSON)
        if (typeof res === 'string') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const parsed = JSON.parse(res);

            if (isLegacyScriptError(parsed)) {
              const details = parsed.details !== undefined ? parsed.details : parsed;
              return createScriptError(getLegacyErrorMessage(parsed), 'Legacy script error', details);
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            return createScriptSuccess<T>(parsed);
          } catch {
            return createScriptSuccess<T>(res as T);
          }
        }

        // Handle object responses that indicate success patterns
        if (isRawSuccessResponse(res)) {
          return createScriptSuccess<T>(res as T);
        }

        // Check for explicit error indication in object responses
        if (res && typeof res === 'object') {
          const obj = res as RawOmniFocusData;
          if (obj.success === false || obj.error) {
            return createScriptError(
              (typeof obj.error === 'string' ? obj.error : obj.message) || 'Script execution failed',
              typeof obj.context === 'string' ? obj.context : undefined,
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
    };

    // Execute the core operation
    const result = await executeCoreOperation();

    // Track failures for circuit breaker
    if (!result.success) {
      // Check if this error should count toward circuit breaker threshold
      const errorMessage = String(result.error || result.context || 'unknown error').toLowerCase();
      const shouldCountError =
        errorMessage.includes('not running') ||
        errorMessage.includes('not responding') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('-1743');

      if (shouldCountError) {
        // Record failure using the circuit breaker's public API
        this.circuitBreaker.recordFailureManually();
      }
    } else {
      // Reset on success
      this.circuitBreaker.reset();
    }

    // Check if circuit is open and this is a critical error
    const circuitState = this.circuitBreaker.getState();
    if (circuitState.isOpen && !result.success) {
      const context = classifyErrorWithContext(
        result.error || result.context || 'unknown',
        'OmniFocus script execution',
      );

      this.logger.error('Circuit breaker is open - OmniFocus connectivity issues detected', {
        error: result.error || result.context,
        circuit_state: circuitState,
        recovery_suggestions: context.recovery_suggestions,
        related_documentation: context.related_documentation,
      });
    }

    return result;
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
    this.logToolFailure({}, categorizedError.errorType, categorizedError.message, undefined, categorizedError);

    // Merge original error details with enhanced categorization
    const originalErrorDetails =
      categorizedError.originalError &&
      typeof categorizedError.originalError === 'object' &&
      'details' in categorizedError.originalError &&
      categorizedError.originalError.details
        ? (categorizedError.originalError.details as Record<string, unknown>)
        : {};

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
      throw new McpError(ErrorCode.InternalError, 'Not authorized to send Apple events to OmniFocus', {
        code: 'PERMISSION_DENIED',
        instructions: `To grant permissions:
1. You may see a permission dialog - click "OK" to grant access
2. Or manually grant permissions:
   - Open System Settings → Privacy & Security → Automation
   - Find the app using this MCP server (Claude Desktop, Terminal, etc.)
   - Enable the checkbox next to OmniFocus
3. After granting permissions, try your request again`,
      });
    }

    if (error instanceof Error && error.name === 'OmniAutomationError') {
      const omniError = error as { details?: { script?: string; stderr?: string } }; // Type assertion for OmniAutomationError
      throw new McpError(ErrorCode.InternalError, error.message, {
        script: omniError.details?.script,
        stderr: omniError.details?.stderr,
      });
    }

    throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'An unknown error occurred');
  }
}
