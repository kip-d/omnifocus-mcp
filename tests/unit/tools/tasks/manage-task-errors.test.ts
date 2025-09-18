import { describe, it, expect, vi } from 'vitest';
import { ManageTaskTool } from '../../../../src/tools/tasks/ManageTaskTool';
import { createScriptError } from '../../../../src/omnifocus/script-result-types';
import { OmniAutomation } from '../../../../src/omnifocus/OmniAutomation';

class StubCache {
  invalidate(): void {}
}

describe('ManageTaskTool error handling', () => {
  it('returns SCRIPT_ERROR when the backing script reports a missing task', async () => {
    const cache = new StubCache();
    const tool = new ManageTaskTool(cache as any);

    const fakeAutomation = {
      buildScript: vi.fn().mockReturnValue('script'),
    } as unknown as OmniAutomation;
    tool.omniAutomation = fakeAutomation;

    vi.spyOn(tool as any, 'execJson').mockResolvedValue(
      createScriptError('Task with ID missing-id not found', 'Legacy script error', { taskId: 'missing-id' }),
    );

    const response = await tool.execute({
      operation: 'update',
      taskId: 'missing-id',
      name: 'Should fail',
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe('SCRIPT_ERROR');
    expect(response.error.message).toContain('missing-id');
  });
});
