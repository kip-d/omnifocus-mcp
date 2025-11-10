import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { ReadSchema, type ReadInput } from './schemas/read-schema.js';
import { QueryCompiler, type CompiledQuery, type QueryFilter } from './compilers/QueryCompiler.js';
import { QueryTasksTool } from '../tasks/QueryTasksTool.js';
import { ProjectsTool } from '../projects/ProjectsTool.js';
import { TagsTool } from '../tags/TagsTool.js';
import { PerspectivesTool } from '../perspectives/PerspectivesTool.js';
import { FoldersTool } from '../folders/FoldersTool.js';

export class OmniFocusReadTool extends BaseTool<typeof ReadSchema, unknown> {
  name = 'omnifocus_read';
  description = `Query OmniFocus data with flexible filtering. Returns tasks, projects, tags, perspectives, or folders.

COMMON QUERIES:
- Inbox: { query: { type: "tasks", filters: { project: null } } }
- Overdue: { query: { type: "tasks", filters: { dueDate: { before: "now" }, status: "active" } } }
- Smart suggestions: { query: { type: "tasks", mode: "smart_suggest", limit: 10 } }

FILTER OPERATORS:
- tags: { any: [...] } (has any), { all: [...] } (has all), { none: [...] } (has none)
- dates: { before: "YYYY-MM-DD" }, { after: "..." }, { between: ["...", "..."] }
- text: { contains: "..." }, { matches: "regex" }
- logic: { OR: [...] }, { AND: [...] }, { NOT: {...} }

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
    tags: ['unified', 'read', 'query'],
    capabilities: ['tasks', 'projects', 'tags', 'perspectives', 'folders', 'smart_suggest'],
  };

  private compiler: QueryCompiler;
  private tasksTool: QueryTasksTool;
  private projectsTool: ProjectsTool;
  private tagsTool: TagsTool;
  private perspectivesTool: PerspectivesTool;
  private foldersTool: FoldersTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new QueryCompiler();

    // Instantiate existing tools for routing
    this.tasksTool = new QueryTasksTool(cache);
    this.projectsTool = new ProjectsTool(cache);
    this.tagsTool = new TagsTool(cache);
    this.perspectivesTool = new PerspectivesTool(cache);
    this.foldersTool = new FoldersTool(cache);
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
      fields: compiled.fields,
      sort: compiled.sort,
    };

    // Map ID filter (exact match)
    if (compiled.filters.id) {
      tasksArgs.id = compiled.filters.id;
    }

    // Special case: project: null means inbox mode
    if (compiled.filters.project === null) {
      tasksArgs.mode = 'inbox';
    } else if (compiled.filters.project) {
      tasksArgs.project = compiled.filters.project;
    }

    // Map filters to existing parameters
    if (compiled.filters.status) tasksArgs.completed = compiled.filters.status === 'completed';

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
      includeCompleted: compiled.filters.status === 'completed',
    };

    if (compiled.filters.folder) projectsArgs.folder = compiled.filters.folder;
    if (compiled.filters.tags) projectsArgs.tags = this.extractSimpleTags(compiled.filters.tags);

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

  private extractSimpleTags(tagFilter: QueryFilter['tags']): string[] | undefined {
    if (!tagFilter) return undefined;
    if (tagFilter.any) return tagFilter.any;
    if (tagFilter.all) return tagFilter.all;
    return undefined;
  }

  private needsAdvancedFilters(filters: QueryFilter): boolean {
    return Boolean(
      filters.tags?.any ||   // Bug fix: tags.any now uses advanced filters
      filters.tags?.all ||
      filters.tags?.none ||
      filters.dueDate ||
      filters.deferDate ||
      filters.flagged !== undefined ||
      filters.blocked !== undefined ||
      filters.available !== undefined ||
      filters.text ||
      filters.OR ||
      filters.AND ||
      filters.NOT,
    );
  }

  private mapToAdvancedFilters(filters: QueryFilter): Record<string, unknown> {
    // Map builder filters to existing advanced filter structure
    const advanced: Record<string, unknown> = {};

    if (filters.tags) {
      if (filters.tags.any) {
        advanced.tags = { operator: 'OR', values: filters.tags.any };
      } else if (filters.tags.all) {
        advanced.tags = { operator: 'AND', values: filters.tags.all };
      } else if (filters.tags.none) {
        advanced.tags = { operator: 'NOT_IN', values: filters.tags.none };
      }
    }

    if (filters.dueDate) {
      // Handle date ranges with BETWEEN operator when both before and after are specified
      if (filters.dueDate.before && filters.dueDate.after) {
        advanced.dueDate = {
          operator: 'BETWEEN',
          value: filters.dueDate.after,
          upperBound: filters.dueDate.before,
        };
      } else if (filters.dueDate.before) {
        advanced.dueDate = { operator: '<=', value: filters.dueDate.before };
      } else if (filters.dueDate.after) {
        advanced.dueDate = { operator: '>=', value: filters.dueDate.after };
      }
    }

    // Boolean filters
    if (filters.flagged !== undefined) {
      advanced.flagged = filters.flagged;
    }
    if (filters.blocked !== undefined) {
      advanced.blocked = filters.blocked;
    }
    if (filters.available !== undefined) {
      advanced.available = filters.available;
    }

    // Text search filters (Bug fix #2: text filter mapping)
    if (filters.text) {
      if (filters.text.contains) {
        advanced.text = { operator: 'CONTAINS', value: filters.text.contains };
      } else if (filters.text.matches) {
        advanced.text = { operator: 'MATCHES', value: filters.text.matches };
      }
    }

    // Handle OR/AND/NOT logic
    if (filters.OR) {
      advanced.OR = filters.OR.map((f: QueryFilter) => this.mapToAdvancedFilters(f));
    }

    // AND filters: Since QueryTasksTool implicitly ANDs all filters together,
    // flatten the AND array by merging all sub-filters into the parent object
    if (filters.AND) {
      for (const subFilter of filters.AND) {
        const mapped = this.mapToAdvancedFilters(subFilter);
        Object.assign(advanced, mapped);
      }
    }

    if (filters.NOT) {
      advanced.NOT = this.mapToAdvancedFilters(filters.NOT);
    }

    return advanced;
  }
}
