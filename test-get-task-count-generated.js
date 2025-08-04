
  
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
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const filter = {"completed": false};
    
    try {
      let count = 0;
      let baseCollection;
      
      // Start with the most restrictive collection based on filters
      if (filter.inInbox === true) {
        baseCollection = doc.inboxTasks();
      } else if (filter.completed === false && filter.effectivelyCompleted !== true) {
        // Start with incomplete tasks for better performance
        baseCollection = doc.flattenedTasks.whose({completed: false})();
      } else if (filter.completed === true) {
        // Start with completed tasks
        baseCollection = doc.flattenedTasks.whose({completed: true})();
      } else {
        // No optimization possible, use all tasks
        baseCollection = doc.flattenedTasks();
      }
      
      // Helper function to check if task matches all filters
      function matchesFilters(task) {
        // Skip if effectively completed (unless we want completed tasks)
        if (filter.completed !== true && isTaskEffectivelyCompleted(task)) {
          return false;
        }
        
        // Flagged filter
        if (filter.flagged !== undefined && isFlagged(task) !== filter.flagged) {
          return false;
        }
        
        // Project filter
        if (filter.projectId) {
          const project = task.containingProject();
          if (!project || safeGet(() => project.id()) !== filter.projectId) {
            return false;
          }
        }
        
        // Inbox filter
        if (filter.inInbox !== undefined && safeGet(() => task.inInbox(), false) !== filter.inInbox) {
          return false;
        }
        
        // Tag filters
        if (filter.tags && filter.tags.length > 0) {
          const taskTags = safeGetTags(task);
          const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
          if (!hasAllTags) {
            return false;
          }
        }
        
        // Date filters
        if (filter.dueBefore || filter.dueAfter) {
          const dueDate = task.dueDate();
          if (!dueDate || !isValidDate(dueDate)) {
            return false;
          }
          if (filter.dueBefore && dueDate >= new Date(filter.dueBefore)) {
            return false;
          }
          if (filter.dueAfter && dueDate <= new Date(filter.dueAfter)) {
            return false;
          }
        }
        
        // Available filter
        if (filter.available !== undefined && isTaskAvailable(task) !== filter.available) {
          return false;
        }
        
        // Search filter
        if (filter.search) {
          const searchTerm = filter.search.toLowerCase();
          const name = safeGet(() => task.name(), '').toLowerCase();
          const note = safeGet(() => task.note(), '').toLowerCase();
          if (!name.includes(searchTerm) && !note.includes(searchTerm)) {
            return false;
          }
        }
        
        return true;
      }
      
      // Count matching tasks
      const startTime = Date.now();
      
      for (let i = 0; i < baseCollection.length; i++) {
        if (matchesFilters(baseCollection[i])) {
          count++;
        }
      }
      
      const endTime = Date.now();
      
      return JSON.stringify({
        count: count,
        filters_applied: filter,
        query_time_ms: endTime - startTime
      });
      
    } catch (error) {
      return formatError(error, 'get_task_count');
    }
  })();
