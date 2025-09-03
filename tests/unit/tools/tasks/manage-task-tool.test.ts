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

// Spies for child tools
const createExecute = vi.fn(async (args: any) => ({ success: true, data: { op: 'create', args }, metadata: { operation: 'create_task', from_cache: false, timestamp: new Date().toISOString() } }));
const updateExecute = vi.fn(async (args: any) => ({ success: true, data: { op: 'update', args }, metadata: { operation: 'update_task', from_cache: false, timestamp: new Date().toISOString() } }));
const completeExecute = vi.fn(async (args: any) => ({ success: true, data: { op: 'complete', args }, metadata: { operation: 'complete_task', from_cache: false, timestamp: new Date().toISOString() } }));
const deleteExecute = vi.fn(async (args: any) => ({ success: true, data: { op: 'delete', args }, metadata: { operation: 'delete_task', from_cache: false, timestamp: new Date().toISOString() } }));

vi.mock('../../../../src/tools/tasks/CreateTaskTool.js', () => ({
  CreateTaskTool: vi.fn().mockImplementation(() => ({ execute: createExecute }))
}));
vi.mock('../../../../src/tools/tasks/UpdateTaskTool.js', () => ({
  UpdateTaskTool: vi.fn().mockImplementation(() => ({ execute: updateExecute }))
}));
vi.mock('../../../../src/tools/tasks/CompleteTaskTool.js', () => ({
  CompleteTaskTool: vi.fn().mockImplementation(() => ({ execute: completeExecute }))
}));
vi.mock('../../../../src/tools/tasks/DeleteTaskTool.js', () => ({
  DeleteTaskTool: vi.fn().mockImplementation(() => ({ execute: deleteExecute }))
}));

describe('ManageTaskTool (consolidated CRUD)', () => {
  let tool: ManageTaskTool;

  beforeEach(() => {
    vi.clearAllMocks();
    (CacheManager as any).mockImplementation(() => ({}));
    tool = new ManageTaskTool({} as any);
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

  it('delegates to CreateTaskTool with mapped fields', async () => {
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
    expect(createExecute).toHaveBeenCalledWith({
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
    });
  });

  it('delegates to UpdateTaskTool including minimalResponse and clear flags', async () => {
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
    expect(updateExecute).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 't1',
      note: 'Updated',
      clearDueDate: true,
      clearDeferDate: true,
      clearEstimatedMinutes: true,
      clearRepeatRule: true,
      minimalResponse: true,
    }));
  });

  it('delegates to CompleteTaskTool with completionDate', async () => {
    const res: any = await tool.executeValidated({ operation: 'complete', taskId: 't2', completionDate: '2025-01-01 12:00' } as any);
    expect(res.success).toBe(true);
    expect(completeExecute).toHaveBeenCalledWith({ taskId: 't2', completionDate: '2025-01-01 12:00' });
  });

  it('delegates to DeleteTaskTool', async () => {
    const res: any = await tool.executeValidated({ operation: 'delete', taskId: 't3' } as any);
    expect(res.success).toBe(true);
    expect(deleteExecute).toHaveBeenCalledWith({ taskId: 't3' });
  });
});

