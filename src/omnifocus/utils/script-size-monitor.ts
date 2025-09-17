/**
 * Script Size Monitor - Optional Size Checking and Logging
 *
 * Based on empirical testing (September 2025):
 * - JXA Direct: 523,266 chars (~511KB)
 * - OmniJS Bridge: 261,124 chars (~255KB)
 */

import { createLogger, type Logger } from '../../utils/logger.js';

const scriptSizeLogger = createLogger('script-size-monitor');

export interface ScriptSizeLimits {
  jxaDirect: number;
  omniJsBridge: number;
}

export interface ScriptSizeThresholds {
  /** Log info when script exceeds this size */
  infoThreshold: number;
  /** Log warning when script exceeds this size */
  warnThreshold: number;
  /** Log error when script exceeds this size (but still allow execution) */
  errorThreshold: number;
}

/**
 * Empirically determined limits from binary search testing
 */
export const EMPIRICAL_LIMITS: ScriptSizeLimits = {
  jxaDirect: 523266,    // ~511KB
  omniJsBridge: 261124,  // ~255KB
};

/**
 * Conservative thresholds for monitoring (75% of empirical limits)
 */
export const DEFAULT_THRESHOLDS: ScriptSizeThresholds = {
  infoThreshold: 100000,    // 100KB - Large script notification
  warnThreshold: 300000,    // 300KB - Getting close to OmniJS bridge limit
  errorThreshold: 400000,    // 400KB - Approaching JXA limit
};

/**
 * Script size monitoring result
 */
export interface ScriptSizeAnalysis {
  size: number;
  sizeKB: number;
  type: 'jxa' | 'omnijs-bridge';
  limit: number;
  limitKB: number;
  percentOfLimit: number;
  threshold: 'safe' | 'info' | 'warn' | 'error';
  shouldLog: boolean;
  message?: string;
}

/**
 * Analyze script size against empirical limits and thresholds
 */
export function analyzeScriptSize(
  script: string,
  type: 'jxa' | 'omnijs-bridge' = 'jxa',
  thresholds: ScriptSizeThresholds = DEFAULT_THRESHOLDS,
): ScriptSizeAnalysis {
  const size = script.length;
  const sizeKB = Math.round(size / 1024);
  const limit = type === 'jxa' ? EMPIRICAL_LIMITS.jxaDirect : EMPIRICAL_LIMITS.omniJsBridge;
  const limitKB = Math.round(limit / 1024);
  const percentOfLimit = Math.round((size / limit) * 100);

  let threshold: ScriptSizeAnalysis['threshold'] = 'safe';
  let shouldLog = false;
  let message: string | undefined;

  if (size >= thresholds.errorThreshold) {
    threshold = 'error';
    shouldLog = true;
    message = `Very large ${type} script: ${sizeKB}KB (${percentOfLimit}% of ${limitKB}KB limit)`;
  } else if (size >= thresholds.warnThreshold) {
    threshold = 'warn';
    shouldLog = true;
    message = `Large ${type} script: ${sizeKB}KB (${percentOfLimit}% of ${limitKB}KB limit)`;
  } else if (size >= thresholds.infoThreshold) {
    threshold = 'info';
    shouldLog = true;
    message = `Notable ${type} script size: ${sizeKB}KB`;
  }

  return {
    size,
    sizeKB,
    type,
    limit,
    limitKB,
    percentOfLimit,
    threshold,
    shouldLog,
    message,
  };
}

/**
 * Log script size analysis if warranted
 */
export function logScriptSize(analysis: ScriptSizeAnalysis): void {
  if (!analysis.shouldLog || !analysis.message || !scriptSizeLogger) {
    return;
  }

  try {
    switch (analysis.threshold) {
      case 'error':
        (scriptSizeLogger as Logger).error(`[script-size] ${analysis.message}`);
        break;
      case 'warn':
        (scriptSizeLogger as Logger).warn(`[script-size] ${analysis.message}`);
        break;
      case 'info':
        (scriptSizeLogger as Logger).info(`[script-size] ${analysis.message}`);
        break;
    }
  } catch {
    // Silently ignore logger errors in test environments
  }
}

/**
 * Convenience function to analyze and log script size in one call
 */
export function monitorScriptSize(
  script: string,
  type: 'jxa' | 'omnijs-bridge' = 'jxa',
  thresholds?: ScriptSizeThresholds,
): ScriptSizeAnalysis {
  const analysis = analyzeScriptSize(script, type, thresholds);
  logScriptSize(analysis);
  return analysis;
}

/**
 * Check if script exceeds safe thresholds (for development warnings)
 */
export function isScriptSizeSafe(
  script: string,
  type: 'jxa' | 'omnijs-bridge' = 'jxa',
): boolean {
  const analysis = analyzeScriptSize(script, type);
  return analysis.threshold === 'safe';
}

/**
 * Get human-readable size summary
 */
export function getScriptSizeSummary(script: string, type: 'jxa' | 'omnijs-bridge' = 'jxa'): string {
  const analysis = analyzeScriptSize(script, type);
  return `${analysis.sizeKB}KB (${analysis.percentOfLimit}% of ${analysis.limitKB}KB limit)`;
}

/**
 * Development helper: Log all script sizes in a collection
 */
export function auditScriptSizes(scripts: Record<string, string>, type: 'jxa' | 'omnijs-bridge' = 'jxa'): void {
  if (!scriptSizeLogger) return;

  try {
    (scriptSizeLogger as Logger).info(`[script-size] Auditing ${Object.keys(scripts).length} ${type} scripts:`);

    const analyses = Object.entries(scripts).map(([name, script]) => ({
      name,
      analysis: analyzeScriptSize(script, type),
    }));

    // Sort by size, largest first
    analyses.sort((a, b) => b.analysis.size - a.analysis.size);

    analyses.forEach(({ name, analysis }) => {
      const status = analysis.threshold === 'safe' ? '✅' : '⚠️';
      (scriptSizeLogger as Logger).info(`[script-size]   ${status} ${name}: ${analysis.sizeKB}KB (${analysis.percentOfLimit}%)`);
    });

    const totalSize = analyses.reduce((sum, { analysis }) => sum + analysis.size, 0);
    const totalKB = Math.round(totalSize / 1024);
    const avgSize = Math.round(totalSize / analyses.length);
    const avgKB = Math.round(avgSize / 1024);

    (scriptSizeLogger as Logger).info(`[script-size] Total: ${totalKB}KB, Average: ${avgKB}KB`);
  } catch {
    // Silently ignore logger errors in test environments
  }
}
