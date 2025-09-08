import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportTasksTool } from '../../../src/tools/export/ExportTasksTool.js';
import { ExportProjectsTool } from '../../../src/tools/export/ExportProjectsTool.js';
import { BulkExportTool } from '../../../src/tools/export/BulkExportTool.js';
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
vi.mock('../../../src/utils/response-format-v2.js', () => ({
  createSuccessResponseV2: vi.fn((operation, data, _summary, metadata) => ({
    success: true,
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
  })),
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
    error: {
      code,
      message,
      suggestion,
      details,
    },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({
    toMetadata: vi.fn(() => ({ query_time_ms: 100 })),
  })),
}));

// Mock fs/promises at module level
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
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
      executeJson: vi.fn(),
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
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        expect(result.success).toBe(true);
        expect(result.data.format).toBe('json');
      });

      it('should validate export format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'csv',
          data: 'id,name\n1,Task 1',
          count: 1,
        });

        const result = await tool.execute({ format: 'csv' });

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('csv');
        expect(result.data.data).toContain('id,name');
      });

      it('should reject invalid export formats', async () => {
        await expect(tool.execute({ format: 'xml' as any })).rejects.toThrow();
        await expect(tool.execute({ format: 'pdf' as any })).rejects.toThrow();
      });
    });

    describe('filtering and field selection', () => {
      it('should handle all filter options correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        expect(result.success).toBe(true);
        expect(result.data.data).toContain('id,name,project,tags');
      });

      it('should validate field names correctly', async () => {
        const validFields = [
          'id', 'name', 'note', 'project', 'tags', 'deferDate', 'dueDate',
          'completed', 'completionDate', 'flagged', 'estimated', 'created', 
          'createdDate', 'modified', 'modifiedDate'
        ];

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        mockOmniAutomation.executeJson.mockResolvedValue({
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

        expect(result.success).toBe(true);
        expect(result.data.count).toBe(1);
        expect(result.data.data).toContain('Urgent Work Task');
      });
    });

    describe('data formats and integrity', () => {
      it('should handle JSON format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const mockTasks = [
          { id: '1', name: 'Task 1', completed: false },
          { id: '2', name: 'Task 2', completed: true }
        ];
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json',
          data: JSON.stringify(mockTasks),
          count: 2,
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('json');
        expect(result.data.count).toBe(2);
        expect(result.data.data).toBe(JSON.stringify(mockTasks));
        // Standard metadata fields only
        expect(result.metadata.operation).toBe('export_tasks');
        expect(result.metadata.timestamp).toBeDefined();
        expect(result.metadata.from_cache).toBe(false);
      });

      it('should handle CSV format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const csvData = 'id,name,completed\n1,"Task 1",false\n2,"Task 2",true';
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'csv',
          data: csvData,
          count: 2,
        });

        const result = await tool.execute({ format: 'csv' });

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('csv');
        expect(result.data.count).toBe(2);
        expect(result.data.data).toBe(csvData);
        expect(result.data.data).toContain('id,name,completed');
        expect(result.data.data).toContain('"Task 1"');
        expect(result.data.data).toContain('"Task 2"');
      });

      it('should handle Markdown format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const markdownData = '# Tasks Export\n\n- [ ] Task 1\n- [x] Task 2';
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'markdown',
          data: markdownData,
          count: 2,
        });

        const result = await tool.execute({ format: 'markdown' });

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('markdown');
        expect(result.data.count).toBe(2);
        expect(result.data.data).toBe(markdownData);
        expect(result.data.data).toContain('# Tasks Export');
        expect(result.data.data).toContain('- [ ] Task 1');
        expect(result.data.data).toContain('- [x] Task 2');
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
        mockOmniAutomation.executeJson.mockResolvedValueOnce({
          format: 'json',
          data: JSON.stringify([taskData]),
          count: 1,
        });

        const jsonResult = await tool.execute({ format: 'json' });
        expect(jsonResult.success).toBe(true);
        const parsedJson = JSON.parse(jsonResult.data.data);
        expect(parsedJson[0]).toEqual(taskData);

        // Test CSV 
        const csvData = 'id,name,note,project,tags,completed\nabc123,"Complex Task with ""Quotes"" and, Commas","Multi\nline\nnote","Project with Spaces","tag1,tag-with-dash,tag_with_underscore",false';
        mockOmniAutomation.executeJson.mockResolvedValueOnce({
          format: 'csv',
          data: csvData,
          count: 1,
        });

        const csvResult = await tool.execute({ format: 'csv' });
        expect(csvResult.success).toBe(true);
        expect(csvResult.data.data).toContain('Complex Task with ""Quotes""');
        expect(csvResult.data.data).toContain('Project with Spaces');
      });

      it('should handle empty results correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        const result = await tool.execute({
          filter: { completed: true, limit: 100 }
        });

        expect(result.success).toBe(true);
        expect(result.data.count).toBe(0);
        expect(result.data.data).toBe('[]');
        // Standard metadata structure maintained
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
         mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Script execution failed', details: 'Test error' });

        const result = await tool.execute({ format: 'json' });

        expect(result.success).toBe(false);
        expect(result.error.message).toBe('Script execution failed');
      });

      it('should handle automation errors gracefully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockRejectedValue(new Error('OmniFocus not available'));

        const result = await tool.execute({ format: 'csv' });

        // Should return an error response
        expect(result).toBeDefined();
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should validate projectId format', async () => {
        // This test ensures we handle the projectId correctly as per the schema description
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        mockOmniAutomation.executeJson.mockResolvedValue({
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

        expect(result.success).toBe(true);
        const projects = JSON.parse(result.data.data);
        expect(projects[0]).toHaveProperty('stats');
        expect(projects[0].stats.totalTasks).toBe(15);
      });

      it('should handle boolean coercion for includeStats', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
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
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json',
          data: JSON.stringify(mockProjects),
          count: 2,
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.success).toBe(true);
        expect(result.data.format).toBe('json');
        expect(result.data.count).toBe(2);
        expect(result.data.data).toBe(JSON.stringify(mockProjects));
        // Standard metadata fields only
        expect(result.metadata.operation).toBe('export_projects');
        expect(result.metadata.timestamp).toBeDefined();
      });

      it('should handle CSV format correctly', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        const csvData = 'id,name,status\n1,"Project 1",active\n2,"Project 2",onHold';
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'csv',
          data: csvData,
          count: 2,
        });

        const result = await tool.execute({ format: 'csv' });

        expect(result.success).toBe(true);
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
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json',
          data: JSON.stringify([projectWithStats]),
          count: 1,
        });

        const result = await tool.execute({
          format: 'json',
          includeStats: true,
        });

        expect(result.success).toBe(true);
        const projects = JSON.parse(result.data.data);
        expect(projects[0].stats).toBeDefined();
        expect(projects[0].stats.totalTasks).toBe(25);
        expect(projects[0].stats.completionRate).toBe(0.6);
        expect(projects[0].stats.overdueTasks).toBe(2);
        // includeStats is in data, not metadata
        expect(result.data.includeStats).toBe(true);
      });

      it('should preserve data integrity with complex project names', async () => {
        const complexProject = {
          id: 'complex123',
          name: 'Project with "Quotes", Commas & Special chars (2024)',
          status: 'active',
          note: 'Multi-line\nproject\ndescription',
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json',
          data: JSON.stringify([complexProject]),
          count: 1,
        });

        const result = await tool.execute({ format: 'json' });
        expect(result.success).toBe(true);
        const projects = JSON.parse(result.data.data);
        expect(projects[0]).toEqual(complexProject);
      });

      it('should handle empty project list', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json',
          data: '[]',
          count: 0,
        });

        const result = await tool.execute({ format: 'json' });

        expect(result.success).toBe(true);
        expect(result.data.count).toBe(0);
        expect(result.data.data).toBe('[]');
      });
    });

    describe('performance considerations', () => {
      it('should indicate when stats are included (slower operation)', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        const result = await tool.execute({ includeStats: true });

        expect(result.success).toBe(true);
        // includeStats is in data, not metadata
        expect(result.data.includeStats).toBe(true);
        // The description mentions this is slower, so we verify the flag is tracked
      });

      it('should optimize when stats are not requested', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        const result = await tool.execute({ includeStats: false });

        expect(result.success).toBe(true);
        // includeStats is in data, not metadata
        expect(result.data.includeStats).toBe(false);
        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ includeStats: false })
        );
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors with structured response', async () => {
         mockOmniAutomation.buildScript.mockReturnValue('test script');
         mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Failed to access projects', details: 'Test error' });

        const result = await tool.execute({ format: 'json' });

        expect(result.success).toBe(false);
        expect(result.error.code).toBeDefined();
        expect(result.error.message).toBe('Failed to access projects');
      });

      it('should handle automation errors gracefully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockRejectedValue(new Error('Permission denied'));

        const result = await tool.execute({ format: 'csv' });

        // Should return an error response
        expect(result).toBeDefined();
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should validate format parameter', async () => {
        await expect(tool.execute({ format: 'xml' as any })).rejects.toThrow();
        await expect(tool.execute({ format: 'pdf' as any })).rejects.toThrow();
      });
    });

    describe('metadata and response structure', () => {
      it('should include complete metadata in successful response', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'csv',
          data: 'id,name\n1,"Test Project"',
          count: 1,
        });

        const result = await tool.execute({
          format: 'csv',
          includeStats: true,
        });

        expect(result.success).toBe(true);
        expect(result.metadata).toBeDefined();
        expect(result.metadata.query_time_ms).toBeDefined();
        // Standard metadata fields only
        expect(result.metadata.operation).toBe('export_projects');
        expect(result.metadata.timestamp).toBeDefined();
      });

      it('should use correct operation timer', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          format: 'json', data: '[]', count: 0
        });

        const result = await tool.execute({});

        expect(result.success).toBe(true);
        // OperationTimer should be used and provide metadata
        expect(result.metadata.query_time_ms).toBeDefined();
      });
    });
  });
});
