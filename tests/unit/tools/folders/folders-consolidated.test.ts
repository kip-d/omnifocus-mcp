import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FoldersTool } from '../../../../src/tools/folders/FoldersTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

// Mock deps
vi.mock('../../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

// Mock the script creation functions since we're testing the self-contained implementation
vi.mock('../../../../src/omnifocus/scripts/folders/list-folders.js', () => ({
  createListFoldersScript: vi.fn(() => 'mock-list-script')
}));
vi.mock('../../../../src/omnifocus/scripts/folders/create-folder.js', () => ({
  CREATE_FOLDER_SCRIPT: 'mock-create-script'
}));
vi.mock('../../../../src/omnifocus/scripts/folders/update-folder.js', () => ({
  UPDATE_FOLDER_SCRIPT: 'mock-update-script'
}));

vi.mock('../../../../src/utils/response-format-v2.js', () => ({
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code, message, suggestion, details },
  })),
  createSuccessResponseV2: vi.fn((operation, data, suggestion, metadata) => ({
    success: true,
    data,
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({ toMetadata: vi.fn(() => ({ query_time_ms: 1 })) })),
}));

describe('FoldersTool (self-contained implementation)', () => {
  let tool: FoldersTool;
  let mockCache: any;
  let mockOmni: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() };
    mockOmni = { buildScript: vi.fn(), execute: vi.fn(), executeJson: vi.fn() };
    
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new FoldersTool(mockCache);
    (tool as any).omniAutomation = mockOmni;
    
    // Mock the execJson method that the consolidated tool uses
    (tool as any).execJson = vi.fn();
  });

  describe('Query Operations', () => {
    it('list uses cache when available', async () => {
      mockCache.get.mockReturnValue([{ id: 'f1', name: 'Work' }]);
      await tool.executeValidated({ operation: 'list' } as any);
      
      expect(mockCache.get).toHaveBeenCalledWith('folders', 'folders');
      // Should use cache and not call execJson
      expect((tool as any).execJson).not.toHaveBeenCalled();
    });

    it('validates get requires folderId', async () => {
      const res: any = await tool.executeValidated({ operation: 'get' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('folderId is required');
    });

    it('validates search requires searchQuery', async () => {
      const res: any = await tool.executeValidated({ operation: 'search' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('searchQuery is required');
    });

    it('validates projects requires folderId', async () => {
      const res: any = await tool.executeValidated({ operation: 'projects' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('folderId is required');
    });
  });

  describe('Management Operations', () => {
    it('create requires name parameter', async () => {
      const res: any = await tool.executeValidated({ operation: 'create' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('name is required');
    });

    it('update requires folderId parameter', async () => {
      const res: any = await tool.executeValidated({ operation: 'update', name: 'NewName' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('folderId is required');
    });

    it('delete requires folderId parameter', async () => {
      const res: any = await tool.executeValidated({ operation: 'delete' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('folderId is required');
    });

    it('move requires folderId parameter', async () => {
      const res: any = await tool.executeValidated({ operation: 'move', parentFolderId: 'parent' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('folderId is required');
    });

    it('set_status requires both folderId and status', async () => {
      const res1: any = await tool.executeValidated({ operation: 'set_status', status: 'active' } as any);
      expect(res1.success).toBe(false);
      expect(res1.error.code).toBe('MISSING_PARAMETER');
      expect(res1.error.message).toContain('folderId is required');

      const res2: any = await tool.executeValidated({ operation: 'set_status', folderId: 'f1' } as any);
      expect(res2.success).toBe(false);
      expect(res2.error.code).toBe('MISSING_PARAMETER');
      expect(res2.error.message).toContain('status is required');
    });

    it('duplicate returns NOT_IMPLEMENTED error', async () => {
      const res: any = await tool.executeValidated({ operation: 'duplicate', folderId: 'f1' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('NOT_IMPLEMENTED');
      expect(res.error.message).toContain('Duplicate operation is not yet implemented');
    });
  });

  describe('Script Execution', () => {
    it('handles successful script execution for list operation', async () => {
      mockCache.get.mockReturnValue(null); // No cache
      (tool as any).execJson.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'f1', name: 'Work' }] }
      });

      const res: any = await tool.executeValidated({ operation: 'list' } as any);
      expect(res.success).toBe(true);
      expect(res.data.folders).toHaveLength(1);
      expect(res.data.folders[0].name).toBe('Work');
    });

    it('handles script execution failures', async () => {
      (tool as any).execJson.mockResolvedValue({
        success: false,
        error: 'Script execution failed'
      });

      const res: any = await tool.executeValidated({ operation: 'get', folderId: 'f1' } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('GET_FAILED');
    });

    it('invalidates cache after successful mutations', async () => {
      (tool as any).execJson.mockResolvedValue({
        success: true,
        data: { id: 'f1', name: 'Updated Folder' }
      });

      await tool.executeValidated({ operation: 'update', folderId: 'f1', name: 'Updated' } as any);
      
      expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects');
    });
  });
});