/**
 * Unit test for batch create using project field on task items.
 *
 * Regression test: batch create with project field should pass the
 * project through to the script builder, not silently drop it.
 *
 * Previously tested via BatchCreateTool; now tests the same logic
 * inlined in OmniFocusWriteTool.
 */

import { describe, it, expect, vi } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import * as scriptBuilder from '../../../../src/contracts/ast/mutation-script-builder.js';

class StubCache {
  invalidate(): void {}
  invalidateProject(): void {}
  invalidateTag(): void {}
  invalidateTaskQueries(): void {}
  invalidateForTaskChange(): void {}
  clear(): void {}
}

describe('Batch create project field', () => {
  it('should pass project field to buildCreateTaskScript when provided', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

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
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task1',
              name: 'Test task',
              project: 'My Existing Project',
            },
          },
        ],
      },
    });

    // Verify buildCreateTaskScript was called with project in TaskCreateData
    expect(spy).toHaveBeenCalledOnce();
    const taskCreateData = spy.mock.calls[0][0];
    expect(taskCreateData).toHaveProperty('project', 'My Existing Project');

    spy.mockRestore();
  });

  it('should prefer parentTempId over project field when both present', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    const taskSpy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
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
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'project',
            data: {
              tempId: 'proj1',
              name: 'Batch Project',
            },
          },
          {
            operation: 'create',
            target: 'task',
            data: {
              tempId: 'task1',
              name: 'Child task',
              parentTempId: 'proj1',
              project: 'Some Other Project',
            },
          },
        ],
      },
    });

    // parentTempId resolved to project ID should take precedence
    expect(taskSpy).toHaveBeenCalledOnce();
    const taskCreateData = taskSpy.mock.calls[0][0];
    expect(taskCreateData).toHaveProperty('project', 'real-project-id');

    taskSpy.mockRestore();
  });
});
