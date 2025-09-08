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

// Capture calls to underlying tools
const queryExecute = vi.fn(async (_args: any) => ({ success: true, data: {}, metadata: { operation: 'query_folders' } }));
const manageExecute = vi.fn(async (_args: any) => ({ success: true, data: {}, metadata: { operation: 'manage_folder' } }));

vi.mock('../../../../src/tools/folders/QueryFoldersTool.js', () => ({
  QueryFoldersTool: vi.fn().mockImplementation(() => ({ execute: queryExecute }))
}));
vi.mock('../../../../src/tools/folders/ManageFolderTool.js', () => ({
  ManageFolderTool: vi.fn().mockImplementation(() => ({ execute: manageExecute }))
}));

vi.mock('../../../../src/utils/response-format-v2.js', () => ({
  createErrorResponseV2: vi.fn((operation, code, message, suggestion, details, metadata) => ({
    success: false,
    data: {},
    metadata: { operation, timestamp: new Date().toISOString(), from_cache: false, ...metadata },
    error: { code, message, suggestion, details },
  })),
  OperationTimerV2: vi.fn().mockImplementation(() => ({ toMetadata: vi.fn(() => ({ query_time_ms: 1 })) })),
}));

describe('FoldersTool (consolidated dispatcher)', () => {
  let tool: FoldersTool;

  beforeEach(() => {
    vi.clearAllMocks();
    (CacheManager as any).mockImplementation(() => ({ }));
    tool = new FoldersTool({} as any);
  });

  it('routes list to QueryFoldersTool with include flags', async () => {
    await tool.executeValidated({ operation: 'list', includeProjects: true, includeSubfolders: false } as any);
    expect(queryExecute).toHaveBeenCalledWith({ operation: 'list', includeProjects: true, includeSubfolders: false });
  });

  it('validates get requires folderId or folderName', async () => {
    const res: any = await tool.executeValidated({ operation: 'get' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');

    await tool.executeValidated({ operation: 'get', folderId: 'f1' } as any);
    expect(queryExecute).toHaveBeenCalledWith({ operation: 'get', folderId: 'f1', folderName: undefined });
  });

  it('validates search requires searchQuery', async () => {
    const res: any = await tool.executeValidated({ operation: 'search' } as any);
    expect(res.success).toBe(false);
    await tool.executeValidated({ operation: 'search', searchQuery: 'Work' } as any);
    expect(queryExecute).toHaveBeenCalledWith({ operation: 'search', searchQuery: 'Work' });
  });

  it('validates projects requires folderId or folderName', async () => {
    const res: any = await tool.executeValidated({ operation: 'projects' } as any);
    expect(res.success).toBe(false);
    await tool.executeValidated({ operation: 'projects', folderName: 'Area' } as any);
    expect(queryExecute).toHaveBeenCalledWith({ operation: 'projects', folderId: undefined, folderName: 'Area' });
  });

  it('create requires name and maps params', async () => {
    const bad: any = await tool.executeValidated({ operation: 'create' } as any);
    expect(bad.success).toBe(false);
    await tool.executeValidated({ operation: 'create', name: 'New', parentFolderId: 'root' } as any);
    expect(manageExecute).toHaveBeenCalledWith({ operation: 'create', name: 'New', parentFolderId: 'root' });
  });

  it('update requires folderId and name', async () => {
    const r1: any = await tool.executeValidated({ operation: 'update', name: 'X' } as any);
    expect(r1.success).toBe(false);
    const r2: any = await tool.executeValidated({ operation: 'update', folderId: 'f1' } as any);
    expect(r2.success).toBe(false);
    await tool.executeValidated({ operation: 'update', folderId: 'f1', name: 'Renamed' } as any);
    expect(manageExecute).toHaveBeenCalledWith({ operation: 'update', folderId: 'f1', name: 'Renamed' });
  });

  it('delete requires folderId', async () => {
    const bad: any = await tool.executeValidated({ operation: 'delete' } as any);
    expect(bad.success).toBe(false);
    await tool.executeValidated({ operation: 'delete', folderId: 'f1' } as any);
    expect(manageExecute).toHaveBeenCalledWith({ operation: 'delete', folderId: 'f1' });
  });

  it('move requires folderId and parentFolderId', async () => {
    const r1: any = await tool.executeValidated({ operation: 'move', parentFolderId: 'p' } as any);
    expect(r1.success).toBe(false);
    const r2: any = await tool.executeValidated({ operation: 'move', folderId: 'f1' } as any);
    expect(r2.success).toBe(false);
    await tool.executeValidated({ operation: 'move', folderId: 'f1', parentFolderId: 'p' } as any);
    expect(manageExecute).toHaveBeenCalledWith({ operation: 'move', folderId: 'f1', parentFolderId: 'p' });
  });

  it('duplicate requires folderId and maps optional name', async () => {
    const bad: any = await tool.executeValidated({ operation: 'duplicate' } as any);
    expect(bad.success).toBe(false);
    await tool.executeValidated({ operation: 'duplicate', folderId: 'f1', duplicateName: 'Copy' } as any);
    expect(manageExecute).toHaveBeenCalledWith({ operation: 'duplicate', folderId: 'f1', duplicateName: 'Copy' });
  });

  it('set_status requires folderId and status, passes includeContents', async () => {
    const r1: any = await tool.executeValidated({ operation: 'set_status', status: 'dropped' } as any);
    expect(r1.success).toBe(false);
    const r2: any = await tool.executeValidated({ operation: 'set_status', folderId: 'f1' } as any);
    expect(r2.success).toBe(false);
    await tool.executeValidated({ operation: 'set_status', folderId: 'f1', status: 'active', includeContents: true } as any);
    expect(manageExecute).toHaveBeenCalledWith({ operation: 'set_status', folderId: 'f1', status: 'active', includeContents: true });
  });
});
