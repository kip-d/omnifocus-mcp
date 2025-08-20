/**
 * Ultra-fast flagged tasks using whose() - if it works for flagged property
 */

export const FLAGGED_TASKS_WHOSE_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const limit = {{limit}};
    const includeCompleted = {{includeCompleted}};
    const includeDetails = {{includeDetails}};
    
    try {
      const queryStartTime = Date.now();
      
      // Try using whose() for flagged - might work since it's a simple boolean
      let flaggedTasks;
      try {
        // This MIGHT work since flagged is a simple property
        flaggedTasks = doc.flattenedTasks.whose({flagged: true})();
        console.log('whose() succeeded for flagged tasks:', flaggedTasks.length);
      } catch (whoseError) {
        // Fall back to manual iteration if whose() fails
        console.log('whose() failed, falling back to iteration');
        const allTasks = doc.flattenedTasks();
        flaggedTasks = [];
        
        for (let i = 0; i < allTasks.length; i++) {
          try {
            if (allTasks[i].flagged()) {
              flaggedTasks.push(allTasks[i]);
            }
          } catch (e) {}
        }
      }
      
      // Now filter and process the flagged tasks
      const results = [];
      const len = Math.min(flaggedTasks.length, limit);
      
      for (let i = 0; i < len; i++) {
        const task = flaggedTasks[i];
        
        try {
          // Skip completed if not including them
          if (!includeCompleted && task.completed()) continue;
          
          const project = task.containingProject();
          
          const taskData = {
            id: task.id(),
            name: task.name(),
            flagged: true,
            completed: task.completed()
          };
          
          if (includeDetails) {
            taskData.note = task.note() || '';
            taskData.dueDate = task.dueDate() ? task.dueDate().toISOString() : null;
            taskData.deferDate = task.deferDate() ? task.deferDate().toISOString() : null;
            taskData.project = project ? project.name() : null;
            taskData.projectId = project ? project.id() : null;
          } else {
            taskData.project = project ? project.name() : null;
          }
          
          results.push(taskData);
        } catch (e) {}
      }
      
      const queryEndTime = Date.now();
      
      return JSON.stringify({
        tasks: results,
        summary: {
          total: results.length,
          total_flagged: flaggedTasks.length,
          query_time_ms: queryEndTime - queryStartTime,
          query_method: 'whose_flagged'
        }
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to get flagged tasks: " + error.toString()
      });
    }
  })();
`;