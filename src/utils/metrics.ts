/**
 * Performance Metrics Collection System for OmniFocus MCP Server
 *
 * Provides lightweight performance tracking and analytics for tool usage
 * Based on Phase 1 roadmap requirements for usage metrics
 */

export interface ToolExecutionMetrics {
  toolName: string;
  executionTime: number;
  success: boolean;
  errorType?: string;
  timestamp: number;
  correlationId?: string;
  // Performance characteristics
  cacheHit?: boolean;
  resultSize?: number;
  parameterCount?: number;
  // Optional context
  operation?: string;
  helperLevel?: 'minimal' | 'tag' | 'full' | 'bridge';
  retryCount?: number;
}

export interface AggregatedMetrics {
  toolName: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  lastExecutionTime?: number;
  // Error breakdown
  errorBreakdown: Record<string, number>;
  // Performance characteristics
  cacheHitRate?: number;
  averageResultSize?: number;
  averageParameterCount?: number;
}

export interface SystemMetrics {
  startTime: number;
  totalToolCalls: number;
  totalSuccessfulCalls: number;
  totalFailedCalls: number;
  uptimeSeconds: number;
  toolMetrics: Record<string, AggregatedMetrics>;
  // System-wide performance
  averageRequestTime: number;
  currentMemoryUsage?: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
}

/**
 * In-memory metrics collector with automatic aggregation
 */
export class MetricsCollector {
  private metrics: ToolExecutionMetrics[] = [];
  private startTime: number = Date.now();
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Record a tool execution metric
   */
  recordExecution(metric: ToolExecutionMetrics): void {
    this.metrics.push(metric);

    // Maintain history size by removing oldest entries
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }
  }

  /**
   * Get aggregated metrics for all tools
   */
  getAggregatedMetrics(): SystemMetrics {
    const toolMetricsMap = new Map<string, ToolExecutionMetrics[]>();

    // Group metrics by tool name
    for (const metric of this.metrics) {
      const toolMetrics = toolMetricsMap.get(metric.toolName) || [];
      toolMetrics.push(metric);
      toolMetricsMap.set(metric.toolName, toolMetrics);
    }

    // Calculate aggregated metrics for each tool
    const toolMetrics: Record<string, AggregatedMetrics> = {};
    let totalCalls = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalExecutionTime = 0;

    for (const [toolName, toolMetricsList] of toolMetricsMap.entries()) {
      const successfulCalls = toolMetricsList.filter((m) => m.success).length;
      const failedCalls = toolMetricsList.length - successfulCalls;
      const executionTimes = toolMetricsList.map((m) => m.executionTime);
      const averageTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;

      // Error breakdown
      const errorBreakdown: Record<string, number> = {};
      toolMetricsList
        .filter((m) => !m.success && m.errorType)
        .forEach((m) => {
          const errorType = m.errorType!;
          errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
        });

      // Performance characteristics
      const cacheHits = toolMetricsList.filter((m) => m.cacheHit === true).length;
      const cacheTotal = toolMetricsList.filter((m) => m.cacheHit !== undefined).length;
      const resultSizes = toolMetricsList.filter((m) => m.resultSize !== undefined).map((m) => m.resultSize!);
      const parameterCounts = toolMetricsList
        .filter((m) => m.parameterCount !== undefined)
        .map((m) => m.parameterCount!);

      toolMetrics[toolName] = {
        toolName,
        totalCalls: toolMetricsList.length,
        successfulCalls,
        failedCalls,
        averageExecutionTime: Math.round(averageTime),
        minExecutionTime: Math.min(...executionTimes),
        maxExecutionTime: Math.max(...executionTimes),
        lastExecutionTime: toolMetricsList[toolMetricsList.length - 1]?.timestamp,
        errorBreakdown,
        cacheHitRate: cacheTotal > 0 ? Math.round((cacheHits / cacheTotal) * 100) / 100 : undefined,
        averageResultSize:
          resultSizes.length > 0 ? Math.round(resultSizes.reduce((a, b) => a + b, 0) / resultSizes.length) : undefined,
        averageParameterCount:
          parameterCounts.length > 0
            ? Math.round((parameterCounts.reduce((a, b) => a + b, 0) / parameterCounts.length) * 100) / 100
            : undefined,
      };

      totalCalls += toolMetricsList.length;
      totalSuccessful += successfulCalls;
      totalFailed += failedCalls;
      totalExecutionTime += executionTimes.reduce((a, b) => a + b, 0);
    }

    return {
      startTime: this.startTime,
      totalToolCalls: totalCalls,
      totalSuccessfulCalls: totalSuccessful,
      totalFailedCalls: totalFailed,
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
      toolMetrics,
      averageRequestTime: totalCalls > 0 ? Math.round(totalExecutionTime / totalCalls) : 0,
      currentMemoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Get metrics for a specific tool
   */
  getToolMetrics(toolName: string): AggregatedMetrics | undefined {
    const systemMetrics = this.getAggregatedMetrics();
    return systemMetrics.toolMetrics[toolName];
  }

  /**
   * Get recent execution metrics (last N executions)
   */
  getRecentExecutions(limit: number = 50): ToolExecutionMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get metrics summary for debugging
   */
  getSummary(): {
    totalExecutions: number;
    recentExecutions: number;
    topTools: Array<{ name: string; calls: number; avgTime: number }>;
    errorRate: number;
  } {
    const systemMetrics = this.getAggregatedMetrics();
    const topTools = Object.values(systemMetrics.toolMetrics)
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 5)
      .map((tool) => ({
        name: tool.toolName,
        calls: tool.totalCalls,
        avgTime: tool.averageExecutionTime,
      }));

    return {
      totalExecutions: systemMetrics.totalToolCalls,
      recentExecutions: this.metrics.length,
      topTools,
      errorRate:
        systemMetrics.totalToolCalls > 0
          ? Math.round((systemMetrics.totalFailedCalls / systemMetrics.totalToolCalls) * 100) / 100
          : 0,
    };
  }

  /**
   * Clear all collected metrics
   */
  clear(): void {
    this.metrics = [];
    this.startTime = Date.now();
  }

  /**
   * Export metrics data for analysis
   */
  exportRawData(): ToolExecutionMetrics[] {
    return [...this.metrics]; // Return copy to prevent external modification
  }
}

// Global metrics collector instance
export const globalMetricsCollector = new MetricsCollector();

/**
 * Record a tool execution metric globally
 */
export function recordToolExecution(metric: ToolExecutionMetrics): void {
  globalMetricsCollector.recordExecution(metric);
}

/**
 * Get global system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  return globalMetricsCollector.getAggregatedMetrics();
}

/**
 * Get metrics summary for quick diagnostics
 */
export function getMetricsSummary(): ReturnType<MetricsCollector['getSummary']> {
  return globalMetricsCollector.getSummary();
}
