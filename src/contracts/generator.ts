/**
 * OMNIJS CODE GENERATOR
 *
 * Generates OmniJS filter logic from the TaskFilter specification.
 *
 * Instead of hand-writing filter logic in each mode (and forgetting some),
 * we generate it from a single source of truth.
 *
 * This eliminates:
 * - Bug #7: Missing matchesTagFilter in default mode
 * - Bug #9/#10: Missing text/date filters in some modes
 * - Today's bug: filter.completed vs filter.includeCompleted
 */

import type { TaskFilter } from './filters.js';

// =============================================================================
// GENERATED FILTER FUNCTIONS
// =============================================================================

/**
 * Generate the tag filter function for OmniJS
 *
 * This is injected into the OmniJS script and called for each task.
 */
export function generateTagFilterFunction(): string {
  return `
    function matchesTagFilter(task, filterTags, tagsOperator) {
      if (!filterTags || filterTags.length === 0) return true;

      const taskTags = task.tags ? task.tags.map(t => t.name) : [];
      const operator = tagsOperator || 'AND';

      switch(operator) {
        case 'OR':
        case 'IN':
          return filterTags.some(tag => taskTags.includes(tag));
        case 'NOT_IN':
          return !filterTags.some(tag => taskTags.includes(tag));
        case 'AND':
        default:
          return filterTags.every(tag => taskTags.includes(tag));
      }
    }
  `;
}

/**
 * Generate the text filter function for OmniJS
 */
export function generateTextFilterFunction(): string {
  return `
    function matchesTextFilter(task, filterText, textOperator) {
      if (!filterText) return true;

      const taskName = (task.name || '').toLowerCase();
      const taskNote = (task.note || '').toLowerCase();
      const searchTerm = filterText.toLowerCase();
      const operator = textOperator || 'CONTAINS';

      switch(operator) {
        case 'CONTAINS':
          return taskName.includes(searchTerm) || taskNote.includes(searchTerm);
        case 'MATCHES':
          return taskName === searchTerm || taskNote === searchTerm;
        default:
          return true;
      }
    }
  `;
}

/**
 * Generate the date filter function for OmniJS
 */
export function generateDateFilterFunction(): string {
  return `
    function matchesDateFilter(task, dueAfter, dueBefore, dueDateOperator) {
      if (!dueAfter && !dueBefore) return true;

      const dueDate = task.dueDate;

      if (dueDateOperator === 'BETWEEN' && dueAfter && dueBefore) {
        if (!dueDate) return false;
        const dueLower = new Date(dueAfter);
        const dueUpper = new Date(dueBefore);
        return dueDate >= dueLower && dueDate <= dueUpper;
      }

      if (dueAfter && dueDate) {
        if (dueDate < new Date(dueAfter)) return false;
      }

      if (dueBefore && dueDate) {
        if (dueDate > new Date(dueBefore)) return false;
      }

      return true;
    }
  `;
}

/**
 * Generate the completion filter logic for OmniJS
 *
 * Uses the EXACT property name from TaskFilter: 'completed'
 *
 * @param filter The filter specification
 * @returns OmniJS code string that filters by completion status
 */
export function generateCompletionFilterLogic(filter: TaskFilter): string {
  // IMPORTANT: These property accesses use TaskFilter's exact names
  // If someone tries to use 'includeCompleted', TypeScript will catch it

  if (filter.completed === true) {
    // Only return completed tasks
    return 'if (!task.completed) return;';
  } else if (filter.completed === false) {
    // Only return active tasks
    return 'if (task.completed) return;';
  } else {
    // Default: exclude completed (backward compatible)
    return 'if (task.completed) return;';
  }
}

// =============================================================================
// COMPLETE FILTER BLOCK GENERATOR
// =============================================================================

/**
 * Options for generating filter logic
 */
export interface FilterGeneratorOptions {
  /** Include completion filtering */
  completion?: boolean;
  /** Include tag filtering */
  tags?: boolean;
  /** Include text filtering */
  text?: boolean;
  /** Include date filtering */
  dates?: boolean;
  /** Include flagged filtering */
  flagged?: boolean;
}

/**
 * Generate the complete filter logic block for an OmniJS script
 *
 * This replaces the hand-written filter logic that was duplicated across modes.
 *
 * @param filter The TaskFilter from the query
 * @param options Which filters to include
 * @returns Object with helper functions and filter call code
 */
export function generateFilterBlock(
  filter: TaskFilter,
  options: FilterGeneratorOptions = {},
): { helpers: string; filterCalls: string } {
  const helpers: string[] = [];
  const filterCalls: string[] = [];

  // Always respect completion filter from the TaskFilter
  // Note: We read filter.completed, NOT filter.includeCompleted
  const completionLogic = generateCompletionFilterLogic(filter);
  if (options.completion !== false) {
    filterCalls.push(completionLogic);
  }

  // Tags
  if (options.tags !== false) {
    helpers.push(generateTagFilterFunction());
    filterCalls.push(`
      const filterTags = ${JSON.stringify(filter.tags || [])};
      const tagsOperator = '${filter.tagsOperator || 'AND'}';
      if (!matchesTagFilter(task, filterTags, tagsOperator)) return;
    `);
  }

  // Text
  if (options.text !== false && filter.text) {
    helpers.push(generateTextFilterFunction());
    filterCalls.push(`
      const filterText = ${JSON.stringify(filter.text)};
      const textOperator = '${filter.textOperator || 'CONTAINS'}';
      if (!matchesTextFilter(task, filterText, textOperator)) return;
    `);
  }

  // Dates
  if (options.dates !== false && (filter.dueAfter || filter.dueBefore)) {
    helpers.push(generateDateFilterFunction());
    filterCalls.push(`
      const dueAfter = ${JSON.stringify(filter.dueAfter || '')};
      const dueBefore = ${JSON.stringify(filter.dueBefore || '')};
      const dueDateOperator = '${filter.dueDateOperator || ''}';
      if (!matchesDateFilter(task, dueAfter, dueBefore, dueDateOperator)) return;
    `);
  }

  // Flagged
  if (options.flagged !== false && filter.flagged !== undefined) {
    filterCalls.push(`
      if (task.flagged !== ${filter.flagged}) return;
    `);
  }

  return {
    helpers: helpers.join('\n'),
    filterCalls: filterCalls.join('\n'),
  };
}

// =============================================================================
// SCRIPT TEMPLATE GENERATOR
// =============================================================================

/**
 * Generate a complete OmniJS task iteration script
 *
 * This is the main entry point - replaces hand-written mode scripts.
 *
 * @param filter The TaskFilter specification
 * @param options Configuration options
 */
export function generateTaskIterationScript(
  filter: TaskFilter,
  options: {
    collection?: 'flattenedTasks' | 'inbox';
    limit?: number;
    fields?: string[];
  } = {},
): string {
  const { helpers, filterCalls } = generateFilterBlock(filter, {
    completion: true,
    tags: true,
    text: true,
    dates: true,
    flagged: true,
  });

  const collection = options.collection || 'flattenedTasks';
  const limit = options.limit || filter.limit || 50;

  return `
    (() => {
      ${helpers}

      const results = [];
      let count = 0;
      const limit = ${limit};

      ${collection}.forEach(task => {
        if (count >= limit) return;

        ${filterCalls}

        // Task passed all filters - add to results
        const proj = task.containingProject;
        results.push({
          id: task.id.primaryKey,
          name: task.name,
          completed: task.completed || false,
          flagged: task.flagged || false,
          inInbox: !proj,
          dueDate: task.dueDate ? task.dueDate.toISOString() : null,
          tags: task.tags ? task.tags.map(t => t.name) : [],
          project: proj ? proj.name : null,
          projectId: proj ? proj.id.primaryKey : null,
        });
        count++;
      });

      return JSON.stringify({
        tasks: results,
        count: results.length,
        collection: '${collection}'
      });
    })()
  `;
}
