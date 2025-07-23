import { stderr } from 'node:process';

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
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
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}${formattedArgs}`;
  };

  return {
    info: (message: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        stderr.write(formatMessage('info', message, args) + '\n');
      }
    },
    error: (message: string, ...args: unknown[]) => {
      if (shouldLog('error')) {
        stderr.write(formatMessage('error', message, args) + '\n');
      }
    },
    debug: (message: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        stderr.write(formatMessage('debug', message, args) + '\n');
      }
    },
    warn: (message: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        stderr.write(formatMessage('warn', message, args) + '\n');
      }
    },
  };
}
