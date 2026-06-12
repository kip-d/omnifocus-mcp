import * as path from 'path';
import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { ReadSchema, type ReadInput } from './schemas/read-schema.js';
import { QueryCompiler, type CompiledQuery } from './compilers/QueryCompiler.js';
import { buildListTasksScriptV4 } from '../../omnifocus/scripts/tasks.js';
import {
  buildTaskCountScript,
  buildFilteredProjectsScript,
  buildFilteredFoldersScript,
  buildExportTasksScript,
  buildProjectByIdScript,
  NOTE_TRUNCATE_LENGTH,
  resolveEffectiveTaskFields,
  resolveEffectiveProjectFields,
  type ExportFilter,
} from '../../contracts/ast/script-builder.js';
import { EXPORT_PROJECTS_SCRIPT } from '../../omnifocus/scripts/export/export-projects.js';
import { isScriptSuccess, isScriptError } from '../../omnifocus/script-result-types.js';
import {
  listResultSchema,
  CountResultSchema,
  ExportResultSchema,
  astEnvelopeSchema,
  ProjectByIdSchema,
  FolderListSchema,
} from '../../omnifocus/script-response-schemas.js';
import {
  createTaskResponseV2,
  createListResponseV2,
  createErrorResponseV2,
  createSuccessResponseV2,
  OperationTimerV2,
} from '../../utils/response-format.js';
import type { ExportDataV2 } from '../response-types-v2.js';
import type { TaskFilter, ProjectFilter } from '../../contracts/filters.js';
import {
  augmentFilterForMode,
  getDefaultSort,
  parseTasks,
  sortTasks,
  projectFields,
  scoreForSmartSuggest,
  countTodayCategories,
  type TaskQueryMode,
} from '../tasks/task-query-pipeline.js';
import { buildTagsScript } from '../../contracts/ast/tag-script-builder.js';
import type { TagQueryOptions, TagQueryMode, TagSortBy } from '../../contracts/tag-options.js';
import { LIST_PERSPECTIVES_SCRIPT } from '../../omnifocus/scripts/perspectives/list-perspectives.js';

// =============================================================================
// MODULE-SCOPE SUCCESS SCHEMAS (OMN-139)
// Instantiated once; never constructed per-request.
// Source-verified against the emitting script before finalizing each schema.
// =============================================================================

/**
 * Task list/id-lookup result — emitted by buildListTasksScriptV4 (wraps
 * buildFilteredTasksScript / buildInboxScript / buildTaskByIdScript).
 * Wire shape: {tasks, metadata} — the outer JXA wrapper always uses 'tasks'.
 * The 'items' variant covers any legacy callers that use data.tasks||data.items.
 *
 * Source: src/omnifocus/scripts/tasks/list-tasks-ast.ts — return JSON.stringify({tasks, metadata}).
 *
 * OMN-158: remove the dormant items variant and the caller `|| data.items` fallback together.
 */
const TASK_LIST_SCHEMA = listResultSchema(['tasks', 'items'], { metadata: true });

/**
 * Filtered project list result — emitted by buildFilteredProjectsScript.
 * Wire shape: {projects, metadata}
 * The 'items' variant covers any legacy callers using data.projects||data.items.
 *
 * Source: src/contracts/ast/script-builder.ts → buildFilteredProjectsScript →
 *   return JSON.stringify({ projects, metadata: {...} }).
 *
 * OMN-158: remove the dormant items variant and the caller `|| data.items` fallback together.
 */
const PROJECT_LIST_SCHEMA = listResultSchema(['projects', 'items'], { metadata: true });

/**
 * Tag list result — emitted by buildTagsScript (all modes).
 * Wire shape: {ok: true, v: 'ast', items, summary}
 *
 * Source: src/contracts/ast/tag-script-builder.ts — return JSON.stringify({ok:true, v:'ast', items, summary}).
 */
const TAG_LIST_SCHEMA = astEnvelopeSchema('items');

/**
 * Perspective list result — emitted by LIST_PERSPECTIVES_SCRIPT.
 * Wire shape: {items, summary}
 *
 * Source: src/omnifocus/scripts/perspectives/list-perspectives.ts →
 *   return JSON.stringify({ items: perspectives, summary: {...} }).
 */
const PERSPECTIVE_LIST_SCHEMA = listResultSchema(['items'], { extras: { summary: z.unknown().optional() } });

/**
 * Post-hoc field projection for project query results.
 * Strips project objects to only the requested fields.
 * Always includes 'id' for identity (matching task projectFields behavior).
 *
 * Handles the StandardResponseV2 envelope: projects live at result.data.projects.
 */
export function projectFieldsOnResult(
  result: Record<string, unknown>,
  fields: string[] | undefined,
): Record<string, unknown> {
  if (!fields || fields.length === 0) return result;

  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return result;

  const projects = data.projects as Record<string, unknown>[] | undefined;
  if (!projects || !Array.isArray(projects)) return result;

  const projectOne = (project: Record<string, unknown>) => {
    const out: Record<string, unknown> = { id: project.id };
    for (const field of fields) {
      if (field in project) {
        out[field] = project[field];
      }
    }
    return out;
  };

  const projected = projects.map(projectOne);

  return { ...result, data: { ...data, projects: projected } };
}

// =============================================================================
// TASK QUERY BUILDER
// =============================================================================

type ExportFormat = 'json' | 'csv' | 'markdown';

interface TaskQueryPlan {
  script: string;
  filter: TaskFilter;
  mode: TaskQueryMode | undefined;
  scriptFields: string[];
  limit: number;
  sortedInScript: boolean;
}

/**
 * Determine the fields_mode for metadata reporting.
 */
function resolveFieldsMode(
  userFields: string[] | undefined,
  details: boolean | undefined,
): 'minimal' | 'detailed' | 'explicit' {
  if (userFields && userFields.length > 0) return 'explicit';
  if (details) return 'detailed';
  return 'minimal';
}

/**
 * Build the full task query: resolve mode, augment filters, inject fields, build script.
 */
function buildTaskQuery(compiled: CompiledQuery): TaskQueryPlan & { fieldsMode: 'minimal' | 'detailed' | 'explicit' } {
  const limit = compiled.limit || 25;
  const mode = (compiled.filters.inInbox ? 'inbox' : compiled.mode) as TaskQueryMode | undefined;

  const filter = augmentFilterForMode(mode, compiled.filters, {
    daysAhead: compiled.daysAhead,
  });

  const userExplicitFields = compiled.fields && compiled.fields.length > 0 ? compiled.fields : undefined;
  const fieldsMode = resolveFieldsMode(userExplicitFields, compiled.details);

  // Resolve effective fields: explicit > details=true > MINIMAL_FIELDS
  let scriptFields = resolveEffectiveTaskFields(userExplicitFields, compiled.details);

  // Today mode needs extra fields for category counting
  if (mode === 'today') {
    scriptFields = [...new Set([...scriptFields, 'reason', 'daysOverdue', 'modified'])];
  }

  // Note truncation: apply when not in detail mode
  // Truncate when using minimal fields OR when user explicitly requests note without details=true
  const shouldTruncateNotes = !compiled.details;
  const noteTruncateLength = shouldTruncateNotes ? NOTE_TRUNCATE_LENGTH : undefined;

  // Only pass user-specified sort to the script builder (not mode default sorts).
  // Mode default sorts operate on small, already-filtered sets and stay as post-hoc.
  const userSort = compiled.sort;

  const script = buildListTasksScriptV4({
    filter,
    fields: scriptFields,
    limit,
    offset: compiled.offset,
    mode: mode === 'inbox' ? 'inbox' : undefined,
    sort: userSort,
    noteTruncateLength,
  });

  // Inbox path doesn't pass sort to buildInboxScript, so sort is never applied in-script.
  // Mark sortedInScript false so the post-hoc sort handles it instead.
  const isInboxPath = mode === 'inbox';
  return { script, filter, mode, scriptFields, limit, sortedInScript: !isInboxPath && !!userSort, fieldsMode };
}

// OMN-88: date fields parseProjects converts string → Date. Mirrors the
// TASK_DATE_FIELDS contract in `src/tools/tasks/task-query-pipeline.ts`.
const PROJECT_DATE_FIELDS = ['dueDate', 'completionDate', 'nextReviewDate', 'lastReviewDate'] as const;

export class OmniFocusReadTool extends BaseTool<typeof ReadSchema, unknown> {
  name = 'omnifocus_read';
  description = `Query OmniFocus data with flexible filtering. Returns tasks, projects, tags, perspectives, folders, or exports.

COMMON QUERIES:
- Inbox: { query: { type: "tasks", filters: { project: null } } }
- Tasks in a specific project (by ID, fast): { query: { type: "tasks", filters: { projectId: "<id>" } } }
- Direct children of a task (subtasks): { query: { type: "tasks", filters: { parentTaskId: "<id>" } } }
- Overdue: { query: { type: "tasks", mode: "overdue" } }
- Today perspective: { query: { type: "tasks", mode: "today" } }
- Flagged: { query: { type: "tasks", mode: "flagged" } }
- Upcoming (7 days): { query: { type: "tasks", mode: "upcoming", daysAhead: 7 } }
- Smart suggestions: { query: { type: "tasks", mode: "smart_suggest", limit: 10 } }
- Count only (fast): { query: { type: "tasks", filters: { flagged: true }, countOnly: true } }
- Export tasks: { query: { type: "export", exportType: "tasks", format: "json" } }

MODES (tasks queries ONLY — not valid on type:"projects"):
- today: Due soon (≤3 days) OR flagged, matching OmniFocus Today perspective
- overdue: Tasks past their due date
- flagged: Flagged tasks
- upcoming: Tasks due in next N days (set daysAhead, default 7)
- inbox, available, blocked, search, smart_suggest, all
- To SEARCH projects (or tasks) use filters, not mode: filters: { name: { contains: "..." } } or filters: { text: { matches: "regex" } }
- Projects filters: status, completed, flagged, name, text, folder, id. OR/NOT are not supported on projects queries (use one query per alternative).

FILTER OPERATORS:
- tags: { any: [...] } (has any), { all: [...] } (has all), { none: [...] } (has none)
- dates (dueDate, deferDate, plannedDate, added): { before: "YYYY-MM-DD" }, { after: "..." }, { between: ["...", "..."] }
- text: { contains: "..." }, { matches: "regex" } — full-text: matches name OR note
- name: { contains: "..." }, { matches: "regex" } — name ONLY (never matches note content)
- boolean: flagged, blocked, available, inInbox
- folder (projects queries): "<name>" matches folder-name substring; null = top-level projects only (no containing folder)
- logic: { OR: [...] }, { AND: [...] }; NOT supports ONLY { status: "completed" } or { status: "active" } — anything else is rejected. For tag exclusion use tags: { none: [...] }; for flag exclusion use flagged: false

RESPONSE CONTROL:
- Default returns minimal fields (id, name, flagged, completed, dueDate, deferDate, tags, project, available)
- details: true returns all fields with full notes
- fields: [...] returns exactly those fields (note truncated to 200 chars unless details: true)
- ID lookup always returns all fields with full notes
- fields are type-specific; requesting a field of the other type (e.g. reviewInterval on tasks) returns a guided error
- fields (tasks): id, name, completed, flagged, blocked, available, estimatedMinutes, dueDate, deferDate, plannedDate, completionDate, added, modified, dropDate, note, projectId, project, tags, repetitionRule, parentTaskId, parentTaskName, inInbox
- fields (projects): id, name, status, flagged, note, dueDate, deferDate, completionDate, folder, folderPath, folderId, sequential, lastReviewDate, nextReviewDate, reviewInterval, defaultSingletonActionHolder, tags, plannedDate
- sort: [{ field: "dueDate", direction: "asc" }]
- limit/offset: Pagination (default limit: 25, max: 500)
- countOnly: true returns only count (33x faster for "how many" questions) — tasks only

COMPLETED TASKS:
- Use filters: { completed: true } or filters: { status: "completed" } to query completed tasks
- includeCompleted is for export operations only (type: "export"); honored by exportType: "tasks" and exportType: "all"

FOLDERS (type: "folders"):
- Returns a FLAT list; each folder appears once as a full entry (id, name, status, depth, path, parentId). Folders with subfolders additionally carry a children array of lightweight {id,name} refs plus childCount for navigation — those nested refs are adjacency hints, NOT duplicate rows.

EXPORT TO DISK:
- outputDirectory: when set with exportType: "tasks", writes tasks.<format> to disk (raises the implicit cap to 5000); required for exportType: "all"
- A response-path export (no outputDirectory) caps at 1000 by default and emits summary.truncated when the cap fires; override with limit

PERFORMANCE:
- Use countOnly for counting questions
- Use fields to select only needed data
- Use modes instead of raw filters when available
- Default queries are token-efficient (9 fields, no notes)`;

  schema = ReadSchema;

  /**
   * Hand-crafted minimal JSON Schema for MCP tool advertisement.
   *
   * The auto-generated schema from zodToJsonSchema() is ~22 KB due to
   * discriminatedUnion duplicating filters across 6 query type branches.
   * This minimal version is ~1 KB (~5K tokens saved per interaction turn).
   *
   * Server-side validation still uses the full Zod ReadSchema — this only controls
   * what the MCP tools/list response advertises to LLM clients.
   */
  override get inputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['tasks', 'projects', 'tags', 'perspectives', 'folders', 'export'],
            },
            mode: {
              type: 'string',
              enum: [
                'all',
                'inbox',
                'search',
                'overdue',
                'today',
                'upcoming',
                'available',
                'blocked',
                'flagged',
                'smart_suggest',
              ],
            },
            filters: { type: 'object' },
            sort: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  direction: { type: 'string', enum: ['asc', 'desc'] },
                },
              },
            },
            fields: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' },
            offset: { type: 'number' },
            countOnly: { type: 'boolean' },
            fastSearch: { type: 'boolean' },
            daysAhead: { type: 'number' },
            details: { type: 'boolean' },
            includeStats: { type: 'boolean' },
            exportType: { type: 'string', enum: ['tasks', 'projects', 'all'] },
            format: { type: 'string', enum: ['json', 'csv', 'markdown'] },
            exportFields: { type: 'array', items: { type: 'string' } },
            outputDirectory: {
              type: 'string',
              description:
                'Export only: directory to write the export file to. With exportType:"tasks" writes tasks.<format> and raises the cap; required for exportType:"all".',
            },
            includeCompleted: {
              type: 'boolean',
              description:
                'Export only: include completed tasks (default true). Honored by exportType:"tasks" and exportType:"all".',
            },
          },
          required: ['type'],
        },
      },
      required: ['query'],
    };
  }
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

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new QueryCompiler();
  }

  async executeValidated(args: ReadInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    // Dispatch to handler based on query type
    switch (compiled.type) {
      case 'tasks':
        return this.handleTaskQuery(compiled);
      case 'projects':
        return this.handleProjectQuery(compiled);
      case 'tags':
        return this.handleTagQuery(compiled);
      case 'perspectives':
        return this.handlePerspectiveQuery(compiled);
      case 'folders':
        return this.handleFolderQuery(compiled);
      case 'export':
        return this.handleExport(compiled);
      default: {
        // Exhaustiveness check
        const _exhaustive: never = compiled.type;
        throw new Error(`Unsupported query type: ${String(_exhaustive)}`);
      }
    }
  }

  private async handleTaskQuery(compiled: CompiledQuery): Promise<unknown> {
    const timer = new OperationTimerV2();
    const { script, filter, mode, limit, sortedInScript, fieldsMode } = buildTaskQuery(compiled);

    // --- Count-only fast path ---
    if (compiled.countOnly) {
      return this.executeCountOnly(filter, mode, timer);
    }

    // --- ID lookup fast path (always full detail) ---
    if (filter.id) {
      return this.executeIdLookup(filter, compiled.fields, timer);
    }

    // --- Execute main query ---
    const result = await this.execJson(script, TASK_LIST_SCHEMA);

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

    const data = result.data as {
      tasks?: unknown[];
      items?: unknown[];
      metadata?: { total_matched?: number; sorted_in_script?: boolean };
    };
    let tasks = parseTasks(data.tasks || data.items || []);
    const totalMatched = data.metadata?.total_matched;

    // Smart suggest: score and rank
    if (mode === 'smart_suggest') {
      tasks = scoreForSmartSuggest(tasks, limit);
    }

    // Sort: skip post-hoc sort when sort was already applied in-script.
    // User-specified sorts are embedded in OmniJS (sort-before-limit fix).
    // Mode default sorts (e.g., overdue -> dueDate asc) stay as post-hoc
    // since they operate on small, already-filtered result sets.
    const sortOptions = sortedInScript ? undefined : compiled.sort || getDefaultSort(mode as TaskQueryMode);
    if (sortOptions) {
      tasks = sortTasks(tasks, sortOptions as import('../tasks/filter-types.js').SortOption[]);
    }

    // Build metadata
    const metadata: Partial<import('../../utils/response-format.js').StandardMetadataV2> = {
      ...timer.toMetadata(),
      from_cache: false,
      mode: mode || 'all',
      offset: compiled.offset || 0,
      sort_applied: sortedInScript || !!sortOptions,
      fields_mode: fieldsMode,
      ...(totalMatched !== undefined ? { total_matched: totalMatched } : {}),
    };

    // Today mode: count categories BEFORE field projection
    if (mode === 'today') {
      const counts = countTodayCategories(tasks);
      metadata.due_soon_days = compiled.daysAhead || 3;
      metadata.overdue_count = counts.overdueCount;
      metadata.due_soon_count = counts.dueSoonCount;
      metadata.flagged_count = counts.flaggedCount;
    }

    // Project fields (after counting)
    tasks = projectFields(tasks, compiled.fields);

    return createTaskResponseV2('tasks', tasks, metadata);
  }

  private async executeCountOnly(
    filter: TaskFilter,
    mode: TaskQueryMode | undefined,
    timer: OperationTimerV2,
  ): Promise<unknown> {
    // Ensure inbox mode sets the inInbox filter (mode: "inbox" is not in
    // MODE_DEFINITIONS, so augmentFilterForMode passes through unchanged)
    const countFilter = { ...filter };
    if (mode === 'inbox' && !countFilter.inInbox) {
      countFilter.inInbox = true;
    }

    const { script } = buildTaskCountScript(countFilter, { maxScan: 10000 });
    const result = await this.execJson(script, CountResultSchema);

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
    const count = data.count ?? 0;
    const response = createTaskResponseV2('tasks', [], {
      ...timer.toMetadata(),
      from_cache: false,
      mode: mode || 'count_only',
      count_only: true,
      total_count: count,
      filters_applied: countFilter as unknown as Record<string, unknown>,
      optimization: data.optimization || 'ast_omnijs_bridge',
      filter_description: data.filter_description,
      warning: data.warning,
    });

    // Override summary total_count with actual count from JXA
    // (generateTaskSummary receives [] for countOnly, producing total_count: 0)
    if (response.summary && 'total_count' in response.summary) {
      (response.summary as { total_count: number }).total_count = count;
    }

    return response;
  }

  private async executeIdLookup(
    filter: TaskFilter,
    fields: string[] | undefined,
    timer: OperationTimerV2,
  ): Promise<unknown> {
    // ID lookup is a detail view — always use full fields, no truncation
    const idFields = resolveEffectiveTaskFields(fields, true);
    const script = buildListTasksScriptV4({
      filter,
      fields: idFields,
      limit: 1,
    });
    const result = await this.execJson(script, TASK_LIST_SCHEMA);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tasks',
        'SCRIPT_ERROR',
        `Failed to find task with ID: ${filter.id}`,
        'Verify the task ID is correct and the task exists',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { tasks?: unknown[]; items?: unknown[] };
    const tasks = parseTasks(data.tasks || data.items || []);

    if (tasks.length === 0) {
      return createErrorResponseV2(
        'tasks',
        'NOT_FOUND',
        `Task not found with ID: ${filter.id}`,
        'Verify the task ID is correct and the task exists',
        undefined,
        timer.toMetadata(),
      );
    }

    if (tasks[0].id !== filter.id) {
      return createErrorResponseV2(
        'tasks',
        'ID_MISMATCH',
        `Task ID mismatch: requested ${filter.id}, received ${tasks[0].id}`,
        'This indicates a potential issue with the OmniFocus script - please report this bug',
        undefined,
        timer.toMetadata(),
      );
    }

    const projectedTasks = projectFields(tasks, fields);
    return createTaskResponseV2('tasks', projectedTasks, {
      ...timer.toMetadata(),
      from_cache: false,
      mode: 'id_lookup',
      sort_applied: false,
    });
  }

  /**
   * OMN-40: project id-lookup fast path. Uses Project.byIdentifier() for O(1)
   * lookup, bypasses the projects-list cache (whose key did not include id), and
   * defensively verifies the returned project's id matches the request.
   */
  private async executeProjectIdLookup(projectId: string, fields: string[], timer: OperationTimerV2): Promise<unknown> {
    const generated = buildProjectByIdScript(projectId, fields);
    const result = await this.execJson(generated.script, ProjectByIdSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        `Failed to find project with ID: ${projectId}`,
        'Verify the project ID is correct and OmniFocus is running',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const data = result.data as { projects?: unknown[]; items?: unknown[] };
    const projects = this.parseProjects(data.projects || data.items || []);

    if (projects.length === 0) {
      return createErrorResponseV2(
        'projects',
        'NOT_FOUND',
        `Project not found with ID: ${projectId}`,
        'Verify the project ID is correct and the project exists',
        undefined,
        timer.toMetadata(),
      );
    }

    const found = projects[0] as { id?: string };
    if (found.id !== projectId) {
      return createErrorResponseV2(
        'projects',
        'ID_MISMATCH',
        `Project ID mismatch: requested ${projectId}, received ${found.id ?? 'unknown'}`,
        'This indicates a potential issue with the OmniFocus script - please report this bug',
        undefined,
        timer.toMetadata(),
      );
    }

    const listResult = createListResponseV2('projects', projects, 'projects', {
      ...timer.toMetadata(),
      from_cache: false,
      operation: 'list',
      mode: 'id_lookup',
    }) as unknown as Record<string, unknown>;

    // Narrow lookup — strip the dashboard-style summary (matches OMN-19 rule).
    delete listResult.summary;

    return projectFieldsOnResult(listResult, fields);
  }

  private async handleProjectQuery(compiled: CompiledQuery): Promise<unknown> {
    const timer = new OperationTimerV2();
    const limit = compiled.limit || 25;
    const includeStats = compiled.includeStats ?? false;

    // Resolve effective project fields
    const userExplicitFields = compiled.fields && compiled.fields.length > 0 ? compiled.fields : undefined;
    const effectiveFields = resolveEffectiveProjectFields(userExplicitFields, compiled.details);

    // OMN-156 (C-lite): the compiler emits a typed ProjectFilter; the old
    // cherry-pick re-narrowing seam (silently dropped unmapped keys → match-all,
    // D10) is deleted, not guarded. A missing projectFilter is an invariant
    // violation — falling back to {} would silently degrade to match-all,
    // exactly the bug class this seam closes.
    if (!compiled.projectFilter) {
      throw new Error('Invariant violation: projects query compiled without projectFilter (OMN-156)');
    }
    const projectFilter: ProjectFilter = compiled.projectFilter;

    if (projectFilter.id) {
      return this.executeProjectIdLookup(projectFilter.id, effectiveFields, timer);
    }

    // OMN-19: suppress review/bottleneck summary on narrow lookups (name or id).
    // Rationale: the summary is built for weekly-review/dashboard flows but is
    // pure noise when the caller is doing "find this one project to get its ID."
    // Status- and folder-only browses still return the summary — those look
    // dashboard-ish and users may be scanning review state. See Linear OMN-19
    // for the full option trade-off (explicit param vs heuristic vs slim mode).
    const isNarrowLookup = Boolean(projectFilter.name || projectFilter.text || projectFilter.id);

    // Build cache key
    const cacheParams = { ...projectFilter, limit, includeStats };
    const cacheKey = `projects_list_${JSON.stringify(cacheParams)}`;

    // Check cache
    const cached = this.cache.get<{ projects: unknown[] }>('projects', cacheKey);
    if (cached) {
      const cacheResult = createListResponseV2('projects', cached.projects, 'projects', {
        ...timer.toMetadata(),
        from_cache: true,
        operation: 'list',
      }) as unknown as Record<string, unknown>;

      if (isNarrowLookup) delete cacheResult.summary;

      // Post-hoc field projection (always applied for thin-by-default)
      return projectFieldsOnResult(cacheResult, effectiveFields);
    }

    // Execute query using AST-powered script builder
    const generatedScript = buildFilteredProjectsScript(projectFilter, {
      limit,
      includeStats,
      performanceMode: includeStats ? 'normal' : 'lite',
    });

    const result = await this.execJson(generatedScript.script, PROJECT_LIST_SCHEMA);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        (isScriptError(result) ? result.error : null) || 'Failed to query projects',
        'Check if OmniFocus is running',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    // Parse dates and cache
    const resultData = result.data as { projects?: unknown[]; items?: unknown[] };
    const projects = this.parseProjects(resultData.projects || resultData.items || result.data);
    this.cache.set('projects', cacheKey, { projects });

    const listResult = createListResponseV2('projects', projects, 'projects', {
      ...timer.toMetadata(),
      from_cache: false,
      operation: 'list',
    }) as unknown as Record<string, unknown>;

    if (isNarrowLookup) delete listResult.summary;

    // Post-hoc field projection (always applied for thin-by-default)
    return projectFieldsOnResult(listResult, effectiveFields);
  }

  /**
   * Parse raw project data, converting date strings to Date objects.
   *
   * OMN-80 / OMN-88: date fields come through as `string | null` from the
   * OmniJS projection. `null` means "explicitly cleared in OmniFocus"; an
   * absent key means "field not requested by the script." parseProjects
   * honors all three:
   *   absent input  → absent output key
   *   null input    → null output
   *   string input  → Date object output
   * Truthy-check consumers (`if (proj.dueDate)`) are unaffected — both
   * null and absent are falsy. The observable win is that field-projection's
   * payload reduction is no longer defeated by parseProjects resurrecting
   * null date keys.
   *
   * OMN-81 resolved the related `completedDate`/`completionDate`
   * projection-strip bug by renaming the enum/script-builder to use
   * `completionDate` consistently; this override is now the canonical key
   * for that field.
   */
  private parseProjects(projects: unknown): unknown[] {
    if (!Array.isArray(projects)) return [];

    return projects.map((project: unknown) => {
      const projectRecord = project as Record<string, unknown>;
      const result: Record<string, unknown> = { ...projectRecord };
      for (const field of PROJECT_DATE_FIELDS) {
        if (field in projectRecord) {
          const raw = projectRecord[field];
          // Strict null/undefined check (see parseTasks for rationale).
          result[field] = raw === null || raw === undefined ? null : new Date(raw as string);
        }
      }
      return result;
    });
  }

  private async handleTagQuery(_compiled: CompiledQuery): Promise<unknown> {
    const timer = new OperationTimerV2();

    // Check cache
    const cacheKey = 'list:name:true:false:false:true:false';
    const cached = this.cache.get<{
      tags?: unknown[];
      items?: unknown[];
      count?: number;
    }>('tags', cacheKey);
    if (cached) {
      return cached;
    }

    // Build and execute AST-powered tag list script (basic mode, defaults)
    const tagOptions: TagQueryOptions = {
      mode: 'basic' as TagQueryMode,
      includeEmpty: true,
      sortBy: 'name' as TagSortBy,
    };
    const generatedScript = buildTagsScript(tagOptions);
    const result = await this.execJson(generatedScript.script, TAG_LIST_SCHEMA);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'tags',
        'SCRIPT_ERROR',
        (isScriptError(result) ? result.error : null) || 'Failed to list tags',
        'Check OmniFocus is running',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    // Unwrap AST envelope: {ok: true, v: "ast", items: [...], summary: {...}}
    const envelope = result.data as { ok?: boolean; v?: string; items?: unknown[]; summary?: { total?: number } };
    const items = envelope.items || [];
    const total = envelope.summary?.total ?? items.length;

    const response = createListResponseV2('tags', items, 'tags', {
      ...timer.toMetadata(),
      total,
      operation: 'list',
      mode: 'ast_unified',
    });

    // Cache the result
    this.cache.set('tags', cacheKey, response);
    return response;
  }

  private async handlePerspectiveQuery(_compiled: CompiledQuery): Promise<unknown> {
    const timer = new OperationTimerV2();

    try {
      const script = this.omniAutomation.buildScript(LIST_PERSPECTIVES_SCRIPT, {});
      const result = await this.execJson(script, PERSPECTIVE_LIST_SCHEMA);

      if (!isScriptSuccess(result)) {
        return createErrorResponseV2(
          'perspectives',
          'SCRIPT_ERROR',
          (isScriptError(result) ? result.error : null) || 'Failed to list perspectives',
          'Check if OmniFocus is running',
          isScriptError(result) ? result.details : undefined,
          timer.toMetadata(),
        );
      }

      // Parse the result - handle both perspectives and items properties
      const parsedResult = result.data as {
        perspectives?: Array<Record<string, unknown>>;
        items?: Array<Record<string, unknown>>;
        metadata?: Record<string, unknown>;
      };

      const perspectives = parsedResult.perspectives || parsedResult.items || [];

      // Sort perspectives by name
      perspectives.sort((a, b) => {
        const nameA = (a.name as string) || '';
        const nameB = (b.name as string) || '';
        return nameA.localeCompare(nameB);
      });

      return createSuccessResponseV2('perspectives', { perspectives }, undefined, {
        ...timer.toMetadata(),
        ...parsedResult.metadata,
        operation: 'list',
      });
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

  private async handleFolderQuery(_compiled: CompiledQuery): Promise<unknown> {
    const timer = new OperationTimerV2();

    // Check cache first
    const cacheKey = 'folders_list_basic';
    const cached = this.cache.get<{ folders: unknown[] }>('folders', cacheKey);
    if (cached) {
      return createSuccessResponseV2('folders', { folders: cached.folders }, undefined, {
        ...timer.toMetadata(),
        operation: 'list',
        from_cache: true,
      });
    }

    // Build and execute AST-generated folder list script
    const { script } = buildFilteredFoldersScript({ limit: 100 });
    const result = await this.execJson(script, FolderListSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'folders',
        'SCRIPT_ERROR',
        (isScriptError(result) ? result.error : null) || 'Failed to query folders',
        'Check if OmniFocus is running',
        isScriptError(result) ? result.details : undefined,
        timer.toMetadata(),
      );
    }

    const resultData = result.data as { folders?: unknown[]; items?: unknown[] };
    const folders = resultData.folders || resultData.items || [];

    // Cache for 5 minutes (folders change infrequently)
    this.cache.set('folders', cacheKey, { folders });

    return createSuccessResponseV2('folders', { folders }, undefined, {
      ...timer.toMetadata(),
      operation: 'list',
      total_folders: folders.length,
    });
  }

  // =============================================================================
  // EXPORT (inlined from ExportTool)
  // =============================================================================

  private async handleExport(compiled: CompiledQuery): Promise<unknown> {
    const exportType = compiled.exportType || 'tasks';
    const format = (compiled.format || 'json') as ExportFormat;
    const timer = new OperationTimerV2();

    try {
      switch (exportType) {
        case 'tasks':
          return await this.handleTaskExport(compiled, format, timer);
        case 'projects':
          return await this.handleProjectExport(format, compiled.includeStats ?? false, timer);
        case 'all':
          return await this.handleBulkExport(compiled, format, timer);
        default:
          return createErrorResponseV2(
            'export',
            'INVALID_TYPE',
            `Invalid export type: ${String(exportType)}`,
            undefined,
            { type: exportType },
            timer.toMetadata(),
          );
      }
    } catch (error) {
      return this.handleErrorV2<ExportDataV2>(error);
    }
  }

  private async handleTaskExport(
    compiled: CompiledQuery,
    format: ExportFormat,
    timer: OperationTimerV2,
  ): Promise<unknown> {
    const outputDirectory = compiled.outputDirectory;

    // OMN-44: `filters.completed` (if set) takes precedence; `includeCompleted`
    // is the higher-level convenience that the schema doc-comment promises.
    const completedFromFlag = compiled.includeCompleted === false ? false : undefined;
    const exportFilter: ExportFilter = {
      available: compiled.filters.available,
      completed: compiled.filters.completed ?? completedFromFlag,
      flagged: compiled.filters.flagged,
      project: undefined, // export filter uses project name, not in compiled.filters
      projectId: compiled.filters.projectId,
      tags: compiled.filters.tags,
      tagsOperator: compiled.filters.tagsOperator as ExportFilter['tagsOperator'],
      search: compiled.filters.search,
      // OMN-142: name is name-scoped (never matches notes); search above
      // keeps the legacy full-text (name OR note) semantics.
      name: compiled.filters.name,
      nameOperator: compiled.filters.nameOperator,
    };
    // OMN-44: response-size pressure does not apply when writing to disk, so
    // raise the implicit cap; a user-supplied `limit` always wins.
    const defaultCap = outputDirectory ? 5000 : 1000;
    const limit = compiled.limit || defaultCap;

    const { script } = buildExportTasksScript(exportFilter, {
      limit,
      fields: compiled.exportFields,
      format,
    });

    const result = await this.execJson(script, ExportResultSchema);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'export',
        'TASK_EXPORT_FAILED',
        result.error || 'Failed to export tasks',
        undefined,
        { format, filter: exportFilter },
        timer.toMetadata(),
      );
    }

    if (isScriptSuccess(result)) {
      const data = result.data as {
        format: string;
        data: unknown;
        count: number;
        limited?: boolean;
      };
      const summary: Record<string, unknown> = {};
      if (data.limited === true) {
        summary.truncated = true;
        summary.cap = limit;
      }

      // OMN-44: honor outputDirectory for tasks export. Write the payload to
      // disk and return the path; skip embedding the full payload to keep the
      // response small.
      if (outputDirectory) {
        try {
          const fsSync = await import('fs');
          fsSync.mkdirSync(outputDirectory, { recursive: true });
          const outputPath = path.join(outputDirectory, `tasks.${format}`);
          const payload = data.data;
          const toWrite = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
          fsSync.writeFileSync(outputPath, toWrite, 'utf-8');
          return createSuccessResponseV2(
            'export',
            {
              format: data.format as ExportFormat,
              exportType: 'tasks' as const,
              data: { written_to: outputPath, count: data.count },
              count: data.count,
              outputPath,
              ...(Object.keys(summary).length ? { summary } : {}),
            },
            undefined,
            { ...timer.toMetadata(), operation: 'tasks' },
          );
        } catch (writeError) {
          return createErrorResponseV2(
            'export',
            'WRITE_FAILED',
            `Failed to write export file: ${String(writeError)}`,
            undefined,
            { outputDirectory, error: String(writeError) },
            timer.toMetadata(),
          );
        }
      }

      return createSuccessResponseV2(
        'export',
        {
          format: data.format as ExportFormat,
          exportType: 'tasks' as const,
          data: data.data as string | object,
          count: data.count,
          ...(Object.keys(summary).length ? { summary } : {}),
        },
        undefined,
        { ...timer.toMetadata(), operation: 'tasks' },
      );
    }

    return createErrorResponseV2(
      'export',
      'UNEXPECTED_RESULT',
      'Unexpected script result format',
      undefined,
      { result },
      timer.toMetadata(),
    );
  }

  private async handleProjectExport(
    format: ExportFormat,
    includeStats: boolean,
    timer: OperationTimerV2,
  ): Promise<unknown> {
    const script = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, {
      format,
      includeStats,
    });
    const result = await this.execJson(script, ExportResultSchema);

    if (isScriptError(result)) {
      return createErrorResponseV2(
        'export',
        'SCRIPT_ERROR',
        result.error || 'Script error during project export',
        'Check error details',
        result.details,
        timer.toMetadata(),
      );
    }

    if (isScriptSuccess(result)) {
      const data = result.data as { format: string; data: unknown; count: number };
      return createSuccessResponseV2(
        'export',
        {
          format: data.format as ExportFormat,
          exportType: 'projects' as const,
          data: data.data as string | object,
          count: data.count,
          includeStats,
        },
        undefined,
        { ...timer.toMetadata(), operation: 'projects' },
      );
    }

    return createErrorResponseV2(
      'export',
      'UNEXPECTED_RESULT',
      'Unexpected script result format',
      undefined,
      { result },
      timer.toMetadata(),
    );
  }

  private async handleBulkExport(
    compiled: CompiledQuery,
    format: ExportFormat,
    timer: OperationTimerV2,
  ): Promise<unknown> {
    const outputDirectory = compiled.outputDirectory;
    if (!outputDirectory) {
      return createErrorResponseV2(
        'export',
        'MISSING_PARAMETER',
        'outputDirectory is required for type="all"',
        undefined,
        { type: 'all' },
        timer.toMetadata(),
      );
    }

    const includeCompleted = compiled.includeCompleted ?? true;
    const includeProjectStats = compiled.includeStats ?? true;

    // Ensure directory exists
    try {
      const fsSync = await import('fs');
      fsSync.mkdirSync(outputDirectory, { recursive: true });
    } catch (mkdirError) {
      return createErrorResponseV2(
        'export',
        'MKDIR_FAILED',
        `Failed to create directory: ${String(mkdirError)}`,
        undefined,
        { outputDirectory, error: String(mkdirError) },
        timer.toMetadata(),
      );
    }

    const exports: Record<
      string,
      {
        format: string;
        task_count?: number;
        project_count?: number;
        tag_count?: number;
        exported: boolean;
      }
    > = {};
    let totalExported = 0;

    // Export tasks using AST-powered script
    const taskExportFilter: ExportFilter = includeCompleted ? {} : { completed: false };
    const { script: taskScript } = buildExportTasksScript(taskExportFilter, {
      format,
      limit: 5000,
    });
    const taskResult = await this.execJson(taskScript, ExportResultSchema);

    if (isScriptSuccess(taskResult)) {
      const taskData = taskResult.data as { data?: unknown; count?: number };
      const taskFile = path.join(outputDirectory, `tasks.${format}`);
      const taskCount = taskData.count || 0;

      const payload = taskData.data;
      const toWrite = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      const fsSync = await import('fs');
      fsSync.writeFileSync(taskFile, toWrite, 'utf-8');

      exports.tasks = { format, task_count: taskCount, exported: true };
      totalExported += taskCount;
    }

    // Export projects
    const projectScript = this.omniAutomation.buildScript(EXPORT_PROJECTS_SCRIPT, {
      format,
      includeStats: includeProjectStats,
    });
    const projectResult = await this.execJson(projectScript, ExportResultSchema);

    if (isScriptSuccess(projectResult)) {
      const projData = projectResult.data as { data?: unknown; count?: number };
      const projectFile = path.join(outputDirectory, `projects.${format}`);
      const projectCount = projData.count || 0;

      const ppayload = projData.data;
      const pwrite = typeof ppayload === 'string' ? ppayload : JSON.stringify(ppayload, null, 2);
      const fsSync = await import('fs');
      fsSync.writeFileSync(projectFile, pwrite, 'utf-8');

      exports.projects = { format, project_count: projectCount, exported: true };
      totalExported += projectCount;
    }

    // Export tags (JSON only) via AST builder
    const tagGeneratedScript = buildTagsScript({
      mode: 'basic' as TagQueryMode,
      includeEmpty: true,
      sortBy: 'name' as TagSortBy,
    });
    const tagResult = await this.execJson(tagGeneratedScript.script, TAG_LIST_SCHEMA);

    if (isScriptSuccess(tagResult)) {
      const tagEnvelope = tagResult.data as { items?: unknown[]; summary?: { total?: number } };
      const tagItems = tagEnvelope.items || [];
      const tagCount = tagEnvelope.summary?.total ?? tagItems.length;
      const tagFile = path.join(outputDirectory, 'tags.json');

      const fsSync = await import('fs');
      fsSync.writeFileSync(tagFile, JSON.stringify(tagItems, null, 2), 'utf-8');

      exports.tags = { format: 'json', tag_count: tagCount, exported: true };
      totalExported += tagCount;
    }

    return createSuccessResponseV2(
      'export',
      {
        format,
        exportType: 'bulk' as const,
        data: exports,
        count: totalExported,
        exports,
        summary: { totalExported, export_date: new Date().toISOString() },
      },
      undefined,
      { ...timer.toMetadata(), operation: 'all' },
    );
  }
}
