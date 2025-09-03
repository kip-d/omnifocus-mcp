import { z } from 'zod';
import { BaseTool } from '../base.js';
import {
  LIST_PROJECTS_SCRIPT,
  CREATE_PROJECT_SCRIPT,
  COMPLETE_PROJECT_SCRIPT,
  DELETE_PROJECT_SCRIPT,
  GET_PROJECT_STATS_SCRIPT,
} from '../../omnifocus/scripts/projects.js';
import { createUpdateProjectScript } from '../../omnifocus/scripts/projects/update-project.js';
import { isScriptSuccess, ProjectUpdateResultSchema } from '../../omnifocus/script-result-types.js';
import {
  createSuccessResponseV2,
  createErrorResponseV2,
  createListResponseV2,
  OperationTimerV2,
  normalizeBooleanInput,
  normalizeStringInput,
} from '../../utils/response-format-v2.js';
import { ProjectsResponseV2, ProjectOperationResponseV2 } from '../response-types-v2.js';

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

export class ProjectsToolV2 extends BaseTool<typeof ProjectsToolSchemaV2, ProjectsResponseV2 | ProjectOperationResponseV2> {
  name = 'projects';
  description = 'Manage OmniFocus projects. Operations: list (query projects), create, update, complete, delete, review (needing review), active (only active). Returns summary with key insights.';
  schema = ProjectsToolSchemaV2;

  async executeValidated(args: ProjectsArgsV2): Promise<ProjectsResponseV2 | ProjectOperationResponseV2> {
    const timer = new OperationTimerV2();

    try {
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
          ) as ProjectsResponseV2;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide helpful suggestions
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
      ) as ProjectsResponseV2;
    }
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

    // Validate required fields for operations
    if (['update', 'complete', 'delete'].includes(normalized.operation) && !normalized.projectId) {
      throw new Error(`Operation "${normalized.operation}" requires projectId parameter`);
    }
    if (normalized.operation === 'create' && !normalized.name) {
      throw new Error('Create operation requires name parameter');
    }

    return normalized;
  }

  private async handleListProjects(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
    const filter: any = {
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

    const cacheKey = `projects_list_${JSON.stringify(filter)}`;

    // Check cache
    const cached = this.cache.get<any>('projects', cacheKey);
    if (cached) {
      return createListResponseV2(
        'projects',
        cached.projects,
        'projects',
        { ...timer.toMetadata(), from_cache: true, operation: 'list' },
      );
    }

    // Execute query
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
      filter,
      limit: args.limit || 10,
      includeStats: args.details !== undefined ? args.details : true,
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result?.message || 'Failed to list projects',
        'Check if OmniFocus is running',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Parse dates and cache
    const projects = this.parseProjects(result.projects || result);
    this.cache.set('projects', cacheKey, { projects });

    return createListResponseV2(
      'projects',
      projects,
      'projects',
      { ...timer.toMetadata(), from_cache: false, operation: 'list' },
    );
  }

  private async handleCreateProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
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

    const projectData: any = {
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
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'CREATE_FAILED',
        result?.message || 'Failed to create project',
        'Check the project name and try again',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Invalidate cache
    this.cache.invalidate('projects');

    return createSuccessResponseV2(
      'projects',
      { project: result },
      undefined, // No summary for create operation
      { ...timer.toMetadata(), operation: 'create' },
    );
  }

  private async handleUpdateProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
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

    const updates: any = {};
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
    const result = await this.omniAutomation.executeJson(script, ProjectUpdateResultSchema);

    if (!isScriptSuccess(result)) {
      return createErrorResponseV2(
        'projects',
        'UPDATE_FAILED',
        result.error || 'Failed to update project',
        'Check the project ID and try again',
        result.details,
        timer.toMetadata(),
      );
    }

    // Invalidate cache
    this.cache.invalidate('projects');

    return createSuccessResponseV2(
      'projects',
      {
        operation: result.data,
        project: result.data.project, // Extract project details for response
      },
      undefined,
      { ...timer.toMetadata(), operation: 'update' },
    );
  }

  private async handleCompleteProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
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

    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'COMPLETE_FAILED',
        result?.message || 'Failed to complete project',
        'Check the project ID and ensure it\'s not already completed',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Invalidate cache
    this.cache.invalidate('projects');
    this.cache.invalidate('tasks'); // Completing project affects tasks too

    return createSuccessResponseV2(
      'projects',
      { project: result },
      undefined, // No summary for complete operation
      { ...timer.toMetadata(), operation: 'complete' },
    );
  }

  private async handleDeleteProject(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
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

    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'DELETE_FAILED',
        result?.message || 'Failed to delete project',
        'Check the project ID and permissions',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Invalidate cache
    this.cache.invalidate('projects');
    this.cache.invalidate('tasks');

    return createSuccessResponseV2(
      'projects',
      { deleted: true },
      undefined, // No summary for delete operation
      { ...timer.toMetadata(), operation: 'delete' },
    );
  }

  private async handleReviewProjects(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
    // Get projects needing review
    const filter = {
      needsReview: true,
      limit: args.limit,
    };

    const cacheKey = 'projects_review';

    // Check cache
    const cached = this.cache.get<any>('projects', cacheKey);
    if (cached) {
      return createListResponseV2(
        'projects',
        cached.projects,
        'projects',
        { ...timer.toMetadata(), from_cache: true, operation: 'review' },
      );
    }

    // Execute query
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
      filter,
      limit: args.limit || 10,
      includeStats: args.details !== undefined ? args.details : true,
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result?.message || 'Failed to get projects for review',
        undefined,
        result?.details,
        timer.toMetadata(),
      );
    }

    // Filter for review and cache
    const projects = this.parseProjects(result.projects || result);
    const needingReview = projects.filter(p => {
      if (!p.nextReviewDate) return false;
      return new Date(p.nextReviewDate) < new Date();
    });

    this.cache.set('projects', cacheKey, { projects: needingReview });

    return createListResponseV2(
      'projects',
      needingReview,
      'projects',
      { ...timer.toMetadata(), from_cache: false, operation: 'review' },
    );
  }

  private async handleActiveProjects(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
    const filter = {
      status: 'active',
      limit: args.limit,
    };

    const cacheKey = 'projects_active';

    // Check cache
    const cached = this.cache.get<any>('projects', cacheKey);
    if (cached) {
      return createListResponseV2(
        'projects',
        cached.projects,
        'projects',
        { ...timer.toMetadata(), from_cache: true, operation: 'active' },
      );
    }

    // Execute query
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, {
      filter,
      limit: args.limit || 10,
      includeStats: args.details !== undefined ? args.details : true,
    });
    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result?.message || 'Failed to get active projects',
        undefined,
        result?.details,
        timer.toMetadata(),
      );
    }

    // Parse and cache
    const projects = this.parseProjects(result.projects || result);
    this.cache.set('projects', cacheKey, { projects });

    return createListResponseV2(
      'projects',
      projects,
      'projects',
      { ...timer.toMetadata(), from_cache: false, operation: 'active' },
    );
  }

  private async handleProjectStats(args: ProjectsArgsV2, timer: OperationTimerV2): Promise<any> {
    const cacheKey = `projects_stats_${args.projectId || 'all'}`;

    // Check cache
    const cached = this.cache.get<any>('projects', cacheKey);
    if (cached) {
      return createSuccessResponseV2(
        'projects',
        cached,
        undefined, // No summary for stats operation
        { ...timer.toMetadata(), from_cache: true, operation: 'stats' },
      );
    }

    // Execute the stats script
    const script = this.omniAutomation.buildScript(GET_PROJECT_STATS_SCRIPT, {
      options: {
        projectId: args.projectId,
        limit: args.limit || 200,
      },
    });

    const result = await this.omniAutomation.execute<any>(script);

    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'SCRIPT_ERROR',
        result?.message || 'Failed to get project statistics',
        'Check if OmniFocus is running',
        result?.details,
        timer.toMetadata(),
      );
    }

    // Cache the result
    this.cache.set('projects', cacheKey, result);

    return createSuccessResponseV2(
      'projects',
      result,
      undefined, // No summary for stats operation
      { ...timer.toMetadata(), from_cache: false, operation: 'stats' },
    );
  }

  private parseProjects(projects: any[]): any[] {
    if (!Array.isArray(projects)) return [];

    return projects.map(project => ({
      ...project,
      dueDate: project.dueDate ? new Date(project.dueDate) : undefined,
      completionDate: project.completionDate ? new Date(project.completionDate) : undefined,
      nextReviewDate: project.nextReviewDate ? new Date(project.nextReviewDate) : undefined,
      lastReviewDate: project.lastReviewDate ? new Date(project.lastReviewDate) : undefined,
    }));
  }
}
