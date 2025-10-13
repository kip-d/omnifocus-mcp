import { stderr } from 'node:process';
import { randomUUID } from 'node:crypto';

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  // Enhanced methods with correlation ID support
  withCorrelation: (correlationId: string) => Logger;
}

export interface LogContext {
  correlationId?: string;
  operation?: string;
  tool?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  correlationId?: string;
  operation?: string;
  tool?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  args?: unknown[];
}

/**
 * Generate a new correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

// Keys whose values should be redacted in logs
const SENSITIVE_KEYS = new Set([
  'name',
  'note',
  'notes',
  'taskName',
  'projectName',
  'tagName',
  'title',
  'script',
]);

// Best‑effort deep redaction that preserves structure for debugging
export function redactArgs<T>(value: T, depth = 0): T {
  if (depth > 6) return value; // Avoid pathological recursion

  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    // Array mapping preserves generic type structure
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value.map(v => redactArgs(v, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactArgs(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out as unknown as T;
}

export function createLogger(context: string, initialContext?: LogContext): Logger {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const levels = ['error', 'warn', 'info', 'debug'];
  const currentLevelIndex = levels.indexOf(logLevel);
  const useStructuredLogging = process.env.STRUCTURED_LOGGING === 'true';

  const shouldLog = (level: string): boolean => {
    return levels.indexOf(level) <= currentLevelIndex;
  };

  const createStructuredEntry = (
    level: string,
    message: string,
    args: unknown[],
    logContext?: LogContext,
  ): StructuredLogEntry => {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      context,
      message,
      correlationId: logContext?.correlationId || initialContext?.correlationId,
      operation: logContext?.operation || initialContext?.operation,
      tool: logContext?.tool || initialContext?.tool,
      userId: logContext?.userId || initialContext?.userId,
      metadata: {
        ...initialContext?.metadata,
        ...logContext?.metadata,
      },
      args: args.length > 0 ? redactArgs(args) : undefined,
    };
  };

  const formatMessage = (level: string, message: string, args: unknown[], logContext?: LogContext): string => {
    if (useStructuredLogging) {
      const entry = createStructuredEntry(level, message, args, logContext);
      return JSON.stringify(entry);
    }

    // Traditional format with correlation ID
    const timestamp = new Date().toISOString();
    const correlationId = logContext?.correlationId || initialContext?.correlationId;
    const correlationPrefix = correlationId ? ` [${correlationId.substring(0, 8)}]` : '';

    // Only include structured args at debug level; redact first
    const includeArgs = level === 'debug' && args.length > 0;
    const redacted = includeArgs ? ' ' + JSON.stringify(redactArgs(args)) : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${context}]${correlationPrefix} ${message}${redacted}`;
  };

  const logWithContext = (level: string, message: string, args: unknown[], logContext?: LogContext) => {
    if (shouldLog(level)) {
      stderr.write(formatMessage(level, message, args, logContext) + '\n');
    }
  };

  const logger: Logger = {
    info: (message: string, ..._args: unknown[]) => {
      logWithContext('info', message, [], undefined);
    },
    error: (message: string, ...args: unknown[]) => {
      // Enhanced error logging with better context preservation
      const errArg = args && args.length === 1 && args[0] instanceof Error
        ? (args[0] as Error).message
        : undefined;
      const finalMessage = errArg ? `${message} ${errArg}` : message;
      logWithContext('error', finalMessage, useStructuredLogging ? args : [], undefined);

      // Log error metrics for telemetry (privacy-safe - no user data)
      if (typeof args[0] === 'object' && args[0] !== null && 'errorType' in args[0]) {
        const errorData = args[0] as { errorType?: string; recoverable?: boolean };
        stderr.write(`[ERROR_METRIC] ${JSON.stringify({
          timestamp: new Date().toISOString(),
          context,
          errorType: errorData.errorType,
          recoverable: errorData.recoverable,
          correlationId: initialContext?.correlationId,
        })}\n`);
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      logWithContext('debug', message, args, undefined);
    },
    warn: (message: string, ..._args: unknown[]) => {
      logWithContext('warn', message, [], undefined);
    },
    withCorrelation: (correlationId: string) => {
      return createLogger(context, {
        ...initialContext,
        correlationId,
      });
    },
  };

  return logger;
}

/**
 * Create a logger with correlation context for tool execution
 */
export function createCorrelatedLogger(
  context: string,
  correlationId: string,
  operation?: string,
  tool?: string,
  metadata?: Record<string, unknown>,
): Logger {
  return createLogger(context, {
    correlationId,
    operation,
    tool,
    metadata,
  });
}

