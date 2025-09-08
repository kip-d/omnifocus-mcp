/**
 * Simplified Script to create a new task in OmniFocus  
 * MINIMAL VERSION: Basic task creation without heavy helpers
 * Size: ~3KB (well under limits)
 */
export const CREATE_TASK_SCRIPT_SIMPLE = `
  // Minimal error formatting
  function formatError(error, context = '') {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      context: context
    });
  }
  
  // Basic project validation
  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };
    
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try { 
        if (projects[i].id() === projectId) { 
          return { valid: true, project: projects[i] }; 
        } 
      } catch (e) {}
    }
    
    return { 
      valid: false, 
      error: 'Project not found: ' + projectId 
    };
  }
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskData = {{taskData}};
    
    try {
      // Determine the target container
      let targetContainer = doc.inboxTasks;
      
      if (taskData.parentTaskId) {
        // Find parent task
        const allTasks = doc.flattenedTasks();
        let parentTask = null;
        for (let i = 0; i < allTasks.length; i++) {
          try {
            if (allTasks[i].id() === taskData.parentTaskId) {
              parentTask = allTasks[i];
              break;
            }
          } catch (e) {}
        }
        
        if (!parentTask) {
          return JSON.stringify({ 
            error: true, 
            message: "Parent task with ID '" + taskData.parentTaskId + "' not found" 
          });
        }
        
        targetContainer = parentTask.tasks;
        
      } else if (taskData.projectId) {
        const validation = validateProject(taskData.projectId, doc);
        if (!validation.valid) {
          return JSON.stringify({ error: true, message: validation.error });
        }
        if (validation.project) {
          targetContainer = validation.project.tasks;
        }
      }
      
      // Create the task
      const task = targetContainer.make({ new: 'task', withProperties: { name: taskData.name } });
      
      // Set basic properties
      if (taskData.note) {
        task.note = taskData.note;
      }
      
      if (taskData.flagged !== undefined) {
        task.flagged = taskData.flagged;
      }
      
      // Set dates
      if (taskData.dueDate) {
        try {
          task.dueDate = new Date(taskData.dueDate);
        } catch (e) {
          console.log('Invalid due date:', taskData.dueDate);
        }
      }
      
      if (taskData.deferDate) {
        try {
          task.deferDate = new Date(taskData.deferDate);
        } catch (e) {
          console.log('Invalid defer date:', taskData.deferDate);
        }
      }
      
      // Set estimated minutes
      if (taskData.estimatedMinutes && typeof taskData.estimatedMinutes === 'number') {
        task.estimatedMinutes = taskData.estimatedMinutes;
      }
      
      // Set sequential property
      if (taskData.sequential !== undefined) {
        task.sequential = taskData.sequential;
      }
      
      // Build simple response
      const response = {
        taskId: task.id(),
        name: task.name(),
        note: task.note() || "",
        flagged: task.flagged(),
        dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
        deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
        estimatedMinutes: task.estimatedMinutes() || null,
        project: task.containingProject() ? task.containingProject().name() : null,
        projectId: task.containingProject() ? task.containingProject().id() : null,
        inInbox: task.inInbox(),
        created: true,
        tags: [], // TODO: Re-implement after fixing script size limits
        note: taskData.tags ? 'Tags temporarily disabled due to script size limits' : ''
      };
      
      return JSON.stringify(response);
      
    } catch (error) {
      return formatError(error, 'create_task');
    }
  })();
`;