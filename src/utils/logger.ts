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
const SENSITIVE_KEYS = new Set(['name', 'note', 'notes', 'taskName', 'projectName', 'tagName', 'title', 'script']);

// Best‑effort deep redaction that preserves structure for debugging.
// Returns `unknown`: the redacted value is only ever serialized to a log sink,
// never read field-by-field, so a typed return would be a lie (it rebuilds the
// structure rather than preserving the input type).
//
// `seen` guards against cycles: it tracks the objects currently on the
// in-progress recursion path (added on entry, removed on exit), not every
// object ever visited — two sibling fields that happen to reference the same
// object are not a cycle and must both redact normally.
export function redactArgs(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (depth > 6) return value; // Avoid pathological recursion

  if (value == null) return value;

  // Errors don't expose message/stack/name as enumerable own properties, so
  // the generic object branch below would otherwise redact them to `{}`.
  // Expand explicitly, then recurse into `cause` (itself possibly an Error).
  if (value instanceof Error) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    try {
      const out: Record<string, unknown> = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      const cause = (value as { cause?: unknown }).cause;
      if (cause !== undefined) {
        out.cause = redactArgs(cause, depth + 1, seen);
      }
      return out;
    } finally {
      seen.delete(value);
    }
  }

  if (typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((v) => redactArgs(v, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = '[REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        out[k] = redactArgs(v, depth + 1, seen);
      } else {
        out[k] = v;
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
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
      // redactArgs preserves array-ness for an array input, so this narrows honestly.
      args: args.length > 0 ? (redactArgs(args) as unknown[]) : undefined,
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

    // D1/D2 (OMN-348): debug/warn/error print key-redacted args; info stays
    // headline-only (high volume, and the privacy default — see createLogger's
    // `info` below).
    const includeArgs = (level === 'debug' || level === 'warn' || level === 'error') && args.length > 0;
    const redacted = includeArgs ? ' ' + JSON.stringify(redactArgs(args)) : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${context}]${correlationPrefix} ${message}${redacted}`;
  };

  const logWithContext = (level: string, message: string, args: unknown[], logContext?: LogContext) => {
    if (shouldLog(level)) {
      stderr.write(formatMessage(level, message, args, logContext) + '\n');
    }
  };

  const logger: Logger = {
    // D2 (OMN-348): info is high-volume and is the privacy default — args are
    // never printed, even in STRUCTURED_LOGGING mode. A call site whose
    // payload a human actually needs puts that text in the message itself,
    // or logs at `warn` instead (see e.g. the permission-instructions site in
    // index.ts).
    info: (message: string, ..._args: unknown[]) => {
      logWithContext('info', message, []);
    },
    error: (message: string, ...args: unknown[]) => {
      // Enhanced error logging with better context preservation
      const errArg = args && args.length === 1 && args[0] instanceof Error ? (args[0] as Error).message : undefined;
      const finalMessage = errArg ? `${message} ${errArg}` : message;
      // D1 (OMN-348): print redacted args by default (not gated on
      // STRUCTURED_LOGGING) — formatMessage/createStructuredEntry decide how.
      logWithContext('error', finalMessage, args);

      // Log error metrics for telemetry (privacy-safe - no user data)
      if (typeof args[0] === 'object' && args[0] !== null && 'errorType' in args[0]) {
        const errorData = args[0] as { errorType?: string; recoverable?: boolean };
        stderr.write(
          `[ERROR_METRIC] ${JSON.stringify({
            timestamp: new Date().toISOString(),
            context,
            errorType: errorData.errorType,
            recoverable: errorData.recoverable,
            correlationId: initialContext?.correlationId,
          })}\n`,
        );
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      logWithContext('debug', message, args);
    },
    warn: (message: string, ...args: unknown[]) => {
      // D1 (OMN-348): print redacted args by default — see `error` above.
      logWithContext('warn', message, args);
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
