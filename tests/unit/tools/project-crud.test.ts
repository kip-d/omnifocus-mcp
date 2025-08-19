import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateProjectTool } from '../../../src/tools/legacy-v1/projects/CreateProjectTool.js';
import { UpdateProjectTool } from '../../../src/tools/legacy-v1/projects/UpdateProjectTool.js';
import { CompleteProjectTool } from '../../../src/tools/legacy-v1/projects/CompleteProjectTool.js';
import { DeleteProjectTool } from '../../../src/tools/legacy-v1/projects/DeleteProjectTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn()
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('Project CRUD Operations', () => {
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn(),
      execute: vi.fn(),
      executeViaUrlScheme: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
  });

  describe('CreateProjectTool', () => {
    let tool: CreateProjectTool;

    beforeEach(() => {
      tool = new CreateProjectTool(mockCache);
    });

    describe('successful operations', () => {
      it('should create a simple project', async () => {
        const projectData = { name: 'Test project' };
        const scriptResult = {
          project: {
            id: 'proj-123',
            name: 'Test project',
            status: 'active',
            folder: null
          }
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(scriptResult));

        const result = await tool.execute(projectData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // CREATE_PROJECT_SCRIPT
          {
            name: 'Test project',
            options: expect.objectContaining({
              status: 'active',
              flagged: false,
              sequential: false
            })
          }
        );
        expect(mockOmniAutomation.execute).toHaveBeenCalledWith('test script');
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
        expect(result.success).toBe(true);
        expect(result.data.project.projectId).toBe('proj-123');
        expect(result.data.project.name).toBe('Test project');
      });

      it('should create a project with all optional fields', async () => {
        const projectData = {
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
          project: {
            id: 'proj-456',
            name: 'Complex project',
            status: 'onHold',
            folder: 'Work',
            nextReviewDate: '2024-01-15T12:00:00Z',
            reviewInterval: { unit: 'week', steps: 2, fixed: true }
          }
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(scriptResult));

        const result = await tool.execute(projectData);

        expect(result.success).toBe(true);
        expect(result.data.project.projectId).toBe('proj-456');
        expect(result.data.project.folder).toBe('Work');
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
      });
    });

    describe('validation', () => {
      it('should reject missing name', async () => {
        await expect(tool.execute({})).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty name', async () => {
        await expect(tool.execute({ name: '' })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject invalid status', async () => {
        await expect(tool.execute({
          name: 'Test project',
          status: 'invalid-status' as any
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const projectData = { name: 'Test project' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Failed to create project'
        });

        const result = await tool.execute(projectData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SCRIPT_ERROR');
        expect(result.error.message).toBe('Failed to create project');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });

      it('should handle permission denied error', async () => {
        const projectData = { name: 'Test project' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('access not allowed'));

        const result = await tool.execute(projectData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.message).toContain('Permission denied');
      });
    });
  });

  describe('UpdateProjectTool', () => {
    let tool: UpdateProjectTool;

    beforeEach(() => {
      tool = new UpdateProjectTool(mockCache);
    });

    describe('successful operations', () => {
      it('should update project name', async () => {
        const updateData = {
          projectId: 'proj-123',
          updates: {
            name: 'Updated project name'
          }
        };
        const scriptResult = {
          id: 'proj-123',
          name: 'Updated project name',
          updated: true,
          changes: { name: 'Updated project name' }
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(scriptResult);

        const result = await tool.execute(updateData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // UPDATE_PROJECT_SCRIPT
          {
            projectId: 'proj-123',
            updates: expect.objectContaining({ name: 'Updated project name' })
          }
        );
        expect(result.success).toBe(true);
        expect(result.data.project).toEqual(scriptResult);
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
      });
    });

    describe('validation', () => {
      it('should reject missing projectId', async () => {
        await expect(tool.execute({
          updates: { name: 'New name' }
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty updates object', async () => {
        await expect(tool.execute({
          projectId: 'proj-123',
          updates: {}
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const updateData = {
          projectId: 'proj-123',
          updates: { name: 'New name' }
        };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Project not found'
        });

        const result = await tool.execute(updateData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('UPDATE_FAILED');
        expect(result.error.message).toBe('Project not found');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });
    });
  });

  describe('CompleteProjectTool', () => {
    let tool: CompleteProjectTool;

    beforeEach(() => {
      tool = new CompleteProjectTool(mockCache);
    });

    describe('successful operations', () => {
      it('should complete a project', async () => {
        const completeData = { projectId: 'proj-123' };
        const scriptResult = {
          id: 'proj-123',
          name: 'Test Project',
          status: 'completed',
          completionDate: new Date().toISOString()
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(scriptResult));

        const result = await tool.execute(completeData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // COMPLETE_PROJECT_SCRIPT
          {
            projectId: 'proj-123',
            completeAllTasks: false
          }
        );
        expect(result.success).toBe(true);
        expect(result.data.project).toEqual(scriptResult);
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
        expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
      });

      it('should complete a project with all tasks', async () => {
        const completeData = {
          projectId: 'proj-123',
          completeAllTasks: true
        };
        const scriptResult = {
          id: 'proj-123',
          name: 'Test Project',
          status: 'completed',
          tasksCompleted: 5,
          completionDate: new Date().toISOString()
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(scriptResult));

        const result = await tool.execute(completeData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            projectId: 'proj-123',
            completeAllTasks: true
          }
        );
        expect(result.success).toBe(true);
        expect(result.metadata.complete_all_tasks).toBe(true);
      });
    });

    describe('validation', () => {
      it('should reject missing projectId', async () => {
        await expect(tool.execute({})).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const completeData = { projectId: 'proj-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Project not found'
        });

        const result = await tool.execute(completeData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SCRIPT_ERROR');
        expect(result.error.message).toBe('Project not found');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });
    });
  });

  describe('DeleteProjectTool', () => {
    let tool: DeleteProjectTool;

    beforeEach(() => {
      tool = new DeleteProjectTool(mockCache);
    });

    describe('successful operations', () => {
      it('should delete a project', async () => {
        const deleteData = { projectId: 'proj-123' };
        const scriptResult = {
          projectName: 'Deleted Project',
          tasksDeleted: 0,
          tasksOrphaned: 3
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(scriptResult);

        const result = await tool.execute(deleteData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // DELETE_PROJECT_SCRIPT
          {
            projectId: 'proj-123',
            deleteTasks: false
          }
        );
        expect(result.success).toBe(true);
        expect(result.data.deleted_id).toBe('proj-123');
        expect(result.data.project_name).toBe('Deleted Project');
        expect(result.data.tasks_orphaned).toBe(3);
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
      });

      it('should fallback to URL scheme on permission error', async () => {
        const deleteData = { projectId: 'proj-123' };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'parameter is missing'
        });

        const result = await tool.execute(deleteData);

        expect(mockOmniAutomation.executeViaUrlScheme).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.metadata.method).toBe('url_scheme');
        expect(result.data.message).toContain('marked as dropped');
        expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
      });
    });

    describe('validation', () => {
      it('should reject missing projectId', async () => {
        await expect(tool.execute({})).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle generic execution error', async () => {
        const deleteData = { projectId: 'proj-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('Network error'));

        const result = await tool.execute(deleteData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.message).toBe('Network error');
        expect(mockOmniAutomation.executeViaUrlScheme).not.toHaveBeenCalled();
      });
    });
  });
});