export const LIST_TASKS_SCRIPT = `
  const filter = {{filter}};
  const tasks = [];
  
  // Helper function to analyze recurring task status
  function analyzeRecurringStatus(task, repetitionRule) {
    if (!repetitionRule) {
      return {
        isRecurring: false,
        type: 'non-recurring'
      };
    }
    
    const status = {
      isRecurring: true,
      type: 'new-instance', // Default assumption
      frequency: '',
      scheduleDeviation: false,
      nextExpectedDate: null
    };
    
    // Calculate frequency description
    if (repetitionRule.unit && repetitionRule.steps) {
      switch(repetitionRule.unit) {
        case 'days':
          if (repetitionRule.steps === 1) status.frequency = 'Daily';
          else if (repetitionRule.steps === 7) status.frequency = 'Weekly';
          else if (repetitionRule.steps === 14) status.frequency = 'Biweekly';
          else status.frequency = 'Every ' + repetitionRule.steps + ' days';
          break;
        case 'weeks':
          if (repetitionRule.steps === 1) status.frequency = 'Weekly';
          else status.frequency = 'Every ' + repetitionRule.steps + ' weeks';
          break;
        case 'months':
          if (repetitionRule.steps === 1) status.frequency = 'Monthly';
          else if (repetitionRule.steps === 3) status.frequency = 'Quarterly';
          else status.frequency = 'Every ' + repetitionRule.steps + ' months';
          break;
        case 'years':
          if (repetitionRule.steps === 1) status.frequency = 'Yearly';
          else status.frequency = 'Every ' + repetitionRule.steps + ' years';
          break;
        default:
          status.frequency = 'Custom';
      }
    }
    
    // Analyze task timing to detect rescheduled vs new instance
    try {
      const now = new Date();
      const added = task.added();
      const dueDate = task.dueDate();
      const deferDate = task.deferDate();
      const completionDate = task.completionDate();
      
      if (added && repetitionRule.unit && repetitionRule.steps) {
        const daysSinceAdded = Math.floor((now - added) / (1000 * 60 * 60 * 24));
        
        // Calculate expected interval in days
        let intervalDays = repetitionRule.steps;
        switch(repetitionRule.unit) {
          case 'weeks': intervalDays *= 7; break;
          case 'months': intervalDays *= 30; break; // Approximation
          case 'years': intervalDays *= 365; break; // Approximation
        }
        
        // If task was added very recently (within 1 day), likely new instance
        if (daysSinceAdded <= 1) {
          status.type = 'new-instance';
        }
        // If task has been around longer than expected interval, might be rescheduled
        else if (daysSinceAdded > intervalDays * 1.5) {
          status.type = 'rescheduled';
          status.scheduleDeviation = true;
        }
        // Check if dates align with repetition pattern
        else if (dueDate) {
          const daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
          
          // If due date is way off from expected pattern, likely rescheduled
          if (Math.abs(daysUntilDue) > intervalDays) {
            status.type = 'rescheduled';
            status.scheduleDeviation = true;
          }
          
          // Calculate next expected date based on pattern
          const nextDue = new Date(dueDate);
          nextDue.setDate(nextDue.getDate() + intervalDays);
          status.nextExpectedDate = nextDue.toISOString();
        }
        
        // For completion-based repetition, check against completion date
        if (repetitionRule.scheduleType === 'fromCompletion' && completionDate) {
          const daysSinceCompletion = Math.floor((now - completionDate) / (1000 * 60 * 60 * 24));
          if (daysSinceCompletion < intervalDays * 0.8) {
            status.type = 'new-instance';
          }
        }
      }
    } catch (e) {
      // If date analysis fails, stick with default 'new-instance'
    }
    
    return status;
  }
  
  try {
    const allTasks = doc.flattenedTasks();
    const limit = Math.min(filter.limit || 100, 1000); // Cap at 1000
    let count = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < allTasks.length && count < limit; i++) {
      const task = allTasks[i];
      
      // Skip if task doesn't match filters
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      if (filter.flagged !== undefined && task.flagged() !== filter.flagged) continue;
      if (filter.inInbox !== undefined && task.inInbox() !== filter.inInbox) continue;
      
      // Search filter
      if (filter.search) {
        try {
          const name = task.name() || '';
          const note = task.note() || '';
          const searchText = (name + ' ' + note).toLowerCase();
          if (!searchText.includes(filter.search.toLowerCase())) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Project filter
      if (filter.projectId !== undefined) {
        try {
          const project = task.containingProject();
          if (filter.projectId === null && project !== null) continue;
          if (filter.projectId !== null && (!project || project.id() !== filter.projectId)) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        try {
          const taskTags = task.tags().map(t => t.name());
          const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
          if (!hasAllTags) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Date filters
      if (filter.dueBefore || filter.dueAfter) {
        try {
          const dueDate = task.dueDate();
          if (!dueDate && (filter.dueBefore || filter.dueAfter)) continue; // Skip tasks without due dates
          if (filter.dueBefore && dueDate > new Date(filter.dueBefore)) continue;
          if (filter.dueAfter && dueDate < new Date(filter.dueAfter)) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.deferBefore || filter.deferAfter) {
        try {
          const deferDate = task.deferDate();
          if (!deferDate && (filter.deferBefore || filter.deferAfter)) continue; // Skip tasks without defer dates
          if (filter.deferBefore && deferDate > new Date(filter.deferBefore)) continue;
          if (filter.deferAfter && deferDate < new Date(filter.deferAfter)) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Available filter
      if (filter.available) {
        try {
          if (task.completed() || task.dropped()) continue;
          const deferDate = task.deferDate();
          if (deferDate && deferDate > new Date()) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Build task object with safe property access
      const taskObj = {
        id: task.id(),
        name: task.name(),
        completed: task.completed(),
        flagged: task.flagged(),
        inInbox: task.inInbox()
      };
      
      // Add optional properties safely
      try {
        const note = task.note();
        if (note) taskObj.note = note;
      } catch (e) {}
      
      try {
        const project = task.containingProject();
        if (project) {
          taskObj.project = project.name();
          taskObj.projectId = project.id();
        }
      } catch (e) {}
      
      try {
        const dueDate = task.dueDate();
        if (dueDate) taskObj.dueDate = dueDate.toISOString();
      } catch (e) {}
      
      try {
        const deferDate = task.deferDate();
        if (deferDate) taskObj.deferDate = deferDate.toISOString();
      } catch (e) {}
      
      try {
        const tags = task.tags();
        taskObj.tags = tags.map(t => t.name());
      } catch (e) {
        taskObj.tags = [];
      }
      
      // Add creation date if available
      try {
        const added = task.added();
        if (added) taskObj.added = added.toISOString();
      } catch (e) {}
      
      // Add repetition rule and recurring status analysis
      try {
        const repetitionRule = task.repetitionRule();
        if (repetitionRule) {
          taskObj.repetitionRule = {
            method: repetitionRule.method || 'fixed',
            interval: repetitionRule.interval || '',
            unit: repetitionRule.unit,
            steps: repetitionRule.steps,
            scheduleType: repetitionRule.scheduleType
          };
          
          // Use helper function for sophisticated analysis
          taskObj.recurringStatus = analyzeRecurringStatus(task, repetitionRule);
        } else {
          taskObj.recurringStatus = {
            isRecurring: false,
            type: 'non-recurring'
          };
        }
      } catch (e) {
        taskObj.recurringStatus = {
          isRecurring: false,
          type: 'non-recurring'
        };
      }
      
      tasks.push(taskObj);
      count++;
    }
    
    const endTime = Date.now();
    const totalFiltered = count; // Tasks that matched filters (including those beyond limit)
    let totalAvailable = 0;
    
    // Quick count of total matching tasks
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Apply same filters as main loop
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      if (filter.flagged !== undefined && task.flagged() !== filter.flagged) continue;
      if (filter.inInbox !== undefined && task.inInbox() !== filter.inInbox) continue;
      
      // Search filter
      if (filter.search) {
        try {
          const name = task.name() || '';
          const note = task.note() || '';
          const searchText = (name + ' ' + note).toLowerCase();
          if (!searchText.includes(filter.search.toLowerCase())) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Project filter
      if (filter.projectId !== undefined) {
        try {
          const project = task.containingProject();
          if (filter.projectId === null && project !== null) continue;
          if (filter.projectId !== null && (!project || project.id() !== filter.projectId)) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        try {
          const taskTags = task.tags().map(t => t.name());
          const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
          if (!hasAllTags) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Date filters
      if (filter.dueBefore || filter.dueAfter) {
        try {
          const dueDate = task.dueDate();
          if (!dueDate && (filter.dueBefore || filter.dueAfter)) continue;
          if (filter.dueBefore && dueDate > new Date(filter.dueBefore)) continue;
          if (filter.dueAfter && dueDate < new Date(filter.dueAfter)) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.deferBefore || filter.deferAfter) {
        try {
          const deferDate = task.deferDate();
          if (!deferDate && (filter.deferBefore || filter.deferAfter)) continue;
          if (filter.deferBefore && deferDate > new Date(filter.deferBefore)) continue;
          if (filter.deferAfter && deferDate < new Date(filter.deferAfter)) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Available filter
      if (filter.available) {
        try {
          if (task.completed() || task.dropped()) continue;
          const deferDate = task.deferDate();
          if (deferDate && deferDate > new Date()) continue;
        } catch (e) {
          continue;
        }
      }
      
      totalAvailable++;
    }
    
    return JSON.stringify({
      tasks: tasks,
      metadata: {
        total_items: totalAvailable,
        items_returned: tasks.length,
        limit_applied: limit,
        has_more: totalAvailable > tasks.length,
        query_time_ms: endTime - startTime,
        filters_applied: {
          completed: filter.completed,
          flagged: filter.flagged,
          inInbox: filter.inInbox,
          search: filter.search,
          tags: filter.tags,
          projectId: filter.projectId,
          dueBefore: filter.dueBefore,
          dueAfter: filter.dueAfter,
          deferBefore: filter.deferBefore,
          deferAfter: filter.deferAfter,
          available: filter.available
        },
        performance_note: totalAvailable > 500 ? 
          "Large result set. Consider using more specific filters for better performance." : 
          undefined
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to list tasks: " + error.toString(),
      details: error.message
    });
  }
`;

export const CREATE_TASK_SCRIPT = `
  const taskData = {{taskData}};
  
  try {
    // Create task data object for JXA
    const taskObj = {
      name: taskData.name
    };
    
    // Add optional properties
    if (taskData.note !== undefined) taskObj.note = taskData.note;
    if (taskData.flagged !== undefined) taskObj.flagged = taskData.flagged;
    if (taskData.dueDate !== undefined && taskData.dueDate) taskObj.dueDate = new Date(taskData.dueDate);
    if (taskData.deferDate !== undefined && taskData.deferDate) taskObj.deferDate = new Date(taskData.deferDate);
    if (taskData.estimatedMinutes !== undefined) taskObj.estimatedMinutes = taskData.estimatedMinutes;
    
    // Handle tags before task creation
    const tagsToAdd = [];
    if (taskData.tags && taskData.tags.length > 0) {
      const existingTags = doc.flattenedTags();
      for (const tagName of taskData.tags) {
        let found = false;
        for (let i = 0; i < existingTags.length; i++) {
          if (existingTags[i].name() === tagName) {
            tagsToAdd.push(existingTags[i]);
            found = true;
            break;
          }
        }
        // Note: JXA doesn't support creating new tags reliably in task creation
      }
    }
    
    // Determine where to create the task
    let targetContainer = null;
    let taskIsInInbox = true;
    
    // If projectId is provided, find the project and assign the task there
    if (taskData.projectId && taskData.projectId !== "") {
      const projects = doc.flattenedProjects();
      for (let i = 0; i < projects.length; i++) {
        if (projects[i].id() === taskData.projectId) {
          targetContainer = projects[i];
          taskIsInInbox = false;
          break;
        }
      }
      
      // If project not found, return error
      if (!targetContainer) {
        // Check if this looks like Claude Desktop extracted a number from an alphanumeric ID
        const isNumericOnly = /^\d+$/.test(taskData.projectId);
        let errorMessage = "Project with ID '" + taskData.projectId + "' not found";
        
        if (isNumericOnly) {
          errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
        }
        
        return JSON.stringify({
          error: true,
          message: errorMessage
        });
      }
    }
    
    // Create the task using JXA syntax
    let newTask;
    if (targetContainer) {
      // Create task in the specified project
      newTask = app.Task(taskObj);
      targetContainer.tasks.push(newTask);
    } else {
      // Create task in inbox
      newTask = app.InboxTask(taskObj);
      const inbox = doc.inboxTasks;
      inbox.push(newTask);
    }
    
    // Try to get the real OmniFocus ID by finding the task we just created
    let taskId = null;
    let createdTask = null;
    
    try {
      // Search in the appropriate container
      const tasksToSearch = targetContainer ? targetContainer.tasks() : doc.inboxTasks();
      for (let i = tasksToSearch.length - 1; i >= 0; i--) {
        const task = tasksToSearch[i];
        if (task.name() === taskData.name) {
          taskId = task.id();
          createdTask = task;
          
          // Add tags to the created task
          if (tagsToAdd.length > 0) {
            try {
              task.addTags(tagsToAdd);
            } catch (tagError) {
              // Tags failed to add, but task was created
            }
          }
          
          break;
        }
      }
    } catch (e) {
      // If we can't get the real ID, generate a temporary one
      taskId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    }
    
    return JSON.stringify({
      success: true,
      taskId: taskId,
      task: {
        id: taskId,
        name: taskData.name,
        flagged: taskData.flagged || false,
        inInbox: taskIsInInbox,
        projectId: taskData.projectId || null,
        project: targetContainer ? targetContainer.name() : null
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to create task: " + error.toString(),
      details: error.message
    });
  }
`;

// Simplified version to debug freeze issue
export const UPDATE_TASK_SCRIPT_SIMPLE = `
  const taskId = {{taskId}};
  const updates = {{updates}};
  
  try {
    // Find task by ID - simplified search
    const tasks = doc.flattenedTasks();
    let task = null;
    for (let i = 0; i < tasks.length; i++) { // Search all tasks
      if (tasks[i].id() === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ error: true, message: 'Task not found' });
    }
    
    // Apply updates - basic properties
    if (updates.name !== undefined) task.name = updates.name;
    if (updates.note !== undefined) task.note = updates.note;
    if (updates.flagged !== undefined) task.flagged = updates.flagged;
    
    // Handle project assignment (simplified version)
    if (updates.projectId !== undefined) {
      if (updates.projectId === "") {
        // Move to inbox - set assignedContainer to null which moves task to inbox
        task.assignedContainer = null;
      } else {
        // Find and assign project by ID
        const projects = doc.flattenedProjects();
        let projectFound = false;
        for (let i = 0; i < projects.length; i++) {
          if (projects[i].id() === updates.projectId) {
            task.assignedContainer = projects[i];
            projectFound = true;
            break;
          }
        }
        if (!projectFound) {
          // Check if this looks like Claude Desktop extracted a number from an alphanumeric ID
          const isNumericOnly = /^\d+$/.test(updates.projectId);
          let errorMessage = "Project with ID '" + updates.projectId + "' not found";
          
          if (isNumericOnly) {
            errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
          }
          
          return JSON.stringify({
            error: true,
            message: errorMessage
          });
        }
      }
    }
    
    // Build response with updated fields
    const response = {
      id: task.id(),
      name: task.name(),
      updated: true,
      changes: {}
    };
    
    // Track what was actually changed
    if (updates.name !== undefined) response.changes.name = updates.name;
    if (updates.note !== undefined) response.changes.note = updates.note;
    if (updates.flagged !== undefined) response.changes.flagged = updates.flagged;
    if (updates.projectId !== undefined) {
      response.changes.projectId = updates.projectId;
      if (updates.projectId !== "") {
        const project = task.containingProject();
        if (project) {
          response.changes.projectName = project.name();
        }
      } else {
        response.changes.projectName = "Inbox";
      }
    }
    
    return JSON.stringify(response);
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to update task: " + error.toString()
    });
  }
`;

export const UPDATE_TASK_SCRIPT = `
  const taskId = {{taskId}};
  const updates = {{updates}};
  
  try {
    // Find task by ID
    const tasks = doc.flattenedTasks();
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id() === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ error: true, message: 'Task not found' });
    }
    
    // Apply updates using property setters
    if (updates.name !== undefined) task.name = updates.name;
    if (updates.note !== undefined) task.note = updates.note;
    if (updates.flagged !== undefined) task.flagged = updates.flagged;
    if (updates.dueDate !== undefined) {
      task.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
    }
    if (updates.deferDate !== undefined) {
      task.deferDate = updates.deferDate ? new Date(updates.deferDate) : null;
    }
    if (updates.estimatedMinutes !== undefined) {
      task.estimatedMinutes = updates.estimatedMinutes;
    }
    
    // Update project assignment
    if (updates.projectId !== undefined) {
      if (updates.projectId === "") {
        // Move to inbox - set assignedContainer to null
        task.assignedContainer = null;
      } else {
        // Find and assign project
        const projects = doc.flattenedProjects();
        let projectFound = false;
        for (let i = 0; i < projects.length; i++) {
          if (projects[i].id() === updates.projectId) {
            task.assignedContainer = projects[i];
            projectFound = true;
            break;
          }
        }
        if (!projectFound) {
          // Check if this looks like Claude Desktop extracted a number from an alphanumeric ID
          const isNumericOnly = /^\d+$/.test(updates.projectId);
          let errorMessage = "Project with ID '" + updates.projectId + "' not found";
          
          if (isNumericOnly) {
            errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
          }
          
          return JSON.stringify({
            error: true,
            message: errorMessage
          });
        }
      }
    }
    
    // Update tags
    if (updates.tags !== undefined) {
      // Get current tags
      const currentTags = task.tags();
      
      // Remove all existing tags
      if (currentTags.length > 0) {
        task.removeTags(currentTags);
      }
      
      // Add new tags
      if (updates.tags.length > 0) {
        const existingTags = doc.flattenedTags();
        const tagsToAdd = [];
        
        for (const tagName of updates.tags) {
          let found = false;
          for (let i = 0; i < existingTags.length; i++) {
            if (existingTags[i].name() === tagName) {
              tagsToAdd.push(existingTags[i]);
              found = true;
              break;
            }
          }
          if (!found) {
            // Create new tag
            const newTag = app.Tag({name: tagName});
            doc.tags.push(newTag);
            tagsToAdd.push(newTag);
          }
        }
        
        if (tagsToAdd.length > 0) {
          task.addTags(tagsToAdd);
        }
      }
    }
    
    // Build response with updated fields
    const response = {
      id: task.id(),
      name: task.name(),
      updated: true,
      changes: {}
    };
    
    // Track what was actually changed
    if (updates.name !== undefined) response.changes.name = updates.name;
    if (updates.note !== undefined) response.changes.note = updates.note;
    if (updates.flagged !== undefined) response.changes.flagged = updates.flagged;
    if (updates.dueDate !== undefined) response.changes.dueDate = updates.dueDate;
    if (updates.deferDate !== undefined) response.changes.deferDate = updates.deferDate;
    if (updates.estimatedMinutes !== undefined) response.changes.estimatedMinutes = updates.estimatedMinutes;
    if (updates.tags !== undefined) response.changes.tags = updates.tags;
    if (updates.projectId !== undefined) {
      response.changes.projectId = updates.projectId;
      if (updates.projectId !== "") {
        const project = task.containingProject();
        if (project) {
          response.changes.projectName = project.name();
        }
      } else {
        response.changes.projectName = "Inbox";
      }
    }
    
    return JSON.stringify(response);
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to update task: " + error.toString(),
      details: error.message
    });
  }
`;

export const COMPLETE_TASK_SCRIPT = `
  const taskId = {{taskId}};
  
  try {
    // Find task by ID
    const tasks = doc.flattenedTasks();
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id() === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ error: true, message: 'Task not found' });
    }
    
    if (task.completed()) {
      return JSON.stringify({ error: true, message: 'Task already completed' });
    }
    
    // Mark as complete using JXA property setter
    task.completed = true;
    
    return JSON.stringify({
      id: task.id(),
      completed: true,
      completionDate: task.completionDate() ? task.completionDate().toISOString() : new Date().toISOString()
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to complete task: " + error.toString(),
      details: error.message
    });
  }
`;

// Omni Automation script for completing tasks (bypasses JXA permission issues)
export const COMPLETE_TASK_OMNI_SCRIPT = `
  const taskId = {{taskId}};
  
  try {
    // Find task by ID using Omni Automation
    const tasks = flattenedTasks;
    let targetTask = null;
    
    tasks.forEach(task => {
      if (task.id() === taskId) {
        targetTask = task;
      }
    });
    
    if (!targetTask) {
      throw new Error('Task not found');
    }
    
    if (targetTask.completed) {
      throw new Error('Task already completed');
    }
    
    // Mark as complete using Omni Automation method
    targetTask.markComplete();
    
    // Return success (URL scheme doesn't return values directly)
    return true;
  } catch (error) {
    throw new Error("Failed to complete task: " + error.toString());
  }
`;

export const DELETE_TASK_SCRIPT = `
  const taskId = {{taskId}};
  
  try {
    // Find task by ID
    const tasks = doc.flattenedTasks();
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].id() === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ error: true, message: 'Task not found' });
    }
    
    const taskName = task.name();
    
    // Delete using JXA app.delete method
    app.delete(task);
    
    return JSON.stringify({
      id: taskId,
      deleted: true,
      name: taskName
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to delete task: " + error.toString(),
      details: error.message
    });
  }
`;

// Omni Automation script for deleting tasks (bypasses JXA permission issues)
export const DELETE_TASK_OMNI_SCRIPT = `
  const taskId = {{taskId}};
  
  try {
    // Find task by ID using Omni Automation
    const tasks = flattenedTasks;
    let targetTask = null;
    
    tasks.forEach(task => {
      if (task.id() === taskId) {
        targetTask = task;
      }
    });
    
    if (!targetTask) {
      throw new Error('Task not found');
    }
    
    const taskName = targetTask.name;
    
    // Delete using Omni Automation method
    deleteObject(targetTask);
    
    // Return success (URL scheme doesn't return values directly)
    return true;
  } catch (error) {
    throw new Error("Failed to delete task: " + error.toString());
  }
`;

export const TODAYS_AGENDA_SCRIPT = `
  const options = {{options}};
  const tasks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  try {
    const allTasks = doc.flattenedTasks();
    const startTime = Date.now();
    
    let dueTodayCount = 0;
    let overdueCount = 0;
    let flaggedCount = 0;
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip completed tasks
      if (task.completed()) continue;
      
      // Check if available (if required)
      if (options.includeAvailable) {
        try {
          const deferDate = task.deferDate();
          if (deferDate && deferDate > new Date()) continue;
          // Note: Full availability check would include blocked status
        } catch (e) {}
      }
      
      let includeTask = false;
      let reason = '';
      
      // Check due date
      try {
        const dueDate = task.dueDate();
        if (dueDate) {
          if (dueDate < today && options.includeOverdue) {
            includeTask = true;
            reason = 'overdue';
            overdueCount++;
          } else if (dueDate >= today && dueDate < tomorrow) {
            includeTask = true;
            reason = 'due_today';
            dueTodayCount++;
          }
        }
      } catch (e) {}
      
      // Check flagged status
      if (!includeTask && options.includeFlagged && task.flagged()) {
        includeTask = true;
        reason = 'flagged';
        flaggedCount++;
      }
      
      if (includeTask) {
        // Build task object
        const taskObj = {
          id: task.id(),
          name: task.name(),
          completed: false,
          flagged: task.flagged(),
          reason: reason
        };
        
        // Add optional properties
        try {
          const note = task.note();
          if (note) taskObj.note = note;
        } catch (e) {}
        
        try {
          const project = task.containingProject();
          if (project) {
            taskObj.project = project.name();
            taskObj.projectId = project.id();
          }
        } catch (e) {}
        
        try {
          const dueDate = task.dueDate();
          if (dueDate) taskObj.dueDate = dueDate.toISOString();
        } catch (e) {}
        
        try {
          const deferDate = task.deferDate();
          if (deferDate) taskObj.deferDate = deferDate.toISOString();
        } catch (e) {}
        
        try {
          const tags = task.tags();
          taskObj.tags = tags.map(t => t.name());
        } catch (e) {
          taskObj.tags = [];
        }
        
        tasks.push(taskObj);
      }
    }
    
    const endTime = Date.now();
    
    // Sort tasks by priority: overdue first, then due today, then flagged
    tasks.sort((a, b) => {
      const priority = {'overdue': 0, 'due_today': 1, 'flagged': 2};
      return priority[a.reason] - priority[b.reason];
    });
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        overdue: overdueCount,
        due_today: dueTodayCount,
        flagged: flaggedCount,
        query_time_ms: endTime - startTime
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to get today's agenda: " + error.toString(),
      details: error.message
    });
  }
`;

export const GET_TASK_COUNT_SCRIPT = `
  const filter = {{filter}};
  
  try {
    const allTasks = doc.flattenedTasks();
    let count = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip if task doesn't match filters
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      if (filter.flagged !== undefined && task.flagged() !== filter.flagged) continue;
      if (filter.inInbox !== undefined && task.inInbox() !== filter.inInbox) continue;
      
      // Additional filters that require more processing
      if (filter.projectId !== undefined) {
        try {
          const project = task.containingProject();
          if (filter.projectId === null && project !== null) continue;
          if (filter.projectId !== null && (!project || project.id() !== filter.projectId)) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.tags && filter.tags.length > 0) {
        try {
          const taskTags = task.tags().map(t => t.name());
          const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
          if (!hasAllTags) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.search) {
        try {
          const name = task.name() || '';
          const note = task.note() || '';
          const searchText = (name + ' ' + note).toLowerCase();
          if (!searchText.includes(filter.search.toLowerCase())) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.dueBefore || filter.dueAfter) {
        try {
          const dueDate = task.dueDate();
          if (filter.dueBefore && (!dueDate || dueDate > new Date(filter.dueBefore))) continue;
          if (filter.dueAfter && (!dueDate || dueDate < new Date(filter.dueAfter))) continue;
        } catch (e) {
          if (filter.dueBefore || filter.dueAfter) continue;
        }
      }
      
      if (filter.deferBefore || filter.deferAfter) {
        try {
          const deferDate = task.deferDate();
          if (filter.deferBefore && (!deferDate || deferDate > new Date(filter.deferBefore))) continue;
          if (filter.deferAfter && (!deferDate || deferDate < new Date(filter.deferAfter))) continue;
        } catch (e) {
          if (filter.deferBefore || filter.deferAfter) continue;
        }
      }
      
      if (filter.available) {
        try {
          if (task.completed() || task.dropped()) continue;
          const deferDate = task.deferDate();
          if (deferDate && deferDate > new Date()) continue;
          // Check if blocked (has incomplete sequential predecessors)
          // This is simplified - full availability logic is complex
        } catch (e) {
          continue;
        }
      }
      
      count++;
    }
    
    const endTime = Date.now();
    
    return JSON.stringify({
      count: count,
      query_time_ms: endTime - startTime,
      filters_applied: {
        completed: filter.completed,
        flagged: filter.flagged,
        inInbox: filter.inInbox,
        search: filter.search,
        tags: filter.tags,
        projectId: filter.projectId,
        dueBefore: filter.dueBefore,
        dueAfter: filter.dueAfter,
        deferBefore: filter.deferBefore,
        deferAfter: filter.deferAfter,
        available: filter.available
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to count tasks: " + error.toString(),
      details: error.message
    });
  }
`;