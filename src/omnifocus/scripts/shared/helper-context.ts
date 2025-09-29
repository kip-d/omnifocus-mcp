/**
 * Helper Context Types
 *
 * Provides configuration options for helper functions to control
 * performance, error handling, and script generation behavior.
 */

/**
 * Configuration context for helper function generation
 */
export interface HelperContext {
  /**
   * Skip expensive recurring task analysis
   * @default true - For daily use, skip analysis for speed
   */
  skipAnalysis?: boolean;

  /**
   * Include performance metrics in generated scripts
   * @default false - Only enable for debugging/optimization
   */
  performanceTracking?: boolean;

  /**
   * Maximum retry attempts for operations
   * @default 3
   */
  maxRetries?: number;

  /**
   * Operation timeout in milliseconds
   * @default 120000 (2 minutes)
   */
  timeout?: number;

  /**
   * Caching strategy for helper operations
   * - aggressive: Cache everything possible
   * - conservative: Cache only safe operations
   * - disabled: No caching
   * @default 'aggressive'
   */
  cacheStrategy?: 'aggressive' | 'conservative' | 'disabled';

  /**
   * Helper function complexity level
   * - minimal: Only essential utilities
   * - standard: Common helper functions
   * - full: Complete helper suite
   * @default 'standard'
   */
  helperLevel?: 'minimal' | 'standard' | 'full';
}

/**
 * Default helper context configuration
 * Optimized for daily use with good performance
 */
export const DEFAULT_HELPER_CONTEXT: Required<HelperContext> = {
  skipAnalysis: true,
  performanceTracking: false,
  maxRetries: 3,
  timeout: 120000,
  cacheStrategy: 'aggressive',
  helperLevel: 'standard',
};

/**
 * Merge user context with defaults
 * @param context User-provided context (partial)
 * @returns Complete context with defaults filled in
 */
export function mergeHelperContext(context?: HelperContext): Required<HelperContext> {
  return {
    ...DEFAULT_HELPER_CONTEXT,
    ...context,
  };
}

/**
 * Generate JavaScript config object for injection into scripts
 * @param context Helper context
 * @returns JavaScript code defining HELPER_CONFIG constant
 */
export function generateHelperConfig(context?: HelperContext): string {
  const merged = mergeHelperContext(context);

  return `
  // Helper configuration injected at script generation time
  const HELPER_CONFIG = {
    skipAnalysis: ${merged.skipAnalysis},
    performanceTracking: ${merged.performanceTracking},
    maxRetries: ${merged.maxRetries},
    timeout: ${merged.timeout},
    cacheStrategy: '${merged.cacheStrategy}',
    helperLevel: '${merged.helperLevel}'
  };
  `.trim();
}