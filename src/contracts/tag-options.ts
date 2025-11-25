/**
 * TAG QUERY OPTIONS
 *
 * Unlike TaskFilter/ProjectFilter, tags use a MODE-BASED pattern rather than
 * filter-based queries. This reflects how OmniFocus handles tags:
 * - Tags don't have rich filterable properties (no dates, status, etc.)
 * - The main variation is HOW MUCH data to return (field projection)
 * - Post-query filtering is minimal (only "exclude empty tags")
 *
 * This is the SINGLE SOURCE OF TRUTH for tag query options.
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */

// =============================================================================
// TAG QUERY MODE
// =============================================================================

/**
 * Tag query modes determine field projection level
 *
 * - 'names': Ultra-fast, returns just string array of tag names
 * - 'basic': Returns minimal objects with id + name
 * - 'full': Returns all properties including parent info and usage stats
 */
export type TagQueryMode = 'names' | 'basic' | 'full';

/**
 * Sort options for tag results
 */
export type TagSortBy = 'name' | 'usage' | 'activeTasks';

// =============================================================================
// TAG QUERY OPTIONS
// =============================================================================

/**
 * TagQueryOptions - Mode-based options for tag queries
 *
 * Unlike TaskFilter/ProjectFilter which filter WHICH items to return,
 * TagQueryOptions determines HOW MUCH data to include for each tag.
 *
 * Used by:
 * - buildTagsScript for AST-generated scripts
 * - TagsTool for query routing
 */
export interface TagQueryOptions {
  // --- Mode (required) ---
  mode: TagQueryMode;

  // --- Post-query options ---
  /**
   * Include tags with 0 tasks assigned
   * Only meaningful in 'full' mode with usage stats
   * @default true
   */
  includeEmpty?: boolean;

  /**
   * Sort order for results
   * - 'name': Alphabetical (default)
   * - 'usage': Total task count descending
   * - 'activeTasks': Active (incomplete) task count descending
   * @default 'name'
   */
  sortBy?: TagSortBy;

  // --- Full mode options ---
  /**
   * Calculate and include usage statistics (task counts)
   * Only meaningful in 'full' mode
   * @default false
   */
  includeUsageStats?: boolean;
}

// =============================================================================
// MODE FIELD MAPPINGS
// =============================================================================

/**
 * Fields included in each mode's response
 *
 * - names: Returns string[] (not objects)
 * - basic: Minimal objects for dropdowns/autocomplete
 * - full: Complete tag data for detailed views
 */
export const TAG_MODE_FIELDS = {
  names: [] as const,  // Returns string[], not objects
  basic: ['id', 'name'] as const,
  full: ['id', 'name', 'parentId', 'parentName', 'childrenAreMutuallyExclusive', 'usage'] as const,
} as const;

/**
 * Type for tag objects in 'basic' mode
 */
export interface BasicTagData {
  id: string;
  name: string;
}

/**
 * Type for usage statistics in 'full' mode
 */
export interface TagUsageStats {
  total: number;      // Total tasks with this tag
  active: number;     // Incomplete tasks with this tag
  completed: number;  // Completed tasks with this tag
}

/**
 * Type for tag objects in 'full' mode
 */
export interface FullTagData extends BasicTagData {
  parentId?: string;
  parentName?: string;
  childrenAreMutuallyExclusive?: boolean;
  usage?: TagUsageStats;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create TagQueryOptions with defaults applied
 */
export function createTagQueryOptions(options: TagQueryOptions): Required<TagQueryOptions> {
  return {
    mode: options.mode,
    includeEmpty: options.includeEmpty ?? true,
    sortBy: options.sortBy ?? 'name',
    includeUsageStats: options.includeUsageStats ?? false,
  };
}

/**
 * Get the fields to include based on mode
 */
export function getFieldsForMode(mode: TagQueryMode): readonly string[] {
  return TAG_MODE_FIELDS[mode];
}
