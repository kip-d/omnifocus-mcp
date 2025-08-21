import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateTaskTool } from '../../../src/tools/tasks/CreateTaskTool.js';
import { UpdateTaskTool } from '../../../src/tools/tasks/UpdateTaskTool.js';
import { CompleteTaskTool } from '../../../src/tools/tasks/CompleteTaskTool.js';
import { DeleteTaskTool } from '../../../src/tools/tasks/DeleteTaskTool.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { OmniAutomation } from '../../../src/omnifocus/OmniAutomation.js';

// Mock dependencies
vi.mock('../../../src/cache/CacheManager.js', () => ({
  CacheManager: vi.fn()
}));
vi.mock('../../../src/omnifocus/OmniAutomation.js', () => ({
  OmniAutomation: vi.fn()
}));
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }))
}));

describe('Task CRUD Operations', () => {
  let mockCache: any;
  let mockOmniAutomation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      invalidate: vi.fn(),
    };
    
    mockOmniAutomation = {
      buildScript: vi.fn(),
      execute: vi.fn(),
      executeViaUrlScheme: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
  });

  describe('CreateTaskTool', () => {
    let tool: CreateTaskTool;

    beforeEach(() => {
      tool = new CreateTaskTool(mockCache);
    });

    describe('successful operations', () => {
      it('should create a simple task', async () => {
        const taskData = { name: 'Test task' };
        const expectedResult = {
          taskId: 'task-123',
          name: 'Test task',
          projectId: null,
          created: true
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(taskData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // CREATE_TASK_SCRIPT
          { taskData: expect.objectContaining({ name: 'Test task' }) }
        );
        expect(mockOmniAutomation.execute).toHaveBeenCalledWith('test script');
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
      });

      it('should create a task with all optional fields', async () => {
        // Tags now work via evaluateJavascript bridge in v2.0.0-beta.1+
        const taskData = {
          name: 'Complex task',
          note: 'Task description',
          projectId: 'proj-456',
          flagged: true,
          dueDate: '2024-01-15 14:30',
          deferDate: '2024-01-10 09:00',
          estimatedMinutes: 60,
          tags: ['work', 'urgent'],
          sequential: true,
          parentTaskId: 'parent-789'
        };

        const scriptResult = {
          taskId: 'task-123',
          name: 'Complex task',
          tags: ['work', 'urgent'],
          created: true
        };

        mockOmniAutomation.execute.mockResolvedValue(scriptResult);

        const result = await tool.execute(taskData);

        // Tags should now work successfully
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(scriptResult);
        expect(mockOmniAutomation.execute).toHaveBeenCalledTimes(1);
      });

      it('should handle object response from script', async () => {
        const taskData = { name: 'Test task' };
        const expectedResult = {
          taskId: 'task-123',
          name: 'Test task',
          created: true
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(expectedResult);

        const result = await tool.execute(taskData);

        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
      });
    });

    describe('validation', () => {
      it('should reject missing name', async () => {
        await expect(tool.execute({})).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty name', async () => {
        await expect(tool.execute({ name: '' })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject invalid date format', async () => {
        await expect(tool.execute({
          name: 'Test task',
          dueDate: 'invalid-date'
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject negative estimated minutes', async () => {
        await expect(tool.execute({
          name: 'Test task',
          estimatedMinutes: -30
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const taskData = { name: 'Test task' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Script execution failed'
        });

        const result = await tool.execute(taskData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SCRIPT_ERROR');
        expect(result.error.message).toBe('Script execution failed');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });

      it('should handle permission denied error', async () => {
        const taskData = { name: 'Test task' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('access not allowed'));

        const result = await tool.execute(taskData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.message).toContain('Permission denied');
      });
    });
  });

  describe('UpdateTaskTool', () => {
    let tool: UpdateTaskTool;

    beforeEach(() => {
      tool = new UpdateTaskTool(mockCache);
    });

    describe('successful operations', () => {
      it('should update task name', async () => {
        const updateData = {
          taskId: 'task-123',
          name: 'Updated task name'
        };
        const expectedResult = {
          id: 'task-123',
          name: 'Updated task name',
          updated: true,
          changes: { name: 'Updated task name' }
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(updateData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // UPDATE_TASK_ULTRA_MINIMAL_SCRIPT
          {
            taskId: 'task-123',
            updatesJson: JSON.stringify({ name: 'Updated task name' })
          }
        );
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it('should update multiple fields', async () => {
        const updateData = {
          taskId: 'task-123',
          name: 'Updated name',
          note: 'Updated note',
          flagged: true,
          dueDate: '2024-01-20 15:00',
          tags: ['updated', 'tags']
        };
        const expectedResult = {
          id: 'task-123',
          name: 'Updated name',
          updated: true,
          changes: {
            name: 'Updated name',
            note: 'Updated note',
            flagged: true,
            dueDate: '2024-01-20T15:00:00Z',
            tags: ['updated', 'tags']
          }
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(updateData);

        expect(result.success).toBe(true);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it('should clear due date when clearDueDate is true', async () => {
        const updateData = {
          taskId: 'task-123',
          clearDueDate: true
        };
        const expectedResult = {
          id: 'task-123',
          updated: true,
          changes: { dueDate: null }
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(updateData);

        expect(result.success).toBe(true);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it('should handle no updates provided', async () => {
        const updateData = {
          taskId: 'task-123'
        };

        const result = await tool.execute(updateData);

        expect(result.success).toBe(true);
        expect(result.data.task.updated).toBe(false);
        expect(result.metadata.message).toBe('No valid updates provided');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('validation', () => {
      it('should reject missing taskId', async () => {
        await expect(tool.execute({ name: 'New name' })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty taskId', async () => {
        await expect(tool.execute({ taskId: '', name: 'New name' })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject invalid date format', async () => {
        await expect(tool.execute({
          taskId: 'task-123',
          dueDate: 'invalid-date'
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const updateData = { taskId: 'task-123', name: 'New name' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Task not found'
        });

        const result = await tool.execute(updateData);

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SCRIPT_ERROR');
        expect(result.error.message).toBe('Task not found');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });
    });
  });

  describe('CompleteTaskTool', () => {
    let tool: CompleteTaskTool;

    beforeEach(() => {
      tool = new CompleteTaskTool(mockCache);
    });

    describe('successful operations', () => {
      it('should complete a task', async () => {
        const completeData = { taskId: 'task-123' };
        const expectedResult = {
          id: 'task-123',
          completed: true,
          completionDate: new Date().toISOString()
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(completeData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // COMPLETE_TASK_SCRIPT
          expect.objectContaining({ taskId: 'task-123' })
        );
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
        expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
      });

      it('should complete a task with custom completion date', async () => {
        const completeData = {
          taskId: 'task-123',
          completionDate: '2024-01-15 10:00'
        };
        const expectedResult = {
          id: 'task-123',
          completed: true,
          completionDate: '2024-01-15T10:00:00Z'
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(completeData);

        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
      });

      it('should fallback to URL scheme on access denied', async () => {
        const completeData = { taskId: 'task-123' };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'access not allowed'
        });

        const result = await tool.execute(completeData);

        expect(mockOmniAutomation.executeViaUrlScheme).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.metadata.method).toBe('url_scheme');
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
        expect(mockCache.invalidate).toHaveBeenCalledWith('analytics');
      });
    });

    describe('validation', () => {
      it('should reject missing taskId', async () => {
        await expect(tool.execute({})).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject invalid completion date', async () => {
        await expect(tool.execute({
          taskId: 'task-123',
          completionDate: 'invalid-date'
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const completeData = { taskId: 'task-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Task not found'
        });

        const result = await tool.execute(completeData);

        // CompleteTaskTool returns the raw error object when script has error=true
        expect(result.error).toBe(true);
        expect(result.message).toBe('Task not found');
      });

      it('should handle permission error with exception', async () => {
        const completeData = { taskId: 'task-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('access not allowed'));

        const result = await tool.execute(completeData);

        expect(mockOmniAutomation.executeViaUrlScheme).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.metadata.method).toBe('url_scheme');
      });
    });
  });

  describe('DeleteTaskTool', () => {
    let tool: DeleteTaskTool;

    beforeEach(() => {
      tool = new DeleteTaskTool(mockCache);
    });

    describe('successful operations', () => {
      it('should delete a task', async () => {
        const deleteData = { taskId: 'task-123' };
        const expectedResult = {
          id: 'task-123',
          name: 'Deleted task',
          deleted: true
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute(deleteData);

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // DELETE_TASK_SCRIPT
          expect.objectContaining({ taskId: 'task-123' })
        );
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it('should fallback to URL scheme on permission error', async () => {
        const deleteData = { taskId: 'task-123' };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'parameter is missing'
        });

        const result = await tool.execute(deleteData);

        expect(mockOmniAutomation.executeViaUrlScheme).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.metadata.method).toBe('url_scheme');
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it('should handle exception-based permission error', async () => {
        const deleteData = { taskId: 'task-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockRejectedValue(new Error('access not allowed'));

        const result = await tool.execute(deleteData);

        expect(mockOmniAutomation.executeViaUrlScheme).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.metadata.method).toBe('url_scheme');
      });
    });

    describe('validation', () => {
      it('should reject missing taskId', async () => {
        await expect(tool.execute({})).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty taskId', async () => {
        await expect(tool.execute({ taskId: '' })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const deleteData = { taskId: 'task-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.execute.mockResolvedValue({
          error: true,
          message: 'Task not found'
        });

        const result = await tool.execute(deleteData);

        // DeleteTaskTool returns the raw error object when script has error=true  
        expect(result.error).toBe(true);
        expect(result.message).toBe('Task not found');
      });
    });
  });
});