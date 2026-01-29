import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { ReadSchema, type ReadInput } from './schemas/read-schema.js';
import { QueryCompiler, type CompiledQuery } from './compilers/QueryCompiler.js';
import type { TaskFilter } from '../../contracts/filters.js';
import { QueryTasksTool } from '../tasks/QueryTasksTool.js';
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
  private tasksTool: QueryTasksTool;
  private projectsTool: ProjectsTool;
  private tagsTool: TagsTool;
  private perspectivesTool: PerspectivesTool;
  private foldersTool: FoldersTool;
  private exportTool: ExportTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new QueryCompiler();

    // Instantiate existing tools for routing
    this.tasksTool = new QueryTasksTool(cache);
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
    // Map compiled query to existing tasks tool parameters
    const tasksArgs: Record<string, unknown> = {
      mode: compiled.mode,
      limit: compiled.limit || 25,
      offset: compiled.offset,
      fields: compiled.fields,
      sort: compiled.sort,
      countOnly: compiled.countOnly,
      response_format: 'json', // Optimized for LLM token efficiency
    };

    // Map ID filter (exact match)
    if (compiled.filters.id) {
      tasksArgs.id = compiled.filters.id;
    }

    // Special case: inInbox means inbox mode (transformed from project: null)
    if (compiled.filters.inInbox) {
      tasksArgs.mode = 'inbox';
    } else if (compiled.filters.projectId) {
      tasksArgs.project = compiled.filters.projectId;
    }

    // Map filters to existing parameters (already transformed by QueryCompiler)
    if (compiled.filters.completed !== undefined) tasksArgs.completed = compiled.filters.completed;

    // Map search filter (from name filter transformation)
    // This enables mode:"search" with filters:{name:{contains:"..."}}
    if (compiled.filters.search) tasksArgs.search = compiled.filters.search;

    // REMOVED: Simple tags parameter - all tag filters now use advanced filters
    // This fixes Bug #1: tags.any not working (was being passed as simple array)

    // Use advanced filters for complex queries
    // ALL tag filters (any/all/none) now use advanced filters for consistency
    if (this.needsAdvancedFilters(compiled.filters)) {
      tasksArgs.filters = this.mapToAdvancedFilters(compiled.filters);
    }

    return this.tasksTool.execute(tasksArgs);
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

  private needsAdvancedFilters(filters: TaskFilter): boolean {
    // TaskFilter already has transformed properties
    return Boolean(
      filters.tags || // Tags are now string[] with tagsOperator
      filters.dueBefore ||
      filters.dueAfter ||
      filters.deferBefore ||
      filters.deferAfter ||
      filters.flagged !== undefined ||
      filters.blocked !== undefined ||
      filters.available !== undefined ||
      filters.text,
    );
  }

  private mapToAdvancedFilters(filters: TaskFilter): Record<string, unknown> {
    // Map TaskFilter to existing advanced filter structure for backend tools
    const advanced: Record<string, unknown> = {};

    // Tags are already transformed: tags: string[], tagsOperator: 'AND' | 'OR' | 'NOT_IN'
    if (filters.tags && filters.tags.length > 0) {
      advanced.tags = {
        operator: filters.tagsOperator || 'AND',
        values: filters.tags,
      };
    }

    // Due date filters (already transformed to dueBefore/dueAfter)
    if (filters.dueBefore || filters.dueAfter) {
      if (filters.dueDateOperator === 'BETWEEN' && filters.dueAfter && filters.dueBefore) {
        advanced.dueDate = {
          operator: 'BETWEEN',
          value: filters.dueAfter,
          upperBound: filters.dueBefore,
        };
      } else if (filters.dueBefore) {
        advanced.dueDate = { operator: '<=', value: filters.dueBefore };
      } else if (filters.dueAfter) {
        advanced.dueDate = { operator: '>=', value: filters.dueAfter };
      }
    }

    // Boolean filters (direct passthrough)
    if (filters.flagged !== undefined) {
      advanced.flagged = filters.flagged;
    }
    if (filters.blocked !== undefined) {
      advanced.blocked = filters.blocked;
    }
    if (filters.available !== undefined) {
      advanced.available = filters.available;
    }

    // Text search filters (already transformed: text is string, textOperator is operator)
    if (filters.text) {
      advanced.text = {
        operator: filters.textOperator || 'CONTAINS',
        value: filters.text,
      };
    }

    // Note: OR/AND/NOT are handled by QueryCompiler.transformFilters()
    // and don't appear in the TaskFilter output (they're flattened/logged)

    return advanced;
  }
}
