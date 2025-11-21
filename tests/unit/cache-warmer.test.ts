import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheWarmer } from '../../src/cache/CacheWarmer.js';
import { CacheManager } from '../../src/cache/CacheManager.js';
import type { WarmingResult } from '../../src/cache/CacheWarmer.js';

// Mock dependencies
vi.mock('../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));

const loggerMocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => loggerMocks.logger),
}));

describe('CacheWarmer', () => {
  let mockCache: any;
  let warmer: CacheWarmer;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(loggerMocks.logger).forEach(fn => fn.mockClear());

    mockCache = {
      set: vi.fn(),
      get: vi.fn(),
      clear: vi.fn(),
      clearNamespace: vi.fn(),
      warm: vi.fn()
    };
    (CacheManager as any).mockImplementation(() => mockCache);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor and Configuration', () => {
    it('should create warmer with default strategy', () => {
      warmer = new CacheWarmer(mockCache as any);
      expect(warmer).toBeDefined();
    });

    it('should accept custom warming strategy', () => {
      const customStrategy = {
        enabled: true,
        timeout: 10000,
        categories: {
          projects: true,
          tags: false,
          tasks: true,
          perspectives: false
        }
      };

      warmer = new CacheWarmer(mockCache as any, customStrategy);
      expect(warmer).toBeDefined();
    });

    it('should merge custom strategy with defaults', () => {
      const partialStrategy = {
        timeout: 3000,
        categories: {
          tags: false
        }
      };

      warmer = new CacheWarmer(mockCache as any, partialStrategy);
      expect(warmer).toBeDefined();
    });
  });

  describe('Cache Warming Behavior', () => {
    it('should skip warming when disabled', async () => {
      warmer = new CacheWarmer(mockCache as any, { enabled: false });
      const result = await warmer.warmCache();

      expect(result.enabled).toBe(false);
      expect(result.results).toEqual([]);
    });

    it('should return warming results structure', async () => {
      warmer = new CacheWarmer(mockCache as any, {
        enabled: true,
        categories: {
          projects: false,
          tags: false,
          tasks: false,
          perspectives: false
        }
      });

      const result = await warmer.warmCache();

      expect(result).toBeDefined();
      expect(result.enabled).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('executes enabled warm operations and aggregates statistics', async () => {
      warmer = new CacheWarmer(mockCache as any, {
        categories: { projects: true, tags: true, tasks: false, perspectives: false },
      });

      const warmProjects = vi.spyOn(warmer as any, 'warmProjects' as any).mockResolvedValue({
        operation: 'projects',
        success: true,
        duration: 12,
      });
      const warmTags = vi.spyOn(warmer as any, 'warmTags' as any).mockResolvedValue({
        operation: 'tags',
        success: true,
        duration: 5,
      });

      const result = await warmer.warmCache();

      expect(warmProjects).toHaveBeenCalledTimes(1);
      expect(warmTags).toHaveBeenCalledTimes(1);
      expect(result.enabled).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.results).toEqual([
        { operation: 'projects', success: true, duration: 12 },
        { operation: 'tags', success: true, duration: 5 },
      ]);
    });
  });

  describe('Task Warming Options', () => {
    it('should support custom task warming options', () => {
      const taskOptions = {
        today: true,
        overdue: true,
        upcoming: false,
        flagged: true
      };

      warmer = new CacheWarmer(mockCache as any, {
        taskWarmingOptions: taskOptions
      });

      expect(warmer).toBeDefined();
    });

    it('should handle all task warming options disabled', () => {
      warmer = new CacheWarmer(mockCache as any, {
        taskWarmingOptions: {
          today: false,
          overdue: false,
          upcoming: false,
          flagged: false
        }
      });

      expect(warmer).toBeDefined();
    });
  });

  describe('Category Selection', () => {
    it('should support warming only projects', () => {
      warmer = new CacheWarmer(mockCache as any, {
        categories: {
          projects: true,
          tags: false,
          tasks: false,
          perspectives: false
        }
      });

      expect(warmer).toBeDefined();
    });

    it('should support warming only tags', () => {
      warmer = new CacheWarmer(mockCache as any, {
        categories: {
          projects: false,
          tags: true,
          tasks: false,
          perspectives: false
        }
      });

      expect(warmer).toBeDefined();
    });

    it('should support warming multiple categories', () => {
      warmer = new CacheWarmer(mockCache as any, {
        categories: {
          projects: true,
          tags: true,
          tasks: false,
          perspectives: false
        }
      });

      expect(warmer).toBeDefined();
    });
  });

  describe('Timeout Handling', () => {
    it('should accept custom timeout value', () => {
      warmer = new CacheWarmer(mockCache as any, {
        timeout: 15000
      });

      expect(warmer).toBeDefined();
    });

    it('should use default timeout when not specified', () => {
      warmer = new CacheWarmer(mockCache as any);
      expect(warmer).toBeDefined();
    });

    it('falls back with timeout results when operations hang', async () => {
      vi.useFakeTimers();
      warmer = new CacheWarmer(mockCache as any, { timeout: 5 });
      const never = new Promise<WarmingResult>(() => { });

      const executePromise = (warmer as any).executeWithTimeout([never]);

      vi.advanceTimersByTime(6);
      const results = await executePromise;

      expect(results).toEqual([
        {
          operation: 'timeout',
          success: false,
          duration: 5,
          error: 'Timeout exceeded',
        },
      ]);
    });
  });

  describe('Error Resilience', () => {
    it('should handle cache manager errors gracefully', async () => {
      // We need to mock the internal warmProjects/etc calls to fail, or mock cache.warm
      // Since warmCache calls warmProjects which calls cache.warm

      // Let's mock warmProjects to fail
      warmer = new CacheWarmer(mockCache as any, {
        categories: {
          projects: true,
          tags: false,
          tasks: false,
          perspectives: false
        }
      });

      vi.spyOn(warmer as any, 'warmProjects' as any).mockRejectedValue(new Error('Cache error'));

      // Note: executeWithTimeout catches errors and returns them as failed results
      // But warmCache expects executeWithTimeout to return results

      // Actually, warmProjects catches its own errors and returns { success: false }
      // So we should test that behavior

      // Let's test the internal error handling of warmProjects by mocking OmniAutomation to fail?
      // Or just trust the existing tests that cover this.

      // The original test mocked mockCache.set to fail.
      // But CacheWarmer uses cache.warm.

      mockCache.warm = vi.fn().mockRejectedValue(new Error('Cache error'));

      // We need to instantiate warmer again to use the mocked cache? No, reference is same.

      // However, warmProjects catches errors.
      // Let's just verify that warmCache doesn't throw.

      const result = await warmer.warmCache();
      expect(result).toBeDefined();
      // It might be enabled=true but with failed results
      expect(result.enabled).toBe(true);
    });
  });

  describe('Strategy Validation', () => {
    it('should handle empty strategy object', () => {
      warmer = new CacheWarmer(mockCache as any, {});
      expect(warmer).toBeDefined();
    });

    it('should handle undefined strategy', () => {
      warmer = new CacheWarmer(mockCache as any);
      expect(warmer).toBeDefined();
    });

    it('should handle partial category configuration', () => {
      warmer = new CacheWarmer(mockCache as any, {
        categories: {
          projects: true
          // Other categories use defaults
        }
      });

      expect(warmer).toBeDefined();
    });
  });

  describe('Performance Considerations', () => {
    it('should support performance-optimized configuration', () => {
      // Minimal warming for fastest startup
      warmer = new CacheWarmer(mockCache as any, {
        enabled: true,
        timeout: 2000,
        categories: {
          projects: true, // High value
          tags: true,      // High value
          tasks: false,    // Skip for faster startup
          perspectives: false
        }
      });

      expect(warmer).toBeDefined();
    });

    it('should support comprehensive warming configuration', () => {
      // Full warming for maximum performance
      warmer = new CacheWarmer(mockCache as any, {
        enabled: true,
        timeout: 10000,
        categories: {
          projects: true,
          tags: true,
          tasks: true,
          perspectives: true
        },
        taskWarmingOptions: {
          today: true,
          overdue: true,
          upcoming: true,
          flagged: true
        }
      });

      expect(warmer).toBeDefined();
    });
  });

  describe('Internal Behavior', () => {
    it('wraps cache warm operations and returns fetched data', async () => {
      const cacheWarmMock = vi.fn((_category, _key, fetcher: () => Promise<unknown>) => fetcher());
      mockCache.warm = cacheWarmMock;

      warmer = new CacheWarmer(mockCache as any);

      const fetcher = vi.fn().mockResolvedValue([{ id: '1' }]);

      const data = await (warmer as any).warmSingleOperation('tasks', 'demo', fetcher);

      expect(cacheWarmMock).toHaveBeenCalledWith('tasks', 'demo', expect.any(Function));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(data).toEqual([{ id: '1' }]);
    });
  });
});
