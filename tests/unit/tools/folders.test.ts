import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageFolderTool } from '../../../src/tools/folders/ManageFolderTool.js';
import { QueryFoldersTool } from '../../../src/tools/folders/QueryFoldersTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { createMockedTool, createManageFolderMock, createQueryFoldersMock, ResponseBuilder } from '../../utils/mock-factories.js';
import { SchemaTestHelper } from '../../utils/schema-helpers.js';

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
      executeJson: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
  });

  describe('ManageFolderTool', () => {
    let tool: ManageFolderTool;
    let folderMock: any;

    beforeEach(() => {
      folderMock = createManageFolderMock();
      tool = createMockedTool(ManageFolderTool, {
        cache: mockCache,
        omniAutomation: folderMock
      });
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('manage_folder');
        expect(tool.description).toContain('Unified tool for folder management operations');
        expect(tool.description).toContain('create, update, delete, move, set_status, and duplicate folders');
      });

      it('should handle invalid operations', async () => {
        // Invalid operations will throw during validation
        await expect(tool.execute({ operation: 'invalid' as any })).rejects.toThrow('Invalid parameters');
      });
    });

    describe('create operation', () => {
      it('should create folder with basic parameters', async () => {
        // Set up mock to return success for create operation
        folderMock.execute.mockResolvedValue({
          folder: { 
            id: 'folder-1',
            name: 'Test Folder',
            status: 'active'
          }
        });
        
        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(true);
        expect(result.data.folder).toBeDefined();
        expect(result.data.folder.name).toBe('Test Folder');
        expect(result.data.folder.folderId).toBe('folder-1');
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('update operation', () => {
      it('should update folder with multiple parameters', async () => {
        // Set up mock for update operation
        // Update expects properties at root level, not nested in folder
        folderMock.execute.mockResolvedValue({
          id: 'folder-1',
          name: 'Updated Folder',
          status: 'active',
          changes: { name: 'Updated Folder', status: 'active' }
        });
        
        const result = await tool.execute({
          operation: 'update',
          folderId: 'folder-1',
          name: 'Updated Folder',
          status: 'active',
        });

        expect(result.success).toBe(true);
        expect(result.data.folder).toBeDefined();
        expect(result.data.folder.name).toBe('Updated Folder');
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('delete operation', () => {
      it('should delete folder successfully', async () => {
        // Set up mock for delete operation
        folderMock.execute.mockResolvedValue({
          success: true,
          deletedFolder: { 
            id: 'folder-1',
            name: 'Deleted Folder'
          }
        });
        
        const result = await tool.execute({
          operation: 'delete',
          folderId: 'folder-1',
        });

        expect(result.success).toBe(true);
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('move operation', () => {
      it('should move folder successfully', async () => {
        // Set up mock for move operation  
        // Move also expects properties at root level
        folderMock.execute.mockResolvedValue({
          id: 'folder-1',
          name: 'Moved Folder',
          parent: 'folder-2',
          folder: {
            oldParent: null,
            newParent: 'folder-2'
          }
        });
        
        const result = await tool.execute({
          operation: 'move',
          folderId: 'folder-1',
          parentId: 'folder-2',
        });

        expect(result.success).toBe(true);
        expect(result.data.folder).toBeDefined();
        expect(result.data.folder.parent).toBe('folder-2');
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('set_status operation', () => {
      it('should set folder status successfully', async () => {
        // Set up mock for set_status operation
        // Set_status also expects properties at root level
        folderMock.execute.mockResolvedValue({
          id: 'folder-1',
          name: 'Status Folder',
          status: 'dropped',
          changes: { status: 'dropped' }
        });
        
        const result = await tool.execute({
          operation: 'set_status',
          folderId: 'folder-1',
          status: 'dropped',
        });

        expect(result.success).toBe(true);
        expect(result.data.folder).toBeDefined();
        expect(result.data.folder.status).toBe('dropped');
        expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      });
    });

    describe('duplicate operation', () => {
      it('should return NOT_IMPLEMENTED error for duplicate operation', async () => {
        const result = await tool.execute({
          operation: 'duplicate',
          folderId: 'folder-1',
          newName: 'Test Folder (Copy)',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('NOT_IMPLEMENTED');
        expect(result.error?.message).toContain('not yet implemented');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });
    });

    describe('create operation extended', () => {
      it('should create folder with all parameters', async () => {
        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
          parent: 'parent-folder',
          position: 'after',
          relativeToFolder: 'relative-folder',
          status: 'active',
        });

        expect(folderMock.buildScript).toHaveBeenCalledWith(
          expect.any(String),
          { name: 'Test Folder', options: { parent: 'parent-folder', position: 'after', relativeToFolder: 'relative-folder', status: 'active' } }
        );
      });

      it('should handle create script errors', async () => {
       folderMock.execute.mockResolvedValue({ success: false, error: 'Creation failed', details: 'Test error' });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('CREATE_FAILED');
        expect(result.error?.message).toBe('Creation failed');
      });

      it('should handle create script execution errors', async () => {
        folderMock.execute.mockResolvedValue({ success: false, error: 'Script execution failed', details: 'Test error' });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test Folder',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('CREATE_FAILED');
      });

      it('should handle invalid result format', async () => {
        folderMock.execute.mockResolvedValue({
          // Missing folder and id - should trigger INVALID_RESULT
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
  });

  describe('QueryFoldersTool', () => {
    let tool: QueryFoldersTool;
    let queryMock: any;

    beforeEach(() => {
      queryMock = createQueryFoldersMock();
      tool = createMockedTool(QueryFoldersTool, {
        cache: mockCache,
        omniAutomation: queryMock
      });
    });

    describe('basic functionality', () => {
      it('should have correct name and description', () => {
        expect(tool.name).toBe('query_folders');
        expect(tool.description).toContain('Unified tool for folder query operations');
      });

      it('should query folders with basic parameters', async () => {
        const result = await tool.execute({
          operation: 'list',
        });

        expect(queryMock.buildScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data.folders).toBeDefined();
        expect(Array.isArray(result.data.folders)).toBe(true);
      });

      it('should query folders with filters', async () => {
        const result = await tool.execute({
          operation: 'list',
          status: ['active'],  // Status must be an array
          limit: 50,
          includeEmpty: true,
        });

        expect(result.success).toBe(true);
        expect(result.data.folders).toBeDefined();
      });

      it('should get folder by ID', async () => {
        // Update mock to return folders array for get operation to work
        queryMock.execute.mockResolvedValue({
          folders: [{ id: '1', name: 'Test Folder', status: 'active' }],
        });
        
        const result = await tool.execute({
          operation: 'get',
          folderId: '1',
        });

        expect(result.success).toBe(true);
        expect(result.data.folder).toBeDefined();
        expect(result.data.folder.id).toBe('1');
      });

      it('should search folders', async () => {
        const result = await tool.execute({
          operation: 'search',
          searchTerm: 'test',  // Use searchTerm instead of query
        });

        expect(result.success).toBe(true);
        expect(result.data.folders).toBeDefined();
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

        expect(mockCache.get).toHaveBeenCalledWith('folders', 'folders');
        expect(result.success).toBe(true);
        expect(result.data.folders).toEqual(cachedData.folders);
        expect(queryMock.execute).not.toHaveBeenCalled();
      });

      it('should cache result when not cached', async () => {
        const scriptResult = {
          folders: [{ id: '1', name: 'New Folder' }],
        };
        
        mockCache.get.mockReturnValue(null);
        queryMock.buildScript.mockReturnValue('test script');
        queryMock.execute.mockResolvedValue(scriptResult);

        const result = await tool.execute({
          operation: 'list',
        });

        expect(mockCache.set).toHaveBeenCalledWith('folders', 'folders', scriptResult);
        expect(result.success).toBe(true);
        expect(result.data.folders).toEqual(scriptResult.folders);
      });
    });

    describe('error handling', () => {
      it('should handle script execution errors', async () => {
         mockCache.get.mockReturnValue(null);
         queryMock.execute.mockResolvedValue({ success: false, error: 'Query failed', details: 'Test error' });

        const result = await tool.execute({
          operation: 'list',
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Query failed');
      });

      it('should handle execution exceptions', async () => {
        mockCache.get.mockReturnValue(null);
        queryMock.execute.mockRejectedValue(new Error('Query failed'));

        const result = await tool.execute({
          operation: 'list',
        });

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Query failed');
      });
    });
  });
});
