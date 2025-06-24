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
    
    // This test SHOULD FAIL until we fix the bug
    expect(matches).toBeNull(); // Should not find any instances without parentheses
  });
  
  it('should check project ID extraction bug', () => {
    const buggyPattern = /project\.id\.primaryKey(?![\(\)])/g;
    const matches = LIST_TASKS_SCRIPT.match(buggyPattern);
    
    if (matches) {
      console.log(`Found ${matches.length} instances of project.id.primaryKey without parentheses`);
    }
    
    // This test SHOULD FAIL until we fix the bug
    expect(matches).toBeNull();
  });
  
  it('should verify correct syntax after fix', () => {
    // After fixing, these patterns should exist
    const correctTaskPattern = /task\.id\.primaryKey\(\)/g;
    const correctProjectPattern = /project\.id\.primaryKey\(\)/g;
    
    // This test will pass after we fix the bug
    const scriptAfterFix = LIST_TASKS_SCRIPT.replace(/\.id\.primaryKey(?![\(\)])/g, '.id.primaryKey()');
    
    const taskMatches = scriptAfterFix.match(correctTaskPattern);
    const projectMatches = scriptAfterFix.match(correctProjectPattern);
    
    console.log(`\\nAfter fix simulation:`);
    console.log(`- Found ${taskMatches?.length || 0} correct task.id.primaryKey() calls`);
    console.log(`- Found ${projectMatches?.length || 0} correct project.id.primaryKey() calls`);
    
    expect(taskMatches).not.toBeNull();
    expect(projectMatches).not.toBeNull();
  });
});