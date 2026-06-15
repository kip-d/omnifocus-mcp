/**
 * SHARED FILTER CONTRACT
 *
 * This is the SINGLE SOURCE OF TRUTH for filter property names and types.
 *
 * Used by:
 * - QueryCompiler (to validate and transform input)
 * - AST Builder (to generate filter AST)
 * - Pipeline functions (to augment, sort, project)
 *
 * If you need a new filter:
 * 1. Add it here FIRST
 * 2. Then update 3-4 layers — see docs/dev/FILTER_PIPELINE.md for the checklist
 *    (Schema, QueryCompiler, AST Builder/DATE_FILTER_DEFS, KNOWN_FIELDS)
 * 3. For date filters: add one line to DATE_FILTER_DEFS in builder.ts
 *    The filter-coverage.test.ts safety net will catch missing entries.
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

  // --- Name Search (OMN-142) ---
  /**
   * Name-scoped search term — matches task.name ONLY, never the note.
   * Distinct from `text`/`search`, which match name OR note. The public
   * `filters.name` compiles here; before OMN-142 it aliased onto `search`
   * and the note over-match fed a destructive sweep.
   */
  name?: string;
  nameOperator?: TextOperator; // How to match (default: CONTAINS)

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

  completionAfter?: string;
  completionBefore?: string;
  completionDateOperator?: DateOperator; // How to compare completion dates

  // OMN-48: filter by task creation timestamp.
  addedAfter?: string;
  addedBefore?: string;
  addedDateOperator?: DateOperator; // BETWEEN, <=, >=

  // OMN-49: filter by estimated duration (minutes).
  estimatedMinutesEquals?: number;
  estimatedMinutesLessThan?: number;
  estimatedMinutesGreaterThan?: number;

  // --- Boolean Flags ---
  flagged?: boolean;
  blocked?: boolean;
  available?: boolean;
  inInbox?: boolean;

  // --- Today Mode ---
  /**
   * Today mode: OR logic (Due Soon OR Flagged) matching OmniFocus Today perspective.
   * When true, buildAST() combines dueBefore + flagged into an OR node.
   * Requires dueBefore to be set (the Due Soon cutoff date).
   */
  todayMode?: boolean;

  /**
   * Tag status filter: requires task to have at least one active/on-hold tag, OR be untagged.
   * Matches OmniFocus perspective rule: "Has a tag that is active or on hold" OR "Untagged".
   */
  tagStatusValid?: boolean;

  /** Due Soon interval in days (used by reason field computation, default: 3) */
  dueSoonDays?: number;

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

  // --- Parent task (OMN-114) ---
  /**
   * Filter to direct children of the given task ID — the read-side mirror of
   * `data.parentTaskId` on write, which writes already accept and reads already
   * project. Matches `task.parent.id.primaryKey === parentTaskId` (null-guarded).
   */
  parentTaskId?: string;

  // --- Search (for name/note search) ---
  search?: string; // Search term for name/note content

  /**
   * OMN-115: fast search restricts text matching to the task NAME only,
   * skipping the note body. Fulfils the documented "Name search → fastSearch:
   * true" fast path (QuickReferencePrompt). When undefined/false, search
   * matches both name and note.
   */
  fastSearch?: boolean;

  /**
   * OMN-153: opt into receiving project-root rows (the task that IS the project).
   *
   * By default ALL tasks queries exclude project-root rows (task.project !== null
   * in OmniJS) because a project's root task is indistinguishable from a real
   * task in flattenedTasks and its completion/deletion deletes the PROJECT — a
   * P5 safety hazard. Set true only when intentionally inspecting project roots.
   *
   * This is a QUERY-LEVEL param (like countOnly/fastSearch), NOT a filters:{} key.
   * It threads from the compiled query onto the filter in OmniFocusReadTool.
   */
  includeProjectRoot?: boolean;

  // --- Project Status (preserved for project queries) ---
  projectStatus?: ProjectStatus[];

  // --- Folder (for project filtering) ---
  folder?: string; // Filter projects by folder name
  // OMN-96: `folder: null` (top-level projects only) compiles to this flag.
  folderTopLevel?: boolean;

  // --- Pagination ---
  limit?: number;
  offset?: number;

  // --- Mode (for backward compat with existing code) ---
  mode?: 'all' | 'inbox' | 'today' | 'overdue' | 'flagged' | 'available' | 'search';

  // --- OR Logic ---
  /**
   * OR branches: each entry is an independent TaskFilter.
   * buildAST() wraps them in an OrNode.
   * Populated by QueryCompiler when the public API uses { OR: [...] }.
   */
  orBranches?: TaskFilter[];

  // --- Compat alias (intentional PUBLIC API boundary — do NOT remove in "legacy" sweeps) ---
  /**
   * @deprecated PUBLIC API ONLY - Use `completed: true` instead
   *
   * AUDIT NOTE (OMN-25, 2026-05-21): The `@deprecated` tag here is a
   * PUBLIC API hint, not a removal signal. Re-flagging this in "legacy
   * code" audits is incorrect — the dual naming is a permanent boundary.
   * See the design note below for the full rationale.
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
  // --- Identification ---
  /** Exact project ID lookup (OMN-40). Triggers fast-path via Project.byIdentifier. */
  id?: string;

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
  /**
   * OMN-142: how `text` matches (default CONTAINS; MATCHES = regex).
   */
  textOperator?: TextOperator;

  // --- Name Search (OMN-142) ---
  /**
   * Name-scoped search term — matches project.name ONLY, never the note.
   * Distinct from `text`, which matches name OR note.
   */
  name?: string;
  nameOperator?: TextOperator; // How to match (default: CONTAINS)

  // --- Folder Filter ---
  /**
   * Filter by folder ID (exact match)
   */
  folderId?: string;
  /**
   * Filter by folder name (case-insensitive substring match)
   */
  folderName?: string;
  /**
   * OMN-96: match only top-level projects (no containing folder).
   * Set when the read query passes `folder: null`.
   */
  topLevelOnly?: boolean;

  // --- OR Logic (OMN-171 / OMN-161 S3) ---
  /**
   * OR branches: each entry is an independent flat ProjectFilter (no nested
   * logical operators — the schema is one level). `generateProjectFilterCode`
   * recurses per branch and joins them with `||`, ANDed with the base keys —
   * mirroring the tasks-side `buildAST` orBranches path. Populated by
   * `transformProjectFilters` when the projects query uses `{ OR: [...] }`.
   */
  orBranches?: ProjectFilter[];

  // --- Pagination ---
  limit?: number;
  offset?: number;
}

/**
 * OMN-161 S2: tags/folders queries support basic name (+ folder parent) filtering.
 * Distinct members of the CompiledQuery discriminated union. Perspectives still
 * carry no filter (reject-all). The compile boundary (reject-filters.ts) maps the
 * input vocabulary into these typed shapes; the query scripts consume them.
 */
export interface TagFilter {
  /** Tag name-scoped match (OMN-170). */
  name?: string;
  nameOperator?: TextOperator; // CONTAINS (default) | MATCHES
}
export interface FolderFilter {
  /** Folder name-scoped match (OMN-170). */
  name?: string;
  nameOperator?: TextOperator; // CONTAINS (default) | MATCHES
  /** `folder: "<name>"` → parent folder name (case-insensitive substring). */
  parentName?: string;
  /** `folder: null` → only folders with no parent (top-level). */
  topLevelOnly?: boolean;
}
export type PerspectiveFilter = Record<string, never>;

/**
 * Known project filter property names (for validation)
 */
export const PROJECT_FILTER_PROPERTY_NAMES = [
  'id',
  'status',
  'flagged',
  'needsReview',
  'text',
  'textOperator', // OMN-142
  'name', // OMN-142: name-only match (text also matches notes)
  'nameOperator', // OMN-142
  'folderId',
  'folderName',
  'topLevelOnly', // OMN-96
  'orBranches', // OMN-171: OR branch compilation on projects
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
  'name', // OMN-142: name-only match (text/search also match notes)
  'nameOperator', // OMN-142

  'dueAfter',
  'dueBefore',
  'dueDateOperator',
  'deferAfter',
  'deferBefore',
  'deferDateOperator',
  'plannedAfter',
  'plannedBefore',
  'plannedDateOperator',
  'completionAfter',
  'completionBefore',
  'completionDateOperator',
  // OMN-48
  'addedAfter',
  'addedBefore',
  'addedDateOperator',
  // OMN-49
  'estimatedMinutesEquals',
  'estimatedMinutesLessThan',
  'estimatedMinutesGreaterThan',
  'flagged',
  'blocked',
  'available',
  'inInbox',
  'dropped',
  'hasRepetitionRule',
  'todayMode',
  'tagStatusValid',
  'dueSoonDays',
  'projectId',
  'project',
  'parentTaskId', // OMN-114: direct children of a task
  'search',
  'fastSearch', // OMN-115: name-only fast search
  'includeProjectRoot', // OMN-153: opt into project-root rows (query-level param, not a filters:{} key)
  'projectStatus',
  'folder',
  'folderTopLevel', // OMN-96
  'limit',
  'offset',
  'mode',
  'orBranches',
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
// BRANDED FILTER TYPE
// =============================================================================

/**
 * Brand key for normalized filters (runtime value)
 * This key is used to mark filters that have been processed through normalizeFilter()
 */
const NORMALIZED_FILTER_BRAND = '__normalized__' as const;

/**
 * NormalizedTaskFilter - A TaskFilter that has been validated and normalized
 *
 * This branded type ensures compile-time safety by requiring all filters
 * to pass through normalizeFilter() before being used in script builders.
 *
 * Benefits:
 * - Catches property name mismatches at compile time (e.g., includeCompleted vs completed)
 * - Ensures default operators are set (tagsOperator, textOperator)
 * - Guarantees legacy properties have been converted
 *
 * Usage:
 *   const filter: TaskFilter = { completed: false };
 *   const normalized = normalizeFilter(filter);  // Returns NormalizedTaskFilter
 *   buildFilteredTasksScript(normalized);        // Only accepts NormalizedTaskFilter
 */
export type NormalizedTaskFilter = Omit<TaskFilter, 'includeCompleted'> & {
  readonly [NORMALIZED_FILTER_BRAND]?: true;
};

/**
 * Type guard to check if a filter has been normalized
 */
export function isNormalizedFilter(filter: TaskFilter | NormalizedTaskFilter): filter is NormalizedTaskFilter {
  return (filter as Record<string, unknown>)[NORMALIZED_FILTER_BRAND] === true;
}

/**
 * Return a brand-free shallow copy of a filter (OMN-177).
 *
 * The `__normalized__` brand is an internal NormalizedTaskFilter marker, not a
 * filter the user applied. Echo sites that surface a filter in user-facing
 * metadata (`filters_applied`) must route it through this helper so the brand
 * never reaches the wire. Does not mutate the input.
 */
export function stripNormalizedBrand(filter: TaskFilter | NormalizedTaskFilter): Record<string, unknown> {
  const rest = { ...(filter as Record<string, unknown>) };
  delete rest[NORMALIZED_FILTER_BRAND];
  return rest;
}

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Normalize legacy filter properties to current standard
 *
 * This handles the `includeCompleted` → `completed` migration and returns
 * a branded NormalizedTaskFilter that can be used with script builders.
 *
 * IMPORTANT: Script builders only accept NormalizedTaskFilter to ensure
 * all filters have been properly processed.
 */
export function normalizeFilter(filter: TaskFilter): NormalizedTaskFilter {
  // Destructure to separate legacy property from the rest
  // This gives us type safety: rest is Omit<TaskFilter, 'includeCompleted'>
  const { includeCompleted, ...rest } = filter; // eslint-disable-line sonarjs/deprecation -- migrating away from legacy field

  // Start with the non-legacy properties (properly typed)
  const normalized: Omit<TaskFilter, 'includeCompleted'> = { ...rest };

  // Handle legacy includeCompleted → completed conversion
  if (includeCompleted !== undefined && normalized.completed === undefined) {
    // Convert includeCompleted to completed
    // includeCompleted: true means show completed tasks
    // includeCompleted: false means exclude completed tasks
    normalized.completed = includeCompleted;
  }

  // Default tagsOperator
  if (normalized.tags && normalized.tags.length > 0 && !normalized.tagsOperator) {
    normalized.tagsOperator = 'AND';
  }

  // Default textOperator
  if (normalized.text && !normalized.textOperator) {
    normalized.textOperator = 'CONTAINS';
  }

  // OMN-142: default nameOperator
  if (normalized.name && !normalized.nameOperator) {
    normalized.nameOperator = 'CONTAINS';
  }

  // Brand the filter as normalized using Object.assign to add the symbol property
  // This is the only place we need a type assertion - for the brand itself
  return Object.assign(normalized, { [NORMALIZED_FILTER_BRAND]: true as const }) as NormalizedTaskFilter;
}
