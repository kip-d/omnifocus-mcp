import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { ReadSchema, type ReadInput } from './schemas/read-schema.js';
import { QueryCompiler, type CompiledQuery } from './compilers/QueryCompiler.js';
import { buildListTasksScriptV4 } from '../../omnifocus/scripts/tasks.js';
import { buildTaskCountScript, DEFAULT_FIELDS } from '../../contracts/ast/script-builder.js';
import { isScriptSuccess, isScriptError } from '../../omnifocus/script-result-types.js';
import { createTaskResponseV2, createErrorResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import {
  augmentFilterForMode,
  getDefaultSort,
  parseTasks,
  sortTasks,
  projectFields,
  scoreForSmartSuggest,
  type TaskQueryMode,
} from '../tasks/task-query-pipeline.js';
import { ProjectsTool } from '../projects/ProjectsTool.js';
import { TagsTool } from '../tags/TagsTool.js';
import { PerspectivesTool } from '../perspectives/PerspectivesTool.js';
import { FoldersTool } from '../folders/FoldersTool.js';
import { ExportTool } from '../export/ExportTool.js';

export class OmniFocusReadTool extends BaseTool<typeof ReadSchema, unknown> {
  name = 'omnifocus_read';
  description = `Query OmniFocus data with flexible filtering. Returns tasks, projects, tags, perspectives, folders, or exports.

COMMON QUERIES:
- Inbox: { query: { type: "tasks", filters: { project: null } } }
- Overdue: { query: { type: "tasks", filters: { dueDate: { before: "now" }, status: "active" } } }
- Smart suggestions: { query: { type: "tasks", mode: "smart_suggest", limit: 10 } }
- Export tasks: { query: { type: "export", exportType: "tasks", format: "json" } }

FILTER OPERATORS:
- tags: { any: [...] } (has any), { all: [...] } (has all), { none: [...] } (has none)
- dates: { before: "YYYY-MM-DD" }, { after: "..." }, { between: ["...", "..."] }
- text: { contains: "..." }, { matches: "regex" }
- logic: { OR: [...] }, { AND: [...] }, { NOT: {...} }

EXPORT OPTIONS:
- exportType: "tasks", "projects", or "all" (bulk)
- format: "json", "csv", or "markdown"
- outputDirectory: required for exportType="all"

PERFORMANCE:
- Use fields parameter to select only needed data
- Set reasonable limits (default: 25)
- Smart suggest uses scoring: overdue +100, due today +80, flagged +50`;

  schema = ReadSchema;
  meta = {
    category: 'Utility' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['unified', 'read', 'query', 'export'],
    capabilities: ['tasks', 'projects', 'tags', 'perspectives', 'folders', 'smart_suggest', 'export'],
  };

  annotations = {
    title: 'Query OmniFocus Data',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };

  private compiler: QueryCompiler;
  private projectsTool: ProjectsTool;
  private tagsTool: TagsTool;
  private perspectivesTool: PerspectivesTool;
  private foldersTool: FoldersTool;
  private exportTool: ExportTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new QueryCompiler();

    // Instantiate existing tools for routing (non-task types)
    this.projectsTool = new ProjectsTool(cache);
    this.tagsTool = new TagsTool(cache);
    this.perspectivesTool = new PerspectivesTool(cache);
    this.foldersTool = new FoldersTool(cache);
    this.exportTool = new ExportTool(cache);
  }

  async executeValidated(args: ReadInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    // Route to appropriate existing tool based on type
    switch (compiled.type) {
      case 'tasks':
        return this.routeToTasksTool(compiled);
      case 'projects':
        return this.routeToProjectsTool(compiled);
      case 'tags':
        return this.routeToTagsTool(compiled);
      case 'perspectives':
        return this.routeToPerspectivesTool(compiled);
      case 'folders':
        return this.routeToFoldersTool(compiled);
      case 'export':
        return this.routeToExportTool(compiled);
      default: {
        // Exhaustiveness check
        const _exhaustive: never = compiled.type;
        throw new Error(`Unsupported query type: ${String(_exhaustive)}`);
      }
    }
  }

  private async routeToTasksTool(compiled: CompiledQuery): Promise<unknown> {
    const timer = new OperationTimerV2();
    const limit = compiled.limit || 25;
    const mode = (compiled.filters.inInbox ? 'inbox' : compiled.mode) as TaskQueryMode | undefined;

    // Augment filters with mode-specific constraints (e.g. overdue → dueBefore: now)
    const filter = augmentFilterForMode(mode, compiled.filters, {
      daysAhead: compiled.daysAhead,
    });

    // --- Count-only fast path ---
    if (compiled.countOnly) {
      const { script } = buildTaskCountScript(filter, { maxScan: 10000 });
      const result = await this.execJson(script);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'tasks',
          'SCRIPT_ERROR',
          'Failed to count tasks',
          'Check if OmniFocus is running and filters are valid',
          isScriptError(result) ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      const data = result.data as {
        count?: number;
        warning?: string;
        optimization?: string;
        filter_description?: string;
      };
      return createTaskResponseV2('tasks', [], {
        ...timer.toMetadata(),
        from_cache: false,
        mode: mode || 'count_only',
        count_only: true,
        total_count: data.count ?? 0,
        filters_applied: filter as unknown as Record<string, unknown>,
        optimization: data.optimization || 'ast_omnijs_bridge',
        filter_description: data.filter_description,
        warning: data.warning,
      });
    }

    // --- Today mode: extra fields for category counting ---
    let scriptFields = compiled.fields || [];
    if (mode === 'today') {
      const baseFields = scriptFields.length > 0 ? scriptFields : DEFAULT_FIELDS;
      scriptFields = [...new Set([...baseFields, 'reason', 'daysOverdue', 'modified'])];
    }

    // --- Build and execute query ---
    const script = buildListTasksScriptV4({
      filter,
      fields: scriptFields,
      limit,
      offset: compiled.offset,
      mode: mode === 'inbox' ? 'inbox' : undefined,
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        `Failed to get tasks (mode: ${mode || 'all'})`,
        'Check if OmniFocus is running',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    let tasks = parseTasks(data.tasks || data.items || []);

    // --- Smart suggest: score and rank ---
    if (mode === 'smart_suggest') {
      tasks = scoreForSmartSuggest(tasks, limit);
    }

    // --- Sort (user-specified or mode default) ---
    const sortOptions = compiled.sort || getDefaultSort(mode as TaskQueryMode);
    if (sortOptions) {
      tasks = sortTasks(tasks, sortOptions as import('../tasks/filter-types.js').SortOption[]);
    }

    // --- Project fields ---
    tasks = projectFields(tasks, compiled.fields);

    // --- Build metadata ---
    const metadata: Partial<import('../../utils/response-format.js').StandardMetadataV2> = {
      ...timer.toMetadata(),
      from_cache: false,
      mode: mode || 'all',
      sort_applied: !!sortOptions,
    };

    // Today mode: add category counts
    if (mode === 'today') {
      let overdueCount = 0,
        dueSoonCount = 0,
        flaggedCount = 0;
      for (const task of tasks) {
        const reason = (task as unknown as Record<string, unknown>).reason;
        if (reason === 'overdue') overdueCount++;
        else if (reason === 'due_soon') dueSoonCount++;
        else if (reason === 'flagged') flaggedCount++;
      }
      metadata.due_soon_days = compiled.daysAhead || 3;
      metadata.overdue_count = overdueCount;
      metadata.due_soon_count = dueSoonCount;
      metadata.flagged_count = flaggedCount;
    }

    return createTaskResponseV2('tasks', tasks, metadata);
  }

  private async routeToProjectsTool(compiled: CompiledQuery): Promise<unknown> {
    const projectsArgs: Record<string, unknown> = {
      operation: 'list',
      includeCompleted: compiled.filters.completed === true,
      response_format: 'json', // Optimized for LLM token efficiency
    };

    // Pass limit if specified (defaults to 50 in ProjectsTool)
    if (compiled.limit) projectsArgs.limit = compiled.limit;

    // Tags are already transformed to string[] by QueryCompiler
    if (compiled.filters.tags) projectsArgs.tags = compiled.filters.tags;

    // Pass folder filter for project filtering
    if (compiled.filters.folder) projectsArgs.folder = compiled.filters.folder;

    // Pass search filter for project name search (from name filter)
    if (compiled.filters.search) projectsArgs.search = compiled.filters.search;

    return this.projectsTool.execute(projectsArgs);
  }

  private async routeToTagsTool(_compiled: CompiledQuery): Promise<unknown> {
    return this.tagsTool.execute({ operation: 'list' });
  }

  private async routeToPerspectivesTool(_compiled: CompiledQuery): Promise<unknown> {
    return this.perspectivesTool.execute({ operation: 'list' });
  }

  private async routeToFoldersTool(_compiled: CompiledQuery): Promise<unknown> {
    return this.foldersTool.execute({ operation: 'list' });
  }

  private async routeToExportTool(compiled: CompiledQuery): Promise<unknown> {
    // Map compiled query to ExportTool parameters
    const exportArgs: Record<string, unknown> = {
      type: compiled.exportType || 'tasks', // Default to tasks export
      format: compiled.format || 'json',
    };

    // Map filters to export filter format
    if (compiled.filters && Object.keys(compiled.filters).length > 0) {
      const filter: Record<string, unknown> = {};
      if (compiled.filters.search) filter.search = compiled.filters.search;
      if (compiled.filters.projectId) filter.projectId = compiled.filters.projectId;
      if (compiled.filters.tags) filter.tags = compiled.filters.tags;
      if (compiled.filters.flagged !== undefined) filter.flagged = compiled.filters.flagged;
      if (compiled.filters.completed !== undefined) filter.completed = compiled.filters.completed;
      if (compiled.filters.available !== undefined) filter.available = compiled.filters.available;
      if (compiled.limit) filter.limit = compiled.limit;
      exportArgs.filter = filter;
    }

    // Pass export-specific fields
    if (compiled.exportFields) {
      exportArgs.fields = compiled.exportFields;
    }

    // Project export options
    if (compiled.includeStats !== undefined) {
      exportArgs.includeStats = compiled.includeStats;
    }

    // Bulk export options
    if (compiled.outputDirectory) {
      exportArgs.outputDirectory = compiled.outputDirectory;
    }
    if (compiled.includeCompleted !== undefined) {
      exportArgs.includeCompleted = compiled.includeCompleted;
    }

    return this.exportTool.execute(exportArgs);
  }
}
