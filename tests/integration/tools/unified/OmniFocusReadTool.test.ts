import { describe, it, expect, beforeAll } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusReadTool Integration', () => {
  let tool: OmniFocusReadTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusReadTool(cache);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('omnifocus_read');
    expect(tool.description).toContain('Query OmniFocus data');
  });

  it('should query inbox tasks', async () => {
    const input = {
      query: {
        type: 'tasks' as const,
        filters: {
          project: null,
          status: 'active' as const,
        },
        limit: 5,
      }
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
  });

  it('should use smart_suggest mode', async () => {
    const input = {
      query: {
        type: 'tasks' as const,
        mode: 'smart_suggest' as const,
        limit: 10,
      }
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('metadata');
  });
});
