import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to create a new task in OmniFocus
 */
export const CREATE_TASK_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskData = {{taskData}};
    
    try {
      // Create the task in inbox or specified project
      let targetContainer = doc.inboxTasks;
      
      if (taskData.projectId) {
        const validation = validateProject(taskData.projectId, doc);
        if (!validation.valid) {
          return JSON.stringify({ error: true, message: validation.error });
        }
        if (validation.project) {
          targetContainer = validation.project.tasks;
        }
      }
      
      // Create task with basic properties
      const task = app.Task({
        name: taskData.name,
        note: taskData.note || '',
        flagged: taskData.flagged || false
      });
      
      // Add to container
      targetContainer.push(task);
      
      // Set dates if provided
      if (taskData.dueDate) {
        try {
          task.dueDate = new Date(taskData.dueDate);
        } catch (e) {
          // Skip invalid due date - log error details for debugging
          console.log('Invalid due date:', taskData.dueDate, e.message);
        }
      }
      
      if (taskData.deferDate) {
        try {
          task.deferDate = new Date(taskData.deferDate);
        } catch (e) {
          // Skip invalid defer date - log error details for debugging
          console.log('Invalid defer date:', taskData.deferDate, e.message);
        }
      }
      
      // Set estimated minutes if provided
      if (taskData.estimatedMinutes && typeof taskData.estimatedMinutes === 'number') {
        task.estimatedMinutes = taskData.estimatedMinutes;
      }
      
      // Note: Tags cannot be assigned during creation in JXA
      // This is a known limitation of the OmniFocus JXA API
      
      // Get the created task ID
      const taskId = task.id();
      
      return JSON.stringify({
        taskId: taskId,
        name: task.name(),
        created: true,
        note: taskData.tags && taskData.tags.length > 0 
          ? 'Note: Tags cannot be assigned during task creation due to JXA limitations. Use update_task to add tags.'
          : undefined
      });
      
    } catch (error) {
      return formatError(error, 'create_task');
    }
  })();
`;