import { describe, it, expect, beforeAll } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusReadTool Integration', () => {
  let tool: OmniFocusReadTool;
  let writeTool: OmniFocusWriteTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusReadTool(cache);
    writeTool = new OmniFocusWriteTool(cache);
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

  it('should filter by exact task ID (synthetic test)', async () => {
    // Step 1: Create a task with known properties
    const createInput = {
      mutation: {
        operation: 'create' as const,
        target: 'task' as const,
        data: {
          name: 'ID Filter Synthetic Test Task',
          note: 'Created to test exact ID filtering',
          flagged: true,
        }
      }
    };

    const createResult = await writeTool.execute(createInput);

    // Log the result for debugging
    if (!createResult.success) {
      console.log('Task creation failed:', JSON.stringify(createResult, null, 2));
    }

    // Verify task was created successfully
    expect(createResult.success).toBe(true);
    if (!createResult.success) {
      throw new Error(`Task creation failed: ${JSON.stringify(createResult.error)}`);
    }
    expect(createResult.data).toHaveProperty('task');
    expect(createResult.data.task).toHaveProperty('taskId');

    const createdTaskId = createResult.data.task.taskId;

    // Step 2: Query by exact ID using omnifocus_read
    const queryInput = {
      query: {
        type: 'tasks' as const,
        filters: {
          id: createdTaskId,
        },
      }
    };

    const queryResult = await tool.execute(queryInput);

    // Step 3: Verify exactly 1 result returned
    expect(queryResult.success).toBe(true);
    expect(queryResult.data).toHaveProperty('tasks');
    expect(Array.isArray(queryResult.data.tasks)).toBe(true);
    expect(queryResult.data.tasks.length).toBe(1);

    // Step 4: Validate returned task matches created task
    const returnedTask = queryResult.data.tasks[0];
    expect(returnedTask.id).toBe(createdTaskId);
    expect(returnedTask.name).toBe('ID Filter Synthetic Test Task');

    // Cleanup: Complete the test task to remove it from active lists
    const completeInput = {
      mutation: {
        operation: 'complete' as const,
        target: 'task' as const,
        id: createdTaskId,
      }
    };

    await writeTool.execute(completeInput);
  }, 60000); // 60 second timeout for OmniFocus operations
});
