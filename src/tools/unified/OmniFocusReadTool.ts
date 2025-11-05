import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { ReadSchema, type ReadInput } from './schemas/read-schema.js';
import { QueryCompiler } from './compilers/QueryCompiler.js';
import { QueryTasksToolV2 } from '../tasks/QueryTasksToolV2.js';
import { ProjectsToolV2 } from '../projects/ProjectsToolV2.js';
import { TagsToolV2 } from '../tags/TagsToolV2.js';
import { PerspectivesToolV2 } from '../perspectives/PerspectivesToolV2.js';
import { FoldersTool } from '../folders/FoldersTool.js';

export class OmniFocusReadTool extends BaseTool<typeof ReadSchema, any> {
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
    stability: 'experimental' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['unified', 'builder', 'read', 'query'],
    capabilities: ['tasks', 'projects', 'tags', 'perspectives', 'folders', 'smart_suggest'],
  };

  private compiler: QueryCompiler;
  private tasksTool: QueryTasksToolV2;
  private projectsTool: ProjectsToolV2;
  private tagsTool: TagsToolV2;
  private perspectivesTool: PerspectivesToolV2;
  private foldersTool: FoldersTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new QueryCompiler();

    // Instantiate existing tools for routing
    this.tasksTool = new QueryTasksToolV2(cache);
    this.projectsTool = new ProjectsToolV2(cache);
    this.tagsTool = new TagsToolV2(cache);
    this.perspectivesTool = new PerspectivesToolV2(cache);
    this.foldersTool = new FoldersTool(cache);
  }

  async executeValidated(args: ReadInput): Promise<any> {
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
      default:
        throw new Error(`Unsupported query type: ${compiled.type}`);
    }
  }

  private async routeToTasksTool(compiled: any): Promise<any> {
    // Map compiled query to existing tasks tool parameters
    const tasksArgs: any = {
      mode: compiled.mode,
      limit: compiled.limit || 25,
      fields: compiled.fields,
      sort: compiled.sort,
    };

    // Special case: project: null means inbox mode
    if (compiled.filters.project === null) {
      tasksArgs.mode = 'inbox';
    } else if (compiled.filters.project) {
      tasksArgs.project = compiled.filters.project;
    }

    // Map filters to existing parameters
    if (compiled.filters.status) tasksArgs.completed = compiled.filters.status === 'completed';
    if (compiled.filters.tags) tasksArgs.tags = this.extractSimpleTags(compiled.filters.tags);

    // Use advanced filters for complex queries (including flagged)
    if (this.needsAdvancedFilters(compiled.filters)) {
      tasksArgs.filters = this.mapToAdvancedFilters(compiled.filters);
    }

    return this.tasksTool.execute(tasksArgs);
  }

  private async routeToProjectsTool(compiled: any): Promise<any> {
    const projectsArgs: any = {
      operation: 'list',
      includeCompleted: compiled.filters?.status === 'completed',
    };

    if (compiled.filters?.folder) projectsArgs.folder = compiled.filters.folder;
    if (compiled.filters?.tags) projectsArgs.tags = this.extractSimpleTags(compiled.filters.tags);

    return this.projectsTool.execute(projectsArgs);
  }

  private async routeToTagsTool(_compiled: any): Promise<any> {
    return this.tagsTool.execute({ operation: 'list' });
  }

  private async routeToPerspectivesTool(_compiled: any): Promise<any> {
    return this.perspectivesTool.execute({ operation: 'list' });
  }

  private async routeToFoldersTool(_compiled: any): Promise<any> {
    return this.foldersTool.execute({ operation: 'list' });
  }

  private extractSimpleTags(tagFilter: any): string[] | undefined {
    if (tagFilter.any) return tagFilter.any;
    if (tagFilter.all) return tagFilter.all;
    return undefined;
  }

  private needsAdvancedFilters(filters: any): boolean {
    return Boolean(
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
      filters.NOT
    );
  }

  private mapToAdvancedFilters(filters: any): any {
    // Map builder filters to existing advanced filter structure
    const advanced: any = {};

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
      if (filters.dueDate.before) {
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

    // Handle OR/AND/NOT recursively if needed
    if (filters.OR) {
      advanced.OR = filters.OR.map((f: any) => this.mapToAdvancedFilters(f));
    }

    return advanced;
  }
}
