/**
 * Unit test for BatchCreateTool using project field on task items.
 *
 * Regression test: batch create with project field should pass the
 * project through to the script builder, not silently drop it.
 */

import { describe, it, expect, vi } from 'vitest';
import { BatchCreateTool } from '../../../../src/tools/batch/BatchCreateTool.js';
import * as scriptBuilder from '../../../../src/contracts/ast/mutation-script-builder.js';

class StubCache {
  invalidate(): void {}
  invalidateProject(): void {}
  invalidateTag(): void {}
  invalidateTaskQueries(): void {}
}

describe('BatchCreateTool project field', () => {
  it('should pass project field to buildCreateTaskScript when provided', async () => {
    const cache = new StubCache();
    const tool = new BatchCreateTool(cache as any);

    // Spy on buildCreateTaskScript to capture the TaskCreateData
    const spy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
      script: 'mock script',
      operation: 'create',
      target: 'task',
      description: 'mock',
    });

    // Mock execJson to return a successful task creation
    vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: { taskId: 'new-task-id-123' },
    });

    await tool.execute({
      items: [
        {
          type: 'task' as const,
          tempId: 'task1',
          name: 'Test task',
          project: 'My Existing Project',
        },
      ],
      createSequentially: true,
      atomicOperation: false,
      returnMapping: true,
      stopOnError: true,
    });

    // Verify buildCreateTaskScript was called with project in TaskCreateData
    expect(spy).toHaveBeenCalledOnce();
    const taskCreateData = spy.mock.calls[0][0];
    expect(taskCreateData).toHaveProperty('project', 'My Existing Project');

    spy.mockRestore();
  });

  it('should prefer parentTempId over project field when both present', async () => {
    const cache = new StubCache();
    const tool = new BatchCreateTool(cache as any);

    const spy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
      script: 'mock script',
      operation: 'create',
      target: 'task',
      description: 'mock',
    });

    // Mock buildCreateProjectScript for the parent project
    vi.spyOn(scriptBuilder, 'buildCreateProjectScript').mockReturnValue({
      script: 'mock project script',
      operation: 'create',
      target: 'project',
      description: 'mock',
    });

    vi.spyOn(tool as any, 'execJson')
      .mockResolvedValueOnce({
        success: true,
        data: { projectId: 'real-project-id' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { taskId: 'new-task-id' },
      });

    await tool.execute({
      items: [
        {
          type: 'project' as const,
          tempId: 'proj1',
          name: 'Batch Project',
        },
        {
          type: 'task' as const,
          tempId: 'task1',
          name: 'Child task',
          parentTempId: 'proj1',
          project: 'Some Other Project',
        },
      ],
      createSequentially: true,
      atomicOperation: false,
      returnMapping: true,
      stopOnError: true,
    });

    // parentTempId resolved to project ID should take precedence
    expect(spy).toHaveBeenCalledOnce();
    const taskCreateData = spy.mock.calls[0][0];
    expect(taskCreateData).toHaveProperty('project', 'real-project-id');

    spy.mockRestore();
  });
});
