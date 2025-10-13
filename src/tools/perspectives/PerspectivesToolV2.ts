import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives/list-perspectives.js';
import { QUERY_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/perspectives/query-perspective.js';
import { createSuccessResponseV2, createErrorResponseV2, OperationTimerV2, StandardResponseV2 } from '../../utils/response-format.js';
import { coerceBoolean, coerceNumber } from '../schemas/coercion-helpers.js';
import { isScriptSuccess } from '../../omnifocus/script-result-types.js';

// Consolidated schema for all perspective operations
const PerspectivesToolSchema = z.object({
  operation: z.enum(['list', 'query'])
    .default('list')
    .describe('Operation to perform: list all perspectives or query a specific one'),

  // List operation parameters
  includeFilterRules: coerceBoolean()
    .default(false)
    .describe('Include filter rules for custom perspectives (list operation)'),

  sortBy: z.string()
    .default('name')
    .describe('Sort order for perspectives (list operation)'),

  // Query operation parameters
  perspectiveName: z.string()
    .optional()
    .describe('Name of the perspective to query (required for query operation)'),

  limit: coerceNumber()
    .default(50)
    .describe('Maximum number of tasks to return (query operation)'),

  includeDetails: coerceBoolean()
    .default(false)
    .describe('Include task details like notes and subtasks (query operation)'),

  // Enhanced formatting options (query operation)
  formatOutput: coerceBoolean()
    .default(false)
    .describe('Return rich formatted text with checkboxes, flags, and visual indicators (query operation)'),

  groupBy: z.enum(['none', 'project', 'tag', 'dueDate', 'status'])
    .default('none')
    .describe('Group results by project, tag, due date, or status for better organization (query operation)'),

  fields: z.array(z.enum([
    'id', 'name', 'flagged', 'dueDate', 'deferDate', 'completed',
    'project', 'projectId', 'tags', 'available', 'note', 'estimatedMinutes',
  ]))
    .optional()
    .describe('Select specific fields to return for performance optimization (query operation)'),

  includeMetadata: coerceBoolean()
    .default(true)
    .describe('Include perspective metadata and summary information (query operation)'),
});

interface PerspectiveInfo {
  name: string;
  identifier?: string;
  isBuiltIn?: boolean;
  isActive?: boolean;
  filterRules?: {
    available?: boolean | null;
    flagged?: boolean | null;
    duration?: number | null;
    tags?: string[];
  };
}

interface PerspectiveTask {
  id: string;
  name: string;
  flagged: boolean;
  dueDate: string | null;
  deferDate: string | null;
  completed: boolean;
  project: string | null;
  available: boolean;
  tags: string[];
}

interface QueryPerspectiveData {
  perspectiveName: string;
  perspectiveType: 'builtin' | 'custom';
  tasks: PerspectiveTask[];
  filterRules: Record<string, unknown>;
  aggregation: string;
  // Enhanced formatting support
  formattedOutput?: string;
  groupedResults?: GroupedPerspectiveResults;
  metadata?: PerspectiveMetadata;
}

interface GroupedPerspectiveResults {
  [groupKey: string]: {
    title: string;
    count: number;
    tasks: PerspectiveTask[];
  };
}

interface PerspectiveMetadata {
  totalTasks: number;
  completedTasks: number;
  flaggedTasks: number;
  overdueTasks: number;
  availableTasks: number;
  grouping: string;
  formatting: 'raw' | 'formatted';
}

type PerspectivesResponse = StandardResponseV2<{ perspectives: PerspectiveInfo[] } | QueryPerspectiveData>;

export class PerspectivesToolV2 extends BaseTool<typeof PerspectivesToolSchema> {
  name = 'perspectives';
  description = 'Manage OmniFocus perspectives with enhanced viewing capabilities. Use operation="list" to see all perspectives, operation="query" to get tasks from a perspective with rich formatting, grouping, and field selection options. Set formatOutput=true for human-readable display with checkboxes and visual indicators.';
  schema = PerspectivesToolSchema;

  async executeValidated(args: z.infer<typeof PerspectivesToolSchema>): Promise<PerspectivesResponse> {
    const { operation } = args;

    switch (operation) {
      case 'list':
        return this.listPerspectives(args);
      case 'query':
        return this.queryPerspective(args);
      default:
        return createErrorResponseV2(
          'perspectives',
          'INVALID_OPERATION',
          `Invalid operation: ${String(operation)}`,
          undefined,
          { operation },
          { executionTime: 0 },
        );
    }
  }

  private async listPerspectives(args: z.infer<typeof PerspectivesToolSchema>): Promise<StandardResponseV2<{ perspectives: PerspectiveInfo[] }>> {
    const timer = new OperationTimerV2();

    try {
      const script = this.omniAutomation.buildScript(LIST_PERSPECTIVES_SCRIPT, {});
      const result = await this.execJson(script);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          result.error,
          undefined,
          { rawResult: result.details },
          timer.toMetadata(),
        );
      }

      // Parse the result - handle both perspectives and items properties
      const parsedResult = result.data;

      // Handle different response formats from the script
      let perspectives: PerspectiveInfo[];
      if (parsedResult && typeof parsedResult === 'object') {
        const data = parsedResult as { perspectives?: PerspectiveInfo[]; items?: PerspectiveInfo[] };
        perspectives = data.perspectives || data.items || [];
      } else {
        perspectives = [];
      }

      // Sort perspectives (default to 'name' if not specified)
      const sortBy = args.sortBy || 'name';
      if (sortBy === 'name') {
        (perspectives as PerspectiveInfo[]).sort((a: PerspectiveInfo, b: PerspectiveInfo) =>
          a.name.localeCompare(b.name),
        );
      }

      // Filter out filter rules if not requested
      if (!args.includeFilterRules) {
        perspectives.forEach((p: PerspectiveInfo) => {
          delete p.filterRules;
        });
      }

      return createSuccessResponseV2(
        'perspectives',
        { perspectives },
        undefined,
        { ...timer.toMetadata(), ...(parsedResult as { metadata?: Record<string, unknown> }).metadata, operation: 'list' },
      );
    } catch (error) {
      return createErrorResponseV2(
        'perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        { operation: 'list' },
        timer.toMetadata(),
      );
    }
  }

  private async queryPerspective(args: z.infer<typeof PerspectivesToolSchema>): Promise<StandardResponseV2<QueryPerspectiveData>> {
    const timer = new OperationTimerV2();

    try {
      const {
        perspectiveName,
        limit,
        includeDetails,
        formatOutput,
        groupBy,
        fields,
        includeMetadata,
      } = args;

      if (!perspectiveName) {
        return createErrorResponseV2(
          'perspectives',
          'MISSING_PARAMETER',
          'perspectiveName is required for query operation',
          undefined,
          { operation: 'query' },
          timer.toMetadata(),
        );
      }

      // Create cache key including new formatting options
      const fieldsKey = fields ? fields.sort().join(',') : 'all';
      const cacheKey = `perspective:${perspectiveName}:${limit}:${includeDetails}:${formatOutput}:${groupBy}:${fieldsKey}:${includeMetadata}`;

      // Check cache (30 second TTL for perspective queries)
      const cached = this.cache.get<StandardResponseV2<QueryPerspectiveData>>('tasks', cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached tasks for perspective: ${perspectiveName}`);
        return cached;
      }

      // Build and execute script
      const script = this.omniAutomation.buildScript(QUERY_PERSPECTIVE_SCRIPT, {
        perspectiveName: perspectiveName,
        limit: limit,
        includeDetails: includeDetails,
      });

      this.logger.debug(`Querying perspective: ${perspectiveName}`);
      // For query operation, legacy tests return a direct object with success flag
      let raw: unknown = await (this.omniAutomation as { execute: (script: string) => Promise<unknown> }).execute(script);
      if (typeof raw === 'string') { try { raw = JSON.parse(raw) as unknown; } catch { /* ignore */ } }

      if (!raw || (raw as { error?: boolean }).error === true) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          (raw && (raw as { message?: string }).message) ? (raw as { message: string }).message : 'Script failed',
          undefined,
          { rawResult: raw },
          timer.toMetadata(),
        );
      }

      // Legacy success/false pattern
      if ((raw as { success?: boolean }).success === false) {
        return createErrorResponseV2(
          'perspectives',
          'PERSPECTIVE_NOT_FOUND',
          (raw as { error?: string }).error || `Perspective "${perspectiveName}" not found`,
          undefined,
          { perspectiveName },
          timer.toMetadata(),
        );
      }

      // Extract raw data
      const rawData = raw as {
        perspectiveName: string;
        perspectiveType: 'builtin' | 'custom';
        tasks?: PerspectiveTask[];
        filterRules?: Record<string, unknown>;
        aggregation?: string;
        metadata?: Record<string, unknown>;
      };

      let tasks = rawData.tasks || [];

      // Apply field selection if specified
      if (fields && fields.length > 0) {
        tasks = tasks.map(task => {
          const filteredTask: Record<string, unknown> = {};
          for (const field of fields) {
            if (field in task) {
              filteredTask[field] = task[field as keyof PerspectiveTask];
            }
          }
          return filteredTask as unknown as PerspectiveTask;
        });
      }

      // Generate enhanced data
      const metadata = includeMetadata
        ? this.generateMetadata(tasks, groupBy || 'none', formatOutput ? 'formatted' : 'raw')
        : undefined;

      const groupedResults = (groupBy && groupBy !== 'none')
        ? this.groupTasks(tasks, groupBy)
        : undefined;

      const formattedOutput = formatOutput
        ? this.createFormattedOutput(
            rawData.perspectiveName,
            groupedResults || { all: { title: 'All Tasks', count: tasks.length, tasks } },
            metadata || this.generateMetadata(tasks, groupBy || 'none', 'formatted'),
          )
        : undefined;

      // Create enhanced response data
      const responseData: QueryPerspectiveData = {
        perspectiveName: rawData.perspectiveName,
        perspectiveType: rawData.perspectiveType,
        tasks,
        filterRules: rawData.filterRules || {},
        aggregation: rawData.aggregation || '',
        ...(formattedOutput && { formattedOutput }),
        ...(groupedResults && { groupedResults }),
        ...(metadata && { metadata }),
      };

      const response = createSuccessResponseV2(
        'perspectives',
        responseData,
        undefined,
        {
          ...timer.toMetadata(),
          operation: 'query',
          total_count: tasks.length,
          filter_rules_applied: !!(rawData.filterRules),
          formatting_applied: formatOutput,
          grouping_applied: groupBy !== 'none',
          fields_selected: fields ? fields.length : 'all',
        },
      );

      // Cache the result
      this.cache.set('tasks', cacheKey, response);

      return response;

    } catch (error) {
      return createErrorResponseV2(
        'perspectives',
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        { operation: 'query' },
        timer.toMetadata(),
      );
    }
  }

  /**
   * Formats a single task for human-readable display
   */
  private formatTask(task: PerspectiveTask): string {
    const checkbox = task.completed ? '☑' : '☐';
    const flag = task.flagged ? ' [🚩]' : '';
    const name = task.name;

    const details: string[] = [];

    // Add due date info
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      if (dueDate.toDateString() === today.toDateString()) {
        details.push('Due: Today');
      } else if (dueDate.toDateString() === tomorrow.toDateString()) {
        details.push('Due: Tomorrow');
      } else if (dueDate < today) {
        details.push(`Due: ${dueDate.toLocaleDateString()} (Overdue)`);
      } else {
        details.push(`Due: ${dueDate.toLocaleDateString()}`);
      }
    }

    // Add project info
    if (task.project) {
      details.push(`Project: ${task.project}`);
    }

    // Add tags
    if (task.tags && task.tags.length > 0) {
      details.push(`Tags: ${task.tags.join(', ')}`);
    }

    // Add availability status
    if (!task.available && !task.completed) {
      details.push('(Blocked)');
    }

    const detailsText = details.length > 0 ? ` (${details.join(', ')})` : '';

    return `${checkbox}${flag} ${name}${detailsText}`;
  }

  /**
   * Groups tasks based on the specified groupBy parameter
   */
  private groupTasks(tasks: PerspectiveTask[], groupBy: string): GroupedPerspectiveResults {
    const groups: GroupedPerspectiveResults = {};

    for (const task of tasks) {
      let groupKey: string;
      let groupTitle: string;

      switch (groupBy) {
        case 'project':
          groupKey = task.project || 'no-project';
          groupTitle = task.project || '📝 Inbox';
          break;

        case 'tag':
          if (task.tags && task.tags.length > 0) {
            // Group by first tag
            groupKey = task.tags[0];
            groupTitle = `🏷 ${task.tags[0]}`;
          } else {
            groupKey = 'no-tags';
            groupTitle = '🏷 No Tags';
          }
          break;

        case 'dueDate':
          if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of today
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const dueDateStart = new Date(dueDate);
            dueDateStart.setHours(0, 0, 0, 0); // Start of due date

            if (dueDateStart.getTime() < today.getTime()) {
              groupKey = 'overdue';
              groupTitle = '⚠️ Overdue';
            } else if (dueDateStart.getTime() === today.getTime()) {
              groupKey = 'today';
              groupTitle = '📅 Today';
            } else if (dueDateStart.getTime() === tomorrow.getTime()) {
              groupKey = 'tomorrow';
              groupTitle = '📅 Tomorrow';
            } else {
              groupKey = 'future';
              groupTitle = '📅 Future';
            }
          } else {
            groupKey = 'no-due-date';
            groupTitle = '📅 No Due Date';
          }
          break;

        case 'status':
          if (task.completed) {
            groupKey = 'completed';
            groupTitle = '✅ Completed';
          } else if (!task.available) {
            groupKey = 'blocked';
            groupTitle = '🚫 Blocked';
          } else if (task.flagged) {
            groupKey = 'flagged';
            groupTitle = '🚩 Flagged';
          } else {
            groupKey = 'available';
            groupTitle = '✅ Available';
          }
          break;

        default:
          groupKey = 'all';
          groupTitle = 'All Tasks';
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          title: groupTitle,
          count: 0,
          tasks: [],
        };
      }

      groups[groupKey].tasks.push(task);
      groups[groupKey].count++;
    }

    return groups;
  }

  /**
   * Generates metadata about the tasks
   */
  private generateMetadata(tasks: PerspectiveTask[], groupBy: string, formatting: 'raw' | 'formatted'): PerspectiveMetadata {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const flaggedTasks = tasks.filter(t => t.flagged).length;
    const availableTasks = tasks.filter(t => t.available && !t.completed).length;

    // Calculate overdue tasks
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const overdueTasks = tasks.filter(t => {
      if (!t.dueDate || t.completed) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0); // Start of due date
      return dueDate.getTime() < today.getTime();
    }).length;

    return {
      totalTasks,
      completedTasks,
      flaggedTasks,
      overdueTasks,
      availableTasks,
      grouping: groupBy,
      formatting,
    };
  }

  /**
   * Creates formatted output from grouped tasks
   */
  private createFormattedOutput(
    perspectiveName: string,
    groupedResults: GroupedPerspectiveResults,
    metadata: PerspectiveMetadata,
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`📋 ${perspectiveName} Perspective (${metadata.totalTasks} tasks)`);
    lines.push('');

    // Summary
    if (metadata.totalTasks > 0) {
      const summary: string[] = [];
      if (metadata.availableTasks > 0) summary.push(`${metadata.availableTasks} available`);
      if (metadata.completedTasks > 0) summary.push(`${metadata.completedTasks} completed`);
      if (metadata.flaggedTasks > 0) summary.push(`${metadata.flaggedTasks} flagged`);
      if (metadata.overdueTasks > 0) summary.push(`${metadata.overdueTasks} overdue`);

      if (summary.length > 0) {
        lines.push(`📊 Summary: ${summary.join(', ')}`);
        lines.push('');
      }
    }

    // Groups
    const sortedGroups = Object.entries(groupedResults).sort(([, a], [, b]) => {
      // Sort by priority: overdue, today, flagged, then alphabetical
      const priorityOrder = ['overdue', 'today', 'flagged', 'available', 'blocked', 'completed'];
      const aIndex = priorityOrder.indexOf(a.title.toLowerCase());
      const bIndex = priorityOrder.indexOf(b.title.toLowerCase());

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.title.localeCompare(b.title);
    });

    for (const [, group] of sortedGroups) {
      if (group.tasks.length === 0) continue;

      lines.push(`📂 ${group.title} (${group.count} tasks)`);

      // Sort tasks within group: flagged first, then by due date, then alphabetical
      const sortedTasks = group.tasks.sort((a, b) => {
        if (a.flagged && !b.flagged) return -1;
        if (!a.flagged && b.flagged) return 1;

        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;

        return a.name.localeCompare(b.name);
      });

      for (const task of sortedTasks) {
        lines.push(`  ${this.formatTask(task)}`);
      }

      lines.push('');
    }

    return lines.join('\n').trim();
  }
}
