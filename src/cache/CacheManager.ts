import { CacheEntry, CacheConfig, CacheCategory, CacheStats } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('cache');

export class CacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };

  private config: CacheConfig = {
    tasks: { ttl: 30 * 1000 },        // 30 seconds - GTD inbox processing needs frequent updates
    projects: { ttl: 300 * 1000 },    // 5 minutes - weekly review and project reorganization
    folders: { ttl: 600 * 1000 },     // 10 minutes - folders change less frequently
    analytics: { ttl: 3600 * 1000 },  // 1 hour - expensive computations
    tags: { ttl: 600 * 1000 },        // 10 minutes - tag assignments during processing
    reviews: { ttl: 180 * 1000 },     // 3 minutes - GTD review workflow needs fresh data
  };

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start cleanup interval
    setInterval(() => this.cleanup(), 60 * 1000); // Every minute
  }

  public get<T>(category: CacheCategory, key: string): T | null {
    const fullKey = `${category}:${key}`;
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.stats.misses++;
      logger.debug(`Cache miss for ${fullKey}`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      this.stats.evictions++;
      this.stats.misses++;
      logger.debug(`Cache expired for ${fullKey}`);
      return null;
    }

    this.stats.hits++;
    logger.debug(`Cache hit for ${fullKey}`);
    return entry.data as T;
  }

  public set<T>(category: CacheCategory, key: string, data: T): void {
    const fullKey = `${category}:${key}`;
    const ttl = this.config[category].ttl;
    const expiresAt = Date.now() + ttl;

    this.cache.set(fullKey, {
      data,
      expiresAt,
      key: fullKey,
    });

    this.stats.size = this.cache.size;
    logger.debug(`Cache set for ${fullKey}, expires in ${ttl}ms`);
  }

  public invalidate(category?: CacheCategory, key?: string): void {
    if (!category) {
      // Clear all cache
      const size = this.cache.size;
      this.cache.clear();
      this.stats.evictions += size;
      logger.info('Cleared entire cache');
    } else if (!key) {
      // Clear category
      let count = 0;
      for (const [cacheKey] of this.cache) {
        if (cacheKey.startsWith(`${category}:`)) {
          this.cache.delete(cacheKey);
          count++;
        }
      }
      this.stats.evictions += count;
      logger.info(`Cleared ${count} entries from ${category} cache`);
    } else {
      // Clear specific key
      const fullKey = `${category}:${key}`;
      if (this.cache.delete(fullKey)) {
        this.stats.evictions++;
        logger.debug(`Invalidated cache for ${fullKey}`);
      }
    }

    this.stats.size = this.cache.size;
  }

  public getStats(): CacheStats {
    return { ...this.stats };
  }

  public clear(category?: keyof CacheConfig): void {
    if (category) {
      // Clear specific category
      const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(category + ':'));
      keysToDelete.forEach(key => {
        this.cache.delete(key);
        this.stats.evictions++;
      });
      logger.info(`Cleared ${keysToDelete.length} entries from ${category} cache`);
    } else {
      // Clear all
      const size = this.cache.size;
      this.cache.clear();
      this.stats.evictions += size;
      logger.info(`Cleared all ${size} cache entries`);
    }
    this.stats.size = this.cache.size;
  }

  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.cache.size;
      logger.debug(`Evicted ${evicted} expired entries`);
    }
  }

  public warm<T>(category: CacheCategory, key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(category, key);
    if (cached !== null) {
      return Promise.resolve(cached);
    }

    return fetcher().then(data => {
      this.set(category, key, data);
      return data;
    });
  }

  /**
   * GTD-optimized selective cache invalidation
   * Invalidates specific task query patterns while preserving others
   */
  public invalidateTaskQueries(patterns: ('today' | 'overdue' | 'upcoming' | 'inbox' | 'all')[] = ['all']): void {
    let count = 0;
    for (const [cacheKey] of this.cache) {
      if (cacheKey.startsWith('tasks:')) {
        const shouldInvalidate = patterns.some(pattern => {
          switch (pattern) {
            case 'today':
              return cacheKey.includes('tasks_today') || cacheKey.includes('todays_agenda');
            case 'overdue':
              return cacheKey.includes('tasks_overdue') || cacheKey.includes('overdue');
            case 'upcoming':
              return cacheKey.includes('tasks_upcoming') || cacheKey.includes('upcoming');
            case 'inbox':
              return cacheKey.includes('inbox') || cacheKey.includes('project_null');
            case 'all':
              return true; // Invalidate all task queries
            default:
              return false;
          }
        });

        if (shouldInvalidate) {
          this.cache.delete(cacheKey);
          count++;
        }
      }
    }

    this.stats.evictions += count;
    this.stats.size = this.cache.size;
    logger.info(`Invalidated ${count} task cache entries for patterns: ${patterns.join(', ')}`);
  }

  /**
   * GTD workflow-aware cache refresh
   * Provides different caching strategies for different GTD contexts
   */
  public refreshForWorkflow(workflow: 'inbox_processing' | 'weekly_review' | 'daily_planning'): void {
    switch (workflow) {
      case 'inbox_processing':
        // Clear task and project caches for immediate updates during processing
        this.invalidateTaskQueries(['today', 'inbox']);
        this.invalidate('projects'); // Projects might change as tasks are organized
        break;
      case 'weekly_review':
        // Clear everything except analytics for comprehensive review
        this.invalidate('tasks');
        this.invalidate('projects');
        this.invalidate('reviews');
        break;
      case 'daily_planning':
        // Only clear today's agenda and upcoming tasks
        this.invalidateTaskQueries(['today', 'upcoming', 'overdue']);
        break;
    }
  }
}
