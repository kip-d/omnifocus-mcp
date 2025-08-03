import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to complete a project in OmniFocus
 * 
 * Features:
 * - Mark project as done/completed
 * - Optionally complete all remaining tasks
 * - Multiple fallback approaches for completion
 * - Handles different OmniFocus versions gracefully
 */
export const COMPLETE_PROJECT_SCRIPT = `
  const projectId = {{projectId}};
  const completeAllTasks = {{completeAllTasks}};
  
  ${getAllHelpers()}
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Find the project by ID
    const projects = doc.flattenedProjects();
    
    // Check if projects is null or undefined
    if (!projects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedProjects() returned null or undefined"
      });
    }
    let targetProject = null;
    
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].id() === projectId) {
        targetProject = projects[i];
        break;
      }
    }
    
    if (!targetProject) {
      return JSON.stringify({
        error: true,
        message: "Project with ID '" + projectId + "' not found. Use 'list_projects' tool to see available projects."
      });
    }
    
    // Count incomplete tasks
    const tasks = targetProject.flattenedTasks();
    let incompleteCount = 0;
    let completedCount = 0;
    
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].completed()) {
        incompleteCount++;
      }
    }
    
    // Complete all tasks if requested
    if (completeAllTasks && incompleteCount > 0) {
      for (let i = 0; i < tasks.length; i++) {
        if (!tasks[i].completed()) {
          tasks[i].markComplete();
          completedCount++;
        }
      }
    }
    
    // Complete the project
    let statusSet = false;
    try {
      // Try different ways to set project status to done
      if (typeof app.Project.Status.done !== 'undefined') {
        targetProject.status = app.Project.Status.done;
        statusSet = true;
      } else {
        // Fallback: try setting status directly with string value
        targetProject.status = 'done';
        statusSet = true;
      }
    } catch (statusError) {
      // Status setting failed, try alternative approaches
      try {
        // Try using the markComplete method if available
        if (typeof targetProject.markComplete === 'function') {
          targetProject.markComplete();
          statusSet = true;
        }
      } catch (markCompleteError) {
        // Last resort: try setting completion date without status
        // This might work in some OmniFocus versions
      }
    }
    
    // Only set completion date after status is set, or as last resort
    try {
      if (statusSet) {
        targetProject.completionDate = new Date();
      } else {
        // Try completion date as last resort (some versions allow this)
        targetProject.completionDate = new Date();
      }
    } catch (completionError) {
      // If we can't set completion date, the status change might be enough
    }
    
    return JSON.stringify({
      success: true,
      project: {
        id: targetProject.id(),
        name: targetProject.name(),
        completedAt: targetProject.completionDate().toISOString()
      },
      tasksCompleted: completedCount,
      message: "Project '" + targetProject.name() + "' completed" + 
                (completedCount > 0 ? " with " + completedCount + " tasks" : "")
    });
  } catch (error) {
    return formatError(error, 'complete_project');
  }
`;