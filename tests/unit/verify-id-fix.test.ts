import { describe, it, expect } from 'vitest';
import { 
  LIST_TASKS_SCRIPT, 
  CREATE_TASK_SCRIPT,
  UPDATE_TASK_SCRIPT,
  COMPLETE_TASK_SCRIPT,
  DELETE_TASK_SCRIPT
} from 'src/omnifocus/scripts/tasks';
import {
  LIST_PROJECTS_SCRIPT,
  CREATE_PROJECT_SCRIPT,
  UPDATE_PROJECT_SCRIPT,
  COMPLETE_PROJECT_SCRIPT,
  DELETE_PROJECT_SCRIPT
} from 'src/omnifocus/scripts/projects';

/**
 * Note: This test verifies the correct OmniFocus API usage for ID extraction.
 * IDs are retrieved using the `id()` method on tasks and projects.
 */
describe('Verify ID Extraction Fix', () => {
  it('should use correct ID extraction patterns in task scripts', () => {
    // Task scripts should use safe getters for IDs
    expect(LIST_TASKS_SCRIPT).toContain('id: safeGet(() => task.id()');
    expect(UPDATE_TASK_SCRIPT).toContain('doc.flattenedTasks.whose({id: taskId})');
    expect(COMPLETE_TASK_SCRIPT).toContain('doc.flattenedTasks.whose({id: taskId})');
    expect(DELETE_TASK_SCRIPT).toContain('doc.flattenedTasks.whose({id: taskId})');
    
    // Task scripts should use safe getters for project IDs
    expect(LIST_TASKS_SCRIPT).toContain('safeGet(() => project.id())');
  });
  
  it('should use project.id() in project scripts', () => {
    // Project scripts should use safe getters and id() method
    expect(LIST_PROJECTS_SCRIPT).toContain('id: safeGet(() => project.id()');
    expect(CREATE_PROJECT_SCRIPT).toContain('newProject.id()');
    expect(UPDATE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
    expect(COMPLETE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
    expect(DELETE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
    
    // Project scripts should use id() method
    expect(LIST_PROJECTS_SCRIPT).toContain('.id()');
    expect(UPDATE_PROJECT_SCRIPT).toContain('.id()');
  });
  
  it('should verify ID comparison patterns', () => {
    // Task lookups use Task.byIdentifier for O(1) access
    expect(UPDATE_TASK_SCRIPT).toContain('doc.flattenedTasks.whose({id: taskId})');
    expect(COMPLETE_TASK_SCRIPT).toContain('doc.flattenedTasks.whose({id: taskId})');
    expect(DELETE_TASK_SCRIPT).toContain('doc.flattenedTasks.whose({id: taskId})');
    
    // Project lookups still use iteration but with id() method
    expect(UPDATE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
    expect(COMPLETE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
    expect(DELETE_PROJECT_SCRIPT).toContain('projects[i].id() === projectId');
  });
});