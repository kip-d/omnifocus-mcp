/**
 * Error Recovery Utilities for OmniFocus MCP Server
 *
 * Provides automatic recovery patterns for transient errors including
 * retry with exponential backoff and intelligent error classification.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Initial delay in milliseconds */
  initialDelay?: number;

  /** Maximum delay in milliseconds */
  maxDelay?: number;

  /** Function to check if an error is transient (retryable) */
  isTransientError?: (error: unknown) => boolean;

  /** Function to call before each retry */
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  succeeded: boolean;
  lastError?: unknown;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 100,
  maxDelay: 5000,
  isTransientError: (error) => isTransientError(error),
  onRetry: () => {},
};

/**
 * Check if an error is transient (retryable)
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();

  // Transient error patterns
  const transientPatterns = [
    'timeout',
    'timed out',
    'connection',
    'network',
    'busy',
    'locked',
    'not responding',
    'temporarily unavailable',
    'resource temporarily unavailable',
    'try again later',
    'rate limit',
    'too many requests',
    'service unavailable',
    '503',
    '504',
  ];

  return transientPatterns.some((pattern) => errorMessage.includes(pattern));
}

/**
 * Execute an operation with automatic retry for transient errors
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const mergedOptions: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 1; attempt <= mergedOptions.maxRetries + 1; attempt++) {
    attempts = attempt;

    try {
      const result = await operation();
      return {
        result,
        attempts,
        succeeded: true,
      };
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt or error is not transient
      if (attempt === mergedOptions.maxRetries + 1 || !mergedOptions.isTransientError(error)) {
        return {
          result: undefined as unknown as T,
          attempts,
          succeeded: false,
          lastError: error,
        };
      }

      // Calculate exponential backoff delay
      const delay = calculateExponentialBackoff(attempt, mergedOptions.initialDelay, mergedOptions.maxDelay);

      // Call onRetry callback
      mergedOptions.onRetry(attempt, error);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError;
}

/**
 * Calculate exponential backoff delay
 */
function calculateExponentialBackoff(attempt: number, initialDelay: number, maxDelay: number): number {
  const delay = initialDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enhanced error context for better debugging and user guidance
 */
export interface EnhancedErrorContext {
  /** Unique error identifier for tracking */
  error_id?: string;

  /** Suggested recovery actions */
  recovery_suggestions?: string[];

  /** Links to related documentation */
  related_documentation?: string[];

  /** Support contact information */
  support_contact?: string;

  /** Additional technical details */
  technical_details?: Record<string, unknown>;
}

/**
 * Create an enhanced error response with additional context
 */
export function createEnhancedErrorResponse(
  error: Error,
  context: EnhancedErrorContext = {},
): Error & EnhancedErrorContext {
  const enhancedError = new Error(error.message) as Error & EnhancedErrorContext;

  // Copy all properties from original error
  Object.assign(enhancedError, error);

  // Add enhanced context
  enhancedError.error_id = context.error_id || generateErrorId();
  enhancedError.recovery_suggestions = context.recovery_suggestions;
  enhancedError.related_documentation = context.related_documentation;
  enhancedError.support_contact = context.support_contact;
  enhancedError.technical_details = context.technical_details;

  return enhancedError;
}

/**
 * Generate a unique error ID for tracking
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Classify error and provide appropriate context
 */
export function classifyErrorWithContext(error: unknown, operation: string): EnhancedErrorContext {
  if (!(error instanceof Error)) {
    return {
      recovery_suggestions: ['An unknown error occurred', 'Please try again'],
    };
  }

  const errorMessage = error.message.toLowerCase();
  const context: EnhancedErrorContext = {
    error_id: generateErrorId(),
  };

  // Permission errors
  if (errorMessage.includes('permission') || errorMessage.includes('-1743')) {
    context.recovery_suggestions = [
      'Grant OmniFocus automation permissions in System Settings',
      'Restart OmniFocus after granting permissions',
    ];
    context.related_documentation = ['https://docs.omnifocus.com/automation-permissions'];
  }

  // Timeout errors
  else if (errorMessage.includes('timeout')) {
    context.recovery_suggestions = [
      'Reduce the scope of your query',
      'Try again with smaller data sets',
      'Check system performance and available resources',
    ];
    context.technical_details = {
      operation,
      timestamp: new Date().toISOString(),
    };
  }

  // Connection errors
  else if (errorMessage.includes('connection') || errorMessage.includes('not running')) {
    context.recovery_suggestions = [
      'Ensure OmniFocus is running and responsive',
      'Close any blocking dialogs in OmniFocus',
      'Restart OmniFocus if needed',
    ];
  }

  return context;
}
