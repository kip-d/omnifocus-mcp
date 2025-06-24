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

describe('Verify ID Extraction Fix', () => {
  it('should have fixed all task script ID extractions', () => {
    const scripts = [
      { name: 'LIST_TASKS_SCRIPT', script: LIST_TASKS_SCRIPT },
      { name: 'CREATE_TASK_SCRIPT', script: CREATE_TASK_SCRIPT },
      { name: 'UPDATE_TASK_SCRIPT', script: UPDATE_TASK_SCRIPT },
      { name: 'COMPLETE_TASK_SCRIPT', script: COMPLETE_TASK_SCRIPT }
    ];
    
    scripts.forEach(({ name, script }) => {
      // Check for any remaining .id.primaryKey without parentheses
      const buggyPattern = /\.id\.primaryKey(?![\(\)])/g;
      const matches = script.match(buggyPattern);
      
      if (matches) {
        console.log(`\\n❌ Found ${matches.length} unfixed instances in ${name}:`);
        matches.forEach(match => {
          const index = script.indexOf(match);
          const context = script.substring(Math.max(0, index - 20), Math.min(script.length, index + 40));
          console.log(`   "${context}"`);
        });
      }
      
      expect(matches).toBeNull();
      
      // Verify correct patterns exist
      const correctPattern = /\.id\.primaryKey\(\)/g;
      const correctMatches = script.match(correctPattern);
      
      // Most scripts should have at least one ID extraction
      if (name !== 'CREATE_TASK_SCRIPT') { // CREATE might not have any
        expect(correctMatches).not.toBeNull();
        console.log(`✓ ${name} has ${correctMatches?.length || 0} correct ID extractions`);
      }
    });
  });
  
  it('should have fixed all project script ID extractions', () => {
    const scripts = [
      { name: 'LIST_PROJECTS_SCRIPT', script: LIST_PROJECTS_SCRIPT },
      { name: 'CREATE_PROJECT_SCRIPT', script: CREATE_PROJECT_SCRIPT },
      { name: 'UPDATE_PROJECT_SCRIPT', script: UPDATE_PROJECT_SCRIPT }
    ];
    
    scripts.forEach(({ name, script }) => {
      const buggyPattern = /\.id\.primaryKey(?![\(\)])/g;
      const matches = script.match(buggyPattern);
      
      expect(matches).toBeNull();
      
      const correctPattern = /\.id\.primaryKey\(\)/g;
      const correctMatches = script.match(correctPattern);
      
      expect(correctMatches).not.toBeNull();
      console.log(`✓ ${name} has ${correctMatches?.length || 0} correct ID extractions`);
    });
  });
  
  it('should verify critical ID fields are properly extracted', () => {
    // Check that task objects include ID
    expect(LIST_TASKS_SCRIPT).toContain('id: task.id.primaryKey()');
    expect(UPDATE_TASK_SCRIPT).toContain('id: task.id.primaryKey()');
    expect(COMPLETE_TASK_SCRIPT).toContain('id: task.id.primaryKey()');
    
    // Check project ID extraction
    expect(LIST_TASKS_SCRIPT).toContain('taskObj.projectId = project.id.primaryKey()');
    expect(LIST_PROJECTS_SCRIPT).toContain('id: project.id.primaryKey()');
    
    // Check ID comparisons
    expect(UPDATE_TASK_SCRIPT).toContain('tasks[i].id.primaryKey() === taskId');
    expect(COMPLETE_TASK_SCRIPT).toContain('tasks[i].id.primaryKey() === taskId');
  });
});