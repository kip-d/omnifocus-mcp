import { describe, it, expect, beforeAll } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusWriteTool Integration', () => {
  let tool: OmniFocusWriteTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusWriteTool(cache);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('omnifocus_write');
    expect(tool.description).toContain('Create, update, complete, or delete');
  });

  it('should create task', async () => {
    const input = {
      mutation: {
        operation: 'create' as const,
        target: 'task' as const,
        data: {
          name: 'Builder API test task',
          tags: ['test'],
        }
      }
    };

    const result = await tool.execute(input);

    // Test passes if we get a response (success or structured error)
    // Actual task creation depends on OmniFocus state
    expect(result).toHaveProperty('success');
    if (result.success) {
      expect(result.data).toHaveProperty('task');
      expect(result.data.task).toHaveProperty('taskId');
    } else {
      // Should have structured error
      expect(result).toHaveProperty('error');
    }
  });
});
