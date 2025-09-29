import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TagsToolV2 } from '../../../src/tools/tags/TagsToolV2.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

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

describe('TagsToolV2', () => {
  let tool: TagsToolV2;
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
      invalidateProject: vi.fn(),
      invalidateTag: vi.fn(),
      invalidateForTaskChange: vi.fn(),
      invalidateTaskQueries: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn((script, params) => `built script with params: ${JSON.stringify(params)}`),
      executeJson: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new TagsToolV2(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('list operation', () => {
    it('should list all tags with default parameters', async () => {
      const mockResult = {
        tags: [
          { name: 'Work', id: 'tag1', taskCount: 10 },
          { name: 'Home', id: 'tag2', taskCount: 5 },
          { name: 'Personal', id: 'tag3', taskCount: 0 }
        ],
        count: 3
      };

      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ operation: 'list' });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(3);
      expect(result.metadata.operation).toBe('list');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should use cached results when available', async () => {
      const cachedResult = {
        success: true,
        data: { items: [{ name: 'Cached' }] }
      };

      mockCache.get.mockReturnValue(cachedResult);

      const result = await tool.executeValidated({ operation: 'list' });

      expect(result).toBe(cachedResult);
      expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
    });

    it('should use optimized script for namesOnly mode', async () => {
      const mockResult = {
        tags: ['Work', 'Home', 'Personal'],
        count: 3
      };

      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ 
        operation: 'list',
        namesOnly: true 
      });

      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe('unified');
      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
      // Verify the script contains helper functions (our new architecture)
      const [scriptCall, paramsCall] = mockOmniAutomation.buildScript.mock.calls[0];
      expect(scriptCall).toContain('safeGet');
      expect(paramsCall.options).toHaveProperty('namesOnly', true);
    });

    it('should handle script execution errors', async () => {
      mockOmniAutomation.executeJson.mockRejectedValue(new Error('Script failed'));

      const result = await tool.executeValidated({ operation: 'list' });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Script failed');
    });
  });

  describe('active operation', () => {
    it('should get only active tags', async () => {
      const mockResult = {
        tags: ['Work', 'Home', 'Urgent'],
        count: 3
      };

      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({ operation: 'active' });

      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(['Work', 'Home', 'Urgent']);
      expect(result.metadata.operation).toBe('active');
      expect(result.metadata.description).toContain('incomplete tasks');
    });

    it('should cache active tags results', async () => {
      const mockResult = { tags: ['Active1'], count: 1 };
      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      await tool.executeValidated({ operation: 'active' });

      expect(mockCache.set).toHaveBeenCalledWith(
        'tags',
        'active_tags',
        expect.anything()
      );
    });
  });

  describe('manage operation', () => {
    it('should create a new tag', async () => {
      const mockResult = { success: true, tag: { name: 'NewTag', id: 'tag123' } };
      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'create',
        tagName: 'NewTag'
      });

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('create');
      expect(result.data.tagName).toBe('NewTag');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('NewTag');
    });

    it('should rename a tag', async () => {
      const mockResult = { success: true };
      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'rename',
        tagName: 'OldName',
        newName: 'NewName'
      });

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('rename');
      expect(result.data.newName).toBe('NewName');
    });

    it('should delete a tag', async () => {
      const mockResult = { success: true };
      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'delete',
        tagName: 'DeleteMe'
      });

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('delete');
      expect(result.data.tagName).toBe('DeleteMe');
    });

    it('should merge tags', async () => {
      const mockResult = { success: true, mergedCount: 5 };
      mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(mockResult));

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'merge',
        tagName: 'SourceTag',
        targetTag: 'TargetTag'
      });

      expect(result.success).toBe(true);
      expect(result.data.action).toBe('merge');
      expect(result.data.targetTag).toBe('TargetTag');
    });

    it('should validate required parameters for manage operation', async () => {
      // Missing action
      let result = await tool.executeValidated({
        operation: 'manage',
        tagName: 'Test'
      });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('MISSING_PARAMETER');
      expect(result.error.message).toContain('action is required');

      // Missing tagName
      result = await tool.executeValidated({
        operation: 'manage',
        action: 'create'
      });
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('tagName is required');

      // Missing newName for rename
      result = await tool.executeValidated({
        operation: 'manage',
        action: 'rename',
        tagName: 'OldTag'
      });
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('newName is required');

      // Missing targetTag for merge
      result = await tool.executeValidated({
        operation: 'manage',
        action: 'merge',
        tagName: 'SourceTag'
      });
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('targetTag is required');
    });
  });

  describe('invalid operation', () => {
    it('should return error for invalid operation', async () => {
      const result = await tool.executeValidated({ 
        operation: 'invalid' as any
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_OPERATION');
    });
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('tags');
      expect(tool.description).toContain('Comprehensive tag management');
      expect(tool.description).toContain('list');
      expect(tool.description).toContain('active');
      expect(tool.description).toContain('manage');
    });
  });
});