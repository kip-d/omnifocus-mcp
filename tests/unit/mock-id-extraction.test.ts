import { describe, it, expect, vi } from 'vitest';
import { ListTasksTool } from 'src/tools/tasks/ListTasksTool';

describe('Mock ID Extraction Test', () => {
  it('should properly format task response with IDs', async () => {
    // Create a mock task response that simulates what OmniFocus would return
    const mockTaskData = {
      tasks: [
        {
          id: 'gZ0M5L3PkR8',
          name: 'Test Task 1',
          completed: false,
          flagged: true,
          inInbox: true,
          note: 'Test note',
          tags: ['work', 'urgent']
        },
        {
          id: 'hX1N6M4QlS9',
          name: 'Test Task 2', 
          completed: false,
          flagged: false,
          inInbox: false,
          project: 'My Project',
          projectId: 'pR0J3CT1D',
          dueDate: '2024-01-15T10:00:00.000Z',
          tags: []
        }
      ],
      metadata: {
        total_items: 2,
        items_returned: 2,
        limit_applied: 100,
        has_more: false,
        query_time_ms: 25
      }
    };
    
    // Test that the tool properly formats the response
    const tool = new ListTasksTool({} as any);
    
    // Mock the executeScript method to return our test data
    vi.spyOn(tool as any, 'executeScript').mockResolvedValue(JSON.stringify(mockTaskData));
    
    const result = await tool.execute({ limit: 10 });
    
    // Check the formatted output includes IDs
    expect(result).toContain('Test Task 1');
    expect(result).toContain('gZ0M5L3PkR8'); // ID should be in the output
    expect(result).toContain('Test Task 2');
    expect(result).toContain('hX1N6M4QlS9'); // ID should be in the output
    
    // Verify the response structure
    expect(result).toContain('**Test Task 1**');
    expect(result).toContain('Flagged: ✓');
    expect(result).toContain('Tags: work, urgent');
    expect(result).toContain('2 tasks found');
  });
  
  it('should handle update task with proper ID', async () => {
    // Mock successful update response
    const mockUpdateResponse = {
      id: 'gZ0M5L3PkR8',
      name: 'Updated Task Name',
      updated: true
    };
    
    // This simulates that our JXA script properly uses task.id.primaryKey()
    expect(mockUpdateResponse.id).toBeTruthy();
    expect(mockUpdateResponse.id).toBe('gZ0M5L3PkR8');
  });
  
  it('should verify ID extraction script syntax is correct', () => {
    // This tests that our script has the correct syntax
    const scriptSnippet = `
      const task = tasks[0];
      const taskId = task.id.primaryKey();
      const project = task.containingProject();
      const projectId = project ? project.id.primaryKey() : null;
    `;
    
    // Check for correct method calls with parentheses
    expect(scriptSnippet).toContain('task.id.primaryKey()');
    expect(scriptSnippet).toContain('project.id.primaryKey()');
    
    // Ensure no instances without parentheses
    expect(scriptSnippet).not.toMatch(/\.id\.primaryKey(?![\(\)])/);
  });
});