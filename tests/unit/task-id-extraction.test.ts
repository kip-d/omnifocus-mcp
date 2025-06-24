import { describe, it, expect, vi } from 'vitest';
import { LIST_TASKS_SCRIPT } from 'src/omnifocus/scripts/tasks';

describe('Task ID Extraction', () => {
  it('should show the ID extraction bug in LIST_TASKS_SCRIPT', () => {
    // Check if the script contains the buggy pattern
    const buggyPattern = /task\.id\.primaryKey(?![\(\)])/g;
    const matches = LIST_TASKS_SCRIPT.match(buggyPattern);
    
    console.log('Checking for buggy ID extraction patterns...');
    if (matches) {
      console.log(`Found ${matches.length} instances of task.id.primaryKey without parentheses`);
      matches.forEach((match, index) => {
        const lineNumber = LIST_TASKS_SCRIPT.substring(0, LIST_TASKS_SCRIPT.indexOf(match)).split('\n').length;
        console.log(`  ${index + 1}. Line ~${lineNumber}: ${match}`);
      });
    }
    
    // primaryKey is a property in JXA, not a method - this is correct
    expect(matches).not.toBeNull(); // Should find instances without parentheses
  });
  
  it('should check project ID extraction bug', () => {
    const buggyPattern = /project\.id\.primaryKey(?![\(\)])/g;
    const matches = LIST_TASKS_SCRIPT.match(buggyPattern);
    
    if (matches) {
      console.log(`Found ${matches.length} instances of project.id.primaryKey without parentheses`);
    }
    
    // primaryKey is a property in JXA, not a method - this is correct
    expect(matches).not.toBeNull();
  });
  
  it('should verify correct syntax after fix', () => {
    // In JXA, primaryKey is a property, not a method
    const correctTaskPattern = /task\.id\.primaryKey(?![\(\)])/g;
    const correctProjectPattern = /project\.id\.primaryKey(?![\(\)])/g;
    
    const taskMatches = LIST_TASKS_SCRIPT.match(correctTaskPattern);
    const projectMatches = LIST_TASKS_SCRIPT.match(correctProjectPattern);
    
    console.log(`\\nAfter fix simulation:`);
    console.log(`- Found ${taskMatches?.length || 0} correct task.id.primaryKey calls`);
    console.log(`- Found ${projectMatches?.length || 0} correct project.id.primaryKey calls`);
    
    expect(taskMatches).not.toBeNull();
    expect(projectMatches).not.toBeNull();
  });
});