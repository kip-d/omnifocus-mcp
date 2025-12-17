/**
 * TAG QUERY OPTIONS CONTRACT
 *
 * Unlike TaskFilter/ProjectFilter, tags use MODE-BASED queries for field projection
 * rather than filter-based queries. This reflects OmniFocus's tag model where you
 * typically want all tags but with different levels of detail.
 *
 * Modes:
 * - 'names': Just string array of tag names (fastest)
 * - 'basic': id + name objects (for most UI use cases)
 * - 'full': All properties including usage stats (for admin/analysis)
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */

// =============================================================================
// MODE DEFINITIONS
// =============================================================================

/**
 * Tag query mode determines the level of detail returned
 */
export type TagQueryMode = 'names' | 'basic' | 'full';

/**
 * Sort options for tag results
 */
export type TagSortBy = 'name' | 'usage' | 'activeTasks';

// =============================================================================
// TAG QUERY OPTIONS INTERFACE
// =============================================================================

/**
 * TagQueryOptions - Mode-based options for tag queries
 *
 * Unlike TaskFilter/ProjectFilter, tags use modes for field projection
 * rather than filtering criteria. This reflects OmniFocus's tag model.
 */
export interface TagQueryOptions {
  /**
   * Mode determines field projection level
   * - 'names': string[] (fastest, minimal data)
   * - 'basic': { id, name }[] (default, for UI)
   * - 'full': All properties including usage stats
   */
  mode: TagQueryMode;

  /**
   * Include tags with 0 tasks assigned
   * Default: true (include all tags)
   */
  includeEmpty?: boolean;

  /**
   * Sort order for results
   * - 'name': Alphabetical (default)
   * - 'usage': By total task count (highest first)
   * - 'activeTasks': By active (non-completed) task count
   */
  sortBy?: TagSortBy;

  /**
   * Include usage statistics (only meaningful in 'full' mode)
   * Includes: totalTasks, activeTasks, completedTasks
   */
  includeUsageStats?: boolean;

  /**
   * Limit number of tags returned
   */
  limit?: number;
}

// =============================================================================
// MODE FIELD MAPPINGS
// =============================================================================

/**
 * Fields included in each mode
 */
export const TAG_MODE_FIELDS = {
  names: [] as const, // Just string array, no object fields
  basic: ['id', 'name'] as const,
  full: [
    'id',
    'name',
    'parent',
    'parentId',
    'children',
    'allowsNextAction',
    'status',
    'availableTaskCount',
    'remainingTaskCount',
  ] as const,
} as const;

/**
 * Usage stats fields (added when includeUsageStats: true)
 */
export const TAG_USAGE_FIELDS = ['totalTasks', 'activeTasks', 'completedTasks', 'flaggedTasks'] as const;

// =============================================================================
// TYPE HELPERS
// =============================================================================

/**
 * Create a TagQueryOptions object with compile-time checking
 */
export function createTagQueryOptions(options: TagQueryOptions): TagQueryOptions {
  return {
    mode: options.mode,
    includeEmpty: options.includeEmpty ?? true,
    sortBy: options.sortBy ?? 'name',
    includeUsageStats: options.includeUsageStats ?? false,
    limit: options.limit,
  };
}

/**
 * Get the fields to include for a given mode
 */
export function getFieldsForMode(mode: TagQueryMode): readonly string[] {
  return TAG_MODE_FIELDS[mode];
}

/**
 * Validate TagQueryOptions
 */
export function validateTagQueryOptions(options: TagQueryOptions): string[] {
  const errors: string[] = [];

  if (!['names', 'basic', 'full'].includes(options.mode)) {
    errors.push(`Invalid mode: ${options.mode}. Must be 'names', 'basic', or 'full'.`);
  }

  if (options.sortBy && !['name', 'usage', 'activeTasks'].includes(options.sortBy)) {
    errors.push(`Invalid sortBy: ${options.sortBy}. Must be 'name', 'usage', or 'activeTasks'.`);
  }

  if (options.includeUsageStats && options.mode !== 'full') {
    errors.push(`includeUsageStats only applies to 'full' mode, not '${options.mode}'.`);
  }

  return errors;
}
