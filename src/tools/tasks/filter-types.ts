/**
 * Task-query sort types.
 *
 * OMN-281: this file once held an operator-based advanced-filter system
 * (StringFilter/ArrayFilter/DateFilter/NumberFilter/QueryFilters + guards)
 * that nothing ever consumed; only SortOption is live (task-query-pipeline,
 * OmniFocusReadTool). The dead filter system was removed — see the ticket.
 */

/**
 * Sort configuration
 */
export interface SortOption {
  field: 'dueDate' | 'deferDate' | 'name' | 'flagged' | 'estimatedMinutes' | 'added' | 'modified' | 'completionDate';
  direction: 'asc' | 'desc';
}
