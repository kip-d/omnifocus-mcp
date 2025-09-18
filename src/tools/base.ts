import { z } from 'zod';
import { CacheManager } from '../cache/CacheManager.js';
import { OmniAutomation } from '../omnifocus/OmniAutomation.js';
// Remove conflicting import
// import { RobustOmniAutomation } from '../omnifocus/RobustOmniAutomation.js';
import { createLogger, Logger, redactArgs } from '../utils/logger.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createErrorResponse, OperationTimer, StandardResponse } from '../utils/response-format.js';
import { createErrorResponseV2, OperationTimerV2 } from '../utils/response-format-v2.js';
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
import { ScriptResult, createScriptSuccess, createScriptError } from '../omnifocus/script-result-types.js';

// Type definitions for shim logic
type ExecuteFn = (script: string) => Promise<unknown>;

interface GlobalWithVitest {
  vi?: {
    // Vitest integration requires any types for generic function mocking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: <T extends (...args: any[]) => any>(fn: T) => T;
  };
}

// Type for raw data structure from OmniFocus scripts
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
   * Execute the tool with validation
   */
  async execute(args: unknown): Promise<TResponse> {
    try {
      // Validate input with Zod
      const validated = this.schema.parse(args) as z.infer<TSchema>;

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
    validationErrors?: z.ZodIssue[],
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
   * Note: This method contains intentional `any` types for test framework compatibility.
   * ESLint exceptions are applied to preserve Vitest mocking functionality.
   */
  protected applyExecuteJsonShim(anyOmni: OmniAutomation): void {
    if (!anyOmni) return;

    // Capture originals (may be undefined) - keep as any for test shim compatibility
    const origExecute: ExecuteFn | undefined = typeof anyOmni.execute === 'function' ? anyOmni.execute.bind(anyOmni) : undefined;
    // Dynamic method injection requires any types for runtime flexibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origExecuteJson: any = typeof anyOmni.executeJson === 'function' ? anyOmni.executeJson.bind(anyOmni) : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origExecuteTyped: any = typeof anyOmni.executeTyped === 'function' ? anyOmni.executeTyped.bind(anyOmni) : undefined;

    // Helper: wrap in vi.fn if available (so tests can assert calls)
    // Vitest spy wrapper requires any types for generic function compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapSpy = <F extends (...args: any[]) => any>(fn: F): F => {
      const g = globalThis as GlobalWithVitest;
      if (g.vi && typeof g.vi.fn === 'function') {
        return g.vi.fn(fn);
      }
      return fn;
    };

    // Ensure executeJson exists (fallback to execute)
    if (!origExecuteJson && origExecute) {
      anyOmni.executeJson = wrapSpy(async (script: string, schema?: z.ZodTypeAny) => {
        let raw = await origExecute(script);
        if (typeof raw === 'string') {
          try { raw = JSON.parse(raw); } catch { /* leave as string */ }
        }
        if (schema && typeof schema.safeParse === 'function') {
          let candidate = raw;
          let parsed = schema.safeParse(candidate);
          if (!parsed.success && raw && typeof raw === 'object') {
            const obj = raw as RawOmniFocusData;
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
          // Dynamic data transformation result - any type required for flexible API compatibility
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          if (parsed.success) return { success: true, data: parsed.data };
          let errMsg = 'Script result validation failed';
          const rawData = raw as RawOmniFocusData;
          if (rawData.error && typeof rawData.message === 'string') {
            errMsg = rawData.message;
          }
          if (raw == null) errMsg = 'NULL_RESULT';
          return { success: false, error: errMsg, details: { errors: parsed.error.issues } };
        }
        return { success: true, data: raw };
      });
    }

    // Ensure execute exists (fallback to executeJson)
    if (!origExecute && (origExecuteJson || origExecuteTyped)) {
      anyOmni.execute = wrapSpy(async (script: string) => {
        if (typeof anyOmni.executeJson === 'function') {
          const res = await anyOmni.executeJson(script);
          if (res && res.success) return res.data;
          return { error: true, message: res?.error ?? 'Script failed', details: res?.details };
        }
        if (typeof anyOmni.executeTyped === 'function') {
          // No schema: accept anything - any type required for dynamic execution
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const data = await anyOmni.executeTyped(script, z.any());
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return data;
        }
        return null;
      });
    }

    // Ensure executeTyped exists (fallback to executeJson or execute)
    if (!origExecuteTyped) {
      if (typeof anyOmni.executeJson === 'function') {
        anyOmni.executeTyped = wrapSpy(async (script: string, dataSchema: z.ZodTypeAny) => {
          const res = await anyOmni.executeJson(script);
          if (!res || !res.success) throw new Error(res?.error ?? 'Script execution failed');
          // Dynamic schema parsing for test compatibility
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return dataSchema && typeof dataSchema.parse === 'function' ? dataSchema.parse(res.data) : res.data;
        });
      } else if (typeof anyOmni.execute === 'function') {
        anyOmni.executeTyped = wrapSpy(async (script: string, dataSchema: z.ZodTypeAny) => {
          let raw = await anyOmni.execute(script);
          if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { /* ignore */ }
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return dataSchema && typeof dataSchema.parse === 'function' ? dataSchema.parse(raw) : raw;
        });
      }
    }

    // Normalize existing executeJson to return ScriptResult when tests return raw data
    // Note: Complex shim logic below requires any types for dynamic test compatibility
    if (origExecuteJson) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const prev = origExecuteJson;
      anyOmni.executeJson = wrapSpy(async (script: string, schema?: z.ZodTypeAny) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const maybe = await prev(script, schema);
        if (maybe && typeof maybe === 'object' && 'success' in maybe) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return maybe;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        let raw = maybe;
        if (typeof raw === 'string') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          try { raw = JSON.parse(raw); } catch { /* ignore */ }
        }
        if (schema && typeof schema.safeParse === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          let candidate = raw;
          let parsed = schema.safeParse(candidate);
          if (!parsed.success && raw && typeof raw === 'object') {
            const obj = raw as RawOmniFocusData;
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          if (parsed.success) return { success: true, data: parsed.data };
          return { success: false, error: 'Script result validation failed', details: { errors: parsed.error.issues } };
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        return { success: true, data: raw };
      });
    }
  }

  get omniAutomation(): OmniAutomation {
    // Always ensure shim exists when accessed
    this.applyExecuteJsonShim(this._omniAutomation);
    return this._omniAutomation;
  }

  set omniAutomation(value: OmniAutomation) {
    this._omniAutomation = value;
    this.applyExecuteJsonShim(this._omniAutomation);
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
      const omniError = error as { details?: { script?: string; stderr?: string } }; // Type assertion for OmniAutomationError
      return createErrorResponse(
        this.name,
        'OMNIFOCUS_ERROR',
        errorDetails.message,
        {
          script: omniError.details?.script,
          stderr: omniError.details?.stderr,
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
   * V2 error handler: same mappings as handleError, but returns V2 response format.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected handleErrorV2(error: unknown): any {
    this.logger.error(`Error in ${this.name}:`, error);
    const timer = new OperationTimerV2();

    const errMsg = error instanceof Error ? error.message : String(error);
    const s = errMsg.toLowerCase();

    if (s.includes('-1743') || s.includes('not allowed') || s.includes('authorization')) {
      const info = permissionError(this.name);
      return createErrorResponseV2(this.name, 'PERMISSION_DENIED', info.message, formatErrorWithRecovery(info), undefined, timer.toMetadata());
    }

    if (s.includes('timeout') || s.includes('timed out')) {
      const info = scriptTimeoutError(this.name);
      return createErrorResponseV2(this.name, 'SCRIPT_TIMEOUT', info.message, formatErrorWithRecovery(info), undefined, timer.toMetadata());
    }

    if (s.includes('not running') || s.includes("can't find process")) {
      const info = omniFocusNotRunningError(this.name);
      return createErrorResponseV2(this.name, 'OMNIFOCUS_NOT_RUNNING', info.message, formatErrorWithRecovery(info), undefined, timer.toMetadata());
    }

    if (error instanceof Error && error.name === 'OmniAutomationError') {
      const info = scriptExecutionError(this.name, error.message || 'Script execution failed', 'Check that OmniFocus is not showing any dialogs');
      const omniError = error as { details?: { script?: string; stderr?: string } }; // Type assertion for OmniAutomationError
      return createErrorResponseV2(this.name, 'OMNIFOCUS_ERROR', info.message, formatErrorWithRecovery(info), { script: omniError.details?.script, stderr: omniError.details?.stderr }, timer.toMetadata());
    }

    return createErrorResponseV2(
      this.name,
      'INTERNAL_ERROR',
      errMsg || 'An unknown error occurred',
      'Try again, verify OmniFocus is running, and check parameters',
      { originalError: error },
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
