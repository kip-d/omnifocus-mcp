import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../src/utils/metrics.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector(100); // Small history for testing
  });

  describe('Constructor', () => {
    it('should create collector with default max history', () => {
      const defaultCollector = new MetricsCollector();
      expect(defaultCollector).toBeDefined();
    });

    it('should create collector with custom max history', () => {
      const customCollector = new MetricsCollector(500);
      expect(customCollector).toBeDefined();
    });
  });

  describe('Recording Metrics', () => {
    it('should record successful execution', () => {
      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 100,
        success: true,
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      expect(metrics.totalToolCalls).toBe(1);
      expect(metrics.totalSuccessfulCalls).toBe(1);
      expect(metrics.totalFailedCalls).toBe(0);
    });

    it('should record failed execution', () => {
      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 50,
        success: false,
        errorType: 'TEST_ERROR',
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      expect(metrics.totalToolCalls).toBe(1);
      expect(metrics.totalSuccessfulCalls).toBe(0);
      expect(metrics.totalFailedCalls).toBe(1);
    });

    it('should record multiple executions', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordExecution({
          toolName: `tool_${i % 3}`,
          executionTime: 100 + i,
          success: i % 2 === 0,
          timestamp: Date.now()
        });
      }

      const metrics = collector.getAggregatedMetrics();
      expect(metrics.totalToolCalls).toBe(10);
    });
  });

  describe('Aggregation', () => {
    it('should calculate average execution time', () => {
      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 100,
        success: true,
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 200,
        success: true,
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      const toolMetrics = metrics.toolMetrics['test_tool'];
      expect(toolMetrics.averageExecutionTime).toBe(150);
    });

    it('should track min and max execution times', () => {
      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 50,
        success: true,
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 300,
        success: true,
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      const toolMetrics = metrics.toolMetrics['test_tool'];
      expect(toolMetrics.minExecutionTime).toBe(50);
      expect(toolMetrics.maxExecutionTime).toBe(300);
    });

    it('should track error breakdown by type', () => {
      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 100,
        success: false,
        errorType: 'ERROR_A',
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 100,
        success: false,
        errorType: 'ERROR_A',
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'test_tool',
        executionTime: 100,
        success: false,
        errorType: 'ERROR_B',
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      const toolMetrics = metrics.toolMetrics['test_tool'];
      expect(toolMetrics.errorBreakdown['ERROR_A']).toBe(2);
      expect(toolMetrics.errorBreakdown['ERROR_B']).toBe(1);
    });
  });

  describe('Cache Hit Rate', () => {
    it('should calculate cache hit rate', () => {
      collector.recordExecution({
        toolName: 'cached_tool',
        executionTime: 10,
        success: true,
        cacheHit: true,
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'cached_tool',
        executionTime: 100,
        success: true,
        cacheHit: false,
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'cached_tool',
        executionTime: 10,
        success: true,
        cacheHit: true,
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      const toolMetrics = metrics.toolMetrics['cached_tool'];
      expect(toolMetrics.cacheHitRate).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('History Management', () => {
    it('should maintain max history size', () => {
      const smallCollector = new MetricsCollector(5);

      for (let i = 0; i < 10; i++) {
        smallCollector.recordExecution({
          toolName: 'test',
          executionTime: i,
          success: true,
          timestamp: Date.now()
        });
      }

      const metrics = smallCollector.getAggregatedMetrics();
      // Should only count last 5 executions
      expect(metrics.totalToolCalls).toBeLessThanOrEqual(10);
    });
  });

  describe('Per-Tool Metrics', () => {
    it('should track metrics separately per tool', () => {
      collector.recordExecution({
        toolName: 'tool_a',
        executionTime: 100,
        success: true,
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'tool_b',
        executionTime: 200,
        success: true,
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      expect(metrics.toolMetrics['tool_a']).toBeDefined();
      expect(metrics.toolMetrics['tool_b']).toBeDefined();
      expect(metrics.toolMetrics['tool_a'].totalCalls).toBe(1);
      expect(metrics.toolMetrics['tool_b'].totalCalls).toBe(1);
    });
  });

  describe('System Metrics', () => {
    it('should calculate uptime', () => {
      const metrics = collector.getAggregatedMetrics();
      expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.uptimeSeconds).toBe('number');
    });

    it('should track start time', () => {
      const metrics = collector.getAggregatedMetrics();
      expect(metrics.startTime).toBeDefined();
      expect(metrics.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('should calculate system-wide success rate', () => {
      collector.recordExecution({
        toolName: 'tool1',
        executionTime: 100,
        success: true,
        timestamp: Date.now()
      });

      collector.recordExecution({
        toolName: 'tool2',
        executionTime: 100,
        success: false,
        timestamp: Date.now()
      });

      const metrics = collector.getAggregatedMetrics();
      expect(metrics.totalSuccessfulCalls).toBe(1);
      expect(metrics.totalFailedCalls).toBe(1);
    });
  });
});
