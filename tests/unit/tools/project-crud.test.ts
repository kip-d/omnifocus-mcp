import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectsToolV2 } from '../../../src/tools/projects/ProjectsToolV2.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { applyTestShims } from '../../../src/test-utils/omni-automation-shims.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js');
vi.mock('../../../src/omnifocus/OmniAutomation.js');
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('ProjectsToolV2 CRUD Operations', () => {
  let tool: ProjectsToolV2;
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
      invalidateProject: vi.fn(),
      invalidateTag: vi.fn(),
      invalidateForTaskChange: vi.fn(),
      invalidateTaskQueries: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn(),
      executeJson: vi.fn(),
      executeViaUrlScheme: vi.fn(),
    };

    // Apply test shims to add execute, executeTyped, and vi.fn wrapping
    applyTestShims(mockOmniAutomation);


    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new ProjectsToolV2(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('list operation', () => {
    it('should list projects', async () => {
      const mockResult = {
        projects: [
          { id: 'proj1', name: 'Project 1', status: 'active' },
          { id: 'proj2', name: 'Project 2', status: 'onHold' }
        ],
        count: 2
      };

      mockOmniAutomation.executeJson.mockResolvedValue(mockResult);

      const result = await tool.executeValidated({ 
        operation: 'list',
        includeCompleted: false 
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should use cached results when available', async () => {
      const cachedProjects = {
        projects: [{ name: 'Cached Project' }]
      };

      mockCache.get.mockReturnValue(cachedProjects);

      const result = await tool.executeValidated({ operation: 'list' });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].name).toBe('Cached Project');
      expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
    });
  });

  describe('create operation', () => {
    it('should create a simple project', async () => {
      const scriptResult = {
        id: 'proj-123',
        name: 'Test project',
        status: 'active',
        folder: null
      };

      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

      const result = await tool.executeValidated({
        operation: 'create',
        name: 'Test project'
      });

      expect(result.success).toBe(true);
      expect(result.data.project.id).toBe('proj-123');
      expect(result.data.project.name).toBe('Test project');
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects'); // Create still invalidates all projects
    });

    it('should create a complex project with all options', async () => {
      const projectData = {
        operation: 'create' as const,
        name: 'Complex project',
        note: 'Project description',
        folder: 'Work',
        status: 'onHold' as const,
        flagged: true,
        dueDate: '2024-01-31 23:59',
        deferDate: '2024-01-01',
        sequential: true,
        completedByChildren: true,
        singleton: false,
        nextReviewDate: '2024-01-15 12:00',
        reviewInterval: {
          unit: 'week' as const,
          steps: 2,
          fixed: true
        }
      };

      const scriptResult = {
        id: 'proj-456',
        name: 'Complex project',
        status: 'onHold',
        folder: 'Work',
        nextReviewDate: '2024-01-15T12:00:00Z',
        reviewInterval: { unit: 'week', steps: 2, fixed: true }
      };

      mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

      const result = await tool.executeValidated(projectData);

      expect(result.success).toBe(true);
      expect(result.data.project.id).toBe('proj-456');
      expect(result.data.project.folder).toBe('Work');
    });

    it('should validate required parameters', async () => {
      const result = await tool.executeValidated({
        operation: 'create'
        // Missing name
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EXECUTION_ERROR');
      expect(result.error.message).toContain('Create operation requires name parameter');
    });
  });

  describe('update operation', () => {
    it('should update project properties', async () => {
      const scriptResult = {
        id: 'proj-123',
        name: 'Updated Name',
        status: 'active'
      };

      mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

      const result = await tool.executeValidated({
        operation: 'update',
        projectId: 'proj-123',
        updates: {
          name: 'Updated Name',
          status: 'active'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.project.name).toBe('Updated Name');
      expect(mockCache.invalidateProject).toHaveBeenCalledWith('proj-123');
    });

    it('should validate required parameters', async () => {
      const result = await tool.executeValidated({
        operation: 'update',
        // Missing projectId
        updates: { name: 'New Name' }
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EXECUTION_ERROR');
      expect(result.error.message).toContain('requires projectId parameter');
    });
  });

  describe('complete operation', () => {
    it('should complete a project', async () => {
      const scriptResult = {
        id: 'proj-123',
        name: 'Completed Project',
        completedByChildren: false,
        tasksCompleted: 5
      };

      mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

      const result = await tool.executeValidated({
        operation: 'complete',
        projectId: 'proj-123'
      });

      expect(result.success).toBe(true);
      expect(result.data.project.id).toBe('proj-123');
      expect(result.data.project.tasksCompleted).toBe(5);
      expect(mockCache.invalidateProject).toHaveBeenCalledWith('proj-123');
      expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
    });

    it('should complete a project with all tasks', async () => {
      const scriptResult = {
        id: 'proj-123',
        name: 'Completed Project',
        completedByChildren: true,
        tasksCompleted: 10
      };

      mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

      const result = await tool.executeValidated({
        operation: 'complete',
        projectId: 'proj-123',
        completeTasks: true
      });

      expect(result.success).toBe(true);
      expect(result.data.project.completedByChildren).toBe(true);
      expect(result.data.project.tasksCompleted).toBe(10);
    });
  });

  describe('delete operation', () => {
    it('should delete a project', async () => {
      const scriptResult = {
        success: true,
        projectId: 'proj-123',
        message: 'Project deleted successfully'
      };

      mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

      const result = await tool.executeValidated({
        operation: 'delete',
        projectId: 'proj-123'
      });

      expect(result.success).toBe(true);
      expect(result.data.project.deleted).toBe(true);
      expect(mockCache.invalidateProject).toHaveBeenCalledWith('proj-123');
      expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
    });

    it('should handle permission denied and use URL scheme fallback', async () => {
      mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Not authorized' , details: 'Test error' });

      const result = await tool.executeValidated({
        operation: 'delete',
        projectId: 'proj-123'
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Not authorized');
    });
  });

  describe('error handling', () => {
    it('should handle script execution errors', async () => {
      mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Script failed' , details: 'Test error' });

      const result = await tool.executeValidated({
        operation: 'create',
        name: 'Test Project'
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Script failed');
    });

    it('should handle invalid operation', async () => {
      const result = await tool.executeValidated({
        operation: 'invalid' as any
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_OPERATION');
    });
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('projects');
      expect(tool.description).toContain('Manage OmniFocus projects');
      expect(tool.description).toContain('list');
      expect(tool.description).toContain('create');
      expect(tool.description).toContain('update');
      expect(tool.description).toContain('delete');
    });
  });
});