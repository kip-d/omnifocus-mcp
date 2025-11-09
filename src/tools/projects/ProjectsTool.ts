import { z } from 'zod';
import { BaseTool } from '../base.js';
import { LIST_PROJECTS_SCRIPT } from '../../omnifocus/scripts/projects/list-projects.js';
import { WARM_PROJECTS_CACHE_WITH_STATS_SCRIPT } from '../../omnifocus/scripts/cache/warm-projects-cache-with-stats.js';
import { CREATE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects/create-project.js';
import { COMPLETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects/complete-project.js';
import { DELETE_PROJECT_SCRIPT } from '../../omnifocus/scripts/projects/delete-project.js';
import { GET_PROJECT_STATS_SCRIPT } from '../../omnifocus/scripts/projects/get-project-stats.js';
import { createUpdateProjectScript } from '../../omnifocus/scripts/projects/update-project.js';
import { isScriptSuccess, isScriptError } from '../../omnifocus/script-result-types.js';
import {
  createSuccessResponseV2,
  createErrorResponseV2,
  createListResponseV2,
  OperationTimerV2,
  normalizeBooleanInput,
  normalizeStringInput,
} from '../../utils/response-format.js';
import { ProjectsResponseV2, ProjectOperationResponseV2 } from '../response-types-v2.js';
import { CacheManager } from '../../cache/CacheManager.js';

// Unified schema for all project operations
const ProjectsToolSchemaV2 = z.object({
  // Operation selector
  operation: z.enum([
    'list',      // List/query projects
    'create',    // Create new project
    'update',    // Update existing project
    'complete',  // Mark project as done
    'delete',    // Delete project
    'review',    // Get projects needing review
    'active',    // Get active projects only
    'stats',     // Get accurate project statistics with available rates
  ]).describe('Operation to perform'),

  // For list/query operations
  status: z.enum(['active', 'on-hold', 'done', 'dropped', 'all']).optional()
    .describe('Filter by project status (for list operation)'),
  folder: z.string().optional().describe('Filter by folder name'),
  needsReview: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).optional().describe('Only show projects needing review'),

  // For create/update operations
  projectId: z.string().optional().describe('Project ID (required for update/complete/delete)'),
  name: z.string().optional().describe('Project name'),
  note: z.string().optional().describe('Project note/description'),
  dueDate: z.string().optional().describe('Due date in YYYY-MM-DD or "YYYY-MM-DD HH:mm" format'),
  reviewInterval: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).optional().describe('Review interval in days'),
  tags: z.array(z.string()).optional().describe('Tags to assign'),
  flagged: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).optional().describe('Mark as flagged/important'),

  // Response control - with type coercion for MCP bridge compatibility
  limit: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10)),
  ]).pipe(z.number().min(1).max(200)).default(50).describe('Maximum projects to return'),
  details: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1'),
  ]).default(true).describe('Include full project details'),
});

type ProjectsArgsV2 = z.infer<typeof ProjectsToolSchemaV2>;

export class ProjectsTool extends BaseTool<typeof ProjectsToolSchemaV2, ProjectsResponseV2 | ProjectOperationResponseV2> {
  constructor(cache: CacheManager) {
    super(cache);
  }
  name = 'projects';
  description = 'Manage OmniFocus projects. Operations: list (query projects), create, update, complete, delete, review (needing review), active (only active). Returns summary with key insights.';
  schema = ProjectsToolSchemaV2;
  meta = {
    // Phase 1: Essential metadata
    category: 'Organization' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['queries', 'mutations', 'organization', 'management'],
    capabilities: ['list', 'create', 'update', 'complete', 'delete', 'stats'],

    // Phase 2: Capability & Performance Documentation
    maxResults: 1000,
    maxQueryDuration: 3000, // 3 seconds
    requiresPermission: true,
    requiredCapabilities: ['read', 'write'],
    limitations: [
      'Maximum 1000 projects per query',
      'Projects cannot be renamed after creation (only available on create)',
      'Dropped projects cannot be undropped via API',
    ],
  };

  async executeValidated(args: ProjectsArgsV2): Promise<ProjectsResponseV2 | ProjectOperationResponseV2> {
    const timer = new OperationTimerV2();

    try {
      // Validate required fields early
      if (['update', 'complete', 'delete'].includes(args.operation) && !args.projectId) {
        return createErrorResponseV2(
          'projects',
          'MISSING_PARAMETER',
          `Operation "${args.operation}" requires projectId parameter`,
          'Use operation:"list" first to find the project ID',
          { provided_args: args },
          timer.toMetadata(),
        ) as unknown as ProjectsResponseV2;
      }
      if (args.operation === 'create' && !args.name) {
        return createErrorResponseV2(
          'projects',
          'MISSING_PARAMETER',
          'Create operation requires name parameter',
          'Add a name parameter with the project name',
          { provided_args: args },
          timer.toMetadata(),
        ) as unknown as ProjectOperationResponseV2;
      }

      // Normalize inputs
      const normalizedArgs = this.normalizeInputs(args);

      // Route to appropriate handler
      switch (normalizedArgs.operation) {
        case 'list':
          return this.handleListProjects(normalizedArgs, timer);
        case 'create':
          return this.handleCreateProject(normalizedArgs, timer);
        case 'update':
          return this.handleUpdateProject(normalizedArgs, timer);
        case 'complete':
          return this.handleCompleteProject(normalizedArgs, timer);
        case 'delete':
          return this.handleDeleteProject(normalizedArgs, timer);
        case 'review':
          return this.handleReviewProjects(normalizedArgs, timer);
        case 'active':
          return this.handleActiveProjects(normalizedArgs, timer);
        case 'stats':
          return this.handleProjectStats(normalizedArgs, timer);
        default:
          return createErrorResponseV2(
            'projects',
            'INVALID_OPERATION',
            `Invalid operation: ${String(normalizedArgs.operation)}`,
            'Use one of: list, create, update, complete, delete, review, active, stats',
            { provided: normalizedArgs.operation },
            timer.toMetadata(),
          ) as unknown as ProjectsResponseV2;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for specific OmniFocus errors first (following base tool pattern)
      if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
        return createErrorResponseV2(
          'projects',
          'OMNIFOCUS_NOT_RUNNING',
          'OmniFocus is not running or not accessible',
          'Start OmniFocus and ensure it is running',
          error,
          timer.toMetadata(),
        ) as unknown as ProjectsResponseV2;
      }

      if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
        return createErrorResponseV2(
          'projects',
          'PERMISSION_DENIED',
          'Permission denied: automation access required',
          'Enable automation access in System Settings > Privacy & Security > Automation',
          error,
          timer.toMetadata(),
        ) as unknown as ProjectsResponseV2;
      }

      // Provide helpful suggestions for other errors
      let suggestion = undefined;
      if (errorMessage.includes('projectId')) {
        suggestion = 'First use operation:"list" to find the project ID';
      } else if (errorMessage.includes('timeout')) {
        suggestion = 'Try reducing the limit or using status filter';
      }

      return createErrorResponseV2(
        'projects',
        'EXECUTION_ERROR',
        errorMessage,
        suggestion,
        error,
        timer.toMetadata(),
      ) as unknown as ProjectsResponseV2;
    }
  }

  private getSpecificErrorResponse(error: unknown, _operation: string, timer: OperationTimerV2): ProjectsResponseV2 | null {
    const errorMessage = error && typeof error === 'object' && 'error' in error
      ? String(error.error)
      : String(error);

    // Check for permission errors
    if (errorMessage.includes('1743') || errorMessage.includes('Not allowed to send Apple events')) {
      return createErrorResponseV2(
        'projects',
        'PERMISSION_DENIED',
        'Permission denied: automation access required',
        'Enable automation access in System Settings > Privacy & Security > Automation',
        error,
        timer.toMetadata(),
      ) as unknown as ProjectsResponseV2;
    }

    // Check for OmniFocus not running
    if (errorMessage.includes('not running') || errorMessage.includes("can't find process")) {
      return createErrorResponseV2(
        'projects',
        'OMNIFOCUS_NOT_RUNNING',
        'OmniFocus is not running or not accessible',
        'Start OmniFocus and ensure it is running',
        error,
        timer.toMetadata(),
      ) as unknown as ProjectsResponseV2;
    }

    return null; // No specific error detected
  }

  private normalizeInputs(args: ProjectsArgsV2): ProjectsArgsV2 {
    const normalized = { ...args };

    // Don't normalize dates - pass them through as strings to the script
    // The OmniFocus script handles date parsing with new Date(dateString)
    // Converting to ISO string causes "Can't convert types" errors

    // Normalize booleans
    if (normalized.flagged !== undefined) {
      const bool = normalizeBooleanInput(normalized.flagged);
      if (bool !== null) normalized.flagged = bool;
    }
    if (normalized.needsReview !== undefined) {
      const bool = normalizeBooleanInput(normalized.needsReview);
      if (bool !== null) normalized.needsReview = bool;
    }

    // Normalize strings
    if (normalized.name) {
      normalized.name = normalizeStringInput(normalized.name) || undefined;
    }
    if (normalized.projectId) {
      normalized.projectId = normalizeStringInput(normalized.projectId) || undefined;
    }

    // Note: Required field validation now happens in executeValidated before normalization

    return normalized;
  }

  private async handleListProjects(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectsResponseV2> {
    const filter: {
      limit?: number;
      includeDropped?: boolean;
      status?: string;
      folder?: string;
    } = {
      limit: args.limit,
      includeDropped: args.status === 'all' || args.status === 'dropped',
    };

    // Add status filter
    if (args.status && args.status !== 'all') {
      filter.status = args.status;
    }

    // Add folder filter
    if (args.folder) {
      filter.folder = args.folder;
    }

    // Use simple cache keys that match cache warming
    // This ensures cache hits for common queries
    const cacheKey = args.status === 'active' && !args.folder
      ? 'projects_active'  // Matches cache warming key
      : `projects_list_${JSON.stringify(filter)}`;

    // Check cache
    const cached = this.cache.get<{ projects: unknown[] }>('projects', cacheKey);
    if (cached) {
      return createListResponseV2(
        'projects',
        cached.projects,
        'projects',
        { ...timer.toMetadata(), from_cache: true, operation: 'list' },
      ) as unknown as ProjectsResponseV2;
    }

    // Execute query
    // Use fast OmniJS bridge when stats are needed (100-200x faster than JXA)
    const includeStats = args.details !== undefined ? args.details : false;
    const script = includeStats && !args.folder
      ? this.omniAutomation.buildScript(WARM_PROJECTS_CACHE_WITH_STATS_SCRIPT, {
          filterStatus: filter.status || 'active',
          limit: args.limit || 50,
          includeStats: true,
        })
      : this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
          filter,
          limit: args.limit || 10,
          includeStats: false, // LIST_PROJECTS_SCRIPT uses slow JXA for stats
        });
    const result = await this.execJson(script);
    if (isScriptError(result)) {
      // Check for specific error types first
      const specificError = this.getSpecificErrorResponse(result, 'list', timer);
      if (specificError) {
        return specificError;
      }

      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result.error || 'Script execution failed',
        'Check if OmniFocus is running',
        result.details,
        timer.toMetadata(),
      );
    }

    // Parse dates and cache
    const resultData = result.data as { projects?: unknown[]; items?: unknown[] };
    const projects = this.parseProjects(resultData.projects || resultData.items || result.data);
    this.cache.set('projects', cacheKey, { projects });

    return createListResponseV2(
      'projects',
      projects,
      'projects',
      { ...timer.toMetadata(), from_cache: false, operation: 'list' },
    ) as unknown as ProjectsResponseV2;
  }

  private async handleCreateProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectOperationResponseV2> {
    if (!args.name) {
      return createErrorResponseV2(
        'projects',
        'MISSING_PARAMETER',
        'Project name is required',
        'Add a name parameter with the project name',
        { provided_args: args },
        timer.toMetadata(),
      );
    }

    const projectData: {
      note?: string;
      dueDate?: string;
      flagged?: boolean;
      tags?: string[];
      sequential: boolean;
      reviewInterval?: {
        unit: string;
        steps: number;
        fixed: boolean;
      };
    } = {
      note: args.note,
      dueDate: args.dueDate,
      flagged: args.flagged,
      tags: args.tags,
      sequential: false, // Default to parallel
    };

    // Convert reviewInterval from days (number) to object format expected by script
    if (args.reviewInterval) {
      projectData.reviewInterval = {
        unit: 'days',
        steps: args.reviewInterval,
        fixed: true, // Use fixed scheduling by default
      };
    }

    // Execute creation - CREATE_PROJECT_SCRIPT expects {name, options} structure
    const script = this.omniAutomation.buildScript(CREATE_PROJECT_SCRIPT, {
      name: args.name,
      options: projectData,
    });
    const result = await this.execJson(script);
    if (isScriptError(result)) {
      // Check for specific error types first
      const specificError = this.getSpecificErrorResponse(result, 'create', timer);
      if (specificError) {
        return specificError as unknown as ProjectOperationResponseV2;
      }

      return createErrorResponseV2(
        'projects',
        'CREATE_FAILED',
        result.error || 'Script execution failed',
        'Check the project name and try again',
        result.details,
        timer.toMetadata(),
      );
    }

    // Invalidate cache
    this.cache.invalidate('projects');

    return createSuccessResponseV2(
      'projects',
      { project: result.data, operation: 'create' },
      undefined, // No summary for create operation
      { ...timer.toMetadata(), operation: 'create' },
    ) as unknown as ProjectOperationResponseV2;
  }

  private async handleUpdateProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectOperationResponseV2> {
    if (!args.projectId) {
      return createErrorResponseV2(
        'projects',
        'MISSING_PARAMETER',
        'Project ID is required for update',
        'Use operation:"list" first to find the project ID',
        { provided_args: args },
        timer.toMetadata(),
      );
    }

    // Dynamic update object that matches OmniFocus script expectations
    const updates: {
      name?: string;
      note?: string;
      dueDate?: string;
      flagged?: boolean;
      tags?: string[];
      reviewInterval?: {
        unit: string;
        steps: number;
        fixed: boolean;
      } | number;
      status?: string;
    } = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.note !== undefined) updates.note = args.note;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    // Ensure flagged is a boolean, not a string
    if (args.flagged !== undefined) {
      updates.flagged = typeof args.flagged === 'boolean' ? args.flagged : args.flagged === 'true' || args.flagged === true;
    }
    if (args.tags !== undefined) updates.tags = args.tags;

    // Convert reviewInterval to proper format if provided as a number (days)
    if (args.reviewInterval !== undefined) {
      if (typeof args.reviewInterval === 'number') {
        updates.reviewInterval = {
          unit: 'days',
          steps: args.reviewInterval,
          fixed: true,
        };
      } else {
        updates.reviewInterval = args.reviewInterval;
      }
    }

    if (args.status !== undefined) updates.status = args.status;

    // Execute update using new function argument approach with schema validation
    const script = createUpdateProjectScript(args.projectId!, updates);
    const result = await this.execJson(script);
    if (isScriptError(result)) {
      return createErrorResponseV2(
        'projects',
        'UPDATE_FAILED',
        result.error || 'Failed to update project',
        'Check the project ID and try again',
        result.details,
        timer.toMetadata(),
      );
    }

    // Smart cache invalidation - specific project update
    this.cache.invalidateProject(args.projectId);

    const updated = result.data;
    return createSuccessResponseV2(
      'projects',
      {
        operation: 'update',
        project: (updated && (updated as { project?: unknown }).project) ? (updated as { project: unknown }).project : updated,
      },
      undefined,
      { ...timer.toMetadata(), operation: 'update' },
    ) as unknown as ProjectOperationResponseV2;
  }

  private async handleCompleteProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectOperationResponseV2> {
    if (!args.projectId) {
      return createErrorResponseV2(
        'projects',
        'MISSING_PARAMETER',
        'Project ID is required',
        'Use operation:"list" first to find the project ID',
        { provided_args: args },
        timer.toMetadata(),
      );
    }

    // Execute completion
    const script = this.omniAutomation.buildScript(COMPLETE_PROJECT_SCRIPT, {
      projectId: args.projectId,
      completeAllTasks: false, // Default to not completing all tasks
    });

    const result = await this.execJson(script);
    if (isScriptError(result)) {
      return createErrorResponseV2(
        'projects',
        'COMPLETE_FAILED',
        result.error || 'Script execution failed',
        'Check the project ID and ensure it\'s not already completed',
        result.details,
        timer.toMetadata(),
      );
    }

    // Smart cache invalidation - completing project affects its tasks
    this.cache.invalidateProject(args.projectId!);
    this.cache.invalidate('analytics'); // Affects completion stats

    return createSuccessResponseV2(
      'projects',
      { project: result.data, operation: 'complete' },
      undefined, // No summary for complete operation
      { ...timer.toMetadata(), operation: 'complete' },
    ) as unknown as ProjectOperationResponseV2;
  }

  private async handleDeleteProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectOperationResponseV2> {
    if (!args.projectId) {
      return createErrorResponseV2(
        'projects',
        'MISSING_PARAMETER',
        'Project ID is required',
        'Use operation:"list" first to find the project ID',
        { provided_args: args },
        timer.toMetadata(),
      );
    }

    // Execute deletion
    const script = this.omniAutomation.buildScript(DELETE_PROJECT_SCRIPT, {
      projectId: args.projectId,
      deleteTasks: false, // Don't delete tasks, move them to inbox
    });

    const result = await this.execJson(script);
    if (isScriptError(result)) {
      return createErrorResponseV2(
        'projects',
        'DELETE_FAILED',
        result.error || 'Script execution failed',
        'Check the project ID and permissions',
        result.details,
        timer.toMetadata(),
      );
    }

    // Smart cache invalidation - deleting project affects its tasks
    this.cache.invalidateProject(args.projectId!);
    this.cache.invalidate('analytics'); // Affects project stats

    return createSuccessResponseV2(
      'projects',
      { project: { deleted: true }, operation: 'delete' },
      undefined, // No summary for delete operation
      { ...timer.toMetadata(), operation: 'delete' },
    ) as unknown as ProjectOperationResponseV2;
  }


  private async handleReviewProjects(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectsResponseV2> {
    // Get projects needing review
    const filter = {
      needsReview: true,
      limit: args.limit,
    };

    const cacheKey = 'projects_review';

    // Check cache
    const cached = this.cache.get<{ projects: unknown[] }>('projects', cacheKey);
    if (cached) {
      return createListResponseV2(
        'projects',
        cached.projects,
        'projects',
        { ...timer.toMetadata(), from_cache: true, operation: 'review' },
      ) as unknown as ProjectsResponseV2;
    }

    // Execute query - review lists typically don't need stats
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
      filter,
      limit: args.limit || 10,
      includeStats: false, // Review lists don't need expensive stats
    });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result.error,
        undefined,
        result.details,
        timer.toMetadata(),
      );
    }

    // Filter for review and cache
    const resultData = result.data as { projects?: unknown[]; items?: unknown[] };
    const projects = this.parseProjects(resultData.projects || resultData.items || result.data);
    const needingReview = projects.filter(p => {
      const project = p as { nextReviewDate?: string };
      if (!project.nextReviewDate) return false;
      return new Date(project.nextReviewDate) < new Date();
    });

    this.cache.set('projects', cacheKey, { projects: needingReview });

    return createListResponseV2(
      'projects',
      needingReview,
      'projects',
      { ...timer.toMetadata(), from_cache: false, operation: 'review' },
    ) as unknown as ProjectsResponseV2;
  }

  private async handleActiveProjects(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectsResponseV2> {
    const filter = {
      status: 'active',
      limit: args.limit,
    };

    const cacheKey = 'projects_active';

    // Check cache
    const cached = this.cache.get<{ projects: unknown[] }>('projects', cacheKey);
    if (cached) {
      return createListResponseV2(
        'projects',
        cached.projects,
        'projects',
        { ...timer.toMetadata(), from_cache: true, operation: 'active' },
      ) as unknown as ProjectsResponseV2;
    }

    // Execute query
    // Use fast OmniJS bridge when stats are needed (100-200x faster than JXA)
    const includeStats = args.details !== undefined ? args.details : false;
    const script = includeStats
      ? this.omniAutomation.buildScript(WARM_PROJECTS_CACHE_WITH_STATS_SCRIPT, {
          filterStatus: 'active',
          limit: args.limit || 50,
          includeStats: true,
        })
      : this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
          filter,
          limit: args.limit || 10,
          includeStats: false,
        });
    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result.error,
        undefined,
        result.details,
        timer.toMetadata(),
      );
    }

    // Parse and cache
    const resultData = result.data as { projects?: unknown[]; items?: unknown[] };
    const projects = this.parseProjects(resultData.projects || resultData.items || result.data);
    this.cache.set('projects', cacheKey, { projects });

    return createListResponseV2(
      'projects',
      projects,
      'projects',
      { ...timer.toMetadata(), from_cache: false, operation: 'active' },
    ) as unknown as ProjectsResponseV2;
  }

  private async handleProjectStats(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<ProjectsResponseV2> {
    const cacheKey = `projects_stats_${args.projectId || 'all'}`;

    // Check cache
    const cached = this.cache.get<{ projects: unknown[] }>('projects', cacheKey);
    if (cached) {
      return createSuccessResponseV2(
        'projects',
        { projects: cached },
        undefined, // No summary for stats operation
        { ...timer.toMetadata(), from_cache: true, operation: 'stats' },
      ) as unknown as ProjectsResponseV2;
    }

    // Execute the V3 stats script with OmniJS
    const script = this.omniAutomation.buildScript(GET_PROJECT_STATS_SCRIPT, {
      options: {
        projectId: args.projectId,
        limit: args.limit || 200,
      },
    });

    const result = await this.execJson(script);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result.error,
        'Check if OmniFocus is running',
        result.details,
        timer.toMetadata(),
      );
    }

    // Cache the result
    this.cache.set('projects', cacheKey, result.data);

    return createSuccessResponseV2(
      'projects',
      { projects: result.data as unknown as unknown[] },
      undefined, // No summary for stats operation
      { ...timer.toMetadata(), from_cache: false, operation: 'stats' },
    ) as unknown as ProjectsResponseV2;
  }

  private parseProjects(projects: unknown): unknown[] {
    if (!Array.isArray(projects)) return [];

    return projects.map((project: unknown) => {
      const projectRecord = project as Record<string, unknown>;
      return {
        ...projectRecord,
        dueDate: projectRecord.dueDate ? new Date(projectRecord.dueDate as string) : undefined,
        completionDate: projectRecord.completionDate ? new Date(projectRecord.completionDate as string) : undefined,
        nextReviewDate: projectRecord.nextReviewDate ? new Date(projectRecord.nextReviewDate as string) : undefined,
        lastReviewDate: projectRecord.lastReviewDate ? new Date(projectRecord.lastReviewDate as string) : undefined,
      };
    });
  }
}
