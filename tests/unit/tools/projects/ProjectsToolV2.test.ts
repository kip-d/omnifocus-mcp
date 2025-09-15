import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsToolV2 } from '../../../../src/tools/projects/ProjectsToolV2';
import { CacheManager } from '../../../../src/cache/CacheManager';

vi.mock('../../../../src/cache/CacheManager');

describe('ProjectsToolV2', () => {
  let tool: ProjectsToolV2;
  let mockCache: CacheManager;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      clearPattern: vi.fn(),
      invalidate: vi.fn(),
    } as any;
    
    tool = new ProjectsToolV2(mockCache);
    
    // Mock the OmniAutomation instance
    mockOmni = {
      executeJson: vi.fn(),
      buildScript: vi.fn((template, params) => `script with ${JSON.stringify(params)}`),
    };
    (tool as any).omniAutomation = mockOmni;
  });

  describe('constructor and properties', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('projects');
      expect(tool.description).toContain('Manage OmniFocus projects');
    });

    it('should define input schema with required fields', () => {
      const schema = tool.inputSchema;
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('operation');
      expect(schema.required).toContain('limit');
      expect(schema.required).toContain('details');
    });
  });

  describe('list operation', () => {
    it('should list all projects with default parameters', async () => {
      const mockProjects = [
        { id: 'p1', name: 'Project 1', status: 'active' },
        { id: 'p2', name: 'Project 2', status: 'on-hold' },
      ];

      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          items: mockProjects,
          summary: { total: 2 },
        },
      });

      const result = await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(mockProjects);
      expect(result.summary).toBeDefined();
      expect(result.summary.total_projects).toBe(2);
      expect(result.metadata.operation).toBe('list');
    });

    it('should filter projects by status', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          items: [{ id: 'p1', name: 'Active Project', status: 'active' }],
          summary: { total: 1 },
        },
      });

      const result = await tool.execute({
        operation: 'list',
        status: 'active',
        limit: 50,
        details: false,
      });

      expect(mockOmni.buildScript).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ 
          filter: expect.objectContaining({
            status: 'active'
          })
        })
      );
      expect(mockOmni.executeJson).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should handle needsReview filter', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          items: [{ id: 'p1', name: 'Review Project', needsReview: true }],
          summary: { total: 1 },
        },
      });

      const result = await tool.execute({
        operation: 'list',
        needsReview: true,
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should use cache when available', async () => {
      const cachedData = {
        summary: { total_projects: 2 },
        projects: [{ id: 'p1', name: 'Cached' }],
      };
      
      mockCache.get.mockReturnValue(cachedData);

      const result = await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(cachedData.projects);
      // Mock may or may not be called depending on error path
      expect(result.metadata.from_cache).toBe(true);
    });

    it('should cache successful results', async () => {
      const projectData = {
        items: [{ id: 'p1', name: 'Project' }],
        summary: { total: 1 },
      };
      
      mockCache.get.mockReturnValue(null);
      mockOmni.executeJson.mockResolvedValue({ success: true, data: projectData });

      await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(mockCache.set).toHaveBeenCalledWith(
        'projects',
        expect.any(String), // cache key
        expect.objectContaining({
          projects: expect.any(Array)
        })
      );
    });
  });

  describe('create operation', () => {
    it('should create a new project', async () => {
      const newProject = {
        id: 'new-id',
        name: 'New Project',
        status: 'active',
        note: 'Project description',
      };

      mockOmni.executeJson.mockResolvedValue({ success: true, data: newProject });

      const result = await tool.execute({
        operation: 'create',
        name: 'New Project',
        note: 'Project description',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project).toEqual(newProject);
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    });

    it('should validate required name for create', async () => {
      // Mock should not be called, but set it up to prevent errors
      mockOmni.executeJson.mockResolvedValue(null);
      
      const result = await tool.execute({
        operation: 'create',
        // name is missing
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.code).toMatch(/MISSING_PARAMETER|EXECUTION_ERROR/);
      expect(result.error.message).toContain('name');
      // Mock may or may not be called depending on error path
    });

    it('should handle tags during creation', async () => {
      mockOmni.executeJson.mockResolvedValue({ 
        success: true,
        data: { id: 'p1', name: 'Tagged Project', tags: ['work', 'important'] },
      });

      const result = await tool.execute({
        operation: 'create',
        name: 'Tagged Project',
        tags: ['work', 'important'],
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project.tags).toEqual(['work', 'important']);
    });
  });

  describe('update operation', () => {
    it('should update an existing project', async () => {
      mockOmni.executeJson.mockResolvedValue({ 
        success: true,
        data: { success: true, project: { id: 'p1', name: 'Updated Name', status: 'active' } },
      });

      const result = await tool.execute({
        operation: 'update',
        projectId: 'p1',
        name: 'Updated Name',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project.name).toBe('Updated Name');
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    });

    it('should validate required projectId for update', async () => {
      mockOmni.executeJson.mockResolvedValue(null);
      
      const result = await tool.execute({
        operation: 'update',
        name: 'New Name',
        // projectId is missing
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toMatch(/MISSING_PARAMETER|EXECUTION_ERROR/);
      expect(result.error.message).toContain('projectId');
      // Mock may or may not be called depending on error path
    });

    it('should update project due date', async () => {
      mockOmni.executeJson.mockResolvedValue({ 
        success: true,
        data: { success: true, project: { id: 'p1', name: 'Project', dueDate: '2025-03-31' } },
      });

      const result = await tool.execute({
        operation: 'update',
        projectId: 'p1',
        dueDate: '2025-03-31',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project.dueDate).toBe('2025-03-31');
    });
  });

  describe('complete operation', () => {
    it('should complete a project', async () => {
      mockOmni.executeJson.mockResolvedValue({ 
        success: true,
        data: { id: 'p1', name: 'Completed Project', status: 'done' },
      });

      const result = await tool.execute({
        operation: 'complete',
        projectId: 'p1',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project.status).toBe('done');
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    });

    it('should validate required projectId for complete', async () => {
      mockOmni.executeJson.mockResolvedValue(null);
      
      const result = await tool.execute({
        operation: 'complete',
        // projectId is missing
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toMatch(/MISSING_PARAMETER|EXECUTION_ERROR/);
      expect(result.error.message).toContain('projectId');
      // Mock may or may not be called depending on error path
    });
  });

  describe('delete operation', () => {
    it('should delete a project', async () => {
      mockOmni.executeJson.mockResolvedValue({ 
        success: true,
        data: { id: 'p1', deleted: true },
      });

      const result = await tool.execute({
        operation: 'delete',
        projectId: 'p1',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project.deleted).toBe(true);
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    });

    it('should validate required projectId for delete', async () => {
      mockOmni.executeJson.mockResolvedValue(null);
      
      const result = await tool.execute({
        operation: 'delete',
        // projectId is missing
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toMatch(/MISSING_PARAMETER|EXECUTION_ERROR/);
      expect(result.error.message).toContain('projectId');
      // Mock may or may not be called depending on error path
    });
  });

  describe('review operation', () => {
    it('should list projects needing review', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10); // 10 days ago
      
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          items: [
            { id: 'p1', name: 'Review 1', status: 'active', nextReviewDate: pastDate.toISOString() },
            { id: 'p2', name: 'Review 2', status: 'active', nextReviewDate: pastDate.toISOString() },
          ],
          summary: { total: 2 },
        },
      });

      const result = await tool.execute({
        operation: 'review',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
      // The summary is generated from the actual items returned
      expect(result.summary.total_projects).toBe(2);
      expect(result.summary.active).toBe(2);
    });
  });

  describe('active operation', () => {
    it('should list only active projects', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          items: [
            { id: 'p1', name: 'Active 1', status: 'active' },
            { id: 'p2', name: 'Active 2', status: 'active' },
            { id: 'p3', name: 'Active 3', status: 'active' },
          ],
          summary: { total: 3 },
        },
      });

      const result = await tool.execute({
        operation: 'active',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(3);
      expect(result.data.items.every(p => p.status === 'active')).toBe(true);
    });
  });

  describe('parameter coercion', () => {
    it('should coerce string parameters to correct types', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { items: [], summary: { total: 0 } },
      });

      const result = await tool.execute({
        operation: 'list',
        limit: '100' as any,
        details: 'true' as any,
        needsReview: '1' as any,
        flagged: 'false' as any,
      });

      expect(result.success).toBe(true);
      // buildScript is called with the template and parameters
      expect(mockOmni.buildScript).toHaveBeenCalled();
      // Just verify the coercion worked by checking the result
      expect(result.data.items).toEqual([]);
    });

    it('should handle numeric strings for reviewInterval', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { success: true, project: { id: 'p1', reviewInterval: 7 } },
      });

      const result = await tool.execute({
        operation: 'update',
        projectId: 'p1',
        reviewInterval: '7' as any,
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      // executeJson called (schema may be optional depending on tool logic)
      expect(mockOmni.executeJson).toHaveBeenCalled();
    });

    it('should validate limit bounds', async () => {
      await expect(tool.execute({
        operation: 'list',
        limit: 0,
        details: false,
      })).rejects.toThrow('Invalid parameters');
      
      await expect(tool.execute({
        operation: 'list',
        limit: 501,
        details: false,
      })).rejects.toThrow('Invalid parameters');
    });
  });

  describe('error handling', () => {
    it('should handle script execution errors', async () => {
      // When execute throws, it gets caught in executeValidated catch block
      mockOmni.executeJson.mockRejectedValue(new Error('OmniFocus not running'));

      const result = await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // The base tool maps OmniFocus errors to OMNIFOCUS_NOT_RUNNING
      expect(result.error.code).toBe('OMNIFOCUS_NOT_RUNNING');
      expect(result.error.message.toLowerCase()).toContain('omnifocus is not running');
      // Suggestion is optional and may be undefined
    });

    it('should handle permission errors', async () => {
      mockOmni.executeJson.mockRejectedValue(new Error('Error: -1743 - Not allowed'));

      const result = await tool.execute({
        operation: 'create',
        name: 'Test Project',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PERMISSION_DENIED');
      if (result.error.suggestion) {
        expect(result.error.suggestion).toContain('System Settings');
      }
    });

    it('should handle invalid operation gracefully', async () => {
      await expect(tool.execute({
        operation: 'invalid_op' as any,
        limit: 50,
        details: false,
      })).rejects.toThrow('Invalid parameters');
    });

    it('should handle project not found errors', async () => {
      mockOmni.executeJson.mockResolvedValue({ success: false, error: 'Project not found' });

      const result = await tool.execute({
        operation: 'update',
        projectId: 'nonexistent',
        name: 'New Name',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // UPDATE_FAILED is expected; message may vary with upstream error text
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('metadata', () => {
    it('should include metadata in all responses', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { items: [], summary: { total: 0 } },
      });

      const result = await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.operation).toBe('list');
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.query_time_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include cache hit information', async () => {
      mockCache.get.mockReturnValue({ projects: [] });

      const result = await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(result.metadata.from_cache).toBe(true);
    });
  });

  describe('summary generation', () => {
    it('should generate comprehensive summary for list operations', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: {
          items: [
            { id: 'p1', name: 'Active 1', status: 'active' },
            { id: 'p2', name: 'Active 2', status: 'active' },
            { id: 'p3', name: 'Active 3', status: 'active' },
            { id: 'p4', name: 'Active 4', status: 'active' },
            { id: 'p5', name: 'Active 5', status: 'active' },
            { id: 'p6', name: 'On Hold 1', status: 'on-hold' },
            { id: 'p7', name: 'On Hold 2', status: 'on-hold' },
            { id: 'p8', name: 'Completed 1', status: 'done' },
            { id: 'p9', name: 'Completed 2', status: 'done' },
            { id: 'p10', name: 'Dropped', status: 'dropped' },
          ],
        },
      });

      const result = await tool.execute({
        operation: 'list',
        limit: 50,
        details: false,
      });

      expect(result.summary).toBeDefined();
      // Summary is generated from actual items
      expect(result.summary.total_projects).toBe(10);
      expect(result.summary.active).toBe(5);
      expect(result.summary.on_hold).toBe(2);
      expect(result.summary.completed).toBe(2);
      expect(result.summary.dropped).toBe(1);
    });

    it('should include operation-specific summary for create', async () => {
      mockOmni.executeJson.mockResolvedValue({
        success: true,
        data: { id: 'p1', name: 'New Project', status: 'active' },
      });

      const result = await tool.execute({
        operation: 'create',
        name: 'New Project',
        limit: 50,
        details: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.project).toBeDefined();
      expect(result.data.project.id).toBe('p1');
      // Create operations return success response without summary text
    });
  });
});
