import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageFolderTool } from '../../../src/tools/folders/ManageFolderTool.js';
import { QueryFoldersTool } from '../../../src/tools/folders/QueryFoldersTool.js';
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
  createEntityResponse: vi.fn((operation, data, metadata) => ({
    success: true,
    data,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
  })),
  createErrorResponse: vi.fn((operation, code, message, details, metadata) => ({
    success: false,
    data: null,
    metadata: {
      operation,
      timestamp: new Date().toISOString(),
      from_cache: false,
      ...metadata,
    },
    error: {
      code,
      message,
      details,
    },
  })),
  OperationTimer: vi.fn().mockImplementation(() => ({
    toMetadata: vi.fn(() => ({ query_time_ms: 100 })),
  })),
}));

describe('Folder Tools', () => {
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

  describe('ManageFolderTool', () => {
    let tool: ManageFolderTool;

    beforeEach(() => {
      tool = new ManageFolderTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('manage_folder');
        expect(tool.description).toContain('Unified tool for folder management operations');
        expect(tool.description).toContain('create, update, delete, move, set_status, and duplicate folders');
      });

      it('should handle invalid operations', async () => {
        const result = await tool.execute({ operation: 'invalid' as any });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('INVALID_OPERATION');
        expect(result.error?.message).toContain('Unsupported operation: invalid');
      });
    });

    describe('create operation', () => {
      it('should create folder with basic parameters', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folder: { id: '1', name: 'Test Folder' },
        });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { name: 'Test Folder', options: { parent: undefined, position: undefined, relativeToFolder: undefined, status: undefined } }
        );
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
        expect(result.success).toBe(true);
      });

      it('should create folder with all parameters', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folder: { id: '1', name: 'Test Folder' },
        });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
          parent: 'parent-folder',
          position: 'after',
          relativeToFolder: 'relative-folder',
          status: 'active',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { name: 'Test Folder', options: { parent: 'parent-folder', position: 'after', relativeToFolder: 'relative-folder', status: 'active' } }
        );
      });

      it('should handle create script errors', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Creation failed',
        });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('CREATE_FAILED');
        expect(result.error?.message).toBe('Creation failed');
      });

      it('should handle create script execution errors', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Script execution failed',
        });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('CREATE_FAILED');
      });

      it('should handle invalid result format', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          // Missing folder and id
        });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('INVALID_RESULT');
        expect(result.error?.message).toContain('unexpected result format');
      });
    });

    describe('update operation', () => {
      it('should update folder with basic parameters', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folder: { id: '1', name: 'Updated Folder' },
        });

        const result = await tool.execute({
          operation: 'update',
          folderId: '1',
          name: 'Updated Folder',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { folderId: '1', updates: { name: 'Updated Folder' } }
        );
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });

      it('should update folder with multiple parameters', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folder: { id: '1', name: 'Updated Folder' },
        });

        const result = await tool.execute({
          operation: 'update',
          folderId: '1',
          name: 'Updated Folder',
          status: 'onHold',
          note: 'Updated note',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { folderId: '1', updates: { name: 'Updated Folder', status: 'onHold', note: 'Updated note' } }
        );
      });
    });

    describe('delete operation', () => {
      it('should delete folder successfully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          success: true,
          message: 'Folder deleted',
        });

        const result = await tool.execute({
          operation: 'delete',
          folderId: '1',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { folderId: '1' }
        );
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('move operation', () => {
      it('should move folder successfully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          success: true,
          message: 'Folder moved',
        });

        const result = await tool.execute({
          operation: 'move',
          folderId: '1',
          destination: 'new-parent',
          position: 'after',
          relativeToFolder: 'relative-folder',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { folderId: '1', destination: 'new-parent', position: 'after', relativeToFolder: 'relative-folder' }
        );
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('set_status operation', () => {
      it('should set folder status successfully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          success: true,
          message: 'Status updated',
        });

        const result = await tool.execute({
          operation: 'set_status',
          folderId: '1',
          status: 'completed',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { folderId: '1', status: 'completed' }
        );
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('duplicate operation', () => {
      it('should duplicate folder successfully', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folder: { id: '2', name: 'Test Folder Copy' },
        });

        const result = await tool.execute({
          operation: 'duplicate',
          folderId: '1',
          name: 'Test Folder Copy',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { folderId: '1', name: 'Test Folder Copy' }
        );
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('error handling', () => {
      it('should handle execution exceptions', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('Execution failed'));

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Execution failed');
      });
    });
  });

  describe('QueryFoldersTool', () => {
    let tool: QueryFoldersTool;

    beforeEach(() => {
      tool = new QueryFoldersTool(mockCache);
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('query_folders');
        expect(tool.description).toContain('Query folders with filters');
      });

      it('should query folders with basic parameters', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folders: [{ id: '1', name: 'Test Folder' }],
        });

        const result = await tool.execute({
          operation: 'list',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { operation: 'list', filters: {}, options: { limit: 100, includeEmpty: false } }
        );
        expect(result.success).toBe(true);
      });

      it('should query folders with filters', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folders: [{ id: '1', name: 'Active Folder' }],
        });

        const result = await tool.execute({
          operation: 'list',
          filters: { status: 'active' },
          options: { limit: 50, includeEmpty: true },
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { operation: 'list', filters: { status: 'active' }, options: { limit: 50, includeEmpty: true } }
        );
      });

      it('should get folder by ID', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folder: { id: '1', name: 'Test Folder' },
        });

        const result = await tool.execute({
          operation: 'get',
          folderId: '1',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { operation: 'get', folderId: '1' }
        );
      });

      it('should search folders', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          folders: [{ id: '1', name: 'Search Result' }],
        });

        const result = await tool.execute({
          operation: 'search',
          query: 'test',
        });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { operation: 'search', query: 'test', options: { limit: 100, includeEmpty: false } }
        );
      });
    });

    describe('caching behavior', () => {
      it('should return cached result when available', async () => {
        const cachedData = {
          folders: [{ id: '1', name: 'Cached Folder' }],
          metadata: { timestamp: '2025-01-01T00:00:00Z' },
        };
        
        mockCache.get.mockReturnValue(cachedData);

        const result = await tool.execute({
          operation: 'list',
        });

        expect(mockCache.get).toHaveBeenCalledWith('folders', 'list_{}{"limit":100,"includeEmpty":false}');
        expect(result).toEqual(cachedData);
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should cache result when not cached', async () => {
        const scriptResult = {
          folders: [{ id: '1', name: 'New Folder' }],
        };
        
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(scriptResult);

        const result = await tool.execute({
          operation: 'list',
        });

        expect(mockCache.set).toHaveBeenCalledWith('folders', 'list_{}{"limit":100,"includeEmpty":false}', {
          folders: scriptResult.folders,
          metadata: {
            timestamp: expect.any(String),
            operation: 'list',
            query_time_ms: 100,
          },
        });
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Query failed',
        });

        const result = await tool.execute({
          operation: 'list',
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Query failed');
      });

      it('should handle execution exceptions', async () => {
        mockCache.get.mockReturnValue(null);
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('Query failed'));

        const result = await tool.execute({
          operation: 'list',
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Query failed');
      });
    });
  });
});
