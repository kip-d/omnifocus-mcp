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
  it('should pass project field to the batch-create fast path when provided', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    // OMN-113: an all-task batch takes the single-script fast path, so the
    // project field flows into buildBatchCreateTasksScript as spec.projectId
    // (not buildCreateTaskScript). The regression guard — "project must not be
    // silently dropped" — is unchanged; only the seam moved. (OMN-128: the
    // builder is async now, hence mockResolvedValue.)
    const spy = vi.spyOn(scriptBuilder, 'buildBatchCreateTasksScript').mockResolvedValue({
      script: 'mock script',
      operation: 'create',
      target: 'task',
      description: 'mock',
    });

    // Mock execJson to return the fast-path result shape.
    vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: { results: [{ tempId: 'task1', taskId: 'new-task-id-123', success: true }] },
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

    expect(spy).toHaveBeenCalledOnce();
    const specs = spy.mock.calls[0][0];
    expect(specs[0]).toHaveProperty('projectId', 'My Existing Project');

    spy.mockRestore();
  });

  // OMN-206: sequential (action-group ordering) must reach the fast-path spec,
  // parity with the OMN-198 single-create fix. Was silently dropped — the
  // fast-path item→spec map omitted it and BatchTaskSpec had no field for it.
  it('should pass sequential to the batch-create fast path when provided (OMN-206)', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    const spy = vi.spyOn(scriptBuilder, 'buildBatchCreateTasksScript').mockResolvedValue({
      script: 'mock script',
      operation: 'create',
      target: 'task',
      description: 'mock',
    });

    vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: { results: [{ tempId: 'grp', taskId: 'new-group-id', success: true }] },
    });

    await tool.execute({
      mutation: {
        operation: 'batch',
        target: 'task',
        operations: [
          {
            operation: 'create',
            target: 'task',
            data: { tempId: 'grp', name: 'Sequential group', sequential: true },
          },
        ],
      },
    });

    expect(spy).toHaveBeenCalledOnce();
    const specs = spy.mock.calls[0][0];
    expect(specs[0]).toHaveProperty('sequential', true);

    spy.mockRestore();
  });

  // OMN-206: a repetitionRule makes the batch fast-path-ineligible, so the item
  // takes the per-item path (createBatchTask → buildCreateTaskScript). sequential
  // must survive that route too.
  it('should pass sequential to the per-item path (repetitionRule forces it) (OMN-206)', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    const taskSpy = vi.spyOn(scriptBuilder, 'buildCreateTaskScript').mockResolvedValue({
      script: 'mock script',
      operation: 'create',
      target: 'task',
      description: 'mock',
    });

    vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: { results: [{ tempId: 'grp', taskId: 'new-group-id', success: true }] },
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
              tempId: 'grp',
              name: 'Sequential repeating group',
              sequential: true,
              repetitionRule: { frequency: 'weekly', interval: 1 },
            },
          },
        ],
      },
    });

    expect(taskSpy).toHaveBeenCalledOnce();
    const taskData = taskSpy.mock.calls[0][0];
    expect(taskData).toHaveProperty('sequential', true);

    taskSpy.mockRestore();
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
    vi.spyOn(scriptBuilder, 'buildCreateProjectScript').mockResolvedValue({
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

  it('should pass parentTaskId to the batch-create fast path when provided (OMN-31)', async () => {
    const cache = new StubCache();
    const tool = new OmniFocusWriteTool(cache as any);

    // OMN-113: all-task batch → single-script fast path; parentTaskId flows in
    // as spec.parentTaskId (resolved via Task.byIdentifier inside the script).
    // OMN-128: the builder is async now, hence mockResolvedValue.
    const spy = vi.spyOn(scriptBuilder, 'buildBatchCreateTasksScript').mockResolvedValue({
      script: 'mock script',
      operation: 'create',
      target: 'task',
      description: 'mock',
    });

    vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: { results: [{ tempId: 'subtask1', taskId: 'new-subtask-id', success: true }] },
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
              tempId: 'subtask1',
              name: 'Research: Deploy software',
              parentTaskId: 'existing-parent-task-id',
            },
          },
        ],
      },
    });

    expect(spy).toHaveBeenCalledOnce();
    const specs = spy.mock.calls[0][0];
    expect(specs[0]).toHaveProperty('parentTaskId', 'existing-parent-task-id');

    spy.mockRestore();
  });
});
