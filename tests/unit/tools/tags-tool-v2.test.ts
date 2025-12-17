import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TagsTool } from '../../../src/tools/tags/TagsTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';
import { Logger } from '../../../src/utils/Logger.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn(),
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn(),
}));
vi.mock('../../../src/utils/Logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('TagsTool', () => {
  let tool: TagsTool;
  let mockCache: any;
  let mockOmniAutomation: any;
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidateTag: vi.fn(),
    };

    mockOmniAutomation = {
      buildScript: vi.fn(),
      executeJson: vi.fn(),
      execute: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);

    tool = new TagsTool(mockCache);
    (tool as any).omniAutomation = mockOmniAutomation;
  });

  describe('basic operations', () => {
    it('should list tags with operation="list"', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        success: true,
        data: {
          tags: [
            { id: 'tag1', name: 'Work' },
            { id: 'tag2', name: 'Personal' },
          ],
          count: 2,
        },
      });

      const result = await tool.executeValidated({
        operation: 'list',
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).items).toBeDefined();
      // AST builder generates script directly, no longer uses buildScript
      expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    });

    it('should get active tags with operation="active"', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        success: true,
        data: {
          tags: [{ id: 'tag1', name: 'Work' }],
          count: 1,
        },
      });

      const result = await tool.executeValidated({
        operation: 'active',
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).items).toBeDefined();
    });
  });

  describe('mutually exclusive tags', () => {
    it('should set mutual exclusivity with action="set_mutual_exclusivity" and mutuallyExclusive=true', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        success: true,
        data: {
          success: true,
          action: 'set_mutual_exclusivity',
          tagName: 'Priority',
          childrenAreMutuallyExclusive: true,
          message: 'Mutual exclusivity for Priority child tags set to enabled',
        },
      });

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'Priority',
        mutuallyExclusive: true,
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).action).toBe('set_mutual_exclusivity');
      expect((result.data as any).tagName).toBe('Priority');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('Priority');
      expect(mockOmniAutomation.buildScript).toHaveBeenCalled();
    });

    it('should disable mutual exclusivity with action="set_mutual_exclusivity" and mutuallyExclusive=false', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        success: true,
        data: {
          success: true,
          action: 'set_mutual_exclusivity',
          tagName: 'Priority',
          childrenAreMutuallyExclusive: false,
          message: 'Mutual exclusivity for Priority child tags set to disabled',
        },
      });

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'Priority',
        mutuallyExclusive: false,
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).action).toBe('set_mutual_exclusivity');
      expect((result.data as any).tagName).toBe('Priority');
      expect(mockCache.invalidateTag).toHaveBeenCalledWith('Priority');
    });

    it('should return error when mutuallyExclusive is missing for set_mutual_exclusivity action', async () => {
      mockCache.get.mockReturnValue(null);

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'Priority',
        // mutuallyExclusive is undefined
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('MISSING_PARAMETER');
      expect((result as any).error?.message).toContain('mutuallyExclusive is required');
    });

    it('should support childrenAreMutuallyExclusive property in tag list results', async () => {
      mockCache.get.mockReturnValue(null);
      // AST builder generates script directly, mock the executeJson response in the new format
      mockOmniAutomation.executeJson.mockResolvedValue({
        success: true,
        data: {
          ok: true,
          v: 'ast',
          items: [
            { id: 'tag1', name: 'Priority', childrenAreMutuallyExclusive: true },
            { id: 'tag2', name: 'Status', childrenAreMutuallyExclusive: false },
          ],
          summary: { total: 2 },
        },
      });

      const result = await tool.executeValidated({
        operation: 'list',
        sortBy: 'name',
        includeEmpty: true,
        fastMode: false,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(true);
      const tags = (result.data as any).items;
      expect(tags.length).toBe(2);
      expect(tags[0].childrenAreMutuallyExclusive).toBe(true);
      expect(tags[1].childrenAreMutuallyExclusive).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should require action parameter for manage operation', async () => {
      mockCache.get.mockReturnValue(null);

      const result = await tool.executeValidated({
        operation: 'manage',
        tagName: 'Priority',
        // action is undefined
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('MISSING_PARAMETER');
      expect((result as any).error?.message).toContain('action is required');
    });

    it('should require tagName parameter for manage operation', async () => {
      mockCache.get.mockReturnValue(null);

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        // tagName is undefined
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('MISSING_PARAMETER');
      expect((result as any).error?.message).toContain('tagName is required');
    });

    it('should handle script errors gracefully', async () => {
      mockCache.get.mockReturnValue(null);
      mockOmniAutomation.buildScript.mockReturnValue('test script');
      mockOmniAutomation.executeJson.mockResolvedValue({
        success: false,
        error: 'Tag not found',
        details: 'Tag "NonExistent" could not be located',
      });

      const result = await tool.executeValidated({
        operation: 'manage',
        action: 'set_mutual_exclusivity',
        tagName: 'NonExistent',
        mutuallyExclusive: true,
        sortBy: 'name',
        includeEmpty: true,
        fastMode: true,
        namesOnly: false,
        includeUsageStats: false,
        includeTaskCounts: false,
      });

      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe('SCRIPT_ERROR');
    });
  });
});
