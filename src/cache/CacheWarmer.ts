/**
 * Cache Warming System for OmniFocus MCP Server
 *
 * Pre-populates cache with frequently accessed data during server startup
 * to eliminate cold start delays on first queries.
 */

import { CacheManager } from './CacheManager.js';
import { createLogger } from '../utils/logger.js';
import { ProjectsToolV2 } from '../tools/projects/ProjectsToolV2.js';
import { TagsToolV2 } from '../tools/tags/TagsToolV2.js';
import { QueryTasksToolV2 } from '../tools/tasks/QueryTasksToolV2.js';
import { PerspectivesToolV2 } from '../tools/perspectives/PerspectivesToolV2.js';

const logger = createLogger('cache-warmer');

export interface WarmingStrategy {
  /** Enable cache warming (default: true) */
  enabled?: boolean;
  /** Timeout for warming operations in ms (default: 5000) */
  timeout?: number;
  /** Categories to warm */
  categories?: {
    projects?: boolean;
    tags?: boolean;
    tasks?: boolean;
    perspectives?: boolean;
  };
  /** Task warming options */
  taskWarmingOptions?: {
    /** Warm today's tasks (highest priority) */
    today?: boolean;
    /** Warm overdue tasks (high priority) */
    overdue?: boolean;
    /** Warm upcoming tasks (medium priority) */
    upcoming?: boolean;
    /** Warm flagged tasks (medium priority) */
    flagged?: boolean;
  };
}

export class CacheWarmer {
  private cache: CacheManager;
  private strategy: Required<WarmingStrategy>;

  constructor(cache: CacheManager, strategy: WarmingStrategy = {}) {
    this.cache = cache;
    this.strategy = {
      enabled: true,
      timeout: 5000,
      categories: {
        projects: true,
        tags: true,
        tasks: true,
        perspectives: true, // Fast operation (~340ms), valuable with enhanced PerspectivesToolV2
        ...strategy.categories,
      },
      taskWarmingOptions: {
        today: true,
        overdue: true,
        upcoming: true,
        flagged: false, // Lower priority
        ...strategy.taskWarmingOptions,
      },
      ...strategy,
    };
  }

  /**
   * Warm cache with frequently accessed data
   */
  async warmCache(): Promise<WarmingResults> {
    if (!this.strategy.enabled) {
      logger.info('Cache warming disabled');
      return { enabled: false, results: [] };
    }

    const startTime = Date.now();
    logger.info('Starting cache warming...');

    const operations: Promise<WarmingResult>[] = [];
    const { categories, taskWarmingOptions } = this.strategy;

    // Warm projects - highest priority, used by most operations
    if (categories.projects) {
      operations.push(this.warmProjects());
    }

    // Warm tags - high priority, used for filtering
    if (categories.tags) {
      operations.push(this.warmTags());
    }

    // Warm common task queries - medium to high priority
    if (categories.tasks) {
      if (taskWarmingOptions.today) {
        operations.push(this.warmTodaysTasks());
      }
      if (taskWarmingOptions.overdue) {
        operations.push(this.warmOverdueTasks());
      }
      if (taskWarmingOptions.upcoming) {
        operations.push(this.warmUpcomingTasks());
      }
      if (taskWarmingOptions.flagged) {
        operations.push(this.warmFlaggedTasks());
      }
    }

    // Warm perspectives - lowest priority
    if (categories.perspectives) {
      operations.push(this.warmPerspectives());
    }

    // Execute warming operations with timeout
    const results = await this.executeWithTimeout(operations);
    const totalTime = Date.now() - startTime;

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    logger.info(`Cache warming completed: ${successCount}/${totalCount} operations succeeded in ${totalTime}ms`);

    return {
      enabled: true,
      results,
      totalTime,
      successCount,
      totalCount,
    };
  }

  /**
   * Warm projects cache with active projects list
   */
  private async warmProjects(): Promise<WarmingResult> {
    const operation = 'projects';
    const startTime = Date.now();

    try {
      logger.debug('Warming projects cache...');

      // Create a temporary tool instance for warming
      const projectsTool = new ProjectsToolV2(this.cache);

      // Warm the most common project queries
      await Promise.all([
        // Active projects (most common)
        this.warmSingleOperation('projects', 'projects_active', async () => {
          const result = await projectsTool.execute({ operation: 'list', status: 'active' });
          return result.success ? result.data : null;
        }),

        // All projects list
        this.warmSingleOperation('projects', 'projects_list_{}', async () => {
          const result = await projectsTool.execute({ operation: 'list' });
          return result.success ? result.data : null;
        }),

        // Review-ready projects
        this.warmSingleOperation('projects', 'projects_review', async () => {
          const result = await projectsTool.execute({ operation: 'review' });
          return result.success ? result.data : null;
        }),
      ]);

      const duration = Date.now() - startTime;
      logger.debug(`Projects cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm projects cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Warm tags cache with active tags
   */
  private async warmTags(): Promise<WarmingResult> {
    const operation = 'tags';
    const startTime = Date.now();

    try {
      logger.debug('Warming tags cache...');

      const tagsTool = new TagsToolV2(this.cache);

      await Promise.all([
        // Active tags (most common for filtering)
        this.warmSingleOperation('tags', 'active_tags', async () => {
          const result = await tagsTool.execute({ operation: 'list', active: true });
          if (result && typeof result === 'object' && 'success' in result && 'data' in result) {
            return result.success ? result.data : null;
          }
          return null;
        }),

        // All tags with usage stats
        this.warmSingleOperation('tags', 'list:usage:false:true:false:false', async () => {
          const result = await tagsTool.execute({
            operation: 'list',
            sortBy: 'usage',
            includeUsageStats: true,
          });
          if (result && typeof result === 'object' && 'success' in result && 'data' in result) {
            return result.success ? result.data : null;
          }
          return null;
        }),
      ]);

      const duration = Date.now() - startTime;
      logger.debug(`Tags cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm tags cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Warm today's tasks cache
   */
  private async warmTodaysTasks(): Promise<WarmingResult> {
    const operation = 'tasks_today';
    const startTime = Date.now();

    try {
      logger.debug('Warming today\'s tasks cache...');

      const tasksTool = new QueryTasksToolV2(this.cache);

      // Today's agenda with default parameters
      await this.warmSingleOperation('tasks', 'tasks_today_25_false', async () => {
        const result = await tasksTool.execute({ mode: 'today', limit: 25 });
        return result.success ? result.data : null;
      });

      const duration = Date.now() - startTime;
      logger.debug(`Today's tasks cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm today's tasks cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Warm overdue tasks cache
   */
  private async warmOverdueTasks(): Promise<WarmingResult> {
    const operation = 'tasks_overdue';
    const startTime = Date.now();

    try {
      logger.debug('Warming overdue tasks cache...');

      const tasksTool = new QueryTasksToolV2(this.cache);

      // Overdue tasks with default parameters
      await this.warmSingleOperation('tasks', 'tasks_overdue_25_false', async () => {
        const result = await tasksTool.execute({ mode: 'overdue', limit: 25 });
        return result.success ? result.data : null;
      });

      const duration = Date.now() - startTime;
      logger.debug(`Overdue tasks cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm overdue tasks cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Warm upcoming tasks cache
   */
  private async warmUpcomingTasks(): Promise<WarmingResult> {
    const operation = 'tasks_upcoming';
    const startTime = Date.now();

    try {
      logger.debug('Warming upcoming tasks cache...');

      const tasksTool = new QueryTasksToolV2(this.cache);

      // Upcoming tasks (7 days ahead with default limit)
      await this.warmSingleOperation('tasks', 'tasks_upcoming_7_25', async () => {
        const result = await tasksTool.execute({ mode: 'upcoming', days: 7, limit: 25 });
        return result.success ? result.data : null;
      });

      const duration = Date.now() - startTime;
      logger.debug(`Upcoming tasks cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm upcoming tasks cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Warm flagged tasks cache
   */
  private async warmFlaggedTasks(): Promise<WarmingResult> {
    const operation = 'tasks_flagged';
    const startTime = Date.now();

    try {
      logger.debug('Warming flagged tasks cache...');

      const tasksTool = new QueryTasksToolV2(this.cache);

      // Flagged tasks with default parameters
      await this.warmSingleOperation('tasks', 'tasks_flagged_25_false', async () => {
        const result = await tasksTool.execute({ mode: 'flagged', limit: 25 });
        return result.success ? result.data : null;
      });

      const duration = Date.now() - startTime;
      logger.debug(`Flagged tasks cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm flagged tasks cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Warm perspectives cache (lower priority)
   */
  private async warmPerspectives(): Promise<WarmingResult> {
    const operation = 'perspectives';
    const startTime = Date.now();

    try {
      logger.debug('Warming perspectives cache...');

      const perspectivesTool = new PerspectivesToolV2(this.cache);

      // List all perspectives (store under tasks category since they query tasks)
      await this.warmSingleOperation('tasks', 'perspectives_list', async () => {
        const result = await perspectivesTool.execute({ operation: 'list' });
        if (result && typeof result === 'object' && 'success' in result && 'data' in result) {
          return result.success ? result.data : null;
        }
        return null;
      });

      const duration = Date.now() - startTime;
      logger.debug(`Perspectives cache warmed in ${duration}ms`);

      return { operation, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`Failed to warm perspectives cache: ${error instanceof Error ? error.message : String(error)}`);
      return { operation, success: false, duration, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Helper to warm a single cache operation
   */
  private async warmSingleOperation<T>(
    category: 'projects' | 'tags' | 'tasks' | 'folders' | 'analytics' | 'reviews',
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    return this.cache.warm(category, key, fetcher);
  }

  /**
   * Execute operations with timeout
   */
  private async executeWithTimeout(operations: Promise<WarmingResult>[]): Promise<WarmingResult[]> {
    const timeoutPromise = new Promise<WarmingResult[]>((_, reject) => {
      setTimeout(() => reject(new Error('Cache warming timeout')), this.strategy.timeout);
    });

    try {
      return await Promise.race([
        Promise.allSettled(operations).then(results =>
          results.map(result =>
            result.status === 'fulfilled'
              ? result.value
              : {
                  operation: 'unknown',
                  success: false,
                  duration: 0,
                  error: result.reason instanceof Error ? result.reason.message : 'Operation failed',
                },
          ),
        ),
        timeoutPromise,
      ]);
    } catch {
      logger.warn(`Cache warming timeout after ${this.strategy.timeout}ms`);
      // Return partial results if available
      return operations.map(() => ({
        operation: 'timeout',
        success: false,
        duration: this.strategy.timeout,
        error: 'Timeout exceeded',
      }));
    }
  }
}

export interface WarmingResult {
  operation: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface WarmingResults {
  enabled: boolean;
  results: WarmingResult[];
  totalTime?: number;
  successCount?: number;
  totalCount?: number;
}
