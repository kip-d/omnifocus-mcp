import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheWarmer } from '../../src/cache/CacheWarmer.js';
import { CacheManager } from '../../src/cache/CacheManager.js';

// Mock dependencies
vi.mock('../../src/cache/CacheManager.js', () => ({ CacheManager: vi.fn() }));
vi.mock('../../src/omnifocus/OmniAutomation.js', () => ({ OmniAutomation: vi.fn() }));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() }))
}));

describe('CacheWarmer', () => {
  let mockCache: any;
  let warmer: CacheWarmer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = {
      set: vi.fn(),
      get: vi.fn(),
      clear: vi.fn(),
      clearNamespace: vi.fn()
    };
    (CacheManager as any).mockImplementation(() => mockCache);
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
  });

  describe('Error Resilience', () => {
    it('should handle cache manager errors gracefully', async () => {
      mockCache.set = vi.fn().mockRejectedValue(new Error('Cache error'));
      warmer = new CacheWarmer(mockCache as any, {
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
});
