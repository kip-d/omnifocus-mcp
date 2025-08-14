import { z } from 'zod';
import { BaseTool } from '../base.js';
import { 
  LIST_PROJECTS_SCRIPT,
  CREATE_PROJECT_SCRIPT,
  UPDATE_PROJECT_SCRIPT,
  COMPLETE_PROJECT_SCRIPT,
  DELETE_PROJECT_SCRIPT,
} from '../../omnifocus/scripts/projects.js';
import {
  createSuccessResponseV2,
  createErrorResponseV2,
  createListResponseV2,
  OperationTimerV2,
  normalizeDateInput,
  normalizeBooleanInput,
  normalizeStringInput
} from '../../utils/response-format-v2.js';

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
  ]).describe('Operation to perform'),
  
  // For list/query operations
  status: z.enum(['active', 'on-hold', 'done', 'dropped', 'all']).optional()
    .describe('Filter by project status (for list operation)'),
  folder: z.string().optional().describe('Filter by folder name'),
  needsReview: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional().describe('Only show projects needing review'),
  
  // For create/update operations
  projectId: z.string().optional().describe('Project ID (required for update/complete/delete)'),
  name: z.string().optional().describe('Project name'),
  note: z.string().optional().describe('Project note/description'),
  dueDate: z.string().optional().describe('Due date (natural language supported)'),
  reviewInterval: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10))
  ]).optional().describe('Review interval in days'),
  tags: z.array(z.string()).optional().describe('Tags to assign'),
  flagged: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).optional().describe('Mark as flagged/important'),
  
  // Response control - with type coercion for MCP bridge compatibility
  limit: z.union([
    z.number(),
    z.string().transform(val => parseInt(val, 10))
  ]).pipe(z.number().min(1).max(200)).default(50).describe('Maximum projects to return'),
  details: z.union([
    z.boolean(),
    z.string().transform(val => val === 'true' || val === '1')
  ]).default(true).describe('Include full project details'),
});

type ProjectsArgsV2 = z.infer<typeof ProjectsToolSchemaV2>;

export class ProjectsToolV2 extends BaseTool<typeof ProjectsToolSchemaV2> {
  name = 'projects';
  description = 'Manage OmniFocus projects. Operations: list (query projects), create, update, complete, delete, review (needing review), active (only active). Returns summary with key insights.';
  schema = ProjectsToolSchemaV2;

  async executeValidated(args: ProjectsArgsV2): Promise<any> {
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
        default:
          return createErrorResponseV2(
            'projects',
            'INVALID_OPERATION',
            `Invalid operation: ${normalizedArgs.operation}`,
            'Use one of: list, create, update, complete, delete, review, active',
            { provided: normalizedArgs.operation },
            timer.toMetadata(),
          );
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
      );
    }
  }

  private normalizeInputs(args: ProjectsArgsV2): ProjectsArgsV2 {
    const normalized = { ...args };
    
    // Normalize dates
    if (normalized.dueDate) {
      const date = normalizeDateInput(normalized.dueDate);
      if (date) {
        normalized.dueDate = date.toISOString();
      }
    }
    
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
        { ...timer.toMetadata(), from_cache: true, operation: 'list' }
      );
    }
    
    // Execute query
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, { 
      filter,
      limit: args.limit || 10,
      includeStats: args.details || false
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
      { ...timer.toMetadata(), from_cache: false, operation: 'list' }
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
    
    const projectData = {
      name: args.name,
      note: args.note,
      dueDate: args.dueDate,
      flagged: args.flagged,
      tags: args.tags,
      reviewInterval: args.reviewInterval,
    };
    
    // Execute creation
    const script = this.omniAutomation.buildScript(CREATE_PROJECT_SCRIPT, projectData);
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
    if (args.flagged !== undefined) updates.flagged = args.flagged;
    if (args.tags !== undefined) updates.tags = args.tags;
    if (args.reviewInterval !== undefined) updates.reviewInterval = args.reviewInterval;
    if (args.status !== undefined) updates.status = args.status;
    
    // Execute update
    const script = this.omniAutomation.buildScript(UPDATE_PROJECT_SCRIPT, {
      projectId: args.projectId,
      updates,
    });
    
    const result = await this.omniAutomation.execute<any>(script);
    
    if (!result || result.error) {
      return createErrorResponseV2(
        'projects',
        'UPDATE_FAILED',
        result?.message || 'Failed to update project',
        'Check the project ID and try again',
        result?.details,
        timer.toMetadata(),
      );
    }
    
    // Invalidate cache
    this.cache.invalidate('projects');
    
    return createSuccessResponseV2(
      'projects',
      { project: result },
      undefined, // No summary for update operation
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
        { ...timer.toMetadata(), from_cache: true, operation: 'review' }
      );
    }
    
    // Execute query
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, { 
      filter,
      limit: args.limit || 10,
      includeStats: args.details || false
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
      { ...timer.toMetadata(), from_cache: false, operation: 'review' }
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
        { ...timer.toMetadata(), from_cache: true, operation: 'active' }
      );
    }
    
    // Execute query
    const script = this.omniAutomation.buildScript(LIST_PROJECTS_SCRIPT, { 
      filter,
      limit: args.limit || 10,
      includeStats: args.details || false
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
      { ...timer.toMetadata(), from_cache: false, operation: 'active' }
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