/**
 * Shared helper functions for all OmniFocus JXA scripts
 * These are injected into scripts that need them
 */

export const SAFE_UTILITIES = `
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
  
  function getTaskStatus(task) {
    try {
      const status = task.taskStatus();
      // Convert the Task.Status enum to string
      if (status) {
        return status.toString();
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  function isTaskBlocked(task) {
    try {
      const status = task.taskStatus();
      return status && status.toString() === 'Blocked';
    } catch (e) {
      // Fallback logic for blocked status
      try {
        // A task is blocked if it's in a sequential project/group and has incomplete predecessors
        const parent = task.parent();
        if (parent && parent.sequential && parent.sequential()) {
          const siblings = parent.tasks();
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling.id() === task.id()) {
              break; // Found our task, so all previous siblings should be complete
            }
            if (!sibling.completed()) {
              return true; // Previous sibling not complete, so we're blocked
            }
          }
        }
        
        // Check if containing project is sequential and has incomplete preceding tasks
        const project = task.containingProject();
        if (project && project.sequential && project.sequential()) {
          const projectTasks = project.tasks();
          for (let i = 0; i < projectTasks.length; i++) {
            const projectTask = projectTasks[i];
            if (projectTask.id() === task.id()) {
              break; // Found our task
            }
            if (!projectTask.completed()) {
              return true; // Previous task in sequential project not complete
            }
          }
        }
        
        return false;
      } catch (fallbackError) {
        return false;
      }
    }
  }
  
  function isTaskNext(task) {
    try {
      const status = task.taskStatus();
      return status && status.toString() === 'Next';
    } catch (e) {
      // Fallback logic for next action status
      try {
        // A task is next if it's available and not blocked
        if (!isTaskAvailableForWork(task) || isTaskBlocked(task)) {
          return false;
        }
        
        // In sequential projects, only the first incomplete task is next
        const project = task.containingProject();
        if (project && project.sequential && project.sequential()) {
          const projectTasks = project.tasks();
          for (let i = 0; i < projectTasks.length; i++) {
            const projectTask = projectTasks[i];
            if (!projectTask.completed()) {
              return projectTask.id() === task.id(); // Only first incomplete task is next
            }
          }
        }
        
        return true; // In parallel projects, all available tasks are next actions
      } catch (fallbackError) {
        return false;
      }
    }
  }
  
  function isTaskAvailableForWork(task) {
    try {
      const status = task.taskStatus();
      return status && status.toString() === 'Available';
    } catch (e) {
      // Fallback logic for available status
      try {
        // Available means: not completed, not blocked, not deferred, project is active
        if (task.completed()) return false;
        
        // Check if task is deferred
        const deferDate = task.deferDate();
        if (deferDate && isValidDate(deferDate) && deferDate > new Date()) {
          return false;
        }
        
        // Check if project is active
        const project = task.containingProject();
        if (project) {
          const projectStatus = project.status();
          if (projectStatus === 'dropped' || projectStatus === 'done' || projectStatus === 'onHold') {
            return false;
          }
        }
        
        return !isTaskBlocked(task);
      } catch (fallbackError) {
        return false;
      }
    }
  }
`;

/**
 * Helper to extract project validation
 */
export const PROJECT_VALIDATION = `
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
      const isNumericOnly = /^\\d+$/.test(projectId);
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
`;

/**
 * Task serialization helper
 */
export const TASK_SERIALIZATION = `
  function serializeTask(task, includeDetails = true) {
    const taskObj = {
      id: safeGet(() => task.id()),
      name: safeGet(() => task.name()),
      completed: safeGet(() => task.completed(), false),
      flagged: isFlagged(task),
      inInbox: safeGet(() => task.inInbox(), false),
      // Add status properties
      taskStatus: getTaskStatus(task),
      blocked: isTaskBlocked(task),
      next: isTaskNext(task),
      available: isTaskAvailableForWork(task)
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
`;

/**
 * Error formatting helper
 */
export const ERROR_HANDLING = `
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
`;

/**
 * Get all helpers combined
 */
export function getAllHelpers(): string {
  return [
    SAFE_UTILITIES,
    PROJECT_VALIDATION,
    TASK_SERIALIZATION,
    ERROR_HANDLING
  ].join('\n');
}

/**
 * Legacy export for backward compatibility
 */
export const SAFE_UTILITIES_SCRIPT = SAFE_UTILITIES;