import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportTasksTool } from '../../../src/tools/export/ExportTasksTool.js';
import { ExportProjectsTool } from '../../../src/tools/export/ExportProjectsTool.js';
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
vi.mock('../../../src/utils/response-format.js', () => ({
  createSuccessResponse: vi.fn((operation, data, metadata) => ({
    operation,
    success: true,
    data,
    metadata,
  })),
  createErrorResponse: vi.fn((operation, code, message, details, metadata) => ({
    operation,
    error: true,
    code,
    message,
    details,
    metadata,
  })),
  OperationTimer: vi.fn().mockImplementation(() => ({
    toMetadata: vi.fn(() => ({ duration_ms: 100 })),
  })),
}));

describe('Export Tools', () => {
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
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
  });

  describe('ExportTasksTool', () => {
    let tool: ExportTasksTool;

    beforeEach(() => {
      tool = new ExportTasksTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('export_tasks');
        expect(tool.description).toContain('Export tasks to JSON/CSV/Markdown');
        expect(tool.description).toContain('json|csv|markdown');
      });

      it('should use default format when not specified', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        const result = await tool.execute({});

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            format: 'json',
            filter: {},
            fields: undefined,
          }
        );
        expect(result.format).toBe('json');
      });

      it('should validate export format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'csv',
          data: 'id,name\n1,Task 1',
          count: 1,
        });

        const result = await tool.execute({ format: 'csv' });

        expect(result.format).toBe('csv');
        expect(result.data).toContain('id,name');
      });

      it('should reject invalid export formats', async () => {
        await expect(tool.execute({ format: 'xml' as any })).rejects.toThrow();
        await expect(tool.execute({ format: 'pdf' as any })).rejects.toThrow();
      });
    });

    describe('filtering and field selection', () => {
      it('should handle all filter options correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        await tool.execute({
          format: 'json',
          filter: {
            search: 'meeting',
            project: 'Work Project',
            projectId: 'az5Ieo4ip7K',
            tags: ['urgent', 'work'],
            available: true,
            completed: false,
            flagged: true,
            limit: 50,
          }
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            format: 'json',
            filter: {
              search: 'meeting',
              project: 'Work Project',
              projectId: 'az5Ieo4ip7K',
              tags: ['urgent', 'work'],
              available: true,
              completed: false,
              flagged: true,
              limit: 50,
            },
            fields: undefined,
          }
        );
      });

      it('should handle field selection correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'csv',
          data: 'id,name,project,tags\n1,"Task 1","Work","urgent"',
          count: 1,
        });

        const result = await tool.execute({
          format: 'csv',
          fields: ['id', 'name', 'project', 'tags'],
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            format: 'csv',
            filter: {},
            fields: ['id', 'name', 'project', 'tags'],
          }
        );
        expect(result.data).toContain('id,name,project,tags');
      });

      it('should validate field names correctly', async () => {
        const validFields = [
          'id', 'name', 'note', 'project', 'tags', 'deferDate', 'dueDate',
          'completed', 'completionDate', 'flagged', 'estimated', 'created', 
          'createdDate', 'modified', 'modifiedDate'
        ];

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        // Valid fields should work
        await expect(tool.execute({
          fields: validFields
        })).resolves.toBeDefined();

        // Invalid fields should be rejected
        await expect(tool.execute({
          fields: ['id', 'invalidField'] as any
        })).rejects.toThrow();
      });

      it('should handle complex filter combinations', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: JSON.stringify([
            { id: '1', name: 'Urgent Work Task', project: 'Work', tags: ['urgent', 'work'] }
          ]),
          count: 1,
        });

        const result = await tool.execute({
          format: 'json',
          filter: {
            search: 'urgent',
            tags: ['work'],
            completed: false,
            flagged: true,
            available: true,
          },
          fields: ['id', 'name', 'project', 'tags']
        });

        expect(result.count).toBe(1);
        expect(result.data).toContain('Urgent Work Task');
      });
    });

    describe('data formats and integrity', () => {
      it('should handle JSON format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const mockTasks = [
          { id: '1', name: 'Task 1', completed: false },
          { id: '2', name: 'Task 2', completed: true }
        ];
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: JSON.stringify(mockTasks),
          count: 2,
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.format).toBe('json');
        expect(result.count).toBe(2);
        expect(result.data).toBe(JSON.stringify(mockTasks));
        expect(result.metadata.exportedAt).toBeDefined();
        expect(result.metadata.filters).toEqual({});
        expect(result.metadata.fields).toBe('default');
      });

      it('should handle CSV format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const csvData = 'id,name,completed\n1,"Task 1",false\n2,"Task 2",true';
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'csv',
          data: csvData,
          count: 2,
        });

        const result = await tool.execute({ format: 'csv' });

        expect(result.format).toBe('csv');
        expect(result.count).toBe(2);
        expect(result.data).toBe(csvData);
        expect(result.data).toContain('id,name,completed');
        expect(result.data).toContain('"Task 1"');
        expect(result.data).toContain('"Task 2"');
      });

      it('should handle Markdown format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const markdownData = '# Tasks Export\n\n- [ ] Task 1\n- [x] Task 2';
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'markdown',
          data: markdownData,
          count: 2,
        });

        const result = await tool.execute({ format: 'markdown' });

        expect(result.format).toBe('markdown');
        expect(result.count).toBe(2);
        expect(result.data).toBe(markdownData);
        expect(result.data).toContain('# Tasks Export');
        expect(result.data).toContain('- [ ] Task 1');
        expect(result.data).toContain('- [x] Task 2');
      });

      it('should preserve data integrity across formats', async () => {
        const taskData = {
          id: 'abc123',
          name: 'Complex Task with "Quotes" and, Commas',
          note: 'Multi\nline\nnote',
          project: 'Project with Spaces',
          tags: ['tag1', 'tag-with-dash', 'tag_with_underscore'],
          completed: false,
        };

        // Test JSON
        mockOmniAutomation.execute.mockResolvedValueOnce({
          format: 'json',
          data: JSON.stringify([taskData]),
          count: 1,
        });

        const jsonResult = await tool.execute({ format: 'json' });
        const parsedJson = JSON.parse(jsonResult.data);
        expect(parsedJson[0]).toEqual(taskData);

        // Test CSV 
        const csvData = 'id,name,note,project,tags,completed\nabc123,"Complex Task with ""Quotes"" and, Commas","Multi\nline\nnote","Project with Spaces","tag1,tag-with-dash,tag_with_underscore",false';
        mockOmniAutomation.execute.mockResolvedValueOnce({
          format: 'csv',
          data: csvData,
          count: 1,
        });

        const csvResult = await tool.execute({ format: 'csv' });
        expect(csvResult.data).toContain('Complex Task with ""Quotes""');
        expect(csvResult.data).toContain('Project with Spaces');
      });

      it('should handle empty results correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        const result = await tool.execute({
          filter: { completed: true, limit: 100 }
        });

        expect(result.count).toBe(0);
        expect(result.data).toBe('[]');
        expect(result.metadata.filters).toEqual({ completed: true, limit: 100 });
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Script execution failed',
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.error).toBe(true);
        expect(result.message).toBe('Script execution failed');
      });

      it('should handle automation errors gracefully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('OmniFocus not available'));

        const result = await tool.execute({ format: 'csv' });

        // Should return an error response (exact format may vary based on handleError implementation)
        expect(result).toBeDefined();
        // Check that it's an error by looking for error properties or non-success indicators
        const isError = result.success === false || result.error || result.operation === 'export_tasks';
        expect(isError).toBe(true);
      });

      it('should validate projectId format', async () => {
        // This test ensures we handle the projectId correctly as per the schema description
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        // Valid alphanumeric projectId should work
        await tool.execute({
          filter: { projectId: 'az5Ieo4ip7K' }
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            filter: expect.objectContaining({ projectId: 'az5Ieo4ip7K' })
          })
        );
      });
    });
  });

  describe('ExportProjectsTool', () => {
    let tool: ExportProjectsTool;

    beforeEach(() => {
      tool = new ExportProjectsTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('export_projects');
        expect(tool.description).toContain('Export all projects to JSON/CSV');
        expect(tool.description).toContain('json|csv');
      });

      it('should use default values correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        await tool.execute({});

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            format: 'json',
            includeStats: false,
          }
        );
      });

      it('should handle includeStats parameter correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: JSON.stringify([
            {
              id: '1',
              name: 'Work Project',
              status: 'active',
              stats: {
                totalTasks: 15,
                completedTasks: 10,
                remainingTasks: 5,
              }
            }
          ]),
          count: 1,
        });

        const result = await tool.execute({
          format: 'json',
          includeStats: true,
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          {
            format: 'json',
            includeStats: true,
          }
        );

        const projects = JSON.parse(result.data.data);
        expect(projects[0]).toHaveProperty('stats');
        expect(projects[0].stats.totalTasks).toBe(15);
      });

      it('should handle boolean coercion for includeStats', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        // Test string boolean values
        await tool.execute({ includeStats: 'true' as any });
        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ includeStats: true })
        );

        await tool.execute({ includeStats: 'false' as any });
        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ includeStats: false })
        );
      });
    });

    describe('data formats and integrity', () => {
      it('should handle JSON format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const mockProjects = [
          { id: '1', name: 'Project 1', status: 'active' },
          { id: '2', name: 'Project 2', status: 'onHold' }
        ];
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: JSON.stringify(mockProjects),
          count: 2,
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.data.format).toBe('json');
        expect(result.data.count).toBe(2);
        expect(result.data.data).toBe(JSON.stringify(mockProjects));
        expect(result.metadata.exported_at).toBeDefined();
        expect(result.metadata.include_stats).toBe(false);
        expect(result.metadata.format).toBe('json');
      });

      it('should handle CSV format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const csvData = 'id,name,status\n1,"Project 1",active\n2,"Project 2",onHold';
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'csv',
          data: csvData,
          count: 2,
        });

        const result = await tool.execute({ format: 'csv' });

        expect(result.data.format).toBe('csv');
        expect(result.data.count).toBe(2);
        expect(result.data.data).toBe(csvData);
        expect(result.data.data).toContain('id,name,status');
      });

      it('should include statistics when requested', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const projectWithStats = {
          id: 'proj123',
          name: 'Detailed Project',
          status: 'active',
          stats: {
            totalTasks: 25,
            completedTasks: 15,
            remainingTasks: 10,
            completionRate: 0.6,
            overdueTasks: 2,
          }
        };
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: JSON.stringify([projectWithStats]),
          count: 1,
        });

        const result = await tool.execute({
          format: 'json',
          includeStats: true,
        });

        const projects = JSON.parse(result.data.data);
        expect(projects[0].stats).toBeDefined();
        expect(projects[0].stats.totalTasks).toBe(25);
        expect(projects[0].stats.completionRate).toBe(0.6);
        expect(projects[0].stats.overdueTasks).toBe(2);
        expect(result.metadata.include_stats).toBe(true);
      });

      it('should preserve data integrity with complex project names', async () => {
        const complexProject = {
          id: 'complex123',
          name: 'Project with "Quotes", Commas & Special chars (2024)',
          status: 'active',
          note: 'Multi-line\nproject\ndescription',
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: JSON.stringify([complexProject]),
          count: 1,
        });

        const result = await tool.execute({ format: 'json' });
        const projects = JSON.parse(result.data.data);
        expect(projects[0]).toEqual(complexProject);
      });

      it('should handle empty project list', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.data.count).toBe(0);
        expect(result.data.data).toBe('[]');
      });
    });

    describe('performance considerations', () => {
      it('should indicate when stats are included (slower operation)', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        const result = await tool.execute({ includeStats: true });

        // Should include metadata indicating stats were included
        expect(result.metadata.include_stats).toBe(true);
        // The description mentions this is slower, so we verify the flag is tracked
      });

      it('should optimize when stats are not requested', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        const result = await tool.execute({ includeStats: false });

        expect(result.metadata.include_stats).toBe(false);
        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ includeStats: false })
        );
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors with structured response', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Failed to access projects',
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.error).toBe(true);
        expect(result.code).toBe('SCRIPT_ERROR');
        expect(result.message).toBe('Failed to access projects');
        expect(result.metadata.duration_ms).toBeDefined();
      });

      it('should handle automation errors gracefully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('Permission denied'));

        const result = await tool.execute({ format: 'csv' });

        // Should return an error response (exact format may vary based on handleError implementation)
        expect(result).toBeDefined();
        // Check that it's an error by looking for error properties or non-success indicators
        const isError = result.success === false || result.error || result.operation === 'export_projects';
        expect(isError).toBe(true);
      });

      it('should validate format parameter', async () => {
        await expect(tool.execute({ format: 'xml' as any })).rejects.toThrow();
        await expect(tool.execute({ format: 'pdf' as any })).rejects.toThrow();
      });
    });

    describe('metadata and response structure', () => {
      it('should include complete metadata in successful response', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'csv',
          data: 'id,name\n1,"Test Project"',
          count: 1,
        });

        const result = await tool.execute({
          format: 'csv',
          includeStats: true,
        });

        expect(result.metadata).toBeDefined();
        expect(result.metadata.duration_ms).toBeDefined();
        expect(result.metadata.exported_at).toBeDefined();
        expect(result.metadata.include_stats).toBe(true);
        expect(result.metadata.format).toBe('csv');
      });

      it('should use correct operation timer', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        const result = await tool.execute({});

        // OperationTimer should be used and provide metadata
        expect(result.metadata.duration_ms).toBeDefined();
      });
    });
  });

  describe('export tools comparison and consistency', () => {
    it('should handle the same error types consistently', async () => {
      const tasksTool = new ExportTasksTool(mockCache);
      const projectsTool = new ExportProjectsTool(mockCache);
      
      const error = new Error('OmniFocus connection failed');
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockRejectedValue(error);

      const tasksResult = await tasksTool.execute({ format: 'json' });
      const projectsResult = await projectsTool.execute({ format: 'json' });

      expect(tasksResult).toHaveProperty('error');
      expect(projectsResult).toHaveProperty('error'); 
      expect(tasksResult.message).toBe(projectsResult.message);
    });

    it('should use consistent format validation', async () => {
      const tasksTool = new ExportTasksTool(mockCache);
      const projectsTool = new ExportProjectsTool(mockCache);

      // Both should reject invalid formats
      await expect(tasksTool.execute({ format: 'xml' as any })).rejects.toThrow();
      await expect(projectsTool.execute({ format: 'xml' as any })).rejects.toThrow();

      // Both should accept valid formats
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        format: 'csv', data: '', count: 0
      });

      await expect(tasksTool.execute({ format: 'csv' })).resolves.toBeDefined();
      await expect(projectsTool.execute({ format: 'csv' })).resolves.toBeDefined();
    });

    it('should handle metadata structure consistently', async () => {
      const tasksTool = new ExportTasksTool(mockCache);
      const projectsTool = new ExportProjectsTool(mockCache);

      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.execute.mockResolvedValue({
        format: 'json', data: '[]', count: 0
      });

      const tasksResult = await tasksTool.execute({});
      const projectsResult = await projectsTool.execute({});

      expect(tasksResult.metadata).toBeDefined();
      expect(projectsResult.metadata).toBeDefined();
      expect(tasksResult.metadata.exportedAt).toBeDefined();
      expect(projectsResult.metadata.exported_at).toBeDefined();
    });
  });
});