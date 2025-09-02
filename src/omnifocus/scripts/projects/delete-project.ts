import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Script to delete a project from OmniFocus
 *
 * Features:
 * - Delete project by marking as dropped
 * - Optionally delete all tasks within project
 * - Tasks not deleted become orphaned in Inbox
 * - Detailed reporting of deleted/orphaned tasks
 */
export const DELETE_PROJECT_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
  // Parameter declarations
  const projectId = {{projectId}};
  const deleteTasks = {{deleteTasks}};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    // Find the project by ID (using same pattern as working task deletion)
    const projects = doc.flattenedProjects();
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
    
    const projectName = safeGet(() => targetProject.name(), 'Unknown Project');
    
    // Count tasks
    const tasks = safeGet(() => targetProject.flattenedTasks(), []);
    const taskCount = tasks.length;
    let deletedTaskCount = 0;
    
    // Delete or orphan tasks (if requested)
    if (deleteTasks && taskCount > 0) {
      for (let i = tasks.length - 1; i >= 0; i--) {
        try {
          tasks[i].markDropped();
          deletedTaskCount++;
        } catch (taskError) {
          // Task deletion failed, but continue with project
        }
      }
    }
    
    // Delete/drop the project (using same approach as working task deletion)
    try {
      targetProject.markDropped();
    } catch (dropError) {
      return JSON.stringify({
        error: true,
        message: "Failed to delete project: " + dropError.toString()
      });
    }
    
    return JSON.stringify({
      success: true,
      projectName: projectName,
      tasksDeleted: deletedTaskCount,
      tasksOrphaned: taskCount - deletedTaskCount,
      message: "Project '" + projectName + "' deleted" +
                (deletedTaskCount > 0 ? " with " + deletedTaskCount + " tasks" : "") +
                (taskCount - deletedTaskCount > 0 ? " (" + (taskCount - deletedTaskCount) + " tasks moved to Inbox)" : "")
    });
  } catch (error) {
    return formatError(error, 'delete_project');
  }
  })();
`;
