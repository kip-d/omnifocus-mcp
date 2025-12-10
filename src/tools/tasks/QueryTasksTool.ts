import { z } from 'zod';
import { BaseTool } from '../base.js';
import {
  buildListTasksScriptV4,
  TODAYS_AGENDA_SCRIPT,
  GET_TASK_COUNT_SCRIPT,
} from '../../omnifocus/scripts/tasks.js';
import {
  GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT,
  GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT,
} from '../../omnifocus/scripts/date-range-queries.js';
import { isScriptError } from '../../omnifocus/script-result-types.js';
import { FLAGGED_TASKS_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/tasks/flagged-tasks-perspective.js';
import { isScriptSuccess } from '../../omnifocus/script-result-types.js';
import {
  createTaskResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  normalizeDateInput,
  normalizeBooleanInput,
  normalizeStringInput,
} from '../../utils/response-format.js';
import { OmniFocusTask } from '../../omnifocus/types.js';
import { TasksResponseV2 } from '../response-types-v2.js';
import {
  QueryFilters,
  SortOption,
  isStringFilter,
  isArrayFilter,
  isDateFilter,
  isNumberFilter,
} from './filter-types.js';

// Simplified schema with clearer parameter names
const QueryTasksToolSchemaV2 = z.object({
  // Primary mode selector
  mode: z.enum([
    'all',           // List all tasks (with optional filters)
    'inbox',         // Tasks in inbox (not assigned to any project)
    'search',        // Text search in task names
    'overdue',       // Tasks past their due date
    'today',         // Today perspective: Due soon (≤3 days) OR flagged
    'upcoming',      // Tasks due in next N days
    'available',     // Tasks ready to work on
    'blocked',       // Tasks waiting on others
    'flagged',       // High priority tasks
    'smart_suggest', // AI-powered suggestions for "what should I work on?"
  ]).default('all')
    .describe('Query mode: "all" = all tasks with optional filters, "inbox" = tasks in inbox (not assigned to any project), "search" = find tasks by text, "overdue" = tasks past their due date, "today" = tasks due within 3 days OR flagged, "upcoming" = tasks due in next N days (use daysAhead param), "available" = tasks ready to work on now (not blocked/deferred), "blocked" = tasks waiting on other tasks, "flagged" = high priority flagged tasks'),

  // Common filters (work with most modes)
  id: z.string().optional().describe('Filter by exact task ID (returns single task if found)'),
  search: z.string().optional().describe('Search text to find in task names (for search mode)'),
  project: z.string().optional().describe('Filter by project name or ID'),
  tags: z.array(z.string()).optional().describe('Filter by tag names'),
  completed: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).optional().describe('Include completed tasks (default: false)'),

  // Date filters (natural language supported)
  dueBy: z.string().optional().describe('Show tasks due by this date. Use YYYY-MM-DD format (e.g., "2025-03-15"). Basic terms like "today" or "tomorrow" also work.'),
  daysAhead: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number().min(1).max(30)).optional().describe('For upcoming mode: number of days to look ahead (default: 7)'),

  // Response control - with type coercion for MCP bridge compatibility
  limit: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number().min(1).max(200)).default(25).describe('Maximum tasks to return (default: 25)'),
  details: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).default(false).describe('Include full task details (default: false for speed)'),
  fastSearch: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).default(false).describe('Fast search mode: only search task names, not notes (improves performance)'),
  countOnly: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).default(false).describe('Return only task count, not full task data (33x faster - ideal for "how many" questions)'),

  // Field selection for response optimization
  fields: z.array(z.enum([
    'id',
    'name',
    'completed',
    'flagged',
    'blocked',
    'available',
    'estimatedMinutes',
    'dueDate',
    'deferDate',
    'plannedDate',
    'completionDate',
    'added',
    'modified',
    'dropDate',
    'note',
    'projectId',
    'project',
    'tags',
    'repetitionRule',
    'parentTaskId',
    'parentTaskName',
    'inInbox',
  ])).optional().describe('Select specific fields to return (improves performance). If not specified, returns all fields. Available fields: id, name, completed, flagged, blocked, available, estimatedMinutes, dueDate, deferDate, plannedDate, completionDate, note, projectId, project, tags, repetitionRule, parentTaskId, parentTaskName, inInbox. NOTE: "added", "modified", and "dropDate" fields are technically exposed in the OmniFocus API and are accessible in OmniJS, but cannot be reliably retrieved through the JXA-to-OmniJS bridge used by this tool - they will return null when requested.'),

  // Advanced filtering (optional - for complex queries)
  // Handle both object and stringified JSON (Claude Desktop converts to string)
  filters: z.union([
    z.string().transform(val => {
      // Try to parse as JSON first (Claude Desktop may stringify it)
      try {
        return JSON.parse(val) as unknown;
      } catch {
        return val as unknown;  // Return as-is if not valid JSON
      }
    }),
    z.unknown(),  // Direct object when called from tests or Node.js
  ]).optional().describe('Advanced filters with operator support. Use for complex queries like OR/AND tag logic, date ranges with operators, string matching. Structure: { tags: { operator: "OR", values: ["work", "urgent"] }, dueDate: { operator: "<=", value: "2025-12-31" } }. Simple filters (project, tags as array, completed) take precedence if both are specified.'),

  // Sorting options (optional)
  sort: z.array(z.object({
    field: z.enum(['dueDate', 'deferDate', 'name', 'flagged', 'estimatedMinutes', 'added', 'modified', 'completionDate']),
    direction: z.enum(['asc', 'desc']),
  })).optional().describe('Sort results by one or more fields. Example: [{ field: "dueDate", direction: "asc" }, { field: "flagged", direction: "desc" }]. Applied after filtering.'),
});

type QueryTasksArgsV2 = z.infer<typeof QueryTasksToolSchemaV2>;

export class QueryTasksTool extends BaseTool<typeof QueryTasksToolSchemaV2, TasksResponseV2> {
  name = 'tasks';
  description = `Query OmniFocus tasks with modes and advanced filtering. Returns summary first, then detailed data.

MODES: all, inbox, search, overdue, today, upcoming, available, blocked, flagged, smart_suggest

SIMPLE QUERIES (use basic parameters):
- "What's in my inbox?" → mode: "inbox"
- "What's due today?" → mode: "today"
- "Show me overdue tasks" → mode: "overdue"
- "Find meeting tasks" → mode: "search", search: "meeting"
- "Tasks in Project X" → mode: "all", project: "Project X"
- "Inbox tasks only" → mode: "all", project: null  (or use mode: "inbox")

ADVANCED QUERIES (use filters parameter for complex logic):

TAG LOGIC:
- "urgent OR important" → filters: {tags: {operator: "OR", values: ["urgent", "important"]}}
- "urgent AND work" → filters: {tags: {operator: "AND", values: ["urgent", "work"]}}
- "not waiting" → filters: {tags: {operator: "NOT_IN", values: ["waiting"]}}

PROJECT MATCHING:
- "in work projects" → filters: {project: {operator: "CONTAINS", value: "work"}}
- "starts with Home" → filters: {project: {operator: "STARTS_WITH", value: "Home"}}
- "exactly Project X" → filters: {project: {operator: "EQUALS", value: "Project X"}}

DATE QUERIES:
- "due this week" → filters: {dueDate: {operator: "<=", value: "2025-10-07"}}
- "due after Monday" → filters: {dueDate: {operator: ">", value: "2025-10-06"}}
- "due between dates" → filters: {dueDate: {operator: "BETWEEN", value: "2025-10-01", upperBound: "2025-10-07"}}

DURATION:
- "quick wins under 30 min" → filters: {estimatedMinutes: {operator: "<=", value: 30}}
- "tasks taking 15-30 min" → filters: {estimatedMinutes: {operator: "BETWEEN", value: 15, upperBound: 30}}

COMBINED FILTERS (AND logic between different filter types):
- "work tasks due this week" → filters: {project: {operator: "CONTAINS", value: "work"}, dueDate: {operator: "<=", value: "2025-10-07"}}
- "urgent OR important AND available" → mode: "available", filters: {tags: {operator: "OR", values: ["urgent", "important"]}}

SORTING (add sort parameter):
- "by due date" → sort: [{field: "dueDate", direction: "asc"}]
- "by priority then date" → sort: [{field: "flagged", direction: "desc"}, {field: "dueDate", direction: "asc"}]

CONVERSION PATTERN: When user asks in natural language, identify:
1. Mode (today/overdue/all/search/etc.)
2. Filter operators needed (OR/AND/CONTAINS/etc.)
3. Sort requirements
4. Combine into structured query

KNOWN LIMITATIONS:
- Creation date ("added" field): Not accessible through the JXA-to-OmniJS bridge, despite being available in the native OmniJS API. This is an architectural limitation of how OmniAutomation's evaluateJavascript() works when called from JXA context.
- Modified date ("modified" field): Same limitation as added date
- Drop date ("dropDate" field): Same limitation as added date
These fields will return null when requested.

NOTE: An experimental unified API (omnifocus_read) is available for testing builder-style queries. The 'tasks' tool remains the stable, recommended option for production use.`;
  schema = QueryTasksToolSchemaV2;

  meta = {
    // Phase 1: Essential metadata
    category: 'Task Management' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'read-only', 'filtering', 'search'],
    capabilities: ['search', 'filter', 'sort', 'paginate', 'text-search'],

    // Phase 2: Capability & Performance Documentation
    maxResults: 200,
    maxQueryDuration: 5000, // 5 seconds for most queries
    requiresPermission: true,
    requiredCapabilities: ['read'],
    limitations: [
      'Maximum 200 results per query',
      'Bulk text search may be slower with 1000+ tasks',
      'Complex nested filters may timeout on very large databases (10000+ tasks)',
    ],
  };

  async executeValidated(args: QueryTasksArgsV2): Promise<TasksResponseV2> {
    const timer = new OperationTimerV2();

    try {
      // Debug: Log incoming args
      this.logger.debug('[TAG_FILTER_DEBUG] executeValidated received args:', {
        hasFilters: !!args.filters,
        filterKeys: args.filters && typeof args.filters === 'object' && args.filters !== null ? Object.keys(args.filters) : [],
        filters: args.filters,
      });

      // Validate search mode requirements early
      if (args.mode === 'search' && !args.search && !args.filters) {
        return createErrorResponseV2(
          'tasks',
          'MISSING_PARAMETER',
          'Search mode requires a search term or filters',
          'Add a search parameter with the text to find, or use filters',
          { provided_args: args },
          timer.toMetadata(),
        );
      }

      // Normalize inputs to prevent LLM errors
      const normalizedArgs = this.normalizeInputs(args);

      // Special case: Count-only queries (33x faster - use optimized GET_TASK_COUNT_SCRIPT)
      if (normalizedArgs.countOnly) {
        return this.handleCountOnly(normalizedArgs, timer);
      }

      // Special case: ID filtering (exact match for single task)
      if (normalizedArgs.id) {
        return this.handleTaskById(normalizedArgs, timer);
      }

      // Route to appropriate handler based on mode
      switch (normalizedArgs.mode) {
        case 'inbox':
          return this.handleInboxTasks(normalizedArgs, timer);
        case 'overdue':
          return this.handleOverdueTasks(normalizedArgs, timer);
        case 'upcoming':
          return this.handleUpcomingTasks(normalizedArgs, timer);
        case 'today':
          return this.handleTodaysTasks(normalizedArgs, timer);
        case 'search':
          return this.handleSearchTasks(normalizedArgs, timer);
        case 'available':
          return this.handleAvailableTasks(normalizedArgs, timer);
        case 'blocked':
          return this.handleBlockedTasks(normalizedArgs, timer);
        case 'flagged':
          return this.handleFlaggedTasks(normalizedArgs, timer);
        case 'smart_suggest':
          return this.handleSmartSuggest(normalizedArgs, timer);
        case 'all':
        default:
          return this.handleAllTasks(normalizedArgs, timer);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific OmniFocus errors first (following base tool pattern)
      if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        return createErrorResponseV2(
          'tasks',
          'OMNIFOCUS_NOT_RUNNING',
          'OmniFocus is not running or not accessible',
          'Start OmniFocus and ensure it is running',
          error,
          timer.toMetadata(),
        );
      }

      if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        return createErrorResponseV2(
          'tasks',
          'PERMISSION_DENIED',
          'Permission denied: automation access required',
          'Enable automation access in System Settings > Privacy & Security > Automation',
          error,
          timer.toMetadata(),
        );
      }

      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        return createErrorResponseV2(
          'tasks',
          'SCRIPT_TIMEOUT',
          'Script execution timed out',
          'Try reducing the limit parameter or using a more specific mode',
          error,
          timer.toMetadata(),
        );
      }

      // Provide helpful suggestions for other errors
      let suggestion = undefined;
      if (errorMessage.includes('date')) {
        suggestion = 'Use natural language dates like "tomorrow" or "next week", or ISO format';
      }

      return createErrorResponseV2(
        'tasks',
        'EXECUTION_ERROR',
        errorMessage,
        suggestion,
        error,
        timer.toMetadata(),
      );
    }
  }

  private getSpecificErrorResponse(error: unknown, _operation: string, timer: OperationTimerV2): TasksResponseV2 | null {
    const errorMessage = error && typeof error === 'object' && 'error' in error
      ? String(error.error)
      : String(error);

    // Check for permission errors
    if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
      return createErrorResponseV2(
        'tasks',
        'PERMISSION_DENIED',
        'Permission denied: automation access required',
        'Enable automation access in System Settings > Privacy & Security > Automation',
        error,
        timer.toMetadata(),
      );
    }

    // Check for OmniFocus not running
    if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
      return createErrorResponseV2(
        'tasks',
        'OMNIFOCUS_NOT_RUNNING',
        'OmniFocus is not running or not accessible',
        'Start OmniFocus and ensure it is running',
        error,
        timer.toMetadata(),
      );
    }

    // Check for timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_TIMEOUT',
        'Script execution timed out',
        'Try reducing the limit parameter or using a more specific mode',
        error,
        timer.toMetadata(),
      );
    }

    return null; // No specific error detected
  }

  private normalizeInputs(args: QueryTasksArgsV2): QueryTasksArgsV2 {
    const normalized = { ...args };

    // Normalize date inputs
    if (normalized.dueBy) {
      const date = normalizeDateInput(normalized.dueBy, 'due');
      if (date) {
        normalized.dueBy = date.toISOString();
      }
    }

    // Normalize boolean that might come as string
    if (normalized.completed !== undefined) {
      const bool = normalizeBooleanInput(normalized.completed);
      if (bool !== null) {
        normalized.completed = bool;
      }
    }

    // Normalize search term
    if (normalized.search) {
      normalized.search = normalizeStringInput(normalized.search) || undefined;
    }

    // Note: Search mode validation now happens in executeValidated before normalization

    return normalized;
  }

  /**
   * Process advanced filters into format that can be passed to JXA script
   *
   * Converts operator-based filters into filter structure that list-tasks.ts can understand.
   * Simple filters (project, tags, completed) take precedence for backward compatibility.
   */
  private processAdvancedFilters(args: QueryTasksArgsV2): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    // Start with simple filters (backward compatibility - these take precedence)
    if (args.completed !== undefined) filter.completed = args.completed;
    if (args.project !== undefined) {
      // Special handling: Convert "null" string or empty string to null for inbox filtering
      // This allows both mode: "inbox" and project: null to work correctly
      if (args.project === 'null' || args.project === '') {
        filter.project = null;
      } else {
        filter.project = args.project;
      }
    }
    if (args.tags && Array.isArray(args.tags)) filter.tags = args.tags;
    if (args.search) filter.search = args.search;
    if (args.dueBy) filter.dueBefore = args.dueBy;
    if (args.fastSearch) filter.fastSearch = args.fastSearch;

    // DEBUG: Check if filters parameter made it through
    if (typeof args.filters === 'string') {
      filter._debug_filters_is_string = true;
      filter._debug_filters_string_val = args.filters;
      try {
        const parsed: unknown = JSON.parse(args.filters);
        filter._debug_filters_parsed = parsed;
      } catch {
        filter._debug_filters_parse_error = 'failed to parse';
      }
    } else if (typeof args.filters === 'object' && args.filters !== null) {
      filter._debug_filters_is_object = true;
      filter._debug_filters_obj_keys = Object.keys(args.filters as Record<string, unknown>);
    } else {
      filter._debug_filters_type = typeof args.filters;
      filter._debug_filters_value = args.filters;
    }

    // If no advanced filters provided, return simple filters
    if (!args.filters) {
      // Add to filter object for debugging in metadata
      filter._debug_no_filters_param = true;
      return filter;
    }

    // Process advanced filters
    const advancedFilters = args.filters as QueryFilters;
    filter._debug_has_filters_param = true;
    filter._debug_filter_type = typeof advancedFilters;
    filter._debug_filter_keys = Object.keys(advancedFilters);
    filter._debug_has_tags = !!advancedFilters.tags;

    // String filters (project, projectId, search)
    if (advancedFilters.project && !filter.project) {
      if (isStringFilter(advancedFilters.project)) {
        filter.project = advancedFilters.project.value;
        filter.projectOperator = advancedFilters.project.operator;
      }
    }

    if (advancedFilters.projectId && !filter.projectId) {
      if (isStringFilter(advancedFilters.projectId)) {
        filter.projectId = advancedFilters.projectId.value;
        filter.projectIdOperator = advancedFilters.projectId.operator;
      }
    }

    if (advancedFilters.search && !filter.search) {
      if (isStringFilter(advancedFilters.search)) {
        filter.search = advancedFilters.search.value;
        filter.searchOperator = advancedFilters.search.operator;
      }
    }

    // Text filter (CONTAINS/MATCHES operators) - Bug #9 fix
    if (advancedFilters.text && !filter.text) {
      if (isStringFilter(advancedFilters.text)) {
        filter.text = advancedFilters.text.value;
        filter.textOperator = advancedFilters.text.operator;
      }
    }

    // Array filters (tags, taskStatus)
    if (advancedFilters.tags && !filter.tags) {
      filter._debug_tags_exists = true;
      filter._debug_is_array_filter = isArrayFilter(advancedFilters.tags);
      if (isArrayFilter(advancedFilters.tags)) {
        filter.tags = advancedFilters.tags.values;
        filter.tagsOperator = advancedFilters.tags.operator;
        filter._debug_tags_processed = true;
      }
    }

    if (advancedFilters.taskStatus) {
      if (isArrayFilter(advancedFilters.taskStatus)) {
        filter.taskStatus = advancedFilters.taskStatus.values;
        filter.taskStatusOperator = advancedFilters.taskStatus.operator;
      }
    }

    // Boolean filters
    if (advancedFilters.flagged !== undefined && filter.flagged === undefined) {
      filter.flagged = advancedFilters.flagged;
    }
    if (advancedFilters.available !== undefined && filter.available === undefined) {
      filter.available = advancedFilters.available;
    }
    if (advancedFilters.blocked !== undefined && filter.blocked === undefined) {
      filter.blocked = advancedFilters.blocked;
    }
    if (advancedFilters.inInbox !== undefined && filter.inInbox === undefined) {
      filter.inInbox = advancedFilters.inInbox;
    }
    if (advancedFilters.completed !== undefined && filter.completed === undefined) {
      filter.completed = advancedFilters.completed;
    }

    // Date filters
    if (advancedFilters.dueDate && !filter.dueBefore && !filter.dueAfter) {
      if (isDateFilter(advancedFilters.dueDate)) {
        const normalizedDate = normalizeDateInput(advancedFilters.dueDate.value, 'due');
        if (normalizedDate) {
          const isoDate = normalizedDate.toISOString();
          switch (advancedFilters.dueDate.operator) {
            case '<':
            case '<=':
              filter.dueBefore = isoDate;
              filter.dueDateOperator = advancedFilters.dueDate.operator;
              break;
            case '>':
            case '>=':
              filter.dueAfter = isoDate;
              filter.dueDateOperator = advancedFilters.dueDate.operator;
              break;
            case 'BETWEEN':
              // Bug fix #3: Swap assignments - value is lower bound (after), upperBound is upper bound (before)
              filter.dueAfter = isoDate; // Tasks due AFTER this date (lower bound)
              if (advancedFilters.dueDate.upperBound) {
                const upperDate = normalizeDateInput(advancedFilters.dueDate.upperBound, 'due');
                if (upperDate) {
                  filter.dueBefore = upperDate.toISOString(); // Tasks due BEFORE this date (upper bound)
                }
              }
              filter.dueDateOperator = 'BETWEEN';
              break;
          }
        }
      }
    }

    if (advancedFilters.deferDate && !filter.deferBefore && !filter.deferAfter) {
      if (isDateFilter(advancedFilters.deferDate)) {
        const normalizedDate = normalizeDateInput(advancedFilters.deferDate.value, 'defer');
        if (normalizedDate) {
          const isoDate = normalizedDate.toISOString();
          switch (advancedFilters.deferDate.operator) {
            case '<':
            case '<=':
              filter.deferBefore = isoDate;
              filter.deferDateOperator = advancedFilters.deferDate.operator;
              break;
            case '>':
            case '>=':
              filter.deferAfter = isoDate;
              filter.deferDateOperator = advancedFilters.deferDate.operator;
              break;
            case 'BETWEEN':
              // Bug fix #3: Swap assignments - value is lower bound (after), upperBound is upper bound (before)
              filter.deferAfter = isoDate; // Tasks deferred AFTER this date (lower bound)
              if (advancedFilters.deferDate.upperBound) {
                const upperDate = normalizeDateInput(advancedFilters.deferDate.upperBound, 'defer');
                if (upperDate) {
                  filter.deferBefore = upperDate.toISOString(); // Tasks deferred BEFORE this date (upper bound)
                }
              }
              filter.deferDateOperator = 'BETWEEN';
              break;
          }
        }
      }
    }

    // Added date filters
    if (advancedFilters.added && !filter.addedBefore && !filter.addedAfter) {
      if (isDateFilter(advancedFilters.added)) {
        const normalizedDate = normalizeDateInput(advancedFilters.added.value, 'due');
        if (normalizedDate) {
          const isoDate = normalizedDate.toISOString();
          switch (advancedFilters.added.operator) {
            case '<':
            case '<=':
              filter.addedBefore = isoDate;
              filter.addedDateOperator = advancedFilters.added.operator;
              break;
            case '>':
            case '>=':
              filter.addedAfter = isoDate;
              filter.addedDateOperator = advancedFilters.added.operator;
              break;
            case 'BETWEEN':
              // Bug fix #3: Swap assignments - value is lower bound (after), upperBound is upper bound (before)
              filter.addedAfter = isoDate; // Tasks added AFTER this date (lower bound)
              if (advancedFilters.added.upperBound) {
                const upperDate = normalizeDateInput(advancedFilters.added.upperBound, 'due');
                if (upperDate) {
                  filter.addedBefore = upperDate.toISOString(); // Tasks added BEFORE this date (upper bound)
                }
              }
              filter.addedDateOperator = 'BETWEEN';
              break;
          }
        }
      }
    }

    // Number filters (estimatedMinutes)
    if (advancedFilters.estimatedMinutes) {
      if (isNumberFilter(advancedFilters.estimatedMinutes)) {
        filter.estimatedMinutes = advancedFilters.estimatedMinutes.value;
        filter.estimatedMinutesOperator = advancedFilters.estimatedMinutes.operator;
        if (advancedFilters.estimatedMinutes.upperBound !== undefined) {
          filter.estimatedMinutesUpperBound = advancedFilters.estimatedMinutes.upperBound;
        }
      }
    }

    // Debug: Log processed filter
    this.logger.debug('[TAG_FILTER_DEBUG] processAdvancedFilters returning filter:', {
      filterKeys: Object.keys(filter),
      tags: filter.tags,
      tagsOperator: filter.tagsOperator,
      fullFilter: filter,
    });

    return filter;
  }

  private async handleCountOnly(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Process filters into format expected by GET_TASK_COUNT_SCRIPT
    const filter = this.processAdvancedFilters(args);

    // Execute optimized count-only script (33x faster than fetching full tasks)
    const script = this.omniAutomation.buildScript(GET_TASK_COUNT_SCRIPT, { filter });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      const specificError = this.getSpecificErrorResponse(result, 'count_only', timer);
      if (specificError) {
        return specificError;
      }

      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to count tasks',
        'Check if OmniFocus is running and filters are valid',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    // Extract count from result
    const data = result as { count?: number; warning?: string; filters_applied?: unknown; query_time_ms?: number };
    const count = data.count ?? 0;

    // Return count in standardized format
    return createTaskResponseV2(
      'tasks',
      [], // No actual tasks, just metadata with count
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: args.mode || 'count_only',
        count_only: true,
        total_count: count,
        filters_applied: filter,
        optimization: 'count_only_script_33x_faster',
        warning: data.warning,
      },
    );
  }

  private async handleTaskById(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Fast path for exact ID lookup
    const filter = {
      id: args.id,
      limit: 1,  // Only need one result for exact ID match
      includeDetails: args.details,
    };

    // Execute query using V4 AST-powered script
    const script = buildListTasksScriptV4({
      filter,
      fields: args.fields || [],
      limit: 1,
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      const specificError = this.getSpecificErrorResponse(result, 'id_lookup', timer);
      if (specificError) {
        return specificError;
      }

      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        `Failed to find task with ID: ${args.id}`,
        'Verify the task ID is correct and the task exists',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);

    // Validate ID lookup result
    if (tasks.length === 0) {
      return createErrorResponseV2(
        'tasks',
        'NOT_FOUND',
        `Task not found with ID: ${args.id}`,
        'Verify the task ID is correct and the task exists',
        undefined,
        timer.toMetadata(),
      );
    }

    if (tasks[0].id !== args.id) {
      return createErrorResponseV2(
        'tasks',
        'ID_MISMATCH',
        `Task ID mismatch: requested ${args.id}, received ${tasks[0].id}`,
        'This indicates a potential issue with the OmniFocus script - please report this bug',
        undefined,
        timer.toMetadata(),
      );
    }

    // Apply field projection if requested
    const projectedTasks = this.projectFields(tasks, args.fields);

    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'id_lookup',
        filters_applied: filter,
        sort_applied: false,
      },
    );
  }

  private async handleOverdueTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    const cacheKey = `tasks_overdue_${args.limit}_${args.completed}`;

    // Check cache for speed
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'overdue' },
      );
    }

    // Execute optimized overdue script
    const script = this.omniAutomation.buildScript(GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT, {
      limit: args.limit,
      includeCompleted: args.completed || false,
    });

    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        result.error,
        'Check if OmniFocus is running and not blocked by dialogs',
        result.details,
        timer.toMetadata(),
      );
    }

    // Parse and cache
    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);
    this.cache.set('tasks', cacheKey, { tasks, summary: (result.data as { summary?: unknown }).summary });

    const projectedTasks = this.projectFields(tasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'overdue' },
    );
  }

  private async handleUpcomingTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    const days = args.daysAhead || 7;
    const cacheKey = `tasks_upcoming_${days}_${args.limit}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'upcoming', days_ahead: days },
      );
    }

    // Execute optimized upcoming script
    const script = this.omniAutomation.buildScript(GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT, {
      days,
      includeToday: true,
      limit: args.limit,
    });

    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        result.error,
        'Try reducing the days_ahead parameter',
        result.details,
        timer.toMetadata(),
      );
    }

    // Parse and cache
    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);
    this.cache.set('tasks', cacheKey, { tasks });

    const projectedTasks = this.projectFields(tasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'upcoming', days_ahead: days },
    );
  }

  private async handleTodaysTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Use the ultra-fast optimized script for today's agenda
    const cacheKey = `tasks_today_${args.limit}_${args.details}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'today' },
      );
    }

    // Use the ultra-fast single-pass algorithm
    const options = {
      includeOverdue: true,
      includeFlagged: true,
      includeAvailable: true,
      includeDetails: args.details,
      limit: args.limit,
    };

    // Use the optimized today's agenda script
    const script = this.omniAutomation.buildScript(TODAYS_AGENDA_SCRIPT, {
      options,
      fields: args.fields || [],
    });

    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        result.error,
        'Check if OmniFocus is running and not blocked by dialogs',
        result.details,
        timer.toMetadata(),
      );
    }

    // Unwrap nested data structure (script returns { ok: true, v: '1', data: { tasks: [...] } })
    type TodayDataStructure = { tasks?: unknown[]; overdueCount?: number; dueTodayCount?: number; flaggedCount?: number; processedCount?: number; totalTasks?: number; optimizationUsed?: string };
    const envelope = result.data as { ok?: boolean; v?: string; data?: TodayDataStructure } | TodayDataStructure;
    const data: TodayDataStructure = ('data' in envelope && envelope.data) ? envelope.data : envelope as TodayDataStructure;

    const todayTasks = this.parseTasks(data.tasks || []);

    // Cache the results
    this.cache.set('tasks', cacheKey, { tasks: todayTasks });

    // Return with additional metadata from the ultra-fast script
    const metadata = {
      ...timer.toMetadata(),
      from_cache: false,
      mode: 'today',
      overdue_count: data.overdueCount || 0,
      due_today_count: data.dueTodayCount || 0,
      flagged_count: data.flaggedCount || 0,
      optimization: data.optimizationUsed || 'ultra_fast',
    };

    const projectedTasks = this.projectFields(todayTasks, args.fields);
    return createTaskResponseV2('tasks', projectedTasks, metadata);
  }

  private async handleSearchTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    if (!args.search && !args.filters) {
      return createErrorResponseV2(
        'tasks',
        'MISSING_PARAMETER',
        'Search term is required for search mode',
        'Add a search parameter with the text to find, or use filters',
        { provided_args: args },
        timer.toMetadata(),
      );
    }

    // Process advanced filters (includes simple filters for backward compatibility)
    const filter = {
      ...this.processAdvancedFilters(args),
      limit: args.limit,
      includeDetails: args.details,
      skipAnalysis: !args.details, // Skip expensive analysis if not needed
    };

    // Generate cache key for search with consistent tag ordering
    const sortedTags = args.tags ? [...args.tags].sort() : undefined;
    const cacheKey = `tasks_search_${args.search}_${args.completed}_${args.limit}_${args.project || 'all'}_${sortedTags ? sortedTags.join(',') : 'no-tags'}_${args.details}_${args.fastSearch}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      // Apply sorting if requested (cache may not have sorted results)
      const sortedTasks = this.sortTasks(cached?.tasks || [], args.sort);
      const projectedTasks = this.projectFields(sortedTasks, args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        {
          ...timer.toMetadata(),
          from_cache: true,
          mode: 'search',
          search_term: args.search,
          sort_applied: args.sort ? true : false,
        },
      );
    }

    // Execute search using V4 AST-powered script
    const script = buildListTasksScriptV4({
      filter: { ...filter, mode: 'search' },
      fields: args.fields || [],
      limit: args.limit,
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Search failed',
        'Try a simpler search term or check if OmniFocus is running',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);

    // Apply sorting if requested
    const sortedTasks = this.sortTasks(tasks, args.sort);

    // Cache search results (sorted)
    this.cache.set('tasks', cacheKey, { tasks: sortedTasks });

    const projectedTasks = this.projectFields(sortedTasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'search',
        search_term: args.search,
        sort_applied: args.sort ? true : false,
      },
    );
  }

  private async handleAvailableTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Process advanced filters (includes simple filters for backward compatibility)
    const filter = {
      ...this.processAdvancedFilters(args),
      completed: false,
      available: true,
      limit: args.limit,
      includeDetails: args.details,
      skipAnalysis: false, // Need analysis for accurate availability
    };

    // Include tags in cache key to avoid incorrect caching
    const sortedTags = args.tags ? [...args.tags].sort() : undefined;
    const cacheKey = `tasks_available_${args.limit}_${args.project || 'all'}_${sortedTags ? sortedTags.join(',') : 'no-tags'}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'available' },
      );
    }

    // Execute query using V4 AST-powered script
    const script = buildListTasksScriptV4({
      filter,
      fields: args.fields || [],
      limit: args.limit,
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get available tasks',
        'Try using all mode with fewer filters',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);

    // Apply sorting if requested
    const sortedTasks = this.sortTasks(tasks, args.sort);
    this.cache.set('tasks', cacheKey, { tasks: sortedTasks });

    const projectedTasks = this.projectFields(sortedTasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'available', sort_applied: args.sort ? true : false },
    );
  }

  private async handleBlockedTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Process advanced filters (includes simple filters for backward compatibility)
    const filter = {
      ...this.processAdvancedFilters(args),
      completed: false,
      blocked: true,
      limit: args.limit,
      includeDetails: args.details,
      skipAnalysis: false, // Need analysis for blocking detection
    };

    // Include tags in cache key to avoid incorrect caching
    const sortedTags = args.tags ? [...args.tags].sort() : undefined;
    const cacheKey = `tasks_blocked_${args.limit}_${sortedTags ? sortedTags.join(',') : 'no-tags'}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'blocked' },
      );
    }

    // Execute query using V4 AST-powered script
    const script = buildListTasksScriptV4({
      filter,
      fields: args.fields || [],
      limit: args.limit,
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get blocked tasks',
        'Try using all mode instead',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);

    // Apply sorting if requested
    const sortedTasks = this.sortTasks(tasks, args.sort);
    this.cache.set('tasks', cacheKey, { tasks: sortedTasks });

    const projectedTasks = this.projectFields(sortedTasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'blocked', sort_applied: args.sort ? true : false },
    );
  }

  private async handleFlaggedTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    const cacheKey = `tasks_flagged_${args.limit}_${args.completed}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'flagged' },
      );
    }

    // Use perspective-based flagged script for best performance
    const script = this.omniAutomation.buildScript(FLAGGED_TASKS_PERSPECTIVE_SCRIPT, {
      limit: args.limit,
      includeCompleted: args.completed || false,
      includeDetails: args.details || false,
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        result.error,
        undefined,
        result.details,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);
    this.cache.set('tasks', cacheKey, { tasks });

    const projectedTasks = this.projectFields(tasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'flagged' },
    );
  }

  private async handleInboxTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Inbox mode: Use V4 AST-powered implementation
    // AST version uses OmniJS global collections for optimal performance
    const filter = {
      includeCompleted: args.completed || false,
    };

    // Execute V4 query with inbox mode
    const script = buildListTasksScriptV4({
      filter,
      fields: args.fields || [],
      limit: args.limit,
      mode: 'inbox',
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      // Check for specific error types first
      const specificError = this.getSpecificErrorResponse(result, 'inbox', timer);
      if (specificError) {
        return specificError;
      }

      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get inbox tasks',
        'Check that OmniFocus is running and accessible',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);

    // Apply sorting if requested
    const sortedTasks = this.sortTasks(tasks, args.sort);
    const projectedTasks = this.projectFields(sortedTasks, args.fields);

    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'inbox',
        filters_applied: filter,
        sort_applied: args.sort ? true : false,
      },
    );
  }

  private async handleAllTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Process advanced filters (includes simple filters for backward compatibility)
    const filter = {
      ...this.processAdvancedFilters(args),
      limit: args.limit,
      includeDetails: args.details,
    };

    // Execute query using V4 AST-powered script
    const script = buildListTasksScriptV4({
      filter,
      fields: args.fields || [],
      limit: args.limit,
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      // Check for specific error types first
      const specificError = this.getSpecificErrorResponse(result, 'all', timer);
      if (specificError) {
        return specificError;
      }

      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get tasks',
        'Try a more specific mode like overdue or today',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = this.parseTasks(data.tasks || data.items || []);

    // Apply sorting if requested
    const sortedTasks = this.sortTasks(tasks, args.sort);
    const projectedTasks = this.projectFields(sortedTasks, args.fields);

    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'all',
        filters_applied: filter,
        sort_applied: args.sort ? true : false,
      },
    );
  }

  private async handleSmartSuggest(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<TasksResponseV2> {
    // Smart suggest combines overdue, today, and flagged tasks to suggest what to work on
    // Include tags in cache key if provided for filtering
    const sortedTags = args.tags ? [...args.tags].sort() : undefined;
    const cacheKey = `tasks_smart_suggest_${args.limit}_${sortedTags ? sortedTags.join(',') : 'no-tags'}`;

    // Check cache
    const cached = this.cache.get<{ tasks: OmniFocusTask[] }>('tasks', cacheKey);
    if (cached) {
      const projectedTasks = this.projectFields(cached?.tasks || [], args.fields);
      return createTaskResponseV2(
        'tasks',
        projectedTasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'smart_suggest' },
      );
    }

    // Gather data from multiple sources for intelligent suggestions
    // Process advanced filters (includes simple filters for backward compatibility)
    const filter = {
      ...this.processAdvancedFilters(args),
      completed: false,
      limit: Math.min(args.limit * 2, 100), // Get more for analysis
      includeDetails: args.details,
    };

    // Execute comprehensive query using V4 AST-powered script
    const script = buildListTasksScriptV4({
      filter,
      fields: args.fields || [],
      limit: args.limit,
    });
    const result = await this.execJson(script);

    // Enrich with date fields if requested

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get task suggestions',
        'Try using mode: "today" or "overdue" instead',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const allTasks = this.parseTasks(data.tasks || data.items || []);
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Smart prioritization algorithm
    const scoredTasks = allTasks.map(task => {
      let score = 0;

      // Overdue tasks get highest priority
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const isDueToday = dueDate.toDateString() === now.toDateString();
        if (dueDate < now) {
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          score += 100 + Math.min(daysOverdue * 10, 200); // Cap at 300 for very overdue
        } else if (isDueToday || dueDate <= todayEnd) {
          score += 80; // Due today
        }
      }

      // Flagged tasks get bonus
      if (task.flagged) score += 50;

      // Available tasks get bonus (not blocked, not deferred)
      // Note: Status checking available via task.blocked() and task.next() properties
      if (task.available) score += 30;

      // Tasks with short estimated duration get bonus (quick wins)
      if (task.estimatedMinutes && task.estimatedMinutes <= 15) score += 20;

      return { ...task, _score: score };
    });

    // Sort by score and take top items
    let suggestedTasks = scoredTasks
      .filter(t => t._score > 0) // Only tasks with positive score
      .sort((a, b) => b._score - a._score)
      .slice(0, args.limit)
      .map(({ _score, ...task }) => task); // Remove score from output

    // Ensure at least one due-today task is surfaced if available
    const dueTodayCandidate = allTasks.find(t => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString());
    if (dueTodayCandidate) {
      const alreadyIncluded = suggestedTasks.some(t => t.id === dueTodayCandidate.id);
      if (!alreadyIncluded) {
        if (suggestedTasks.length < args.limit) {
          suggestedTasks.push(dueTodayCandidate);
        } else if (suggestedTasks.length > 0) {
          suggestedTasks[suggestedTasks.length - 1] = dueTodayCandidate;
        }
      }
    }

    // Cache results
    this.cache.set('tasks', cacheKey, { tasks: suggestedTasks });

    const projectedTasks = this.projectFields(suggestedTasks, args.fields);
    return createTaskResponseV2(
      'tasks',
      projectedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'smart_suggest',
        algorithm: 'priority_score_v1',
      },
    );
  }

  private parseTasks(tasks: unknown[]): OmniFocusTask[] {
    if (!tasks || !Array.isArray(tasks)) {
      return [];
    }
    return tasks.map(task => {
      const t = task as {
        dueDate?: string | Date;
        deferDate?: string | Date;
        completionDate?: string | Date;
        added?: string | Date;
        modified?: string | Date;
        dropDate?: string | Date;
        parentTaskId?: string;
        parentTaskName?: string;
        inInbox?: boolean;
        [key: string]: unknown;
      };
      return {
        ...t,
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        deferDate: t.deferDate ? new Date(t.deferDate) : undefined,
        completionDate: t.completionDate ? new Date(t.completionDate) : undefined,
        added: t.added ? new Date(t.added) : undefined,
        modified: t.modified ? new Date(t.modified) : undefined,
        dropDate: t.dropDate ? new Date(t.dropDate) : undefined,
        parentTaskId: t.parentTaskId,
        parentTaskName: t.parentTaskName,
        inInbox: t.inInbox,
      } as unknown as OmniFocusTask;
    });
  }

  /**
   * Project task fields based on user selection for performance optimization
   */
  private projectFields(tasks: OmniFocusTask[], selectedFields?: string[]): OmniFocusTask[] {
    // If no fields specified, return all fields
    if (!selectedFields || selectedFields.length === 0) {
      return tasks;
    }

    // Project each task to only include selected fields
    return tasks.map(task => {
      const projectedTask: Partial<OmniFocusTask> = {};

      // Always include id if not explicitly excluded (needed for identification)
      if (selectedFields.includes('id') || !selectedFields.length) {
        projectedTask.id = task.id;
      }

      // Project only requested fields
      selectedFields.forEach(field => {
        if (field in task) {
          const typedField = field as keyof OmniFocusTask;
          (projectedTask as Record<string, unknown>)[field] = task[typedField];
        }
      });

      return projectedTask as OmniFocusTask;
    });
  }

  /**
   * Sort tasks based on provided sort options
   *
   * Applies multi-level sorting in the order specified.
   * Applied after filtering in TypeScript (post-query) for simplicity.
   */
  private sortTasks(tasks: OmniFocusTask[], sortOptions?: SortOption[]): OmniFocusTask[] {
    if (!sortOptions || sortOptions.length === 0) {
      return tasks;
    }

    return [...tasks].sort((a, b) => {
      for (const option of sortOptions) {
        // Safely access the field value
        const aValue = (a as unknown as Record<string, unknown>)[option.field];
        const bValue = (b as unknown as Record<string, unknown>)[option.field];

        // Handle null/undefined values (push to end)
        if (aValue === null || aValue === undefined) {
          if (bValue === null || bValue === undefined) continue;
          return 1; // a goes after b
        }
        if (bValue === null || bValue === undefined) {
          return -1; // a goes before b
        }

        // Compare values based on type
        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = aValue === bValue ? 0 : aValue ? -1 : 1; // true before false
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        } else {
          // Fallback: convert to string for comparison
          // For objects, use JSON serialization to avoid [object Object]
          let aStr: string;
          let bStr: string;

          if (typeof aValue === 'object' && aValue !== null) {
            aStr = JSON.stringify(aValue);
          } else {
            // Cast to primitive to satisfy linter - we've already handled objects
            aStr = String(aValue as string | number | boolean);
          }

          if (typeof bValue === 'object' && bValue !== null) {
            bStr = JSON.stringify(bValue);
          } else {
            // Cast to primitive to satisfy linter - we've already handled objects
            bStr = String(bValue as string | number | boolean);
          }

          comparison = aStr.localeCompare(bStr);
        }

        // Apply direction
        if (comparison !== 0) {
          return option.direction === 'desc' ? -comparison : comparison;
        }

        // If equal, continue to next sort option
      }

      return 0; // All sort fields are equal
    });
  }
}
