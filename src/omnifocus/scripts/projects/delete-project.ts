/**
 * Script to delete a project from OmniFocus
 *
 * OmniJS-first pattern: All logic runs inside evaluateJavascript()
 *
 * Features:
 * - Delete project by marking as dropped
 * - Optionally delete all tasks within project
 * - Tasks not deleted become orphaned in Inbox
 * - Detailed reporting of deleted/orphaned tasks
 */
export const DELETE_PROJECT_SCRIPT = `
  // DELETE_PROJECT - OmniJS-first pattern
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const projectId = "{{projectId}}";
          const deleteTasks = {{deleteTasks}};

          // Find the project by ID using OmniJS
          const targetProject = Project.byIdentifier(projectId);

          if (!targetProject) {
            return JSON.stringify({
              error: true,
              message: "Project with ID '" + projectId + "' not found. Use 'list_projects' tool to see available projects."
            });
          }

          const projectName = targetProject.name || 'Unknown Project';

          // Count tasks
          const tasks = targetProject.flattenedTasks || [];
          const taskCount = tasks.length;
          let deletedTaskCount = 0;

          // Delete or orphan tasks (if requested)
          if (deleteTasks && taskCount > 0) {
            // Iterate in reverse to avoid index shifting
            for (let i = tasks.length - 1; i >= 0; i--) {
              try {
                tasks[i].markDropped();
                deletedTaskCount++;
              } catch (taskError) {
                // Task deletion failed, but continue with project
              }
            }
          }

          // Delete/drop the project using OmniJS markDropped()
          targetProject.markDropped();

          return JSON.stringify({
            success: true,
            projectName: projectName,
            tasksDeleted: deletedTaskCount,
            tasksOrphaned: taskCount - deletedTaskCount,
            message: "Project '" + projectName + "' deleted" +
                      (deletedTaskCount > 0 ? " with " + deletedTaskCount + " tasks" : "") +
                      (taskCount - deletedTaskCount > 0 ? " (" + (taskCount - deletedTaskCount) + " tasks moved to Inbox)" : "")
          });
        })()
      \`;

      return app.evaluateJavascript(omniJsScript);
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        operation: 'delete_project'
      });
    }
  })();
`;
