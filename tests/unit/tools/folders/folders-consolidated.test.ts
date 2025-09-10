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

// Mock OmniAutomation - the tool uses direct implementation, not delegation
const mockOmniAutomation = {
  buildScript: vi.fn((script, params) => `mocked_script_${script}_${JSON.stringify(params)}`),
  executeJson: vi.fn(),
  execute: vi.fn(),
};

vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn(() => mockOmniAutomation)
}));

vi.mock('../../../../src/utils/response-format-v2.js', () => ({
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code, message, suggestion, details },
  })),
  createSuccessResponseV2: vi.fn((operation, data, summary, metadata) => ({
    success: true,
    data,
    summary,
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({ toMetadata: vi.fn(() => ({ query_time_ms: 1 })) })),
}));

describe('FoldersTool (consolidated dispatcher)', () => {
  let tool: FoldersTool;
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    };
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new FoldersTool(mockCache);
    // Reset mock implementations
    mockOmniAutomation.executeJson.mockReset();
    mockOmniAutomation.execute.mockReset();
    mockOmniAutomation.buildScript.mockReset();
  });

  it('lists folders with direct implementation', async () => {
    // Mock successful folder list response
    mockCache.get.mockReturnValue(null); // No cache hit
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { folders: [{ id: 'f1', name: 'Work' }] }
    });

    // Test without includeProjects so caching is enabled
    const res: any = await tool.executeValidated({ 
      operation: 'list', 
      includeProjects: false, 
      includeSubfolders: false 
    } as any);

    expect(res.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.set).toHaveBeenCalled(); // Only called when includeProjects is false
  });

  it('validates get requires folderId or folderName', async () => {
    const res: any = await tool.executeValidated({ operation: 'get' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');
    expect(res.error.message).toContain('folderId'); // Current implementation only validates folderId

    // Valid get request (uses list script, expects items array)
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'f1', name: 'Work' }] }
    });
    const validRes: any = await tool.executeValidated({ operation: 'get', folderId: 'f1' } as any);
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
  });

  it('validates search requires searchQuery', async () => {
    const res: any = await tool.executeValidated({ operation: 'search' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');
    expect(res.error.message).toContain('searchQuery');

    // Valid search request
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { folders: [{ id: 'f1', name: 'Work' }] }
    });

    const validRes: any = await tool.executeValidated({ operation: 'search', searchQuery: 'Work' } as any);
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
  });

  it('validates projects requires folderId or folderName', async () => {
    const res: any = await tool.executeValidated({ operation: 'projects' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');

    // Valid projects request (current implementation only supports folderId)
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'f1', projects: [{ id: 'p1', name: 'Project A' }] }] }
    });

    const validRes: any = await tool.executeValidated({ operation: 'projects', folderId: 'f1' } as any);
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
  });

  it('create requires name and creates folder', async () => {
    const bad: any = await tool.executeValidated({ operation: 'create' } as any);
    expect(bad.success).toBe(false);
    expect(bad.error.code).toBe('MISSING_PARAMETER');
    expect(bad.error.message).toContain('name');

    // Valid create request
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { folder: { id: 'f_new', name: 'New Folder' } }
    });

    const validRes: any = await tool.executeValidated({ 
      operation: 'create', 
      name: 'New Folder', 
      parentFolderId: 'p1' 
    } as any);
    
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
  });

  it('update requires folderId and name', async () => {
    const bad: any = await tool.executeValidated({ operation: 'update' } as any);
    expect(bad.success).toBe(false);
    expect(bad.error.code).toBe('MISSING_PARAMETER');

    // Valid update request
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { folder: { id: 'f1', name: 'Updated' } }
    });

    const validRes: any = await tool.executeValidated({ 
      operation: 'update', 
      folderId: 'f1', 
      name: 'Updated' 
    } as any);
    
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
  });

  it('delete requires folderId', async () => {
    const bad: any = await tool.executeValidated({ operation: 'delete' } as any);
    expect(bad.success).toBe(false);
    expect(bad.error.code).toBe('MISSING_PARAMETER');

    // Valid delete request
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { deleted: true, folderId: 'f1' }
    });

    const validRes: any = await tool.executeValidated({ operation: 'delete', folderId: 'f1' } as any);
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
  });

  it('move requires folderId and parentFolderId', async () => {
    const bad: any = await tool.executeValidated({ operation: 'move' } as any);
    expect(bad.success).toBe(false);
    expect(bad.error.code).toBe('MISSING_PARAMETER');

    // Valid move request
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { moved: true, folderId: 'f1', parentFolderId: 'p1' }
    });

    const validRes: any = await tool.executeValidated({ 
      operation: 'move', 
      folderId: 'f1', 
      parentFolderId: 'p1' 
    } as any);
    
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
  });

  it('duplicate handles folderId and optional name', async () => {
    // Test missing folderId
    const bad: any = await tool.executeValidated({ operation: 'duplicate' } as any);
    expect(bad.success).toBe(false);
    expect(bad.error.code).toBe('MISSING_PARAMETER');
    expect(bad.error.message).toContain('folderId');

    // Mock successful duplicate without custom name (folder object returned directly)
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { 
        id: 'f_dup1', 
        name: 'Work Copy', 
        sourceId: 'f1',
        sourceName: 'Work',
        duplicated: true
      }
    });

    const validRes1: any = await tool.executeValidated({ operation: 'duplicate', folderId: 'f1' } as any);
    expect(validRes1.success).toBe(true);
    expect(validRes1.data.folder.id).toBe('f_dup1');
    expect(validRes1.data.folder.duplicated).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');

    // Mock successful duplicate with custom name (folder object returned directly)
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { 
        id: 'f_dup2', 
        name: 'Custom Copy Name',
        sourceId: 'f1',
        sourceName: 'Work',
        duplicated: true
      }
    });

    const validRes2: any = await tool.executeValidated({ 
      operation: 'duplicate', 
      folderId: 'f1', 
      duplicateName: 'Custom Copy Name' 
    } as any);
    expect(validRes2.success).toBe(true);
    expect(validRes2.data.folder.name).toBe('Custom Copy Name');
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
  });

  it('set_status requires folderId and status, handles includeContents', async () => {
    const bad: any = await tool.executeValidated({ operation: 'set_status' } as any);
    expect(bad.success).toBe(false);
    expect(bad.error.code).toBe('MISSING_PARAMETER');

    // Valid set_status request
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: { updated: true, folderId: 'f1', status: 'dropped' }
    });

    const validRes: any = await tool.executeValidated({ 
      operation: 'set_status', 
      folderId: 'f1', 
      status: 'dropped', 
      includeContents: true 
    } as any);
    
    expect(validRes.success).toBe(true);
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('folders');
  });
});