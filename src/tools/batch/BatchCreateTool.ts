/**
 * Batch Create Tool
 *
 * Creates multiple projects and tasks in a single operation with support
 * for hierarchical relationships using temporary IDs.
 */

import { BaseTool } from '../base.js';
import { BatchCreateSchema, BatchCreateInput, BatchItem } from './batch-schemas.js';
import { TempIdResolver } from './tempid-resolver.js';
import { DependencyGraph, DependencyGraphError } from './dependency-graph.js';
import { createErrorResponseV2, createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import { CREATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects/create-project.js';
import { DELETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects/delete-project.js';
import { CREATE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks/create-task-with-bridge.js';
import { DELETE_TASK_SCRIPT } from '../../omnifocus/scripts/tasks.js';
import { isScriptSuccess, isScriptError } from '../../omnifocus/script-result-types.js';
import { localToUTC } from '../../utils/timezone.js';

interface ItemCreationResult {
  tempId: string;
  realId: string | null;
  success: boolean;
  error?: string;
  type: 'project' | 'task';
}

/**
 * Tool for batch creation of projects and tasks with hierarchical relationships
 */
export class BatchCreateTool extends BaseTool<typeof BatchCreateSchema> {
  name = 'batch_create';
  description =
    'Create multiple NEW projects and tasks in a single operation with hierarchical relationships. ' +
    'Use temporary IDs to reference parent-child relationships within the batch. ' +
    'NOTE: This tool creates new hierarchies from scratch. To add tasks to an EXISTING project, use manage_task instead. ' +
    'Optimized for local LLMs to avoid expensive sequential operations.';

  schema = BatchCreateSchema;
  meta = {
    // Phase 1: Essential metadata
    category: 'Task Management' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'moderate' as const,
    tags: ['mutations', 'write', 'batch', 'create', 'hierarchy'],
    capabilities: ['batch-create', 'hierarchy', 'projects', 'tasks'],

    // Phase 2: Capability & Performance Documentation
    maxResults: 1000, // Max items to create per batch
    maxQueryDuration: 30000, // 30 seconds for batch operations
    requiresPermission: true,
    requiredCapabilities: ['read', 'write'],
    limitations: [
      'Creates NEW projects/tasks only - cannot add items to existing projects (use manage_task instead)',
      'Maximum 1000 items per batch',
      'Batch operations may take 10-30 seconds depending on item count',
      'Atomic operations not fully supported (partial rollback on failure)',
      'Temporary IDs must be unique within the batch',
      'Complex hierarchies may require sequential creation',
    ],
  };

  async executeValidated(args: BatchCreateInput): Promise<unknown> {
    const timer = new OperationTimerV2();
    const resolver = new TempIdResolver();
    const results: ItemCreationResult[] = [];

    try {
      // Step 1: Validate and build dependency graph
      const graph = new DependencyGraph(args.items as BatchItem[]);
      const stats = graph.getStats();

      this.logger.info('Batch create initiated', {
        itemCount: stats.totalItems,
        projects: stats.projects,
        tasks: stats.tasks,
        maxDepth: stats.maxDepth,
        atomic: args.atomicOperation,
      });

      // Step 2: Register all temporary IDs
      for (const item of args.items) {
        resolver.register(item.tempId, item.type);
      }

      // Step 3: Get creation order (respects dependencies)
      const orderedItems = args.createSequentially
        ? graph.getCreationOrder()
        : args.items;

      // Step 4: Create items in order
      for (let i = 0; i < orderedItems.length; i++) {
        const item = orderedItems[i];
        try {
          const result = await this.createItem(item, resolver);
          results.push(result);

          if (result.success && result.realId) {
            resolver.resolve(item.tempId, result.realId);
          } else {
            resolver.markFailed(item.tempId, result.error || 'Creation failed');

            // Stop on error if configured
            if (args.stopOnError) {
              break;
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          resolver.markFailed(item.tempId, errorMsg);
          results.push({
            tempId: item.tempId,
            realId: null,
            success: false,
            error: errorMsg,
            type: item.type,
          });

          if (args.stopOnError) {
            break;
          }
        }
      }


      // Step 5: Handle atomic operation rollback if needed
      const failedCount = resolver.getFailedCount();
      if (args.atomicOperation && failedCount > 0) {
        await this.rollbackCreations(resolver);
        return createErrorResponseV2(
          'batch_create',
          'ATOMIC_OPERATION_FAILED',
          `Batch operation failed with ${failedCount} errors. All ${resolver.getCreatedCount()} created items have been rolled back.`,
          'Review the errors in the results and fix the issues before retrying',
          { results, rolledBack: true },
          { query_time_ms: timer.toMetadata().query_time_ms },
        );
      }

      // Step 6: Smart cache invalidation after successful batch creations
      if (resolver.getCreatedCount() > 0) {
        // Invalidate projects cache (batch may create/modify projects)
        this.cache.invalidate('projects');

        // Collect unique project IDs and tags from created items
        const projectIds = new Set<string>();
        const tags = new Set<string>();

        for (const item of args.items) {
          if (item.type === 'project' && results.find(r => r.tempId === item.tempId)?.success) {
            // Created project - invalidate its specific cache later
            const realId = resolver.getRealId(item.tempId);
            if (realId) projectIds.add(realId);
          }
          if (item.tags) {
            item.tags.forEach(tag => tags.add(tag));
          }
        }

        // Invalidate affected project caches
        projectIds.forEach(id => this.cache.invalidateProject(id));

        // Invalidate affected tag caches
        tags.forEach(tag => this.cache.invalidateTag(tag));

        // Invalidate task queries that might be affected
        this.cache.invalidateTaskQueries(['today', 'inbox']);

        // Always invalidate analytics
        this.cache.invalidate('analytics');
      }

      // Step 7: Build response
      const successCount = resolver.getCreatedCount();
      const response: Record<string, unknown> = {
        success: successCount > 0,
        created: successCount,
        failed: failedCount,
        totalItems: args.items.length,
        results,
      };

      if (args.returnMapping) {
        response.mapping = resolver.getMappings();
      }

      return createSuccessResponseV2(
        'batch_create',
        response,
        undefined, // No summary needed for batch operations
        { query_time_ms: timer.toMetadata().query_time_ms },
      );

    } catch (error) {
      // Handle validation errors (circular dependencies, etc.)
      if (error instanceof DependencyGraphError) {
        return createErrorResponseV2(
          'batch_create',
          'VALIDATION_ERROR',
          error.message,
          'Fix the dependency issues and retry',
          error.details,
          timer.toMetadata(),
        );
      }

      throw error;
    }
  }

  /**
   * Create a single item (project or task)
   */
  private async createItem(item: BatchItem, resolver: TempIdResolver): Promise<ItemCreationResult> {
    this.logger.debug(`Creating ${item.type}: ${item.name}`, { tempId: item.tempId });

    try {
      if (item.type === 'project') {
        return await this.createProject(item, resolver);
      } else {
        return await this.createTask(item, resolver);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        tempId: item.tempId,
        realId: null,
        success: false,
        error: errorMsg,
        type: item.type,
      };
    }
  }

  /**
   * Create a project
   */
  private async createProject(item: BatchItem, _resolver: TempIdResolver): Promise<ItemCreationResult> {
    const options = {
      note: item.note || '',
      flagged: item.flagged || false,
      status: (item as { status?: string }).status || 'active',
      sequential: (item as { sequential?: boolean }).sequential || false,
      tags: item.tags || [],
    };

    const script = this.omniAutomation.buildScript(CREATE_PROJECT_SCRIPT, {
      name: item.name,
      options,
    });
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return {
        tempId: item.tempId,
        realId: null,
        success: false,
        error: result.error,
        type: 'project',
      };
    }

    if (isScriptSuccess(result) && result.data) {
      const data = result.data as { project?: { id: string } };
      const realId = data.project?.id;

      if (realId) {
        return {
          tempId: item.tempId,
          realId,
          success: true,
          type: 'project',
        };
      }
    }

    return {
      tempId: item.tempId,
      realId: null,
      success: false,
      error: 'No project ID returned from script',
      type: 'project',
    };
  }

  /**
   * Create a task
   */
  private async createTask(item: BatchItem, resolver: TempIdResolver): Promise<ItemCreationResult> {
    // Resolve parent reference if present
    let projectId: string | null = null;
    let parentTaskId: string | null = null;

    if (item.parentTempId) {
      const parentRealId = resolver.getRealId(item.parentTempId);
      if (!parentRealId) {
        return {
          tempId: item.tempId,
          realId: null,
          success: false,
          error: `Parent not yet created: ${item.parentTempId}`,
          type: 'task',
        };
      }

      // Determine if parent is a project or task
      const parentMapping = resolver.getDetailedStatus().find(m => m.tempId === item.parentTempId);
      if (parentMapping?.type === 'project') {
        projectId = parentRealId;
      } else {
        parentTaskId = parentRealId;
      }
    }

    // Convert dates to UTC
    const taskData: Record<string, unknown> = {
      name: item.name,
      note: item.note || '',
      flagged: item.flagged || false,
      projectId,
      parentTaskId,
      tags: item.tags || [],
    };

    // Handle task-specific fields
    const taskItem = item as { dueDate?: string; deferDate?: string; estimatedMinutes?: number | string; sequential?: boolean };

    if (taskItem.dueDate) {
      taskData.dueDate = localToUTC(taskItem.dueDate, 'due');
    }
    if (taskItem.deferDate) {
      taskData.deferDate = localToUTC(taskItem.deferDate, 'defer');
    }
    if (taskItem.estimatedMinutes !== undefined) {
      taskData.estimatedMinutes = typeof taskItem.estimatedMinutes === 'string'
        ? parseInt(taskItem.estimatedMinutes, 10)
        : taskItem.estimatedMinutes;
    }
    if (taskItem.sequential !== undefined) {
      taskData.sequential = taskItem.sequential;
    }

    const script = this.omniAutomation.buildScript(CREATE_TASK_SCRIPT, { taskData });
    const result = await this.execJson(script);

    if (isScriptError(result)) {
      return {
        tempId: item.tempId,
        realId: null,
        success: false,
        error: result.error,
        type: 'task',
      };
    }

    if (isScriptSuccess(result) && result.data) {
      const data = result.data as { taskId?: string };
      const realId = data.taskId;

      if (realId) {
        return {
          tempId: item.tempId,
          realId,
          success: true,
          type: 'task',
        };
      }
    }

    return {
      tempId: item.tempId,
      realId: null,
      success: false,
      error: 'No task ID returned from script',
      type: 'task',
    };
  }

  /**
   * Rollback all created items in reverse order
   */
  private async rollbackCreations(resolver: TempIdResolver): Promise<void> {
    const createdItems = resolver.getCreatedIds();
    this.logger.warn(`Rolling back ${createdItems.length} created items`);

    // Delete in reverse order (children first, parents last)
    for (let i = createdItems.length - 1; i >= 0; i--) {
      const item = createdItems[i];
      try {
        const script = item.type === 'project'
          ? this.omniAutomation.buildScript(DELETE_PROJECT_SCRIPT, { projectId: item.realId })
          : this.omniAutomation.buildScript(DELETE_TASK_SCRIPT, { taskId: item.realId });

        await this.execJson(script);
        this.logger.debug(`Rolled back ${item.type}: ${item.realId}`);
      } catch (error) {
        this.logger.error(`Failed to rollback ${item.type} ${item.realId}:`, error);
      }
    }
  }
}
