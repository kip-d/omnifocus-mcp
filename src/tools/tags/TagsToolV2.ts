import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_TAGS_SCRIPT_V3 } from '../../omnifocus/scripts/tags/list-tags-v3.js';
import { GET_ACTIVE_TAGS_SCRIPT } from '../../omnifocus/scripts/tags/list-tags.js';
import { MANAGE_TAGS_SCRIPT } from '../../omnifocus/scripts/tags/manage-tags.js';
import { createListResponseV2, createSuccessResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import { TagNameSchema } from '../schemas/shared-schemas.js';
import { coerceBoolean } from '../schemas/coercion-helpers.js';
import { isScriptSuccess } from '../../omnifocus/script-result-types.js';
import type { TagsResponseV2, TagOperationResponseV2, TagsDataV2, TagOperationDataV2 } from '../response-types-v2.js';

// Consolidated schema for all tag operations
const TagsToolSchema = z.object({
  operation: z.enum(['list', 'active', 'manage'])
    .default('list')
    .describe('Operation to perform: list all tags, get active tags only, or manage tags (create/rename/delete/merge)'),

  // List operation parameters
  sortBy: z.enum(['name', 'usage', 'tasks'])
    .default('name')
    .describe('How to sort the tags (list operation)'),

  includeEmpty: coerceBoolean()
    .default(true)
    .describe('Include tags with no tasks (list operation)'),

  includeUsageStats: coerceBoolean()
    .default(false)
    .describe('Calculate task usage statistics for each tag - slower on large databases (list operation)'),

  includeTaskCounts: coerceBoolean()
    .default(false)
    .describe('Include task count information for each tag (list operation)'),

  fastMode: coerceBoolean()
    .default(true)
    .describe('Skip parent/child relationships for better performance (list operation)'),

  namesOnly: coerceBoolean()
    .default(false)
    .describe('Ultra-fast mode: Return only tag names without IDs or hierarchy (list operation)'),

  // Manage operation parameters
  action: z.enum(['create', 'rename', 'delete', 'merge', 'nest', 'unparent', 'reparent', 'set_mutual_exclusivity'])
    .optional()
    .describe('The management action to perform (manage operation). set_mutual_exclusivity: toggle mutual exclusivity constraint on tag children (OmniFocus 4.7+)'),

  tagName: TagNameSchema
    .optional()
    .describe('The tag name to create or operate on (manage operation)'),

  newName: TagNameSchema
    .optional()
    .describe('New name for rename action (manage operation)'),

  targetTag: TagNameSchema
    .optional()
    .describe('Target tag for merge action (manage operation)'),

  parentTagName: TagNameSchema
    .optional()
    .describe('Parent tag name for creating nested tags or nest/reparent operations'),

  parentTagId: z.string()
    .optional()
    .describe('Parent tag ID for creating nested tags or nest/reparent operations'),

  // Mutual exclusivity operation parameter (OmniFocus 4.7+)
  mutuallyExclusive: coerceBoolean()
    .optional()
    .describe('Set to true to make tag children mutually exclusive, false to disable (set_mutual_exclusivity action, OmniFocus 4.7+)'),
});

type TagsToolInput = z.infer<typeof TagsToolSchema>;

export class TagsToolV2 extends BaseTool<typeof TagsToolSchema, TagsResponseV2 | TagOperationResponseV2> {
  name = 'tags';
  description = 'Comprehensive tag management with hierarchy support: list all tags (including parent-child relationships), get active tags, or manage tags (create nested tags, rename, delete, merge, nest, unparent, reparent). Use operation="list" for all tags with hierarchy, "active" for tags with incomplete tasks, "manage" for CRUD and hierarchy operations.';
  schema = TagsToolSchema;
  meta = {
    // Phase 1: Essential metadata
    category: 'Organization' as const,
    stability: 'stable' as const,
    complexity: 'simple' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'mutations', 'hierarchy', 'metadata'],
    capabilities: ['list', 'create', 'delete', 'manage', 'hierarchy'],

    // Phase 2: Capability & Performance Documentation
    maxResults: 1000,
    maxQueryDuration: 3000, // 3 seconds
    requiresPermission: true,
    requiredCapabilities: ['read', 'write'],
    limitations: [
      'Maximum 1000 tags per query',
      'Tag hierarchy supported (parent-child relationships)',
      'Tags must have unique names within same parent',
      'Deleting parent tag also deletes all children',
      'set_mutual_exclusivity requires OmniFocus 4.7+',
    ],
  };

  async executeValidated(args: TagsToolInput): Promise<TagsResponseV2 | TagOperationResponseV2> {
    const { operation } = args;

    switch (operation) {
      case 'list':
        return this.listTags(args);
      case 'active':
        return this.getActiveTags();
      case 'manage':
        return this.manageTags(args);
      default:
        {
          const timer = new OperationTimerV2();
          return createErrorResponseV2(
            'tags',
            'INVALID_OPERATION',
            `Invalid operation: ${String(operation)}`,
            undefined,
            { operation },
            timer.toMetadata(),
          ) as TagsResponseV2;
        }
    }
  }

  private async listTags(args: TagsToolInput): Promise<TagsResponseV2> {
    const timer = new OperationTimerV2();

    try {
      const {
        sortBy = 'name',
        includeEmpty = true,
        includeUsageStats = false,
        includeTaskCounts = false,
        fastMode = true,
        namesOnly = false,
      } = args;

      // Cache key
      const cacheKey = `list:${sortBy}:${includeEmpty}:${includeUsageStats}:${includeTaskCounts}:${fastMode}:${namesOnly}`;
      const cached = this.cache.get<{ tags?: unknown[]; items?: unknown[]; count?: number; metadata?: Record<string, unknown> }>('tags', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached tag list');
        return cached as TagsResponseV2; // Keep identity to satisfy test equality; cached object may already be a formatted response
      }

      // Use V3 script with OmniJS for all modes
      const scriptTemplate = LIST_TAGS_SCRIPT_V3;

      const script = this.omniAutomation.buildScript(scriptTemplate, {
        options: {
          sortBy,
          includeEmpty,
          includeUsageStats,
          includeTaskCounts,
          fastMode,
          namesOnly,
        },
      });

      this.logger.debug('Executing consolidated list tags script');
      const result = await this.execJson(script);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'tags',
          'SCRIPT_ERROR',
          result.error,
          'Check OmniFocus is running',
          { operation: 'list', details: result.details },
          timer.toMetadata(),
        );
      }

      // Parse result
      const parsedResult = result.data;

      const response = createListResponseV2(
        'tags',
        (parsedResult as { tags?: unknown[]; items?: unknown[] }).tags || (parsedResult as { tags?: unknown[]; items?: unknown[] }).items || [],
        'other',
        { ...timer.toMetadata(), total: (parsedResult as { count?: number; tags?: unknown[] }).count || (parsedResult as { count?: number; tags?: unknown[] }).tags?.length || 0, operation: 'list', mode: 'unified', options: { sortBy, includeEmpty, includeUsageStats, includeTaskCounts, fastMode, namesOnly } },
      ) as TagsResponseV2;

      // Cache the result
      this.cache.set('tags', cacheKey, response);
      return response;

    } catch (error) {
      return this.handleErrorV2<TagsDataV2>(error);
    }
  }

  private async getActiveTags(): Promise<TagsResponseV2> {
    const timer = new OperationTimerV2();

    try {
      // Check cache
      const cacheKey = 'active_tags';
      const cached = this.cache.get<{ tags?: unknown[]; items?: unknown[]; count?: number; metadata?: Record<string, unknown> }>('tags', cacheKey);
      if (cached) {
        this.logger.debug('Returning cached active tags');
        return cached as TagsResponseV2;
      }

      // Execute script
      const script = this.omniAutomation.buildScript(GET_ACTIVE_TAGS_SCRIPT, {});
      this.logger.debug('Executing get active tags script');
      const result = await this.execJson(script);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'tags',
          'SCRIPT_ERROR',
          result.error,
          'Ensure OmniFocus has active tasks with tags',
          { operation: 'active', details: result.details },
          timer.toMetadata(),
        );
      }

      // Parse result
      const parsedResult = result.data;

      const response = createListResponseV2(
        'tags',
        (parsedResult as { tags?: unknown[]; items?: unknown[] }).tags || (parsedResult as { tags?: unknown[]; items?: unknown[] }).items || [],
        'other',
        { ...timer.toMetadata(), count: (parsedResult as { count?: number; tags?: unknown[] }).count || (parsedResult as { count?: number; tags?: unknown[] }).tags?.length || 0, operation: 'active', description: 'Tags with incomplete tasks' },
      ) as TagsResponseV2;

      // Cache the result (30 second TTL for active tags)
      this.cache.set('tags', cacheKey, response);
      return response;

    } catch (error) {
      return this.handleErrorV2<TagsDataV2>(error);
    }
  }

  private async manageTags(args: TagsToolInput): Promise<TagOperationResponseV2> {
    const timer = new OperationTimerV2();

    try {
      const { action, tagName, newName, targetTag, parentTagName, parentTagId, mutuallyExclusive } = args;

      // Validate required parameters
      if (!action) {
        return createErrorResponseV2(
          'tags',
          'MISSING_PARAMETER',
          'action is required for manage operation',
          undefined,
          { operation: 'manage' },
          timer.toMetadata(),
        );
      }

      if (!tagName) {
        return createErrorResponseV2(
          'tags',
          'MISSING_PARAMETER',
          'tagName is required for manage operation',
          undefined,
          { operation: 'manage', action },
          timer.toMetadata(),
        );
      }

      // Validate action-specific requirements
      if (action === 'rename' && !newName) {
        return createErrorResponseV2(
          'tags',
          'MISSING_PARAMETER',
          'newName is required for rename action',
          undefined,
          { operation: 'manage', action },
          timer.toMetadata(),
        );
      }

      if (action === 'merge' && !targetTag) {
        return createErrorResponseV2(
          'tags',
          'MISSING_PARAMETER',
          'targetTag is required for merge action',
          undefined,
          { operation: 'manage', action },
          timer.toMetadata(),
        );
      }

      if (action === 'set_mutual_exclusivity' && mutuallyExclusive === undefined) {
        return createErrorResponseV2(
          'tags',
          'MISSING_PARAMETER',
          'mutuallyExclusive is required for set_mutual_exclusivity action',
          undefined,
          { operation: 'manage', action },
          timer.toMetadata(),
        );
      }

      // Execute script
      const script = this.omniAutomation.buildScript(MANAGE_TAGS_SCRIPT, {
        action,
        tagName,
        newName,
        targetTag,
        parentTagName,
        parentTagId,
        mutuallyExclusive,
      });
      const result = await this.execJson(script);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'tags',
          'SCRIPT_ERROR',
          result.error,
          'Verify tag names and hierarchy constraints',
          { operation: 'manage', action, tagName, details: result.details },
          timer.toMetadata(),
        );
      }

      // Parse result
      const parsedResult = result.data as { success: boolean; message?: string; data?: unknown };

      // Smart cache invalidation for tag changes
      this.cache.invalidateTag(tagName);
      if (action === 'rename' && newName) {
        this.cache.invalidateTag(newName); // Also invalidate new tag name
      }
      if (action === 'merge' && targetTag) {
        this.cache.invalidateTag(targetTag); // Invalidate merge target too
      }

      return createSuccessResponseV2('tags', { action, tagName, ...(newName && { newName }), ...(targetTag && { targetTag }), result: parsedResult }, undefined, { ...timer.toMetadata(), operation: 'manage', action });

    } catch (error) {
      return this.handleErrorV2<TagOperationDataV2>(error);
    }
  }
}
