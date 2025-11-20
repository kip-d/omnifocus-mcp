import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheWarmer } from '../../src/cache/CacheWarmer.js';
import type { WarmingResult } from '../../src/cache/CacheWarmer.js';

const loggerMocks = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => loggerMocks.logger),
}));

describe('CacheWarmer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(loggerMocks.logger).forEach(fn => fn.mockClear());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns disabled results when warming is disabled', async () => {
    const warmer = new CacheWarmer({ warm: vi.fn() } as any, { enabled: false });

    const result = await warmer.warmCache();

    expect(result).toEqual({ enabled: false, results: [] });
  });

  it('executes enabled warm operations and aggregates statistics', async () => {
    const warmer = new CacheWarmer({ warm: vi.fn() } as any, {
      categories: { projects: true, tags: true, tasks: false, perspectives: false },
    });

    const warmProjects = vi.spyOn(warmer as any, 'warmProjects').mockResolvedValue({
      operation: 'projects',
      success: true,
      duration: 12,
    });
    const warmTags = vi.spyOn(warmer as any, 'warmTags').mockResolvedValue({
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

  it('wraps cache warm operations and returns fetched data', async () => {
    const cacheWarmMock = vi.fn((_category, _key, fetcher: () => Promise<unknown>) => fetcher());
    const warmer = new CacheWarmer({ warm: cacheWarmMock } as any);

    const fetcher = vi.fn().mockResolvedValue([{ id: '1' }]);

    const data = await (warmer as any).warmSingleOperation('tasks', 'demo', fetcher);

    expect(cacheWarmMock).toHaveBeenCalledWith('tasks', 'demo', expect.any(Function));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(data).toEqual([{ id: '1' }]);
  });

  it('falls back with timeout results when operations hang', async () => {
    vi.useFakeTimers();
    const warmer = new CacheWarmer({ warm: vi.fn() } as any, { timeout: 5 });
    const never = new Promise<WarmingResult>(() => {});

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
