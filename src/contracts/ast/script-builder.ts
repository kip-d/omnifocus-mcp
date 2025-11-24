/**
 * Script Builder - Generates OmniJS scripts with AST-powered filters
 *
 * This module creates complete OmniJS scripts that use the AST-generated
 * filter predicates instead of inline filter logic.
 *
 * Benefits:
 * - Single source of truth for filter logic (AST)
 * - Validated filters catch errors before script generation
 * - Consistent behavior across all query modes
 * - Smaller, cleaner scripts
 *
 * @see docs/plans/2025-11-24-ast-filter-contracts-design.md
 */

import type { TaskFilter } from '../filters.js';
import { generateFilterCode } from './filter-generator.js';
import { buildAST } from './builder.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ScriptOptions {
  /** Maximum tasks to return */
  limit?: number;
  /** Fields to include in response */
  fields?: string[];
  /** Whether to include completed tasks (for modes that don't specify) */
  includeCompleted?: boolean;
}

export interface GeneratedScript {
  /** The complete OmniJS script ready for execution */
  script: string;
  /** Description of what the filter does */
  filterDescription: string;
  /** Whether the filter is empty (matches all tasks) */
  isEmptyFilter: boolean;
}

// =============================================================================
// FIELD PROJECTION HELPERS
// =============================================================================

/**
 * Default fields to include in task response
 */
const DEFAULT_FIELDS = [
  'id', 'name', 'completed', 'flagged', 'inInbox', 'blocked', 'available',
  'dueDate', 'deferDate', 'plannedDate', 'tags', 'note', 'project', 'projectId',
];

/**
 * Generate the field projection code for a task object
 */
function generateFieldProjection(fields: string[]): string {
  const fieldList = fields.length > 0 ? fields : DEFAULT_FIELDS;

  const projections: string[] = [];

  for (const field of fieldList) {
    switch (field) {
      case 'id':
        projections.push('id: task.id.primaryKey');
        break;
      case 'name':
        projections.push('name: task.name');
        break;
      case 'completed':
        projections.push('completed: task.completed || false');
        break;
      case 'flagged':
        projections.push('flagged: task.flagged || false');
        break;
      case 'inInbox':
        projections.push('inInbox: !task.containingProject');
        break;
      case 'blocked':
        projections.push('blocked: task.taskStatus === Task.Status.Blocked');
        break;
      case 'available':
        projections.push('available: task.taskStatus === Task.Status.Available');
        break;
      case 'dueDate':
        projections.push('dueDate: task.dueDate ? task.dueDate.toISOString() : null');
        break;
      case 'deferDate':
        projections.push('deferDate: task.deferDate ? task.deferDate.toISOString() : null');
        break;
      case 'plannedDate':
        projections.push('plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null');
        break;
      case 'completionDate':
        projections.push('completionDate: task.completionDate ? task.completionDate.toISOString() : null');
        break;
      case 'tags':
        projections.push('tags: task.tags ? task.tags.map(t => t.name) : []');
        break;
      case 'note':
        projections.push('note: task.note || ""');
        break;
      case 'project':
        projections.push('project: task.containingProject ? task.containingProject.name : null');
        break;
      case 'projectId':
        projections.push('projectId: task.containingProject ? task.containingProject.id.primaryKey : null');
        break;
      case 'estimatedMinutes':
        projections.push('estimatedMinutes: task.estimatedMinutes || null');
        break;
      case 'repetitionRule':
        projections.push(`repetitionRule: (() => {
          const rule = task.repetitionRule;
          if (!rule) return null;
          try {
            return {
              recurrence: rule.recurrence || null,
              repetitionMethod: rule.method ? rule.method.toString() : null,
              ruleString: rule.ruleString || null
            };
          } catch (e) { return null; }
        })()`);
        break;
      case 'parentTaskId':
        projections.push('parentTaskId: task.parent ? task.parent.id.primaryKey : null');
        break;
      case 'parentTaskName':
        projections.push('parentTaskName: task.parent ? task.parent.name : null');
        break;
    }
  }

  return projections.join(',\n                ');
}

// =============================================================================
// MAIN SCRIPT BUILDER
// =============================================================================

/**
 * Build an OmniJS script that filters tasks using AST-generated predicates
 *
 * @param filter - The TaskFilter to apply
 * @param options - Script generation options
 * @returns Generated script ready for execution
 */
export function buildFilteredTasksScript(
  filter: TaskFilter,
  options: ScriptOptions = {},
): GeneratedScript {
  const { limit = 50, fields = [], includeCompleted = false } = options;

  // Build the AST to check if empty
  const ast = buildAST(filter);
  const isEmptyFilter = ast.type === 'literal' && ast.value === true;

  // Generate the filter predicate code
  const filterCode = generateFilterCode(filter, 'omnijs');

  // Build description
  const filterDescription = describeFilterForScript(filter);

  // Generate field projection
  const fieldProjection = generateFieldProjection(fields);

  // Determine completion filter behavior
  // If filter explicitly sets completed, use that
  // Otherwise, use includeCompleted option
  const completionCheck = filter.completed !== undefined
    ? '' // AST handles it
    : (includeCompleted ? '' : 'if (task.completed) return;');

  const script = `
(() => {
  const results = [];
  let count = 0;
  const limit = ${limit};

  // AST-generated filter predicate
  // Filter: ${filterDescription}
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${filterCode};
  }

  flattenedTasks.forEach(task => {
    if (count >= limit) return;
    ${completionCheck}

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    results.push({
      ${fieldProjection}
    });
    count++;
  });

  return JSON.stringify({
    tasks: results,
    count: results.length,
    mode: 'ast_filtered',
    filter_description: ${JSON.stringify(filterDescription)}
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter,
  };
}

/**
 * Build an OmniJS script for inbox tasks with optional additional filters
 */
export function buildInboxScript(
  additionalFilter: TaskFilter = {},
  options: ScriptOptions = {},
): GeneratedScript {
  const { limit = 50, fields = [] } = options;

  // Merge inbox filter with additional filters
  const filter: TaskFilter = { ...additionalFilter, inInbox: true };

  const filterCode = generateFilterCode(filter, 'omnijs');
  const filterDescription = describeFilterForScript(filter);
  const fieldProjection = generateFieldProjection(fields);

  const script = `
(() => {
  const results = [];
  let count = 0;
  const limit = ${limit};

  // AST-generated filter predicate for inbox
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${filterCode};
  }

  inbox.forEach(task => {
    if (count >= limit) return;

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    results.push({
      ${fieldProjection}
    });
    count++;
  });

  return JSON.stringify({
    tasks: results,
    count: results.length,
    mode: 'inbox_ast',
    filter_description: ${JSON.stringify(filterDescription)}
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter: false, // Inbox always has inInbox: true
  };
}

/**
 * Build an OmniJS script for a specific task by ID
 */
export function buildTaskByIdScript(
  taskId: string,
  fields: string[] = [],
): GeneratedScript {
  const fieldProjection = generateFieldProjection(fields);

  const script = `
(() => {
  const results = [];
  const targetId = ${JSON.stringify(taskId)};

  flattenedTasks.forEach(task => {
    if (task.id.primaryKey === targetId) {
      results.push({
        ${fieldProjection}
      });
    }
  });

  return JSON.stringify({
    tasks: results,
    count: results.length,
    mode: 'id_lookup',
    targetId: targetId
  });
})()
`;

  return {
    script: script.trim(),
    filterDescription: `id = ${taskId}`,
    isEmptyFilter: false,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function describeFilterForScript(filter: TaskFilter): string {
  const conditions: string[] = [];

  if (filter.completed !== undefined) {
    conditions.push(filter.completed ? 'completed' : 'active');
  }
  if (filter.flagged !== undefined) {
    conditions.push(filter.flagged ? 'flagged' : 'not flagged');
  }
  if (filter.blocked !== undefined) {
    conditions.push(filter.blocked ? 'blocked' : 'not blocked');
  }
  if (filter.available !== undefined) {
    conditions.push(filter.available ? 'available' : 'not available');
  }
  if (filter.inInbox !== undefined) {
    conditions.push(filter.inInbox ? 'inbox' : 'not inbox');
  }
  if (filter.tags && filter.tags.length > 0) {
    conditions.push(`tags[${filter.tagsOperator || 'AND'}]: ${filter.tags.join(', ')}`);
  }
  if (filter.text) {
    conditions.push(`text: "${filter.text}"`);
  }
  if (filter.dueBefore || filter.dueAfter) {
    if (filter.dueBefore && filter.dueAfter) {
      conditions.push(`due: ${filter.dueAfter} to ${filter.dueBefore}`);
    } else if (filter.dueBefore) {
      conditions.push(`due before: ${filter.dueBefore}`);
    } else {
      conditions.push(`due after: ${filter.dueAfter}`);
    }
  }
  if (filter.projectId) {
    conditions.push(`project: ${filter.projectId}`);
  }
  if (filter.id) {
    conditions.push(`id: ${filter.id}`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : 'all tasks';
}
