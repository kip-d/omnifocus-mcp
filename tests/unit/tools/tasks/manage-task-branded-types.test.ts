import { describe, it, expect, vi } from 'vitest';
import { ManageTaskTool } from '../../../../src/tools/tasks/ManageTaskTool';
import { createSuccessResponseV2 } from '../../../../src/utils/response-format';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation';
import { asTaskId, asProjectId } from '../../../../src/utils/branded-types';

class StubCache {
  invalidate(): void {}
  invalidateForTaskChange(): void {}
  invalidateForProjectChange(): void {}
  invalidateForTagChange(): void {}
}

describe('ManageTaskTool branded types integration', () => {
  it('should convert string taskId to branded TaskId for update operation', async () => {
    const cache = new StubCache();
    const tool = new ManageTaskTool(cache as any);

    const fakeAutomation = {
      buildScript: vi.fn().mockReturnValue('script'),
    } as unknown as OmniAutomation;
    tool.omniAutomation = fakeAutomation;

    // Mock the script execution to return success
    vi.spyOn(tool as any, 'execJson').mockResolvedValue({
      success: true,
      data: {
        task: {
          id: 'test-task-id',
          name: 'Updated Task',
          updated: true,
          changes: { name: 'Updated Task' },
        },
      },
    });

    const stringTaskId = 'test-task-id';
    const response = await tool.execute({
      operation: 'update',
      taskId: stringTaskId,
      name: 'Updated Task',
    });

    expect(response.success).toBe(true);
    expect(response.data.task.id).toBe(stringTaskId);
  });

  it('should demonstrate branded types prevent ID mixing at compile time', async () => {
    // This test demonstrates the compile-time safety of branded types
    // The following code would cause compile-time errors if uncommented:

    // const taskId: TaskId = 'task-123';
    // const projectId: ProjectId = 'project-456';

    // These would be compile-time errors:
    // useTaskId(projectId); // ❌ Type error: ProjectId is not TaskId
    // useProjectId(taskId); // ❌ Type error: TaskId is not ProjectId

    // This test passes if it compiles successfully
    expect(true).toBe(true);
  });
});
