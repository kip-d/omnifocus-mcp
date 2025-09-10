import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageTaskTool } from '../../../../src/tools/tasks/ManageTaskTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

// Mock cache + logger
vi.mock('../../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

// Mock OmniAutomation - the tool uses direct implementation, not delegation
const mockOmniAutomation = {
  buildScript: vi.fn((script, params) => `mocked_script_${script}_${JSON.stringify(params)}`),
  executeJson: vi.fn(),
  execute: vi.fn(),
};

vi.mock('../../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn(() => mockOmniAutomation)
}));

describe('ManageTaskTool (consolidated CRUD)', () => {
  let tool: ManageTaskTool;
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCache = {
      invalidate: vi.fn(),
    };
    (CacheManager as any).mockImplementation(() => mockCache);
    tool = new ManageTaskTool(mockCache);
    // Reset mock implementations
    mockOmniAutomation.executeJson.mockReset();
    mockOmniAutomation.execute.mockReset();
    mockOmniAutomation.buildScript.mockReset();
  });

  it('requires taskId for non-create operations', async () => {
    for (const op of ['update', 'complete', 'delete'] as const) {
      const res: any = await tool.executeValidated({ operation: op } as any);
      expect(res.success).toBe(false);
      expect(res.error.code).toBe('MISSING_PARAMETER');
      expect(res.error.message).toContain('taskId');
    }
  });

  it('requires name for create', async () => {
    const res: any = await tool.executeValidated({ operation: 'create' } as any);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('MISSING_PARAMETER');
    expect(res.error.message).toContain('name');
  });

  it('creates task with direct implementation', async () => {
    // Mock successful task creation response
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: {
        taskId: 'task_123',
        name: 'Write tests',
        projectId: 'proj1'
      }
    });

    const args = {
      operation: 'create',
      name: 'Write tests',
      note: 'Cover consolidated tool',
      projectId: 'proj1',
      parentTaskId: 'parent1',
      dueDate: '2025-01-10 17:00',
      deferDate: '2025-01-09 08:00',
      flagged: 'true',
      estimatedMinutes: '30',
      tags: ['dev', 'tests'],
      sequential: 'false',
      repeatRule: { unit: 'week', steps: 1, method: 'fixed', weekday: 'friday' },
    } as const;

    const res: any = await tool.executeValidated(args as any);
    expect(res.success).toBe(true);
    expect(res.data.task.taskId).toBe('task_123');
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
  });

  it('updates task with direct implementation including minimalResponse', async () => {
    // Mock successful task update response
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: {
        task: {
          id: 't1',
          name: 'Updated Task',
          updated: true
        }
      }
    });

    const res: any = await tool.executeValidated({
      operation: 'update',
      taskId: 't1',
      note: 'Updated',
      clearDueDate: true,
      clearDeferDate: true,
      clearEstimatedMinutes: true,
      clearRepeatRule: true,
      minimalResponse: true,
    } as any);

    expect(res.success).toBe(true);
    expect(res.id).toBe('t1'); // minimalResponse format
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
  });

  it('completes task with direct implementation', async () => {
    // Mock successful task completion response
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: {
        id: 't2',
        name: 'Completed Task',
        completed: true
      }
    });

    const res: any = await tool.executeValidated({ 
      operation: 'complete', 
      taskId: 't2', 
      completionDate: '2025-01-01 12:00' 
    } as any);
    
    expect(res.success).toBe(true);
    expect(res.data.task.id).toBe('t2');
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
  });

  it('deletes task with direct implementation', async () => {
    // Mock successful task deletion response
    mockOmniAutomation.executeJson.mockResolvedValue({
      success: true,
      data: {
        id: 't3',
        deleted: true
      }
    });

    const res: any = await tool.executeValidated({ operation: 'delete', taskId: 't3' } as any);
    expect(res.success).toBe(true);
    expect(res.data.task.id).toBe('t3');
    expect(mockOmniAutomation.executeJson).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
  });
});

