import { describe, it, expect, vi } from 'vitest';
import { LIST_TASKS_SCRIPT } from 'src/omnifocus/scripts/tasks';

describe('Task ID Extraction', () => {
  it('should use task.id() method for task ID extraction', () => {
    // Check that the script uses task.id() method correctly
    const taskIdPattern = /task\.id\(\)/g;
    const matches = LIST_TASKS_SCRIPT.match(taskIdPattern);
    
    console.log('Checking for task.id() method calls...');
    if (matches) {
      console.log(`Found ${matches.length} instances of task.id() method calls`);
    }
    
    // Should find task.id() method calls for task objects
    expect(matches).not.toBeNull();
    expect(matches?.length).toBeGreaterThan(0);
  });
  
  it('should use project.id.primaryKey property for project ID extraction', () => {
    const projectIdPattern = /project\.id\.primaryKey(?![\(\)])/g;
    const matches = LIST_TASKS_SCRIPT.match(projectIdPattern);
    
    if (matches) {
      console.log(`Found ${matches.length} instances of project.id.primaryKey property access`);
    }
    
    // primaryKey is a property in JXA, not a method - this is correct
    expect(matches).not.toBeNull();
    expect(matches?.length).toBeGreaterThan(0);
  });
  
  it('should verify mixed ID extraction patterns are used correctly', () => {
    // Task IDs use method calls in object creation
    const taskIdMethodPattern = /id: task\.id\(\)/g;
    const taskIdMethodMatches = LIST_TASKS_SCRIPT.match(taskIdMethodPattern);
    
    // But task ID comparisons in some scripts use primaryKey property  
    const taskPrimaryKeyPattern = /task\.id\.primaryKey/g;
    const taskPrimaryKeyMatches = LIST_TASKS_SCRIPT.match(taskPrimaryKeyPattern);
    
    // Project IDs consistently use primaryKey property
    const projectIdPattern = /project\.id\.primaryKey/g;
    const projectMatches = LIST_TASKS_SCRIPT.match(projectIdPattern);
    
    console.log(`\\nID extraction patterns:`);
    console.log(`- Found ${taskIdMethodMatches?.length || 0} task.id() method calls`);
    console.log(`- Found ${taskPrimaryKeyMatches?.length || 0} task.id.primaryKey property access`);
    console.log(`- Found ${projectMatches?.length || 0} project.id.primaryKey property access`);
    
    // Should have task ID method calls for object creation
    expect(taskIdMethodMatches).not.toBeNull();
    // Should have project ID property access
    expect(projectMatches).not.toBeNull();
  });
});