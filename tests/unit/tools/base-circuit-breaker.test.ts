import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseTool } from '../../../src/tools/base.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { createScriptError, createScriptSuccess } from '../../../src/omnifocus/script-result-types.js';

/**
 * Mock CacheManager for testing
 */
class MockCache extends CacheManager {
  constructor() {
    super();
    // Mock implementation - no actual caching needed for these tests
  }
}

/**
 * Concrete implementation of BaseTool for testing
 */
class TestTool extends BaseTool<any, any> {
  name = 'test_tool';
  description = 'Test tool for circuit breaker testing';
  schema = { parse: vi.fn() } as any;

  async executeValidated(): Promise<any> {
    return { success: true };
  }
}

describe('BaseTool Circuit Breaker Integration', () => {
  let tool: TestTool;
  let mockExecuteJson: any;

  beforeEach(() => {
    const cache = new MockCache();
    tool = new TestTool(cache);

    // Mock the OmniAutomation executeJson method
    mockExecuteJson = vi.fn();
    (tool as any).omniAutomation = {
      executeJson: mockExecuteJson,
    };
  });

  it('should successfully execute when OmniFocus is available', async () => {
    // Mock successful response
    mockExecuteJson.mockResolvedValue({
      success: true,
      data: { test: 'data' },
    });

    const result = await tool.execJson('test-script');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ test: 'data' });
    expect(mockExecuteJson).toHaveBeenCalledWith('test-script');
  });

  it('should open circuit breaker after multiple failures', async () => {
    // Mock OmniFocus not running error
    mockExecuteJson.mockRejectedValue(new Error('OmniFocus is not running'));

    // First failure
    const result1 = await tool.execJson('test-script');
    expect(result1.success).toBe(false);

    // Second failure
    const result2 = await tool.execJson('test-script');
    expect(result2.success).toBe(false);

    // Third failure - should open circuit
    const result3 = await tool.execJson('test-script');
    expect(result3.success).toBe(false);

    // Circuit should now be open
    const circuitState = (tool as any).circuitBreaker.getState();
    expect(circuitState.isOpen).toBe(true);
    expect(circuitState.failureCount).toBeGreaterThanOrEqual(3);
  });

  it('should return error result when circuit is open', async () => {
    // Force circuit to be open
    const circuitBreaker = (tool as any).circuitBreaker;
    circuitBreaker['state'] = {
      isOpen: true,
      isHalfOpen: false,
      failureCount: 3,
      lastFailureTime: Date.now(),
      nextAttemptTime: Date.now() + 30000,
    };

    // Mock executeJson to return null (which will be converted to NULL_RESULT error)
    mockExecuteJson.mockResolvedValue(null);

    const result = await tool.execJson('test-script');

    // Should return error result instead of throwing
    expect(result.success).toBe(false);
    expect(result.error).toContain('NULL_RESULT');
  });

  it('should reset circuit breaker on successful operation', async () => {
    // Mock successful response
    mockExecuteJson.mockResolvedValue({
      success: true,
      data: { test: 'data' },
    });

    // First successful operation
    await tool.execJson('test-script');

    // Circuit should be closed
    const circuitState = (tool as any).circuitBreaker.getState();
    expect(circuitState.isOpen).toBe(false);
    expect(circuitState.failureCount).toBe(0);
  });

  it('should provide enhanced error context when circuit is open', async () => {
    // Force circuit to be open
    const circuitBreaker = (tool as any).circuitBreaker;
    circuitBreaker['state'] = {
      isOpen: true,
      isHalfOpen: false,
      failureCount: 3,
      lastFailureTime: Date.now(),
      nextAttemptTime: Date.now() + 30000,
    };

    // Mock logger.error to capture log output
    const loggerErrorSpy = vi.spyOn((tool as any).logger, 'error').mockImplementation(() => {});

    // Execute when circuit is open
    const result = await tool.execJson('test-script');

    // Should have logged enhanced error context
    expect(loggerErrorSpy).toHaveBeenCalled();
    const logCall = loggerErrorSpy.mock.calls[0];
    expect(logCall[0]).toContain('Circuit breaker is open');
    expect(logCall[1]).toHaveProperty('recovery_suggestions');
    expect(logCall[1]).toHaveProperty('related_documentation');

    loggerErrorSpy.mockRestore();
  });
});

describe('BaseTool Error Recovery Integration', () => {
  let tool: TestTool;

  beforeEach(() => {
    const cache = new MockCache();
    tool = new TestTool(cache);
  });

  it('should retry transient errors with exponential backoff', async () => {
    let attemptCount = 0;

    // Mock operation that fails twice then succeeds
    const mockOperation = async () => {
      attemptCount++;
      if (attemptCount <= 2) {
        throw new Error('OmniFocus is busy');
      }
      return { success: true };
    };

    const startTime = Date.now();
    const result = await tool.executeWithRetry(mockOperation, {
      maxRetries: 3,
      initialDelay: 10,
      maxDelay: 50,
    });
    const endTime = Date.now();

    expect(result).toEqual({ success: true });
    expect(attemptCount).toBe(3); // 1 initial + 2 retries
    // Should have waited between attempts
    expect(endTime - startTime).toBeGreaterThanOrEqual(10 + 20); // 10ms + 20ms delays
  });

  it('should not retry non-transient errors', async () => {
    let attemptCount = 0;

    // Mock operation that throws permission error (non-transient)
    const mockOperation = async () => {
      attemptCount++;
      throw new Error('Permission denied -1743');
    };

    await expect(tool.executeWithRetry(mockOperation)).rejects.toThrow('Permission denied -1743');

    // Should not retry permission errors
    expect(attemptCount).toBe(1);
  });

  it('should create enhanced error responses with recovery suggestions', () => {
    const error = new Error('OmniFocus is not running');

    const enhancedError = tool.createEnhancedErrorResponse(error, 'test', {
      toolName: 'test_tool',
      operationType: 'query',
    });

    expect(enhancedError.message).toContain('OmniFocus is not running');
    expect(enhancedError.recovery_suggestions).toBeDefined();
    expect(enhancedError.recovery_suggestions?.length).toBeGreaterThan(0);
    expect(enhancedError.recovery_suggestions).toContain('Ensure OmniFocus is running and responsive');
  });

  it('should provide recovery suggestions for common error types', () => {
    // Test permission error - should match 'permission' or '-1743'
    const permissionError = new Error('Permission denied -1743');
    const enhancedPermissionError = tool.createEnhancedErrorResponse(permissionError, 'test');

    // Basic checks
    expect(enhancedPermissionError).toBeInstanceOf(Error);
    expect(enhancedPermissionError.message).toContain('Permission denied -1743');
    expect(enhancedPermissionError.recovery_suggestions).toBeDefined();
    expect(Array.isArray(enhancedPermissionError.recovery_suggestions)).toBe(true);
    expect(enhancedPermissionError.recovery_suggestions?.length).toBeGreaterThan(0);

    // Check specific suggestion
    const suggestions = enhancedPermissionError.recovery_suggestions || [];
    const hasPermissionSuggestion = suggestions.some((s) => s.includes('Grant OmniFocus automation permissions'));
    expect(hasPermissionSuggestion).toBe(true);
  });
});
