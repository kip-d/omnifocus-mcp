import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManageTaskTool } from '../../../src/tools/tasks/ManageTaskTool.js';
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

describe('Task CRUD Operations (via ManageTaskTool)', () => {
  let mockCache: any;
  let mockOmniAutomation: any;
  let tool: ManageTaskTool;

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
      executeJson: vi.fn(),
      executeViaUrlScheme: vi.fn(),
    };

    (CacheManager as any).mockImplementation(() => mockCache);
    (OmniAutomation as any).mockImplementation(() => mockOmniAutomation);
    
    tool = new ManageTaskTool(mockCache);
  });

  describe('Create Operation', () => {

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
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'create', ...taskData });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // CREATE_TASK_SCRIPT
          { taskData: expect.objectContaining({ name: 'Test task' }) }
        );
        // executeJson path is preferred; execute may not be called
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

        mockOmniAutomation.executeJson.mockResolvedValue(scriptResult);

        const result = await tool.execute({ operation: 'create', ...taskData });

        // Tags should now work successfully
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(scriptResult);
        // executeJson path is preferred; execute may not be called
      });

      it('should handle object response from script', async () => {
        const taskData = { name: 'Test task' };
        const expectedResult = {
          taskId: 'task-123',
          name: 'Test task',
          created: true
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue(expectedResult);

        const result = await tool.execute({ operation: 'create', ...taskData });

        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
      });
    });

    describe('validation', () => {
      it('should reject missing name', async () => {
        const result = await tool.execute({ operation: 'create' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('MISSING_PARAMETER');
        expect(result.error.message).toBe('name is required for create operation');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty name', async () => {
        const result = await tool.execute({ operation: 'create', name: '' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('MISSING_PARAMETER');
        expect(result.error.message).toBe('name is required for create operation');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject invalid date format', async () => {
        await expect(tool.execute({
          operation: 'create',
          name: 'Test task',
          dueDate: 'invalid-date'
        })).rejects.toThrow('Invalid parameters');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should handle negative estimated minutes', async () => {
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({
          taskId: 'task-123',
          name: 'Test task',
          estimatedMinutes: -30,
          created: true
        });

        const result = await tool.execute({
          operation: 'create',
          name: 'Test task',
          estimatedMinutes: -30
        });

        expect(result.success).toBe(true);
        expect(result.data.task.estimatedMinutes).toBe(-30);
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const taskData = { name: 'Test task' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Script execution failed'
        , details: 'Test error' });

        const result = await tool.execute({ operation: 'create', ...taskData });

        expect(result.success).toBe(false);
        // Standardized script error from tool when executeJson returns { success:false }
        expect(result.error.code).toBe('SCRIPT_ERROR');
        expect(result.error.message).toBe('Script execution failed');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });

      it('should handle permission denied error', async () => {
        const taskData = { name: 'Test task' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockRejectedValue(new Error('access not allowed'));

        const result = await tool.execute({ operation: 'create', ...taskData });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.message).toContain('Permission denied');
      });
    });
  });

  describe('Update Operation', () => {

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
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'update', ...updateData });

        // Script building path may differ in v2; focus on standardized output
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
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'update', ...updateData });

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
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'update', ...updateData });

        expect(result.success).toBe(true);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it('should handle no updates provided', async () => {
        const updateData = {
          taskId: 'task-123'
        };

        const result = await tool.execute({ operation: 'update', ...updateData });

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
        mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Task not found'
        , details: 'Test error' });

        const result = await tool.execute({ operation: 'update', ...updateData });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('SCRIPT_ERROR');
        expect(result.error.message).toBe('Task not found');
        expect(mockCache.invalidate).not.toHaveBeenCalled();
      });
    });
  });

  describe('Complete Operation', () => {

    describe('successful operations', () => {
      it('should complete a task', async () => {
        const completeData = { taskId: 'task-123' };
        const expectedResult = {
          id: 'task-123',
          completed: true,
          completionDate: new Date().toISOString()
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'complete', ...completeData });

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
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'complete', ...completeData });

        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
      });

      it.skip('should fallback to URL scheme on access denied', async () => {
        // SKIP: ManageTaskTool doesn't implement URL scheme fallback (consolidated tool)
        // This functionality was in the old individual CompleteTaskTool but not in the consolidated version
      });
    });

    describe('validation', () => {
      it('should reject missing taskId', async () => {
        const result = await tool.execute({ operation: 'complete' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('MISSING_PARAMETER');
        expect(result.error.message).toBe('taskId is required for complete operation');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject invalid completion date', async () => {
        await expect(tool.execute({
          operation: 'complete',
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
        mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Task not found'
        , details: 'Test error' });

        const result = await tool.execute({ operation: 'complete', ...completeData });

        // Standardized error response shape (v2): success=false with error object
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('SCRIPT_ERROR');
        expect(result.error?.message).toBe('Task not found');
      });

      it.skip('should handle permission error with exception', async () => {
        // SKIP: ManageTaskTool doesn't implement URL scheme fallback (consolidated tool)
        // This functionality was in the old individual CompleteTaskTool but not in the consolidated version
      });
    });
  });

  describe('Delete Operation', () => {

    describe('successful operations', () => {
      it('should delete a task', async () => {
        const deleteData = { taskId: 'task-123' };
        const expectedResult = {
          id: 'task-123',
          name: 'Deleted task',
          deleted: true
        };

        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue(JSON.stringify(expectedResult));

        const result = await tool.execute({ operation: 'delete', ...deleteData });

        expect(mockOmniAutomation.buildScript).toHaveBeenCalledWith(
          expect.any(String), // DELETE_TASK_SCRIPT
          expect.objectContaining({ taskId: 'task-123' })
        );
        expect(result.success).toBe(true);
        expect(result.data.task).toEqual(expectedResult);
        expect(mockCache.invalidate).toHaveBeenCalledWith('tasks');
      });

      it.skip('should fallback to URL scheme on permission error', async () => {
        // SKIP: ManageTaskTool doesn't implement URL scheme fallback (consolidated tool)
        // This functionality was in the old individual DeleteTaskTool but not in the consolidated version
      });

      it.skip('should handle exception-based permission error', async () => {
        // SKIP: ManageTaskTool doesn't implement URL scheme fallback (consolidated tool)
        // This functionality was in the old individual DeleteTaskTool but not in the consolidated version
      });
    });

    describe('validation', () => {
      it('should reject missing taskId', async () => {
        const result = await tool.execute({ operation: 'delete' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('MISSING_PARAMETER');
        expect(result.error.message).toBe('taskId is required for delete operation');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });

      it('should reject empty taskId', async () => {
        const result = await tool.execute({ operation: 'delete', taskId: '' });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('MISSING_PARAMETER');
        expect(result.error.message).toBe('taskId is required for delete operation');
        expect(mockOmniAutomation.execute).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle script execution error', async () => {
        const deleteData = { taskId: 'task-123' };
        
        mockOmniAutomation.buildScript.mockReturnValue('test script');
        mockOmniAutomation.executeJson.mockResolvedValue({ success: false, error: 'Task not found'
        , details: 'Test error' });

        const result = await tool.execute({ operation: 'delete', ...deleteData });

        // Standardized error response shape (v2): success=false with error object
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('SCRIPT_ERROR');
        expect(result.error?.message).toBe('Task not found');
      });
    });
  });
});
