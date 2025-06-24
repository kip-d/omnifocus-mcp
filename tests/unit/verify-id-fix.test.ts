import { describe, it, expect } from 'vitest';
import { 
  LIST_TASKS_SCRIPT, 
  CREATE_TASK_SCRIPT,
  UPDATE_TASK_SCRIPT,
  COMPLETE_TASK_SCRIPT
} from 'src/omnifocus/scripts/tasks';
import {
  LIST_PROJECTS_SCRIPT,
  CREATE_PROJECT_SCRIPT,
  UPDATE_PROJECT_SCRIPT
} from 'src/omnifocus/scripts/projects';

/**
 * Note: This test was updated AFTER the implementation was fixed, which is backwards.
 * We should have updated the test first to specify the correct behavior (primaryKey as property),
 * then made the implementation changes to satisfy the test.
 * 
 * Keeping this as a regression guard to ensure primaryKey remains a property access,
 * not a method call, throughout the codebase.
 * 
 * Lesson learned: Tests should drive implementation, not chase after it.
 */
describe('Verify ID Extraction Fix', () => {
  it('should use primaryKey as a property (not a method) in all task scripts', () => {
    const scripts = [
      { name: 'LIST_TASKS_SCRIPT', script: LIST_TASKS_SCRIPT },
      { name: 'CREATE_TASK_SCRIPT', script: CREATE_TASK_SCRIPT },
      { name: 'UPDATE_TASK_SCRIPT', script: UPDATE_TASK_SCRIPT },
      { name: 'COMPLETE_TASK_SCRIPT', script: COMPLETE_TASK_SCRIPT }
    ];
    
    scripts.forEach(({ name, script }) => {
      // Check for any incorrect .id.primaryKey() method calls
      const incorrectPattern = /\.id\.primaryKey\(\)/g;
      const incorrectMatches = script.match(incorrectPattern);
      
      if (incorrectMatches) {
        console.log(`\n❌ Found ${incorrectMatches.length} incorrect method calls in ${name}:`);
        incorrectMatches.forEach(match => {
          const index = script.indexOf(match);
          const context = script.substring(Math.max(0, index - 20), Math.min(script.length, index + 40));
          console.log(`   "${context}"`);
        });
      }
      
      expect(incorrectMatches).toBeNull();
      
      // Verify correct property access patterns exist
      const correctPattern = /\.id\.primaryKey(?![\(\)])/g;
      const correctMatches = script.match(correctPattern);
      
      // Most scripts should have at least one ID extraction
      if (name !== 'CREATE_TASK_SCRIPT') { // CREATE might not have any
        expect(correctMatches).not.toBeNull();
        console.log(`✓ ${name} has ${correctMatches?.length || 0} correct property accesses`);
      }
    });
  });
  
  it('should use primaryKey as a property (not a method) in all project scripts', () => {
    const scripts = [
      { name: 'LIST_PROJECTS_SCRIPT', script: LIST_PROJECTS_SCRIPT },
      { name: 'CREATE_PROJECT_SCRIPT', script: CREATE_PROJECT_SCRIPT },
      { name: 'UPDATE_PROJECT_SCRIPT', script: UPDATE_PROJECT_SCRIPT }
    ];
    
    scripts.forEach(({ name, script }) => {
      // Check for any incorrect .id.primaryKey() method calls
      const incorrectPattern = /\.id\.primaryKey\(\)/g;
      const incorrectMatches = script.match(incorrectPattern);
      
      expect(incorrectMatches).toBeNull();
      
      // Verify correct property access patterns exist
      const correctPattern = /\.id\.primaryKey(?![\(\)])/g;
      const correctMatches = script.match(correctPattern);
      
      expect(correctMatches).not.toBeNull();
      console.log(`✓ ${name} has ${correctMatches?.length || 0} correct property accesses`);
    });
  });
  
  it('should verify critical ID fields are properly extracted as properties', () => {
    // Check that task objects include ID extraction
    expect(LIST_TASKS_SCRIPT).toContain('id: task.id()');
    expect(UPDATE_TASK_SCRIPT).toContain('id: task.id()');
    expect(COMPLETE_TASK_SCRIPT).toContain('id: task.id()');
    
    // Check project ID extraction as property
    expect(LIST_TASKS_SCRIPT).toContain('taskObj.projectId = project.id.primaryKey;');
    expect(LIST_PROJECTS_SCRIPT).toContain('id: project.id.primaryKey');
    
    // Check ID comparisons - some use id() method, some use primaryKey property
    expect(UPDATE_TASK_SCRIPT).toMatch(/tasks\[i\]\.id\(\) === taskId|task\.id\.primaryKey === taskId/);
    expect(COMPLETE_TASK_SCRIPT).toMatch(/tasks\[i\]\.id\(\) === taskId|task\.id\.primaryKey === taskId/);
  });
});