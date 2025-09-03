import { stderr } from 'node:process';

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
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

export function createLogger(context: string): Logger {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const levels = ['error', 'warn', 'info', 'debug'];
  const currentLevelIndex = levels.indexOf(logLevel);

  const shouldLog = (level: string): boolean => {
    return levels.indexOf(level) <= currentLevelIndex;
  };

  const formatMessage = (level: string, message: string, args: unknown[]): string => {
    const timestamp = new Date().toISOString();
    // Only include structured args at debug level; redact first
    const includeArgs = level === 'debug' && args.length > 0;
    const redacted = includeArgs ? ' ' + JSON.stringify(redactArgs(args)) : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}${redacted}`;
  };

  return {
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        void args; // keep signature compatible without logging structured data
        // Gate verbose args behind debug; info logs message only
        stderr.write(formatMessage('info', message, []) + '\n');
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) {
        void args; // keep signature compatible without logging structured data
        // Avoid dumping large objects at error; rely on message
        const errArg = args && args.length === 1 && args[0] instanceof Error
          ? (args[0] as Error).message
          : undefined;
        stderr.write(formatMessage('error', errArg ? `${message} ${errArg}` : message, []) + '\n');
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        stderr.write(formatMessage('debug', message, args) + '\n');
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        void args; // keep signature compatible without logging structured data
        stderr.write(formatMessage('warn', message, []) + '\n');
      }
    },
  };
}
