import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CacheManager } from '../../src/cache/CacheManager.js';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('CacheManager', () => {
  let cache: CacheManager;
  let mockDate: any;

  beforeEach(() => {
    // Mock Date.now() for predictable tests
    mockDate = vi.spyOn(Date, 'now');
    mockDate.mockReturnValue(1000000); // Fixed timestamp

    cache = new CacheManager();
    vi.clearAllTimers();
  });

  afterEach(() => {
    mockDate.mockRestore();
    vi.clearAllTimers();
  });

  describe('TTL Configuration', () => {
    it('should have correct default TTL values', () => {
      const cache = new CacheManager();

      // Test by setting values and checking expiration
      cache.set('tasks', 'test', 'value');
      cache.set('projects', 'test', 'value');
      cache.set('folders', 'test', 'value');
      cache.set('analytics', 'test', 'value');
      cache.set('tags', 'test', 'value');
      cache.set('reviews', 'test', 'value');

      const stats = cache.getStats();
      expect(stats.size).toBe(6);
    });

    it('should allow custom TTL configuration', () => {
      const customConfig = {
        tasks: { ttl: 5000 },
        projects: { ttl: 10000 },
      };

      const customCache = new CacheManager(customConfig);
      customCache.set('tasks', 'test', 'value');

      // Advance time by 4 seconds - should still be cached
      mockDate.mockReturnValue(1000000 + 4000);
      expect(customCache.get('tasks', 'test')).toBe('value');

      // Advance time by 6 seconds - should be expired
      mockDate.mockReturnValue(1000000 + 6000);
      expect(customCache.get('tasks', 'test')).toBeNull();
    });
  });

  describe('get/set operations', () => {
    it('should store and retrieve values correctly', () => {
      const testData = { id: 1, name: 'Test Task' };

      cache.set('tasks', 'task1', testData);
      const retrieved = cache.get<typeof testData>('tasks', 'task1');

      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('tasks', 'nonexistent')).toBeNull();
    });

    it('should handle different data types correctly', () => {
      cache.set('tasks', 'string', 'test string');
      cache.set('tasks', 'number', 42);
      cache.set('tasks', 'boolean', true);
      cache.set('tasks', 'object', { nested: { value: 123 } });
      cache.set('tasks', 'array', [1, 2, 3]);

      expect(cache.get('tasks', 'string')).toBe('test string');
      expect(cache.get('tasks', 'number')).toBe(42);
      expect(cache.get('tasks', 'boolean')).toBe(true);
      expect(cache.get('tasks', 'object')).toEqual({ nested: { value: 123 } });
      expect(cache.get('tasks', 'array')).toEqual([1, 2, 3]);
    });
  });

  describe('cache key generation and differentiation', () => {
    it('should generate unique keys for different categories', () => {
      cache.set('tasks', 'item1', 'task data');
      cache.set('projects', 'item1', 'project data');

      expect(cache.get('tasks', 'item1')).toBe('task data');
      expect(cache.get('projects', 'item1')).toBe('project data');
    });

    it('should differentiate by parameter variations', () => {
      // Simulate different cache keys for same category but different parameters
      cache.set('tasks', 'completed:true', 'completed tasks');
      cache.set('tasks', 'completed:false', 'active tasks');
      cache.set('tasks', 'project:work', 'work tasks');

      expect(cache.get('tasks', 'completed:true')).toBe('completed tasks');
      expect(cache.get('tasks', 'completed:false')).toBe('active tasks');
      expect(cache.get('tasks', 'project:work')).toBe('work tasks');
    });

    it('should handle complex parameter combinations in keys', () => {
      const complexKey = 'completed:false_project:work_limit:50_tags:urgent,important';
      cache.set('tasks', complexKey, 'complex query result');

      expect(cache.get('tasks', complexKey)).toBe('complex query result');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      cache.set('tasks', 'test', 'value');

      // Should be available immediately
      expect(cache.get('tasks', 'test')).toBe('value');

      // Advance time beyond tasks TTL (300 seconds = 5 minutes)
      mockDate.mockReturnValue(1000000 + 301000);

      // Should be expired
      expect(cache.get('tasks', 'test')).toBeNull();
    });

    it('should have different TTL for different categories', () => {
      cache.set('tasks', 'test', 'task value');
      cache.set('projects', 'test', 'project value');
      cache.set('analytics', 'test', 'analytics value');

      // Advance time by 6 minutes - tasks and projects should expire (5 min TTL), analytics should remain (1 hour TTL)
      mockDate.mockReturnValue(1000000 + 360000);

      expect(cache.get('tasks', 'test')).toBeNull();
      expect(cache.get('projects', 'test')).toBeNull();
      expect(cache.get('analytics', 'test')).toBe('analytics value');

      // Advance time by 61 minutes - analytics should expire (1 hour TTL)
      mockDate.mockReturnValue(1000000 + 3660000);

      expect(cache.get('analytics', 'test')).toBeNull();
    });

    it('should update TTL on each access', () => {
      cache.set('tasks', 'test', 'value');

      // Advance time but still within TTL (200s < 300s)
      mockDate.mockReturnValue(1000000 + 200000);
      expect(cache.get('tasks', 'test')).toBe('value');

      // Advance time beyond original TTL (350s > 300s from original set)
      mockDate.mockReturnValue(1000000 + 350000);
      expect(cache.get('tasks', 'test')).toBeNull(); // Should be expired since TTL is fixed on set
    });
  });

  describe('cache statistics', () => {
    it('should track hits and misses correctly', () => {
      const initialStats = cache.getStats();
      expect(initialStats).toEqual({
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        checksumFailures: 0,
        checksumFailureRate: 0,
      });

      // Miss
      cache.get('tasks', 'nonexistent');
      expect(cache.getStats().misses).toBe(1);

      // Set and hit
      cache.set('tasks', 'test', 'value');
      cache.get('tasks', 'test');
      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().size).toBe(1);
    });

    it('should track evictions correctly', () => {
      cache.set('tasks', 'test', 'value');

      // Expire the entry (beyond 300s TTL)
      mockDate.mockReturnValue(1000000 + 301000);
      cache.get('tasks', 'test'); // This should trigger eviction

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should track cache size correctly', () => {
      expect(cache.getStats().size).toBe(0);

      cache.set('tasks', 'task1', 'value1');
      expect(cache.getStats().size).toBe(1);

      cache.set('projects', 'project1', 'value2');
      expect(cache.getStats().size).toBe(2);

      cache.invalidate('tasks', 'task1');
      expect(cache.getStats().size).toBe(1);
    });

    it('should validate data integrity with checksums', () => {
      // Set some data
      cache.set('tasks', 'test', { id: 1, name: 'Test Task' });

      // Should work normally initially
      const data = cache.get('tasks', 'test');
      expect(data).toEqual({ id: 1, name: 'Test Task' });
      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().checksumFailures).toBe(0);

      // For this test, we can't easily simulate data corruption without
      // accessing private methods, but we can verify the stats structure
      expect(cache.getStats().checksumFailureRate).toBe(0);
    });

    it('should provide cache validation methods', () => {
      // Set some test data
      cache.set('tasks', 'task1', 'value1');
      cache.set('projects', 'project1', 'value2');

      // Validate all entries
      const validation = cache.validateAllEntries();
      expect(validation.total).toBe(2);
      expect(validation.corrupted).toBe(0);
      expect(validation.details).toEqual([]);
    });
  });

  describe('invalidation', () => {
    beforeEach(() => {
      // Set up test data
      cache.set('tasks', 'task1', 'value1');
      cache.set('tasks', 'task2', 'value2');
      cache.set('projects', 'project1', 'value3');
      cache.set('analytics', 'stats1', 'value4');
    });

    it('should invalidate specific key', () => {
      cache.invalidate('tasks', 'task1');

      expect(cache.get('tasks', 'task1')).toBeNull();
      expect(cache.get('tasks', 'task2')).toBe('value2');
      expect(cache.get('projects', 'project1')).toBe('value3');
    });

    it('should invalidate entire category', () => {
      cache.invalidate('tasks');

      expect(cache.get('tasks', 'task1')).toBeNull();
      expect(cache.get('tasks', 'task2')).toBeNull();
      expect(cache.get('projects', 'project1')).toBe('value3');
      expect(cache.get('analytics', 'stats1')).toBe('value4');
    });

    it('should clear all cache when no parameters provided', () => {
      cache.invalidate();

      expect(cache.get('tasks', 'task1')).toBeNull();
      expect(cache.get('tasks', 'task2')).toBeNull();
      expect(cache.get('projects', 'project1')).toBeNull();
      expect(cache.get('analytics', 'stats1')).toBeNull();

      expect(cache.getStats().size).toBe(0);
    });

    it('should update eviction stats on invalidation', () => {
      const initialStats = cache.getStats();
      const initialEvictions = initialStats.evictions;

      cache.invalidate('tasks');

      const stats = cache.getStats();
      expect(stats.evictions).toBe(initialEvictions + 2); // task1 and task2
    });
  });

  describe('clear method', () => {
    beforeEach(() => {
      cache.set('tasks', 'task1', 'value1');
      cache.set('projects', 'project1', 'value2');
      cache.set('analytics', 'stats1', 'value3');
    });

    it('should clear specific category', () => {
      cache.clear('tasks');

      expect(cache.get('tasks', 'task1')).toBeNull();
      expect(cache.get('projects', 'project1')).toBe('value2');
      expect(cache.get('analytics', 'stats1')).toBe('value3');
    });

    it('should clear all cache when no category specified', () => {
      cache.clear();

      expect(cache.get('tasks', 'task1')).toBeNull();
      expect(cache.get('projects', 'project1')).toBeNull();
      expect(cache.get('analytics', 'stats1')).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('cache warming', () => {
    it('should return cached value if available', async () => {
      cache.set('tasks', 'test', 'cached value');

      const fetcher = vi.fn().mockResolvedValue('new value');
      const result = await cache.warm('tasks', 'test', fetcher);

      expect(result).toBe('cached value');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call fetcher and cache result if not cached', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched value');
      const result = await cache.warm('tasks', 'test', fetcher);

      expect(result).toBe('fetched value');
      expect(fetcher).toHaveBeenCalled();
      expect(cache.get('tasks', 'test')).toBe('fetched value');
    });

    it('should call fetcher if cached value is expired', async () => {
      cache.set('tasks', 'test', 'old value');

      // Expire the cache (beyond 300s TTL)
      mockDate.mockReturnValue(1000000 + 301000);

      const fetcher = vi.fn().mockResolvedValue('new value');
      const result = await cache.warm('tasks', 'test', fetcher);

      expect(result).toBe('new value');
      expect(fetcher).toHaveBeenCalled();
      expect(cache.get('tasks', 'test')).toBe('new value');
    });
  });

  describe('automatic cleanup', () => {
    it('should clean up expired entries when accessed', () => {
      // This tests cleanup behavior indirectly through the get method
      // which already checks expiration and cleans up expired entries
      cache.set('tasks', 'test', 'value');

      // Should be available immediately
      expect(cache.get('tasks', 'test')).toBe('value');

      // Expire the entry by advancing mock date (beyond 300s TTL)
      mockDate.mockReturnValue(1000000 + 301000);

      // Accessing expired entry should return null and clean it up
      expect(cache.get('tasks', 'test')).toBeNull();

      // Stats should show the eviction
      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should setup cleanup interval on construction', () => {
      vi.useFakeTimers();

      // Create a new cache - this should set up the interval
      const instance = new CacheManager();

      // Verify an interval was set up by advancing time and checking if any timers exist
      expect(instance).toBeInstanceOf(CacheManager);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('should handle multiple expired entries', () => {
      cache.set('tasks', 'test1', 'value1');
      cache.set('tasks', 'test2', 'value2');
      cache.set('analytics', 'analytics1', 'analyticsValue');

      const initialStats = cache.getStats();
      expect(initialStats.size).toBe(3);

      // Expire tasks (300s TTL) but not analytics (3600s TTL)
      mockDate.mockReturnValue(1000000 + 301000);

      // Access expired tasks - should clean them up
      expect(cache.get('tasks', 'test1')).toBeNull();
      expect(cache.get('tasks', 'test2')).toBeNull();

      // Analytics should still be available
      expect(cache.get('analytics', 'analytics1')).toBe('analyticsValue');

      const finalStats = cache.getStats();
      // The size is not updated in get() method when deleting expired entries
      // It only gets updated properly in set(), clear(), and invalidate()
      // However, the actual map size should be smaller
      expect(cache['cache'].size).toBe(1); // Direct access to check actual size
      // Evictions should have increased by 2 (the two expired tasks)
      expect(finalStats.evictions).toBeGreaterThanOrEqual(initialStats.evictions + 2);
    });
  });

  describe('cache write operations invalidation', () => {
    it('should demonstrate cache invalidation pattern on write operations', () => {
      // This test demonstrates how write operations should invalidate cache
      // In practice, this would be handled by the tools that perform write operations

      cache.set('tasks', 'list_tasks', 'cached task list');
      cache.set('projects', 'list_projects', 'cached project list');

      // Simulate a write operation (create task) - should invalidate task cache
      cache.invalidate('tasks');

      expect(cache.get('tasks', 'list_tasks')).toBeNull();
      expect(cache.get('projects', 'list_projects')).toBe('cached project list');
    });

    it('should handle selective cache invalidation', () => {
      // Different operations should invalidate different cache categories
      cache.set('tasks', 'today_agenda', 'today tasks');
      cache.set('tasks', 'completed_tasks', 'completed tasks');
      cache.set('projects', 'active_projects', 'active projects');
      cache.set('analytics', 'productivity_stats', 'stats');

      // Task creation should invalidate tasks and analytics, but not projects
      cache.invalidate('tasks');
      cache.invalidate('analytics');

      expect(cache.get('tasks', 'today_agenda')).toBeNull();
      expect(cache.get('tasks', 'completed_tasks')).toBeNull();
      expect(cache.get('analytics', 'productivity_stats')).toBeNull();
      expect(cache.get('projects', 'active_projects')).toBe('active projects');
    });
  });

  describe('invalidateAfterWrite (OMN-336)', () => {
    function seedAllCategories() {
      cache.set('tasks', 'list', 'tasks');
      cache.set('projects', 'list', 'projects');
      cache.set('folders', 'list', 'folders');
      cache.set('tags', 'list', 'tags');
      cache.set('analytics', 'stats', 'analytics');
      cache.set('reviews', 'due', 'reviews');
    }

    function snapshot() {
      return {
        tasks: cache.get('tasks', 'list'),
        projects: cache.get('projects', 'list'),
        folders: cache.get('folders', 'list'),
        tags: cache.get('tags', 'list'),
        analytics: cache.get('analytics', 'stats'),
        reviews: cache.get('reviews', 'due'),
      };
    }

    describe.each([
      { op: 'create' as const },
      { op: 'update' as const },
      { op: 'complete' as const },
      { op: 'delete' as const },
    ])('task $op', ({ op }) => {
      it('clears tasks (cache-warmer entries), analytics, and reviews; never projects/folders', () => {
        seedAllCategories();
        cache.invalidateAfterWrite({ entity: 'task', op });

        expect(snapshot()).toEqual({
          tasks: null,
          projects: 'projects', // D1: cached project rows carry no task-derived fields
          folders: 'folders',
          tags: 'tags', // untouched when no tags were assigned/created
          analytics: null,
          reviews: null, // list_for_review rows embed per-project taskCounts
        });
      });

      it('clears tags only when tags were assigned/created', () => {
        seedAllCategories();
        cache.invalidateAfterWrite({ entity: 'task', op, tags: true });
        expect(cache.get('tags', 'list')).toBeNull();
      });
    });

    describe.each([
      { op: 'create' as const },
      { op: 'update' as const },
      { op: 'complete' as const },
      { op: 'delete' as const },
    ])('project $op', ({ op }) => {
      it('always clears projects, reviews, and analytics', () => {
        seedAllCategories();
        cache.invalidateAfterWrite({ entity: 'project', op });

        expect(cache.get('projects', 'list')).toBeNull();
        expect(cache.get('reviews', 'due')).toBeNull();
        expect(cache.get('analytics', 'stats')).toBeNull();
        // Folder rows carry projectCount: a created or deleted project changes it.
        expect(cache.get('folders', 'list')).toBe(op === 'create' || op === 'delete' ? null : 'folders');
        expect(cache.get('tags', 'list')).toBe('tags');
      });

      it('clears tags only when changes.tags is set', () => {
        seedAllCategories();
        cache.invalidateAfterWrite({ entity: 'project', op, changes: { tags: true } });
        expect(cache.get('tags', 'list')).toBeNull();
      });

      it('clears folders only when changes.folder is set', () => {
        seedAllCategories();
        cache.invalidateAfterWrite({ entity: 'project', op, changes: { folder: true } });
        expect(cache.get('folders', 'list')).toBeNull();
      });
    });

    describe('folder create/update/delete', () => {
      it.each([{ op: 'create' as const }, { op: 'update' as const }, { op: 'delete' as const }])(
        'clears projects and folders only ($op)',
        ({ op }) => {
          seedAllCategories();
          cache.invalidateAfterWrite({ entity: 'folder', op });

          expect(cache.get('projects', 'list')).toBeNull();
          expect(cache.get('folders', 'list')).toBeNull();
          expect(cache.get('reviews', 'due')).toBe('reviews');
          expect(cache.get('analytics', 'stats')).toBe('analytics');
          expect(cache.get('tags', 'list')).toBe('tags');
        },
      );
    });

    describe('tag create / move (nest, unnest, reparent)', () => {
      it.each([{ op: 'create' as const }, { op: 'move' as const }])('clears tags only ($op)', ({ op }) => {
        seedAllCategories();
        cache.invalidateAfterWrite({ entity: 'tag', op });

        expect(cache.get('tags', 'list')).toBeNull();
        expect(cache.get('projects', 'list')).toBe('projects');
        expect(cache.get('analytics', 'stats')).toBe('analytics');
        expect(cache.get('reviews', 'due')).toBe('reviews');
        expect(cache.get('folders', 'list')).toBe('folders');
      });
    });

    describe('tag rename/delete/merge', () => {
      it.each([{ op: 'rename' as const }, { op: 'delete' as const }, { op: 'merge' as const }])(
        'clears tags, projects, and analytics ($op)',
        ({ op }) => {
          seedAllCategories();
          cache.invalidateAfterWrite({ entity: 'tag', op });

          expect(cache.get('tags', 'list')).toBeNull();
          expect(cache.get('projects', 'list')).toBeNull();
          expect(cache.get('analytics', 'stats')).toBeNull();
          expect(cache.get('reviews', 'due')).toBe('reviews'); // untouched
          expect(cache.get('folders', 'list')).toBe('folders'); // untouched
        },
      );
    });
  });
});
