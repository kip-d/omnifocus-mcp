import { CacheEntry, CacheConfig, CacheCategory, CacheStats } from './types.js';
import { createLogger } from '../utils/logger.js';
import { createHash } from 'crypto';

const logger = createLogger('cache');

export class CacheManager {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    checksumFailures: 0,
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

  /**
   * Calculate SHA-256 checksum for data integrity validation
   */
  private calculateChecksum(data: unknown): string {
    const serialized = JSON.stringify(data);
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Validate data integrity using checksum
   */
  private validateChecksum(data: unknown, expectedChecksum: string): boolean {
    const actualChecksum = this.calculateChecksum(data);
    return actualChecksum === expectedChecksum;
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

    // Validate data integrity if checksum is present
    if (entry.checksum && !this.validateChecksum(entry.data, entry.checksum)) {
      this.cache.delete(fullKey);
      this.stats.checksumFailures++;
      this.stats.misses++;
      logger.warn(`Cache checksum validation failed for ${fullKey} - data may be corrupted`);
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
    const checksum = this.calculateChecksum(data);

    this.cache.set(fullKey, {
      data,
      expiresAt,
      key: fullKey,
      checksum,
    });

    this.stats.size = this.cache.size;
    logger.debug(`Cache set for ${fullKey} with checksum ${checksum.substring(0, 8)}..., expires in ${ttl}ms`);
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

  public getStats(): CacheStats & { checksumFailureRate: number } {
    const total = this.stats.hits + this.stats.misses;
    const checksumFailureRate = total > 0 ? (this.stats.checksumFailures / total) * 100 : 0;

    return {
      ...this.stats,
      checksumFailureRate: Math.round(checksumFailureRate * 100) / 100, // Round to 2 decimal places
    };
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

  /**
   * Smart invalidation: Invalidate only cache entries affected by a specific project
   * @param projectId The project ID that was modified
   */
  public invalidateProject(projectId: string): void {
    let count = 0;
    for (const [cacheKey] of this.cache) {
      // Invalidate:
      // - Specific project queries: tasks:project:abc123
      // - Project list queries that might include this project
      // - Task queries that filter by this project
      if (
        cacheKey.startsWith('tasks:') && cacheKey.includes(`project:${projectId}`) ||
        cacheKey.startsWith('tasks:') && cacheKey.includes(`projectId:${projectId}`) ||
        cacheKey.startsWith('projects:') ||  // Project lists need refresh
        cacheKey === `projects:${projectId}`  // Specific project cache
      ) {
        this.cache.delete(cacheKey);
        count++;
      }
    }

    this.stats.evictions += count;
    this.stats.size = this.cache.size;
    logger.debug(`Invalidated ${count} cache entries for project ${projectId}`);
  }

  /**
   * Smart invalidation: Invalidate only cache entries affected by a specific tag
   * @param tagName The tag name that was modified
   */
  public invalidateTag(tagName: string): void {
    let count = 0;
    for (const [cacheKey] of this.cache) {
      // Invalidate:
      // - Tag queries: tags:*
      // - Task queries filtered by this tag: tasks:tag:work
      if (
        cacheKey.startsWith('tags:') ||
        (cacheKey.startsWith('tasks:') && cacheKey.includes(`tag:${tagName}`)) ||
        (cacheKey.startsWith('tasks:') && cacheKey.includes(`tags:${tagName}`))
      ) {
        this.cache.delete(cacheKey);
        count++;
      }
    }

    this.stats.evictions += count;
    this.stats.size = this.cache.size;
    logger.debug(`Invalidated ${count} cache entries for tag ${tagName}`);
  }

  /**
   * Smart invalidation: Invalidate based on what changed in a task operation
   * @param context Information about what changed
   */
  public invalidateForTaskChange(context: {
    operation: 'create' | 'update' | 'complete' | 'delete';
    projectId?: string;
    tags?: string[];
    affectsToday?: boolean;
    affectsOverdue?: boolean;
  }): void {
    const patterns: ('today' | 'overdue' | 'upcoming' | 'inbox' | 'all')[] = [];

    // Determine which query patterns are affected
    if (context.affectsToday) patterns.push('today');
    if (context.affectsOverdue) patterns.push('overdue');
    if (context.operation === 'create' && !context.projectId) patterns.push('inbox');

    // For updates/deletes, we need to be more conservative
    if (context.operation === 'update' || context.operation === 'delete') {
      patterns.push('upcoming'); // Might affect upcoming queries
    }

    // Invalidate affected task queries
    if (patterns.length > 0) {
      this.invalidateTaskQueries(patterns);
    }

    // Invalidate project-specific caches
    if (context.projectId) {
      this.invalidateProject(context.projectId);
    }

    // Invalidate tag-specific caches
    if (context.tags && context.tags.length > 0) {
      context.tags.forEach(tag => this.invalidateTag(tag));
    }

    // Always invalidate analytics for any task change
    this.invalidate('analytics');

    logger.debug(`Smart invalidation for ${context.operation}: ${patterns.length} patterns, project: ${context.projectId}, tags: ${context.tags?.length || 0}`);
  }


  /**
   * Validate all cached entries and report corruption
   */
  public validateAllEntries(): { total: number; corrupted: number; details: string[] } {
    const details: string[] = [];
    let corrupted = 0;
    let total = 0;

    for (const [fullKey, entry] of this.cache) {
      total++;
      if (entry.checksum && !this.validateChecksum(entry.data, entry.checksum)) {
        corrupted++;
        details.push(`${fullKey}: checksum mismatch`);
        logger.warn(`Cache validation found corrupted entry: ${fullKey}`);
      }
    }

    return { total, corrupted, details };
  }
}
