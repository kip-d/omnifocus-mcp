import { CacheEntry, CacheConfig, CacheCategory, CacheStats } from './types.js';
import { createLogger } from '../utils/logger.js';
import { createHash } from 'crypto';

const logger = createLogger('cache');

/**
 * OMN-336: one write event shape for every mutation that can stale the cache.
 * `invalidateAfterWrite` is the single source of truth mapping these to
 * category clears — see its doc comment for the table.
 */
export type WriteEvent =
  | { entity: 'task'; op: 'create' | 'update' | 'complete' | 'delete'; tags?: boolean }
  | {
      entity: 'project';
      op: 'create' | 'update' | 'complete' | 'delete';
      changes?: { tags?: boolean; folder?: boolean };
    }
  | { entity: 'folder'; op: 'create' | 'update' | 'delete' }
  | { entity: 'tag'; op: 'create' | 'rename' | 'delete' | 'merge' | 'move' };

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
    // Tasks are intentionally NOT cached at the tool layer (OmniFocusReadTool always
    // fetches fresh). This TTL exists only for the cache-warmer and any future callers
    // that explicitly opt in. Task data changes too frequently for stale reads to be safe.
    tasks: { ttl: 300 * 1000 }, // 5 min - cache-warmer only; ReadTool bypasses cache.
    // Projects and tags change less often; original TTLs kept for test stability.
    projects: { ttl: 300 * 1000 }, // 5 min - original value for compatibility.
    folders: { ttl: 600 * 1000 }, // 10 min - unchanged.
    analytics: { ttl: 3600 * 1000 }, // 1 h - unchanged.
    tags: { ttl: 600 * 1000 }, // 10 min - original value for compatibility.
    // Reviews are short-lived; keep a tight window.
    reviews: { ttl: 180 * 1000 }, // 3 min - unchanged.
  };

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Start cleanup interval (unref prevents keeping the event loop alive)
    const cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    cleanupInterval.unref();
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
      const keysToDelete = Array.from(this.cache.keys()).filter((key) => key.startsWith(category + ':'));
      keysToDelete.forEach((key) => {
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

    return fetcher().then((data) => {
      this.set(category, key, data);
      return data;
    });
  }

  /**
   * OMN-336: single declarative write→cache invalidation map. Every write handler
   * (task/project/folder/tag mutation, including batch and review-mutation paths)
   * routes through this one entry point instead of ad-hoc `invalidate(category)` /
   * per-id calls scattered across the tool layer — the category table below IS the
   * authoritative policy; don't special-case invalidation elsewhere.
   *
   * Whole-category clears only (decided: targeted per-project/per-tag key deletion
   * added complexity without a measured win — every affected category is small and
   * short-TTL, so over-invalidating a whole category can't under-invalidate and costs
   * one extra cache miss at worst).
   *
   * Category policy:
   * | Event                                   | projects | reviews | analytics | tags | folders |
   * |------------------------------------------|:--------:|:-------:|:---------:|:----:|:-------:|
   * | task create/update/complete/delete       |    –     |    –    |     ✓     | tags?|    –    |
   * | project create/update/complete/delete    |    ✓     |    ✓    |     ✓     | tags?|folder?  |
   * | folder create/update/delete              |    ✓     |    –    |     –     |  –   |    ✓    |
   * | tag create / move (nest/unnest/reparent) |    –     |    –    |     –     |  ✓   |    –    |
   * | tag rename/delete/merge                  |    ✓     |    –    |     ✓     |  ✓   |    –    |
   *
   * Task writes never clear `projects`: cached (non-`includeStats`) project rows
   * carry no task-derived fields — `taskCounts`/`nextTask`/`stats` are gated behind
   * `includeStats`, and `includeStats` reads bypass the cache entirely (see
   * OmniFocusReadTool). A cached project row therefore depends only on project
   * writes, never task writes.
   */
  public invalidateAfterWrite(event: WriteEvent): void {
    switch (event.entity) {
      case 'task':
        this.invalidate('tasks');
        this.invalidate('analytics');
        if (event.tags) this.invalidate('tags');
        break;
      case 'project':
        this.invalidate('projects');
        this.invalidate('reviews');
        this.invalidate('analytics');
        if (event.changes?.tags) this.invalidate('tags');
        if (event.changes?.folder) this.invalidate('folders');
        break;
      case 'folder':
        this.invalidate('projects');
        this.invalidate('folders');
        break;
      case 'tag':
        this.invalidate('tags');
        if (event.op === 'rename' || event.op === 'delete' || event.op === 'merge') {
          this.invalidate('projects');
          this.invalidate('analytics');
        }
        break;
    }
    logger.debug(`invalidateAfterWrite: ${event.entity}/${event.op}`, { event });
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
