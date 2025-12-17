/**
 * Advanced filtering types for OmniFocus task queries
 *
 * Supports operator-based filtering with complex combinations
 * while maintaining backward compatibility with simple filters.
 */

/**
 * String filter with operator
 */
export interface StringFilter {
  operator: 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH' | 'EQUALS' | 'NOT_EQUALS';
  value: string;
}

/**
 * Array filter with operator (for tags, status)
 */
export interface ArrayFilter {
  operator: 'OR' | 'AND' | 'NOT_IN' | 'IN';
  values: string[];
}

/**
 * Date filter with operator
 */
export interface DateFilter {
  operator: '>' | '>=' | '<' | '<=' | 'BETWEEN';
  value: string; // ISO date string or natural language
  upperBound?: string; // For BETWEEN operator
}

/**
 * Number filter with operator
 */
export interface NumberFilter {
  operator: '>' | '>=' | '<' | '<=' | 'EQUALS' | 'BETWEEN';
  value: number;
  upperBound?: number; // For BETWEEN operator
}

/**
 * Boolean filter (no operator needed)
 */
export type BooleanFilter = boolean;

/**
 * Advanced query filters with operator support
 *
 * All filters are optional. Multiple filters are combined with AND logic.
 * Use operator-specific filters for OR/NOT_IN logic.
 */
export interface QueryFilters {
  // Project filters
  project?: StringFilter;
  projectId?: StringFilter;

  // Tag filters (supports OR/AND/NOT_IN logic)
  tags?: ArrayFilter;

  // Status filters
  completed?: BooleanFilter;
  flagged?: BooleanFilter;
  available?: BooleanFilter;
  blocked?: BooleanFilter;
  inInbox?: BooleanFilter;

  // Date filters
  dueDate?: DateFilter;
  deferDate?: DateFilter;
  completionDate?: DateFilter;
  added?: DateFilter;

  // Number filters
  estimatedMinutes?: NumberFilter;

  // Text search filters
  search?: StringFilter;
  text?: StringFilter; // Bug #9 fix - separate text filter with CONTAINS/MATCHES operators

  // Status field filter (for taskStatus enum)
  taskStatus?: ArrayFilter;
}

/**
 * Sort configuration
 */
export interface SortOption {
  field: 'dueDate' | 'deferDate' | 'name' | 'flagged' | 'estimatedMinutes' | 'added' | 'modified' | 'completionDate';
  direction: 'asc' | 'desc';
}

/**
 * Type guard for string filter
 */
export function isStringFilter(filter: unknown): filter is StringFilter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    'operator' in filter &&
    'value' in filter &&
    typeof (filter as StringFilter).value === 'string'
  );
}

/**
 * Type guard for array filter
 */
export function isArrayFilter(filter: unknown): filter is ArrayFilter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    'operator' in filter &&
    'values' in filter &&
    Array.isArray((filter as ArrayFilter).values)
  );
}

/**
 * Type guard for date filter
 */
export function isDateFilter(filter: unknown): filter is DateFilter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    'operator' in filter &&
    'value' in filter &&
    typeof (filter as DateFilter).value === 'string'
  );
}

/**
 * Type guard for number filter
 */
export function isNumberFilter(filter: unknown): filter is NumberFilter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    'operator' in filter &&
    'value' in filter &&
    typeof (filter as NumberFilter).value === 'number'
  );
}
