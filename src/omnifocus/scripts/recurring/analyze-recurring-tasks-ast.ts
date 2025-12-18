/**
 * analyze-recurring-tasks-ast.ts - Pure OmniJS Recurring Task Analysis
 *
 * Phase 4 AST consolidation - modernized from helper-based version.
 *
 * Key optimizations:
 * - Removed getUnifiedHelpers() dependency (~18KB overhead)
 * - ALL task iteration in OmniJS context (vs JXA iteration)
 * - Direct property access without helper wrappers
 * - Single evaluateJavascript() call for all analysis
 *
 * Features preserved:
 * - Detects recurring patterns from repetition rules
 * - Smart inference from task names and project context
 * - Overdue tracking and next occurrence calculation
 * - Frequency summarization
 * - Flexible filtering (active, completed, dropped)
 */

import type { GeneratedScript } from '../../../contracts/ast/script-builder.js';

/**
 * Options for recurring task analysis
 */
export interface RecurringTasksOptions {
  /** Include completed recurring tasks */
  includeCompleted?: boolean;
  /** Include dropped recurring tasks */
  includeDropped?: boolean;
  /** Only include active (non-completed, non-dropped) tasks */
  activeOnly?: boolean;
  /** Include completion history */
  includeHistory?: boolean;
  /** Filter by project name */
  project?: string;
  /** Filter by project ID */
  projectId?: string;
  /** Sort by: name, dueDate, frequency, project */
  sortBy?: 'name' | 'dueDate' | 'frequency' | 'project';
  /** Maximum number of tasks to return */
  limit?: number;
}

/**
 * Build an OmniJS script that analyzes recurring tasks
 *
 * @param options - RecurringTasksOptions for filtering and sorting
 * @returns Generated script ready for execution
 */
export function buildRecurringTasksScript(options: RecurringTasksOptions = {}): GeneratedScript {
  const {
    includeCompleted = false,
    includeDropped = false,
    activeOnly = true,
    includeHistory = false,
    project,
    projectId,
    sortBy = 'name',
    limit,
  } = options;

  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();

    // Options passed from TypeScript
    const includeCompleted = ${includeCompleted};
    const includeDropped = ${includeDropped};
    const activeOnly = ${activeOnly};
    const includeHistory = ${includeHistory};
    const projectFilter = ${project ? JSON.stringify(project) : 'null'};
    const projectIdFilter = ${projectId ? JSON.stringify(projectId) : 'null'};
    const sortBy = ${JSON.stringify(sortBy)};
    const limitCount = ${limit || 'null'};

    // Pure OmniJS analysis - all task iteration in bridge context
    const analysisScript = \`
      (() => {
        const now = new Date();
        const nowTime = now.getTime();
        const recurringTasks = [];

        // Helper to parse RRULE format
        function parseRuleString(ruleStr) {
          const result = { unit: null, steps: 1 };
          if (!ruleStr) return result;

          const str = String(ruleStr);

          // Parse FREQ
          if (str.includes('FREQ=HOURLY')) { result.unit = 'hours'; result.steps = 1; }
          else if (str.includes('FREQ=DAILY')) { result.unit = 'days'; result.steps = 1; }
          else if (str.includes('FREQ=WEEKLY')) { result.unit = 'weeks'; result.steps = 1; }
          else if (str.includes('FREQ=MONTHLY')) { result.unit = 'months'; result.steps = 1; }
          else if (str.includes('FREQ=YEARLY')) { result.unit = 'years'; result.steps = 1; }

          // Parse INTERVAL
          const intervalMatch = str.match(/INTERVAL=(\\\\d+)/);
          if (intervalMatch) {
            result.steps = parseInt(intervalMatch[1]);
          }

          return result;
        }

        // Helper to infer frequency from task name
        function inferFrequencyFromName(taskName) {
          const name = taskName.toLowerCase();

          if (name.includes('hourly') || name.includes('every hour')) {
            return { unit: 'hours', steps: 1 };
          }
          if (name.includes('daily') || name.includes('every day')) {
            return { unit: 'days', steps: 1 };
          }
          if (name.includes('weekly') || name.includes('every week')) {
            return { unit: 'weeks', steps: 1 };
          }
          if (name.includes('monthly') || name.includes('every month')) {
            return { unit: 'months', steps: 1 };
          }
          if (name.includes('yearly') || name.includes('annually')) {
            return { unit: 'years', steps: 1 };
          }
          if (name.includes('quarterly') || name.includes('every 3 months')) {
            return { unit: 'months', steps: 3 };
          }
          if (name.includes('biweekly') || name.includes('every 2 weeks')) {
            return { unit: 'weeks', steps: 2 };
          }

          // Extract patterns like "every 4 weeks"
          const weekMatch = name.match(/every (\\\\d+) weeks?/);
          if (weekMatch) return { unit: 'weeks', steps: parseInt(weekMatch[1]) };

          const monthMatch = name.match(/every (\\\\d+) months?/);
          if (monthMatch) return { unit: 'months', steps: parseInt(monthMatch[1]) };

          const dayMatch = name.match(/every (\\\\d+) days?/);
          if (dayMatch) return { unit: 'days', steps: parseInt(dayMatch[1]) };

          return null;
        }

        // Helper to get frequency description
        function getFrequencyDescription(unit, steps) {
          if (!unit) return 'Unknown Pattern';

          switch (unit) {
            case 'hours':
              if (steps === 1) return 'Hourly';
              return 'Every ' + steps + ' hours';
            case 'days':
              if (steps === 1) return 'Daily';
              if (steps === 7) return 'Weekly';
              if (steps === 14) return 'Biweekly';
              return 'Every ' + steps + ' days';
            case 'weeks':
              if (steps === 1) return 'Weekly';
              if (steps === 2) return 'Biweekly';
              if (steps === 4) return 'Every 4 weeks';
              return 'Every ' + steps + ' weeks';
            case 'months':
              if (steps === 1) return 'Monthly';
              if (steps === 3) return 'Quarterly';
              if (steps === 6) return 'Every 6 months';
              return 'Every ' + steps + ' months';
            case 'years':
              if (steps === 1) return 'Yearly';
              return 'Every ' + steps + ' years';
            default:
              return 'Unknown Pattern';
          }
        }

        // Iterate through all tasks in OmniJS context
        flattenedTasks.forEach(task => {
          // Check if task has repetition rule
          const repetitionRule = task.repetitionRule;
          if (!repetitionRule) return;

          // Apply filtering
          const isCompleted = task.completed || false;
          const isDropped = task.taskStatus === Task.Status.Dropped;

          if (isCompleted && !${includeCompleted}) return;
          if (isDropped && !${includeDropped}) return;
          if (${activeOnly} && !${includeCompleted} && !${includeDropped} && (isCompleted || isDropped)) return;

          // Get project info
          let projectName = null;
          let projId = null;
          const containingProject = task.containingProject;
          if (containingProject) {
            projectName = containingProject.name;
            projId = containingProject.id.primaryKey;
          }

          // Apply project filters
          if (${project ? 'true' : 'false'} && projectName !== ${project ? JSON.stringify(project) : 'null'}) return;
          if (${projectId ? 'true' : 'false'} && projId !== ${projectId ? JSON.stringify(projectId) : 'null'}) return;

          // Build task info
          const taskInfo = {
            id: task.id.primaryKey,
            name: task.name,
            project: projectName,
            projectId: projId,
            repetitionRule: {}
          };

          // Extract repetition rule data
          let ruleData = { unit: null, steps: 1 };

          // Try ruleString first (RRULE format)
          if (repetitionRule.ruleString) {
            ruleData = parseRuleString(repetitionRule.ruleString);
            ruleData.ruleString = repetitionRule.ruleString;
            ruleData._inferenceSource = 'ruleString';
          }

          // Try method property
          if (repetitionRule.method) {
            ruleData.method = typeof repetitionRule.method === 'string'
              ? repetitionRule.method
              : (repetitionRule.method.name || null);
          }

          // Fallback: infer from task name
          if (!ruleData.unit) {
            const inferred = inferFrequencyFromName(task.name);
            if (inferred) {
              ruleData.unit = inferred.unit;
              ruleData.steps = inferred.steps;
              ruleData._inferenceSource = 'name_inference';
            }
          }

          taskInfo.repetitionRule = ruleData;
          taskInfo.frequency = getFrequencyDescription(ruleData.unit, ruleData.steps);

          // Add dates
          if (task.deferDate) {
            taskInfo.deferDate = task.deferDate.toISOString();
          }

          if (task.dueDate) {
            taskInfo.dueDate = task.dueDate.toISOString();
            taskInfo.nextDue = task.dueDate.toISOString();

            const daysUntilDue = Math.floor((task.dueDate.getTime() - nowTime) / (1000 * 60 * 60 * 24));
            taskInfo.daysUntilDue = daysUntilDue;

            if (daysUntilDue < 0) {
              taskInfo.isOverdue = true;
              taskInfo.overdueDays = Math.abs(daysUntilDue);
            }
          }

          // Include history if requested
          if (${includeHistory} && task.completionDate) {
            taskInfo.lastCompleted = task.completionDate.toISOString();
          }

          recurringTasks.push(taskInfo);
        });

        // Sort tasks
        switch ('${sortBy}') {
          case 'dueDate':
            recurringTasks.sort((a, b) => {
              if (!a.dueDate) return 1;
              if (!b.dueDate) return -1;
              return new Date(a.dueDate) - new Date(b.dueDate);
            });
            break;
          case 'frequency':
            recurringTasks.sort((a, b) => {
              const unitDays = { hours: 1/24, days: 1, weeks: 7, months: 30, years: 365 };
              const aFreq = (a.repetitionRule.steps || 1) * (unitDays[a.repetitionRule.unit] || 365);
              const bFreq = (b.repetitionRule.steps || 1) * (unitDays[b.repetitionRule.unit] || 365);
              return aFreq - bFreq;
            });
            break;
          case 'project':
            recurringTasks.sort((a, b) => {
              if (!a.project) return 1;
              if (!b.project) return -1;
              return a.project.localeCompare(b.project);
            });
            break;
          case 'name':
          default:
            recurringTasks.sort((a, b) => a.name.localeCompare(b.name));
            break;
        }

        // Apply limit if specified
        const limitedTasks = ${limit ? `recurringTasks.slice(0, ${limit})` : 'recurringTasks'};

        // Calculate summary statistics
        const summary = {
          totalRecurring: recurringTasks.length,
          returned: limitedTasks.length,
          overdue: recurringTasks.filter(t => t.isOverdue).length,
          dueThisWeek: recurringTasks.filter(t => t.daysUntilDue >= 0 && t.daysUntilDue <= 7).length,
          byFrequency: {}
        };

        recurringTasks.forEach(task => {
          const freq = task.frequency || 'Unknown';
          summary.byFrequency[freq] = (summary.byFrequency[freq] || 0) + 1;
        });

        return JSON.stringify({
          tasks: limitedTasks,
          summary: summary
        });
      })()
    \`;

    const resultJson = app.evaluateJavascript(analysisScript);
    const result = JSON.parse(resultJson);

    const endTime = Date.now();

    return JSON.stringify({
      ok: true,
      v: 'ast',
      tasks: result.tasks,
      summary: result.summary,
      metadata: {
        query_time_ms: endTime - startTime,
        optimization: 'ast_recurring_builder',
        options: {
          includeCompleted: includeCompleted,
          includeDropped: includeDropped,
          activeOnly: activeOnly,
          sortBy: sortBy
        }
      }
    });

  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        message: 'Failed to analyze recurring tasks: ' + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : undefined
      },
      v: 'ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: `recurring tasks (${activeOnly ? 'active only' : 'all'}, sorted by ${sortBy})`,
    isEmptyFilter: false,
  };
}

/**
 * Build a script to get recurring task summary only (faster, no task details)
 */
export function buildRecurringSummaryScript(): GeneratedScript {
  const script = `
(() => {
  const app = Application('OmniFocus');

  try {
    const startTime = Date.now();

    const summaryScript = \`
      (() => {
        const now = new Date();
        const nowTime = now.getTime();

        let total = 0;
        let overdue = 0;
        let dueThisWeek = 0;
        const byFrequency = {};

        flattenedTasks.forEach(task => {
          if (!task.repetitionRule) return;
          if (task.completed) return;

          total++;

          if (task.dueDate) {
            const daysUntilDue = Math.floor((task.dueDate.getTime() - nowTime) / (1000 * 60 * 60 * 24));
            if (daysUntilDue < 0) overdue++;
            else if (daysUntilDue <= 7) dueThisWeek++;
          }

          // Categorize by frequency
          let freq = 'Unknown';
          const rule = task.repetitionRule;
          if (rule.ruleString) {
            const str = String(rule.ruleString);
            if (str.includes('FREQ=DAILY')) freq = 'Daily';
            else if (str.includes('FREQ=WEEKLY')) freq = 'Weekly';
            else if (str.includes('FREQ=MONTHLY')) freq = 'Monthly';
            else if (str.includes('FREQ=YEARLY')) freq = 'Yearly';
          }
          byFrequency[freq] = (byFrequency[freq] || 0) + 1;
        });

        return JSON.stringify({
          totalRecurring: total,
          overdue: overdue,
          dueThisWeek: dueThisWeek,
          byFrequency: byFrequency
        });
      })()
    \`;

    const resultJson = app.evaluateJavascript(summaryScript);
    const summary = JSON.parse(resultJson);

    const endTime = Date.now();

    return JSON.stringify({
      ok: true,
      v: 'ast',
      summary: summary,
      metadata: {
        query_time_ms: endTime - startTime,
        optimization: 'ast_recurring_summary'
      }
    });

  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: {
        message: 'Failed to get recurring summary: ' + (error && error.toString ? error.toString() : 'Unknown error')
      },
      v: 'ast'
    });
  }
})()
`;

  return {
    script: script.trim(),
    filterDescription: 'recurring tasks summary (count only)',
    isEmptyFilter: false,
  };
}
