
  
  // Safe utility functions for OmniFocus automation
  function safeGet(getter, defaultValue = null) {
    try {
      const result = getter();
      return result !== null && result !== undefined ? result : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
  
  function safeGetDate(getter) {
    try {
      const date = getter();
      if (!date) return null;
      
      // Use isValidDate to check if it's a valid Date object
      if (!isValidDate(date)) return null;
      
      return date.toISOString();
    } catch (e) {
      return null;
    }
  }
  
  function safeGetProject(task) {
    try {
      const project = task.containingProject();
      if (project) {
        return {
          name: safeGet(() => project.name()),
          id: safeGet(() => project.id())
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetTags(task) {
    try {
      const tags = task.tags();
      if (!tags) return [];
      const tagNames = [];
      for (let i = 0; i < tags.length; i++) {
        const tagName = safeGet(() => tags[i].name());
        if (tagName) {
          tagNames.push(tagName);
        }
      }
      return tagNames;
    } catch (e) {
      return [];
    }
  }
  
  function isValidDate(date) {
    return date && date.toString() !== 'missing value' && !isNaN(date.getTime());
  }
  
  function isTaskAvailable(task) {
    try {
      const deferDate = task.deferDate();
      if (!deferDate || !isValidDate(deferDate)) {
        return true; // No defer date means available
      }
      return deferDate <= new Date();
    } catch (e) {
      return true; // If we can't check, assume available
    }
  }
  
  function isTaskEffectivelyCompleted(task) {
    try {
      // Check if directly completed
      if (task.completed()) return true;
      
      // Check if dropped
      if (task.dropped && task.dropped()) return true;
      
      // Check if parent project is completed/dropped
      const container = task.containingProject();
      if (container) {
        if (container.completed && container.completed()) return true;
        if (container.dropped && container.dropped()) return true;
        if (container.status && container.status() === 'dropped') return true;
        if (container.status && container.status() === 'done') return true;
      }
      
      return false;
    } catch (e) {
      // If there's an error checking, assume not completed
      return false;
    }
  }
  
  function isFlagged(obj) {
    try {
      return obj.flagged() === true;
    } catch (e) {
      return false;
    }
  }
  
  function safeGetEstimatedMinutes(task) {
    try {
      const estimate = task.estimatedMinutes();
      return typeof estimate === 'number' ? estimate : null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetFolder(project) {
    try {
      const container = project.container();
      if (container && container.constructor.name === 'Folder') {
        return safeGet(() => container.name());
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetTaskCount(project) {
    try {
      return project.numberOfTasks() || 0;
    } catch (e) {
      return 0;
    }
  }
  
  function safeIsCompleted(task) {
    try {
      return task.completed() === true;
    } catch (e) {
      return false;
    }
  }


  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };
    
    // Try whose() first for performance
    let foundProject = null;
    try {
      const projects = doc.flattenedProjects.whose({id: projectId})();
      if (projects && projects.length > 0) {
        foundProject = projects[0];
      }
    } catch (e) {
      // whose() failed, fall back to iteration
    }
    
    // Fall back to iteration if whose() didn't work
    if (!foundProject) {
      const projects = doc.flattenedProjects();
      for (let i = 0; i < projects.length; i++) {
        if (projects[i].id() === projectId) {
          foundProject = projects[i];
          break;
        }
      }
    }
    
    if (!foundProject) {
      // Check if it's a numeric-only ID (Claude Desktop bug)
      const isNumericOnly = /^\d+$/.test(projectId);
      let errorMessage = 'Project not found: ' + projectId;
      
      if (isNumericOnly) {
        errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
      }
      
      return { 
        valid: false, 
        error: errorMessage 
      };
    }
    
    return { 
      valid: true, 
      project: foundProject 
    };
  }


  function serializeTask(task, includeDetails = true) {
    const taskObj = {
      id: safeGet(() => task.id()),
      name: safeGet(() => task.name()),
      completed: safeGet(() => task.completed(), false),
      flagged: isFlagged(task),
      inInbox: safeGet(() => task.inInbox(), false)
    };
    
    if (includeDetails) {
      taskObj.note = safeGet(() => task.note(), '');
      taskObj.dueDate = safeGetDate(() => task.dueDate());
      taskObj.deferDate = safeGetDate(() => task.deferDate());
      taskObj.completionDate = safeGetDate(() => task.completionDate());
      taskObj.estimatedMinutes = safeGetEstimatedMinutes(task);
      
      const project = safeGetProject(task);
      if (project) {
        taskObj.project = project.name;
        taskObj.projectId = project.id;
      }
      
      taskObj.tags = safeGetTags(task);
    }
    
    return taskObj;
  }


  function formatError(error, context = '') {
    const errorObj = {
      error: true,
      message: error.message || String(error),
      context: context
    };
    
    if (error.stack) {
      errorObj.stack = error.stack;
    }
    
    return JSON.stringify(errorObj);
  }

  
  (() => {
    const filter = {"completed": false};
    const format = "csv";
    const fields = ["id", "name", "project", "dueDate", "flagged", "completed"];
    
    try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const tasks = [];
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    const allFields = fields || ['name', 'note', 'project', 'tags', 'deferDate', 'dueDate', 'completed', 'flagged'];
    
    // Apply limit from filter if present, with reasonable default to prevent timeout
    const maxTasks = (filter && filter.limit) ? filter.limit : Math.min(1000, allTasks.length);
    let tasksAdded = 0;
    
    for (let i = 0; i < allTasks.length && tasksAdded < maxTasks; i++) {
      try {
        const task = allTasks[i];
        
        // Apply filters
        if (filter.available !== undefined && safeGet(() => task.effectivelyHidden(), false) === filter.available) continue;
      
      if (filter.completed !== undefined && safeIsCompleted(task) !== filter.completed) continue;
      
      if (filter.flagged !== undefined && isFlagged(task) !== filter.flagged) continue;
      
      if (filter.project) {
        try {
          const project = safeGetProject(task);
          if (!project || project.name !== filter.project) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.projectId) {
        try {
          const project = safeGetProject(task);
          if (!project || project.id !== filter.projectId) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.tags && filter.tags.length > 0) {
        try {
          const taskTags = safeGetTags(task);
          const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
          if (!hasAllTags) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.search) {
        try {
          const name = safeGet(() => task.name(), '') || '';
          const note = safeGet(() => task.note(), '') || '';
          const searchText = (name + ' ' + note).toLowerCase();
          if (!searchText.includes(filter.search.toLowerCase())) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Build task object with requested fields
      const taskData = {};
      
      if (allFields.includes('id')) {
        taskData.id = safeGet(() => task.id(), 'unknown');
      }
      
      if (allFields.includes('name')) {
        taskData.name = safeGet(() => task.name(), 'Unnamed Task');
      }
      
      if (allFields.includes('note')) {
        const note = safeGet(() => task.note());
        if (note) taskData.note = note;
      }
      
      if (allFields.includes('project')) {
        try {
          const project = safeGetProject(task);
          if (project) {
            taskData.project = project.name;
            taskData.projectId = project.id;
          }
        } catch (e) {}
      }
      
      if (allFields.includes('tags')) {
        try {
          const tags = safeGetTags(task);
          if (tags && tags.length > 0) {
            taskData.tags = tags;
          }
        } catch (e) {}
      }
      
      if (allFields.includes('deferDate')) {
        const deferDate = safeGetDate(() => task.deferDate());
        if (deferDate) taskData.deferDate = deferDate;
      }
      
      if (allFields.includes('dueDate')) {
        const dueDate = safeGetDate(() => task.dueDate());
        if (dueDate) taskData.dueDate = dueDate;
      }
      
      if (allFields.includes('completed')) {
        taskData.completed = safeGet(() => task.completed(), false);
        if (taskData.completed) {
          const completionDate = safeGetDate(() => task.completionDate());
          if (completionDate) taskData.completionDate = completionDate;
        }
      }
      
      if (allFields.includes('flagged')) {
        taskData.flagged = safeGet(() => task.flagged(), false);
      }
      
      if (allFields.includes('estimated')) {
        const minutes = safeGet(() => task.estimatedMinutes());
        if (minutes && minutes > 0) {
          taskData.estimatedMinutes = minutes;
        }
      }
      
      if (allFields.includes('created')) {
        const created = safeGetDate(() => task.creationDate());
        if (created) taskData.createdDate = created;
      }
      
      if (allFields.includes('modified')) {
        const modified = safeGetDate(() => task.modificationDate());
        if (modified) taskData.modifiedDate = modified;
      }
      
      tasks.push(taskData);
      tasksAdded++;
      } catch (taskError) {
        // Log but continue processing other tasks
        // Individual task errors shouldn't stop the entire export
        continue;
      }
    }
    
    // Format output based on requested format
    if (format === 'csv') {
      // Build CSV
      if (tasks.length === 0) {
        return JSON.stringify({
          format: 'csv',
          data: 'name,completed,flagged\n',
          count: 0,
          message: 'No tasks found matching the filter criteria'
        });
      }
      
      const headers = Object.keys(tasks[0] || {});
      let csv = headers.join(',') + '\n';
      
      for (const task of tasks) {
        const row = headers.map(h => {
          const value = task[h];
          if (value === undefined || value === null) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          if (Array.isArray(value)) {
            return '"' + value.join('; ') + '"';
          }
          return value.toString();
        });
        csv += row.join(',') + '\n';
      }
      
      return JSON.stringify({
        format: 'csv',
        data: csv,
        count: tasks.length,
        limited: tasksAdded >= maxTasks,
        message: tasksAdded >= maxTasks ? 'Export limited to ' + maxTasks + ' tasks. Use filter.limit to adjust.' : undefined
      });
    } else if (format === 'markdown') {
      // Build Markdown
      let markdown = '# OmniFocus Tasks Export\n\n';
      markdown += 'Export date: ' + new Date().toISOString() + '\n\n';
      markdown += 'Total tasks: ' + tasks.length + '\n\n';
      
      // Group by project
      const byProject = {};
      const inbox = [];
      
      for (const task of tasks) {
        if (task.project) {
          if (!byProject[task.project]) {
            byProject[task.project] = [];
          }
          byProject[task.project].push(task);
        } else {
          inbox.push(task);
        }
      }
      
      // Inbox tasks
      if (inbox.length > 0) {
        markdown += '## Inbox\n\n';
        for (const task of inbox) {
          markdown += '- [' + (task.completed ? 'x' : ' ') + '] ' + task.name;
          if (task.flagged) markdown += ' 🚩';
          if (task.dueDate) markdown += ' 📅 Due: ' + task.dueDate;
          if (task.tags && task.tags.length > 0) markdown += ' 🏷️ ' + task.tags.join(', ');
          markdown += '\n';
          if (task.note) {
            markdown += '  - Note: ' + task.note.replace(/\n/g, '\n    ') + '\n';
          }
        }
        markdown += '\n';
      }
      
      // Project tasks
      for (const projectName in byProject) {
        markdown += '## ' + projectName + '\n\n';
        for (const task of byProject[projectName]) {
          markdown += '- [' + (task.completed ? 'x' : ' ') + '] ' + task.name;
          if (task.flagged) markdown += ' 🚩';
          if (task.dueDate) markdown += ' 📅 Due: ' + task.dueDate;
          if (task.tags && task.tags.length > 0) markdown += ' 🏷️ ' + task.tags.join(', ');
          markdown += '\n';
          if (task.note) {
            markdown += '  - Note: ' + task.note.replace(/\n/g, '\n    ') + '\n';
          }
        }
        markdown += '\n';
      }
      
      return JSON.stringify({
        format: 'markdown',
        data: markdown,
        count: tasks.length
      });
    } else {
      // Default to JSON
      return JSON.stringify({
        format: 'json',
        data: tasks,
        count: tasks.length,
        limited: tasksAdded >= maxTasks,
        message: tasksAdded >= maxTasks ? 'Export limited to ' + maxTasks + ' tasks. Use filter.limit to adjust.' : undefined
      });
    }
  } catch (error) {
    return formatError(error, 'export_tasks');
  }
  })();
