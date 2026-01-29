/**
 * SHARED FILTER CONTRACT
 *
 * This is the SINGLE SOURCE OF TRUTH for filter property names and types.
 *
 * Used by:
 * - QueryCompiler (to validate and transform input)
 * - OmniJS script generator (to generate filter logic)
 * - Tool wrappers (to understand what filters were applied)
 *
 * If you need a new filter:
 * 1. Add it here FIRST
 * 2. The generator will automatically include it in OmniJS scripts
 * 3. The compiler will automatically support it
 */

// =============================================================================
// FILTER PROPERTY DEFINITIONS
// =============================================================================

/**
 * Completion filter modes
 *
 * IMPORTANT: The OmniJS scripts check these exact values.
 * - true = only completed tasks
 * - false = only active tasks
 * - undefined = default behavior (exclude completed)
 */
export type CompletionFilter = boolean | undefined;

/**
 * Tag filter operators
 */
export type TagOperator = 'AND' | 'OR' | 'NOT_IN';

/**
 * Text filter operators
 */
export type TextOperator = 'CONTAINS' | 'MATCHES';

/**
 * Date filter operators
 * Supports both inclusive (<=, >=) and exclusive (<, >) comparisons
 */
export type DateOperator = 'BETWEEN' | '<' | '<=' | '>' | '>=';

// =============================================================================
// THE MASTER FILTER INTERFACE
// =============================================================================

/**
 * TaskFilter - The canonical filter interface
 *
 * EVERY layer must use these exact property names:
 * - QueryCompiler transforms input → TaskFilter
 * - OmniJS generator reads TaskFilter → generates script
 * - Response metadata reports which filters were applied
 */
export interface TaskFilter {
  // --- Identification ---
  id?: string; // Exact task ID lookup

  // --- Completion Status ---
  /**
   * true = only completed tasks
   * false = only active tasks
   * undefined = default (exclude completed for backward compat)
   */
  completed?: boolean;

  // --- Tags ---
  tags?: string[]; // Tag names to filter by
  tagsOperator?: TagOperator; // How to combine tags (default: AND)

  // --- Text Search ---
  text?: string; // Search term
  textOperator?: TextOperator; // How to match (default: CONTAINS)

  // --- Date Filters ---
  dueAfter?: string; // ISO date string
  dueBefore?: string; // ISO date string
  dueDateOperator?: DateOperator; // BETWEEN, <=, >=

  deferAfter?: string;
  deferBefore?: string;
  deferDateOperator?: DateOperator; // How to compare defer dates

  plannedAfter?: string;
  plannedBefore?: string;
  plannedDateOperator?: DateOperator; // How to compare planned dates

  // --- Boolean Flags ---
  flagged?: boolean;
  blocked?: boolean;
  available?: boolean;
  inInbox?: boolean;

  // --- Status Filters (for analytics) ---
  /**
   * Filter by dropped status
   * true = only dropped tasks
   * false = exclude dropped tasks
   * undefined = no filtering by dropped status
   */
  dropped?: boolean;

  /**
   * Filter by presence of repetition rule
   * true = only recurring tasks (has repetition rule)
   * false = only non-recurring tasks
   * undefined = no filtering by repetition
   */
  hasRepetitionRule?: boolean;

  // --- Project ---
  projectId?: string; // Filter by project ID (from advanced filters)
  project?: string | null; // Filter by project (simple param, null = inbox)

  // --- Search (for name/note search) ---
  search?: string; // Search term for name/note content

  // --- Folder (for project filtering) ---
  folder?: string; // Filter projects by folder name

  // --- Pagination ---
  limit?: number;
  offset?: number;

  // --- Mode (for backward compat with existing code) ---
  mode?: 'all' | 'inbox' | 'today' | 'overdue' | 'flagged' | 'available' | 'search';

  // --- Legacy (PUBLIC API deprecation) ---
  /**
   * @deprecated PUBLIC API ONLY - Use `completed: true` instead
   *
   * INTERNAL DESIGN NOTE: The codebase intentionally uses dual naming:
   * - PUBLIC API: `completed` (what users should use)
   * - INTERNAL: `includeCompleted` (used in scripts, compilers, tools)
   *
   * This is NOT technical debt - it's a deliberate boundary:
   * - Migration layer in normalizeFilter() handles the conversion
   * - Internal code uses includeCompleted for historical consistency
   * - Changing internal naming would require ~60 file changes with no user benefit
   *
   * See: normalizeFilter() in this file for the conversion logic
   */
  includeCompleted?: boolean;
}

// =============================================================================
// PROJECT FILTER INTERFACE
// =============================================================================

/**
 * Project status values for filtering
 */
export type ProjectStatus = 'active' | 'onHold' | 'done' | 'dropped';

/**
 * ProjectFilter - Filter properties for project queries
 *
 * Simpler than TaskFilter since projects have fewer filterable properties.
 * Uses filter-based queries (like TaskFilter), not mode-based queries (like tags).
 *
 * @see docs/plans/2025-11-25-phase3-ast-extension-design.md
 */
export interface ProjectFilter {
  // --- Status Filter ---
  /**
   * Filter by project status - can match multiple statuses
   * e.g., ['active', 'onHold'] returns projects in either status
   */
  status?: ProjectStatus[];

  // --- Boolean Flags ---
  flagged?: boolean;
  needsReview?: boolean;

  // --- Text Search ---
  /**
   * Search term for name and note content
   * Case-insensitive substring match
   */
  text?: string;

  // --- Folder Filter ---
  /**
   * Filter by folder ID (exact match)
   */
  folderId?: string;
  /**
   * Filter by folder name (case-insensitive substring match)
   */
  folderName?: string;

  // --- Pagination ---
  limit?: number;
  offset?: number;
}

/**
 * Known project filter property names (for validation)
 */
export const PROJECT_FILTER_PROPERTY_NAMES = [
  'status',
  'flagged',
  'needsReview',
  'text',
  'folderId',
  'folderName',
  'limit',
  'offset',
] as const;

/**
 * Validate that a project filter only contains known properties
 */
export function validateProjectFilterProperties(filter: Record<string, unknown>): string[] {
  const unknownProps: string[] = [];
  const knownSet = new Set(PROJECT_FILTER_PROPERTY_NAMES);

  for (const key of Object.keys(filter)) {
    if (!knownSet.has(key as (typeof PROJECT_FILTER_PROPERTY_NAMES)[number])) {
      unknownProps.push(key);
    }
  }

  return unknownProps;
}

/**
 * Ensure a project filter object conforms to ProjectFilter
 * Use this when creating filters to get compile-time checking
 */
export function createProjectFilter(filter: ProjectFilter): ProjectFilter {
  return filter;
}

// =============================================================================
// FILTER METADATA (for response reporting)
// =============================================================================

/**
 * What filters were actually applied (for debugging/transparency)
 */
export interface AppliedFilters {
  completed?: boolean;
  tags?: string[];
  tagsOperator?: TagOperator;
  text?: string;
  dueRange?: { after?: string; before?: string };
  flagged?: boolean;
  limit?: number;
}

// =============================================================================
// COMPILE-TIME HELPERS
// =============================================================================

/**
 * Ensure a filter object conforms to TaskFilter
 * Use this when creating filters to get compile-time checking
 */
export function createFilter(filter: TaskFilter): TaskFilter {
  return filter;
}

/**
 * Known filter property names (for validation)
 */
export const FILTER_PROPERTY_NAMES = [
  'id',
  'completed',
  'tags',
  'tagsOperator',
  'text',
  'textOperator',
  'dueAfter',
  'dueBefore',
  'dueDateOperator',
  'deferAfter',
  'deferBefore',
  'deferDateOperator',
  'plannedAfter',
  'plannedBefore',
  'plannedDateOperator',
  'flagged',
  'blocked',
  'available',
  'inInbox',
  'dropped', // NEW: Filter by dropped status
  'hasRepetitionRule', // NEW: Filter for recurring tasks
  'projectId',
  'folder', // NEW: Filter projects by folder name
  'limit',
  'offset',
  'mode',
  'includeCompleted', // deprecated
] as const;

/**
 * Validate that a filter object only contains known properties
 * Catches typos like 'complted' or 'tgas' at runtime
 */
export function validateFilterProperties(filter: Record<string, unknown>): string[] {
  const unknownProps: string[] = [];
  const knownSet = new Set(FILTER_PROPERTY_NAMES);

  for (const key of Object.keys(filter)) {
    // Skip debug properties
    if (key.startsWith('_debug')) continue;

    if (!knownSet.has(key as (typeof FILTER_PROPERTY_NAMES)[number])) {
      unknownProps.push(key);
    }
  }

  return unknownProps;
}

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Normalize legacy filter properties to current standard
 *
 * This handles the `includeCompleted` → `completed` migration
 */
export function normalizeFilter(filter: TaskFilter): TaskFilter {
  const normalized = { ...filter };

  // Handle legacy includeCompleted
  if (normalized.includeCompleted !== undefined && normalized.completed === undefined) {
    // includeCompleted: true means "don't filter by completion" (include all)
    // We don't have a direct equivalent, but completed: undefined is close
    // For explicit "only completed", user should use completed: true
    delete normalized.includeCompleted;
  }

  // Default tagsOperator
  if (normalized.tags && normalized.tags.length > 0 && !normalized.tagsOperator) {
    normalized.tagsOperator = 'AND';
  }

  // Default textOperator
  if (normalized.text && !normalized.textOperator) {
    normalized.textOperator = 'CONTAINS';
  }

  return normalized;
}
