import { z } from 'zod';
import { BaseTool } from '../base.js';
import {
  LIST_TASKS_SCRIPT,
  TODAYS_AGENDA_ULTRA_FAST_SCRIPT,
} from '../../omnifocus/scripts/tasks.js';
import {
  GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT,
  GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT,
} from '../../omnifocus/scripts/date-range-queries-optimized-v3.js';
import { FLAGGED_TASKS_PERSPECTIVE_SCRIPT } from '../../omnifocus/scripts/tasks/flagged-tasks-perspective.js';
import {
  createTaskResponseV2,
  createErrorResponseV2,
  OperationTimerV2,
  normalizeDateInput,
  normalizeBooleanInput,
  normalizeStringInput,
} from '../../utils/response-format-v2.js';
import { OmniFocusTask } from '../response-types.js';
import { ListTasksScriptResult } from '../../omnifocus/jxa-types.js';
import { TasksResponseV2 } from '../response-types-v2.js';

// Simplified schema with clearer parameter names
const QueryTasksToolSchemaV2 = z.object({
  // Primary mode selector
  mode: z.enum([
    'all',           // List all tasks (with optional filters)
    'search',        // Text search in task names
    'overdue',       // Tasks past their due date
    'today',         // Today perspective: Due soon (≤3 days) OR flagged
    'upcoming',      // Tasks due in next N days
    'available',     // Tasks ready to work on
    'blocked',       // Tasks waiting on others
    'flagged',       // High priority tasks
    'smart_suggest', // AI-powered suggestions for "what should I work on?"
  ]).default('all')
    .describe('Query mode: "all" = all tasks with optional filters, "search" = find tasks by text, "overdue" = tasks past their due date, "today" = tasks due within 3 days OR flagged, "upcoming" = tasks due in next N days (use daysAhead param), "available" = tasks ready to work on now (not blocked/deferred), "blocked" = tasks waiting on other tasks, "flagged" = high priority flagged tasks'),

  // Common filters (work with most modes)
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
});

type QueryTasksArgsV2 = z.infer<typeof QueryTasksToolSchemaV2>;

export class QueryTasksToolV2 extends BaseTool<typeof QueryTasksToolSchemaV2, TasksResponseV2> {
  name = 'tasks';
  description = 'Query OmniFocus tasks with various modes. Common usage: mode="search" with search="meeting" to find tasks, mode="today" for current tasks, mode="overdue" for past due items. Always returns a summary first for quick answers, then detailed task data.';
  schema = QueryTasksToolSchemaV2;

  async executeValidated(args: QueryTasksArgsV2): Promise<TasksResponseV2> {
    const timer = new OperationTimerV2();

    try {
      // Normalize inputs to prevent LLM errors
      const normalizedArgs = this.normalizeInputs(args);

      // Route to appropriate handler based on mode
      switch (normalizedArgs.mode) {
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

      // Provide helpful suggestions for common errors
      let suggestion = undefined;
      if (errorMessage.includes('timeout')) {
        suggestion = 'Try reducing the limit parameter or using a more specific mode';
      } else if (errorMessage.includes('date')) {
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

    // Ensure search mode has search term
    if (normalized.mode === 'search' && !normalized.search) {
      throw new Error('Search mode requires a search term');
    }

    return normalized;
  }

  private async handleOverdueTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    const cacheKey = `tasks_overdue_${args.limit}_${args.completed}`;

    // Check cache for speed
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'overdue' },
      );
    }

    // Execute optimized overdue script
    const script = this.omniAutomation.buildScript(GET_OVERDUE_TASKS_ULTRA_OPTIMIZED_SCRIPT, {
      limit: args.limit,
      includeCompleted: args.completed || false,
    });

    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        result?.message || 'Failed to get overdue tasks',
        'Check if OmniFocus is running and not blocked by dialogs',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Parse and cache
    const tasks = this.parseTasks(result.tasks);
    this.cache.set('tasks', cacheKey, { tasks, summary: result.summary });

    return createTaskResponseV2(
      'tasks',
      tasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'overdue' },
    );
  }

  private async handleUpcomingTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    const days = args.daysAhead || 7;
    const cacheKey = `tasks_upcoming_${days}_${args.limit}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'upcoming', days_ahead: days },
      );
    }

    // Execute optimized upcoming script
    const script = this.omniAutomation.buildScript(GET_UPCOMING_TASKS_ULTRA_OPTIMIZED_SCRIPT, {
      days,
      includeToday: true,
      limit: args.limit,
    });

    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        result?.message || 'Failed to get upcoming tasks',
        'Try reducing the days_ahead parameter',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Parse and cache
    const tasks = this.parseTasks(result.tasks);
    this.cache.set('tasks', cacheKey, { tasks });

    return createTaskResponseV2(
      'tasks',
      tasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'upcoming', days_ahead: days },
    );
  }

  private async handleTodaysTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    // Use the ultra-fast optimized script for today's agenda
    const cacheKey = `tasks_today_${args.limit}_${args.details}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
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
    const script = this.omniAutomation.buildScript(TODAYS_AGENDA_ULTRA_FAST_SCRIPT, { options });
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get today\'s tasks',
        'Try using overdue or upcoming mode instead',
        result,
        timer.toMetadata(),
      );
    }

    // The ultra-fast script returns tasks directly
    const todayTasks = result.tasks || [];

    // Cache the results
    this.cache.set('tasks', cacheKey, { tasks: todayTasks });

    // Return with additional metadata from the ultra-fast script
    const metadata = {
      ...timer.toMetadata(),
      from_cache: false,
      mode: 'today',
      overdue_count: result.overdueCount || 0,
      due_today_count: result.dueTodayCount || 0,
      flagged_count: result.flaggedCount || 0,
      optimization: result.optimizationUsed || 'ultra_fast',
    };

    return createTaskResponseV2(
      'tasks',
      todayTasks,
      metadata,
    );
  }

  private async handleSearchTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    if (!args.search) {
      return createErrorResponseV2(
        'tasks',
        'MISSING_PARAMETER',
        'Search term is required for search mode',
        'Add a search parameter with the text to find',
        { provided_args: args },
        timer.toMetadata(),
      );
    }

    const filter = {
      search: args.search,
      completed: args.completed || false,
      limit: args.limit,
      includeDetails: args.details,
      project: args.project, // Pass as project name, not ID
      tags: args.tags,
      skipAnalysis: !args.details, // Skip expensive analysis if not needed
    };

    // Generate cache key for search
    const cacheKey = `tasks_search_${JSON.stringify(filter)}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        {
          ...timer.toMetadata(),
          from_cache: true,
          mode: 'search',
          search_term: args.search,
        },
      );
    }

    // Execute search
    const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
    const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Search failed',
        'Try a simpler search term or check if OmniFocus is running',
        result,
        timer.toMetadata(),
      );
    }

    const tasks = this.parseTasks(result.tasks);

    // Cache search results
    this.cache.set('tasks', cacheKey, { tasks });

    return createTaskResponseV2(
      'tasks',
      tasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'search',
        search_term: args.search,
      },
    );
  }

  private async handleAvailableTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    const filter = {
      completed: false,
      available: true,
      limit: args.limit,
      includeDetails: args.details,
      project: args.project, // Pass as project name, not ID
      tags: args.tags,
      skipAnalysis: false, // Need analysis for accurate availability
    };

    const cacheKey = `tasks_available_${args.limit}_${args.project || 'all'}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'available' },
      );
    }

    // Execute query
    const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
    const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get available tasks',
        'Try using all mode with fewer filters',
        result,
        timer.toMetadata(),
      );
    }

    const tasks = this.parseTasks(result.tasks);
    this.cache.set('tasks', cacheKey, { tasks });

    return createTaskResponseV2(
      'tasks',
      tasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'available' },
    );
  }

  private async handleBlockedTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    const filter = {
      completed: false,
      blocked: true,
      limit: args.limit,
      includeDetails: args.details,
      project: args.project, // Pass as project name, not ID
      tags: args.tags,
      skipAnalysis: false, // Need analysis for blocking detection
    };

    const cacheKey = `tasks_blocked_${args.limit}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'blocked' },
      );
    }

    // Execute query
    const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
    const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get blocked tasks',
        'Try using all mode instead',
        result,
        timer.toMetadata(),
      );
    }

    const tasks = this.parseTasks(result.tasks);
    this.cache.set('tasks', cacheKey, { tasks });

    return createTaskResponseV2(
      'tasks',
      tasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'blocked' },
    );
  }

  private async handleFlaggedTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    const cacheKey = `tasks_flagged_${args.limit}_${args.completed}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'flagged' },
      );
    }

    // Use perspective-based flagged script for best performance
    const script = this.omniAutomation.buildScript(FLAGGED_TASKS_PERSPECTIVE_SCRIPT, {
      limit: args.limit,
      includeCompleted: args.completed || false,
      includeDetails: args.details || false,
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get flagged tasks',
        undefined,
        result,
        timer.toMetadata(),
      );
    }

    const tasks = this.parseTasks(result.tasks);
    this.cache.set('tasks', cacheKey, { tasks });

    return createTaskResponseV2(
      'tasks',
      tasks,
      { ...timer.toMetadata(), from_cache: false, mode: 'flagged' },
    );
  }

  private async handleAllTasks(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    const filter: any = {
      completed: args.completed,
      limit: args.limit,
      includeDetails: args.details,
      project: args.project, // Pass as project name, not ID
      tags: args.tags,
    };

    // Add date filter if provided
    if (args.dueBy) {
      filter.dueBefore = args.dueBy;
    }

    // Clean undefined values
    Object.keys(filter).forEach(key => {
      if (filter[key] === undefined) delete filter[key];
    });

    // Execute query
    const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
    const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get tasks',
        'Try a more specific mode like overdue or today',
        result,
        timer.toMetadata(),
      );
    }

    const tasks = this.parseTasks(result.tasks);

    return createTaskResponseV2(
      'tasks',
      tasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'all',
        filters_applied: filter,
      },
    );
  }

  private async handleSmartSuggest(args: QueryTasksArgsV2, timer: OperationTimerV2): Promise<any> {
    // Smart suggest combines overdue, today, and flagged tasks to suggest what to work on
    const cacheKey = `tasks_smart_suggest_${args.limit}`;

    // Check cache
    const cached = this.cache.get<any>('tasks', cacheKey);
    if (cached) {
      return createTaskResponseV2(
        'tasks',
        cached.tasks,
        { ...timer.toMetadata(), from_cache: true, mode: 'smart_suggest' },
      );
    }

    // Gather data from multiple sources for intelligent suggestions
    const filter = {
      completed: false,
      limit: Math.min(args.limit * 2, 100), // Get more for analysis
      includeDetails: args.details,
    };

    // Execute comprehensive query
    const script = this.omniAutomation.buildScript(LIST_TASKS_SCRIPT, { filter });
    const result = await this.omniAutomation.execute<ListTasksScriptResult>(script);

    if (!result || 'error' in result) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        'Failed to get task suggestions',
        'Try using mode: "today" or "overdue" instead',
        result,
        timer.toMetadata(),
      );
    }

    const allTasks = this.parseTasks(result.tasks || []);
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Smart prioritization algorithm
    const scoredTasks = allTasks.map(task => {
      let score = 0;

      // Overdue tasks get highest priority
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        if (dueDate < now) {
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          score += 100 + Math.min(daysOverdue * 10, 200); // Cap at 300 for very overdue
        } else if (dueDate <= todayEnd) {
          score += 80; // Due today
        }
      }

      // Flagged tasks get bonus
      if (task.flagged) score += 50;

      // Available tasks get bonus (not blocked, not deferred)
      // TODO: Add proper status check when type is updated
      // if (task.status === 'available') score += 30;

      // Tasks with short estimated duration get bonus (quick wins)
      if (task.estimatedMinutes && task.estimatedMinutes <= 15) score += 20;

      return { ...task, _score: score };
    });

    // Sort by score and take top items
    const suggestedTasks = scoredTasks
      .filter(t => t._score > 0) // Only tasks with positive score
      .sort((a, b) => b._score - a._score)
      .slice(0, args.limit)
      .map(({ _score, ...task }) => task); // Remove score from output

    // Cache results
    this.cache.set('tasks', cacheKey, { tasks: suggestedTasks });

    return createTaskResponseV2(
      'tasks',
      suggestedTasks,
      {
        ...timer.toMetadata(),
        from_cache: false,
        mode: 'smart_suggest',
        algorithm: 'priority_score_v1',
      },
    );
  }

  private parseTasks(tasks: any[]): OmniFocusTask[] {
    return tasks.map(task => ({
      ...task,
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      deferDate: task.deferDate ? new Date(task.deferDate) : undefined,
      completionDate: task.completionDate ? new Date(task.completionDate) : undefined,
      added: task.added ? new Date(task.added) : undefined,
    }));
  }
}
