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

import type { TaskFilter, ProjectFilter } from '../filters.js';
import { generateFilterCode, generateProjectFilterCode, isEmptyProjectFilter, describeProjectFilter } from './filter-generator.js';
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
  'id',
  'name',
  'completed',
  'flagged',
  'inInbox',
  'blocked',
  'available',
  'dueDate',
  'deferDate',
  'plannedDate',
  'tags',
  'note',
  'project',
  'projectId',
  'estimatedMinutes',
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
export function buildFilteredTasksScript(filter: TaskFilter, options: ScriptOptions = {}): GeneratedScript {
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
  const completionCheck =
    filter.completed !== undefined
      ? '' // AST handles it
      : includeCompleted
        ? ''
        : 'if (task.completed) return;';

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
export function buildInboxScript(additionalFilter: TaskFilter = {}, options: ScriptOptions = {}): GeneratedScript {
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
export function buildTaskByIdScript(taskId: string, fields: string[] = []): GeneratedScript {
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
// RECURRING TASKS SCRIPT BUILDER
// =============================================================================

/**
 * Options for recurring tasks analysis
 */
export interface RecurringTasksOptions extends ScriptOptions {
  /** Include completed recurring tasks */
  includeCompleted?: boolean;
  /** Include dropped recurring tasks */
  includeDropped?: boolean;
  /** Only active tasks (not completed or dropped) */
  activeOnly?: boolean;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by project name */
  project?: string;
  /** Sort by: 'dueDate' | 'frequency' | 'project' | 'name' */
  sortBy?: 'dueDate' | 'frequency' | 'project' | 'name';
  /** Include completion history */
  includeHistory?: boolean;
}

/**
 * Build an OmniJS script for analyzing recurring tasks
 *
 * Uses AST for filtering (hasRepetitionRule, completed, dropped, projectId)
 * while keeping the domain-specific pattern inference logic.
 */
export function buildRecurringTasksScript(options: RecurringTasksOptions = {}): GeneratedScript {
  const {
    limit = 1000,
    includeCompleted = false,
    includeDropped = false,
    activeOnly = true,
    projectId,
    project,
    sortBy = 'name',
    includeHistory = false,
  } = options;

  // Build AST filter from options
  const filter: TaskFilter = {
    hasRepetitionRule: true, // Only recurring tasks
  };

  // Apply completion/dropped filters based on options
  if (activeOnly && !includeCompleted && !includeDropped) {
    filter.completed = false;
    filter.dropped = false;
  } else {
    if (!includeCompleted) {
      filter.completed = false;
    }
    if (!includeDropped) {
      filter.dropped = false;
    }
  }

  // Apply project filter if specified
  if (projectId) {
    filter.projectId = projectId;
  }

  // Generate the filter predicate using AST
  const filterCode = generateFilterCode(filter, 'omnijs');
  const filterDescription = describeFilterForScript(filter);

  // Build the AST to check if empty (it won't be - we always have hasRepetitionRule)
  const ast = buildAST(filter);
  const isEmptyFilter = ast.type === 'literal' && ast.value === true;

  // The script with AST-generated filter predicate and domain-specific inference logic
  const script = `
(() => {
  const options = {
    project: ${JSON.stringify(project)},
    sortBy: ${JSON.stringify(sortBy)},
    includeHistory: ${includeHistory},
    limit: ${limit}
  };

  const results = [];
  const now = new Date();
  let count = 0;

  // AST-generated filter predicate
  // Filter: ${filterDescription}
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${filterCode};
  }

  // Helper to fetch repeat rule via bridge for complete data
  function fetchRepeatRuleViaBridge(taskId) {
    try {
      const task = Task.byIdentifier(taskId);
      if (!task || !task.repetitionRule) return null;
      const rule = task.repetitionRule;
      const method = rule.method ? (typeof rule.method === 'string' ? rule.method : (rule.method.name || null)) : null;
      return { ruleString: rule.ruleString || null, method: method };
    } catch (e) {
      return null;
    }
  }

  // Process each task
  flattenedTasks.forEach(task => {
    if (count >= options.limit) return;

    // Apply AST-generated filter
    if (!matchesFilter(task)) return;

    const taskInfo = {
      id: task.id.primaryKey,
      name: task.name,
      repetitionRule: {}
    };

    // Extract repetition rule properties
    const rule = task.repetitionRule;
    const ruleData = {};

    // Try official OmniFocus API properties
    ['method', 'ruleString', 'anchorDateKey', 'catchUpAutomatically', 'scheduleType'].forEach(prop => {
      try {
        const value = rule[prop];
        if (value !== undefined && value !== null && value !== '') {
          ruleData[prop] = value;
        }
      } catch (e) {}
    });

    // Parse RRULE format
    if (ruleData.ruleString) {
      try {
        const ruleStr = ruleData.ruleString.toString();
        if (ruleStr.includes('FREQ=HOURLY')) { ruleData.unit = 'hours'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=DAILY')) { ruleData.unit = 'days'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=WEEKLY')) { ruleData.unit = 'weeks'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=MONTHLY')) { ruleData.unit = 'months'; ruleData.steps = 1; }
        else if (ruleStr.includes('FREQ=YEARLY')) { ruleData.unit = 'years'; ruleData.steps = 1; }

        const intervalMatch = ruleStr.match(/INTERVAL=(\\d+)/);
        if (intervalMatch) { ruleData.steps = parseInt(intervalMatch[1]); }
        ruleData._inferenceSource = 'ruleString';
      } catch (e) {}
    }

    // Bridge fallback for missing data
    if (!ruleData.ruleString || !ruleData.method) {
      const bridgeRule = fetchRepeatRuleViaBridge(task.id.primaryKey);
      if (bridgeRule && bridgeRule.ruleString) {
        ruleData.ruleString = bridgeRule.ruleString;
        if (bridgeRule.method) { ruleData.method = bridgeRule.method; }
        ruleData._inferenceSource = 'bridge';
      }
    }

    taskInfo.repetitionRule = ruleData;

    // Add project info
    const proj = task.containingProject;
    if (proj) {
      taskInfo.project = proj.name;
      taskInfo.projectId = proj.id.primaryKey;
    }

    // Project name filter (if specified)
    if (options.project && taskInfo.project && taskInfo.project !== options.project) {
      return;
    }

    // Add dates
    if (task.deferDate) { taskInfo.deferDate = task.deferDate.toISOString(); }
    if (task.dueDate) {
      taskInfo.dueDate = task.dueDate.toISOString();
      if (!task.completed) {
        taskInfo.nextDue = task.dueDate.toISOString();
        taskInfo.daysUntilDue = Math.floor((task.dueDate - now) / (1000 * 60 * 60 * 24));
        if (taskInfo.daysUntilDue < 0) {
          taskInfo.isOverdue = true;
          taskInfo.overdueDays = Math.abs(taskInfo.daysUntilDue);
        }
      }
    }

    // Completion history
    if (options.includeHistory && task.completionDate) {
      taskInfo.lastCompleted = task.completionDate.toISOString();
    }

    // Calculate frequency description
    let frequencyDesc = '';
    if (ruleData.unit && ruleData.steps) {
      const s = ruleData.steps;
      switch(ruleData.unit) {
        case 'hours': frequencyDesc = s === 1 ? 'Hourly' : 'Every ' + s + ' hours'; break;
        case 'days': frequencyDesc = s === 1 ? 'Daily' : s === 7 ? 'Weekly' : s === 14 ? 'Biweekly' : 'Every ' + s + ' days'; break;
        case 'weeks': frequencyDesc = s === 1 ? 'Weekly' : 'Every ' + s + ' weeks'; break;
        case 'months': frequencyDesc = s === 1 ? 'Monthly' : s === 3 ? 'Quarterly' : 'Every ' + s + ' months'; break;
        case 'years': frequencyDesc = s === 1 ? 'Yearly' : 'Every ' + s + ' years'; break;
      }
    }

    // Fallback: infer from task name
    if (!frequencyDesc) {
      const taskName = task.name.toLowerCase();
      if (taskName.includes('hourly') || taskName.includes('every hour')) { frequencyDesc = 'Hourly'; ruleData.unit = 'hours'; ruleData.steps = 1; }
      else if (taskName.includes('daily') || taskName.includes('every day')) { frequencyDesc = 'Daily'; ruleData.unit = 'days'; ruleData.steps = 1; }
      else if (taskName.includes('weekly') || taskName.includes('every week')) { frequencyDesc = 'Weekly'; ruleData.unit = 'weeks'; ruleData.steps = 1; }
      else if (taskName.includes('monthly') || taskName.includes('every month')) { frequencyDesc = 'Monthly'; ruleData.unit = 'months'; ruleData.steps = 1; }
      else if (taskName.includes('yearly') || taskName.includes('annually')) { frequencyDesc = 'Yearly'; ruleData.unit = 'years'; ruleData.steps = 1; }
      else if (taskName.includes('quarterly')) { frequencyDesc = 'Quarterly'; ruleData.unit = 'months'; ruleData.steps = 3; }
      else if (taskName.includes('biweekly')) { frequencyDesc = 'Biweekly'; ruleData.unit = 'weeks'; ruleData.steps = 2; }
      else { frequencyDesc = 'Unknown Pattern'; }
    }

    taskInfo.frequency = frequencyDesc;
    taskInfo.repetitionRule = ruleData;
    results.push(taskInfo);
    count++;
  });

  // Sort results
  switch(options.sortBy) {
    case 'dueDate':
      results.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
      break;
    case 'frequency':
      results.sort((a, b) => {
        const aFreq = (a.repetitionRule.steps || 1) * ({ hours: 1/24, days: 1, weeks: 7, months: 30, years: 365 }[a.repetitionRule.unit] || 999);
        const bFreq = (b.repetitionRule.steps || 1) * ({ hours: 1/24, days: 1, weeks: 7, months: 30, years: 365 }[b.repetitionRule.unit] || 999);
        return aFreq - bFreq;
      });
      break;
    case 'project':
      results.sort((a, b) => {
        if (!a.project) return 1;
        if (!b.project) return -1;
        return a.project.localeCompare(b.project);
      });
      break;
    case 'name':
    default:
      results.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Summary statistics
  const summary = {
    totalRecurring: results.length,
    overdue: results.filter(t => t.isOverdue).length,
    dueThisWeek: results.filter(t => t.daysUntilDue >= 0 && t.daysUntilDue <= 7).length,
    byFrequency: {}
  };

  results.forEach(task => {
    const freq = task.frequency || 'Unknown';
    summary.byFrequency[freq] = (summary.byFrequency[freq] || 0) + 1;
  });

  return JSON.stringify({
    tasks: results,
    summary: summary,
    mode: 'recurring_ast',
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function describeFilterForScript(filter: TaskFilter): string {
  const conditions: string[] = [];

  if (filter.completed !== undefined) {
    conditions.push(filter.completed ? 'completed' : 'active');
  }
  if (filter.dropped !== undefined) {
    conditions.push(filter.dropped ? 'dropped' : 'not dropped');
  }
  if (filter.hasRepetitionRule !== undefined) {
    conditions.push(filter.hasRepetitionRule ? 'recurring' : 'non-recurring');
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

// =============================================================================
// PROJECT SCRIPT BUILDER
// =============================================================================

/**
 * Options for project queries
 */
export interface ProjectScriptOptions {
  /** Maximum projects to return */
  limit?: number;
  /** Fields to include in response */
  fields?: string[];
  /** Include task statistics (expensive) */
  includeStats?: boolean;
  /** Performance mode: 'normal' includes task counts, 'lite' skips them */
  performanceMode?: 'normal' | 'lite';
}

/**
 * Default fields to include in project response
 */
const DEFAULT_PROJECT_FIELDS = [
  'id',
  'name',
  'status',
  'flagged',
  'note',
  'dueDate',
  'deferDate',
  'folder',
  'folderPath',
  'sequential',
  'lastReviewDate',
  'nextReviewDate',
];

/**
 * Generate the field projection code for a project object
 */
function generateProjectFieldProjection(fields: string[]): string {
  const fieldList = fields.length > 0 ? fields : DEFAULT_PROJECT_FIELDS;
  const projections: string[] = [];

  for (const field of fieldList) {
    switch (field) {
      case 'id':
        projections.push('id: project.id.primaryKey');
        break;
      case 'name':
        projections.push('name: project.name || "Unnamed Project"');
        break;
      case 'status':
        projections.push('status: getProjectStatus(project)');
        break;
      case 'flagged':
        projections.push('flagged: project.flagged || false');
        break;
      case 'note':
        projections.push('note: project.note || ""');
        break;
      case 'dueDate':
        projections.push('dueDate: project.dueDate ? project.dueDate.toISOString() : null');
        break;
      case 'deferDate':
        projections.push('deferDate: project.deferDate ? project.deferDate.toISOString() : null');
        break;
      case 'folder':
        projections.push('folder: project.parentFolder ? project.parentFolder.name : null');
        break;
      case 'folderPath':
        projections.push('folderPath: project.parentFolder ? getFolderPath(project.parentFolder) : null');
        break;
      case 'folderId':
        projections.push('folderId: project.parentFolder ? project.parentFolder.id.primaryKey : null');
        break;
      case 'sequential':
        projections.push('sequential: project.sequential || false');
        break;
      case 'lastReviewDate':
        projections.push('lastReviewDate: project.lastReviewDate ? project.lastReviewDate.toISOString() : null');
        break;
      case 'nextReviewDate':
        projections.push('nextReviewDate: project.nextReviewDate ? project.nextReviewDate.toISOString() : null');
        break;
      case 'completedDate':
        projections.push('completedDate: project.completedDate ? project.completedDate.toISOString() : null');
        break;
      case 'defaultSingletonActionHolder':
        projections.push('defaultSingletonActionHolder: project.defaultSingletonActionHolder || false');
        break;
    }
  }

  return projections.join(',\n                ');
}

/**
 * Build an OmniJS script that filters projects using AST-generated predicates
 *
 * @param filter - The ProjectFilter to apply
 * @param options - Script generation options
 * @returns Generated script ready for execution
 */
export function buildFilteredProjectsScript(filter: ProjectFilter, options: ProjectScriptOptions = {}): GeneratedScript {
  const { limit = 50, fields = [], includeStats = false, performanceMode = 'normal' } = options;

  // Generate the filter predicate code
  const filterCode = generateProjectFilterCode(filter);
  const isEmptyFilterValue = isEmptyProjectFilter(filter);
  const filterDescription = describeProjectFilter(filter);

  // Generate field projection
  const fieldProjection = generateProjectFieldProjection(fields);

  // Include task counts only in normal mode
  const includeTaskCounts = performanceMode !== 'lite';

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const omniJsScript = \`
      (() => {
        const results = [];
        let count = 0;
        const limit = ${limit};

        // Helper to get project status string
        function getProjectStatus(project) {
          if (project.status === Project.Status.Done) return 'done';
          if (project.status === Project.Status.Dropped) return 'dropped';
          if (project.status === Project.Status.OnHold) return 'on-hold';
          return 'active';
        }

        // Helper to build folder path
        function getFolderPath(folder) {
          if (!folder) return '';
          const parts = [];
          let current = folder;
          while (current) {
            parts.unshift(current.name);
            current = current.parent;
          }
          return parts.join('/');
        }

        // AST-generated filter predicate
        // Filter: ${filterDescription}
        function matchesFilter(project) {
          return ${filterCode};
        }

        flattenedProjects.forEach(project => {
          if (count >= limit) return;

          // Apply AST-generated filter
          if (!matchesFilter(project)) return;

          const proj = {
            ${fieldProjection}
          };

          ${
            includeTaskCounts
              ? `
          // Task counts (normal mode)
          const rootTask = project.rootTask;
          if (rootTask) {
            proj.taskCounts = {
              total: rootTask.numberOfTasks || 0,
              available: rootTask.numberOfAvailableTasks || 0,
              completed: rootTask.numberOfCompletedTasks || 0
            };
          }

          // Next task
          const nextTask = project.nextTask;
          if (nextTask) {
            proj.nextTask = {
              id: nextTask.id.primaryKey,
              name: nextTask.name,
              flagged: nextTask.flagged || false,
              dueDate: nextTask.dueDate ? nextTask.dueDate.toISOString() : null
            };
          }
          `
              : ''
          }

          ${
            includeStats
              ? `
          // Include stats (expensive)
          const tasks = project.flattenedTasks;
          if (tasks && tasks.length > 0) {
            let active = 0, completed = 0, overdue = 0, flagged = 0;
            const now = new Date();

            tasks.forEach(task => {
              if (task.completed) {
                completed++;
              } else {
                active++;
                if (task.dueDate && task.dueDate < now) overdue++;
              }
              if (task.flagged) flagged++;
            });

            proj.stats = {
              active: active,
              completed: completed,
              total: tasks.length,
              completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
              overdue: overdue,
              flagged: flagged
            };
          }
          `
              : ''
          }

          results.push(proj);
          count++;
        });

        return JSON.stringify({
          projects: results,
          count: results.length,
          total_available: flattenedProjects.length
        });
      })()
    \`;

    const resultJson = app.evaluateJavascript(omniJsScript);
    const result = JSON.parse(resultJson);

    return JSON.stringify({
      projects: result.projects,
      metadata: {
        total_available: result.total_available,
        returned_count: result.count,
        limit_applied: ${limit},
        performance_mode: '${performanceMode}',
        stats_included: ${includeStats},
        optimization: 'ast_filtered',
        filter_description: ${JSON.stringify(filterDescription)}
      }
    });

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'list_projects_ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription,
    isEmptyFilter: isEmptyFilterValue,
  };
}

/**
 * Build an OmniJS script for a specific project by ID
 */
export function buildProjectByIdScript(projectId: string, fields: string[] = []): GeneratedScript {
  const fieldProjection = generateProjectFieldProjection(fields);

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const omniJsScript = \`
      (() => {
        const results = [];
        const targetId = ${JSON.stringify(projectId)};

        function getProjectStatus(project) {
          if (project.status === Project.Status.Done) return 'done';
          if (project.status === Project.Status.Dropped) return 'dropped';
          if (project.status === Project.Status.OnHold) return 'on-hold';
          return 'active';
        }

        function getFolderPath(folder) {
          if (!folder) return '';
          const parts = [];
          let current = folder;
          while (current) {
            parts.unshift(current.name);
            current = current.parent;
          }
          return parts.join('/');
        }

        // Use Project.byIdentifier for O(1) lookup
        const project = Project.byIdentifier(targetId);
        if (project) {
          results.push({
            ${fieldProjection}
          });
        }

        return JSON.stringify({
          projects: results,
          count: results.length,
          mode: 'id_lookup',
          targetId: targetId
        });
      })()
    \`;

    const resultJson = app.evaluateJavascript(omniJsScript);
    return resultJson;

  } catch (error) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: 'project_by_id'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: `id = ${projectId}`,
    isEmptyFilter: false,
  };
}
