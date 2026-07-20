/**
 * TAG QUERY OPTIONS CONTRACT
 *
 * Unlike TaskFilter/ProjectFilter, tags use MODE-BASED queries for field projection
 * rather than filter-based queries. This reflects OmniFocus's tag model where you
 * typically want all tags but with different levels of detail.
 *
 * Modes:
 * - 'names': Just string array of tag names (fastest)
 * - 'basic': id + name + parentId objects (for most UI use cases; parentId null for top-level tags)
 * - 'full': All properties including usage stats (for admin/analysis)
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */

import type { TextOperator } from './filters.js';

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
   * - 'basic': { id, name, parentId }[] (default, for UI; parentId null for top-level)
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

  /**
   * OMN-170 S2: tag name-scoped filter (basic mode only — the read seam's mode).
   * Compiled from a TagFilter by reject-filters.ts. Other modes ignore it.
   */
  name?: string;
  nameOperator?: TextOperator; // CONTAINS (default) | MATCHES
}

// =============================================================================
// MODE FIELD MAPPINGS
// =============================================================================
