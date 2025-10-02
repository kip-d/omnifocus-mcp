/**
 * Shared helper functions for all OmniFocus JXA scripts
 * These are injected into scripts that need them
 */

import { REPEAT_HELPERS } from './repeat-helpers.js';
import { HelperContext, generateHelperConfig } from './helper-context.js';

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
      // First try the direct API - most efficient
      const status = task.taskStatus();
      return status && status.toString() === 'Blocked';
    } catch (e) {
      // Fallback logic for blocked status
      try {
        // IMPORTANT: Tasks in the inbox cannot be blocked because they have no project context
        // Sequential blocking only applies within projects or action groups
        
        // Check parent first (action group) - this is the most common case
        const parent = task.parent();
        if (parent && parent.sequential) {
          // Cache the sequential check result
          const isSequential = parent.sequential();
          if (isSequential) {
            const taskId = task.id(); // Cache our ID
            const siblings = parent.tasks();
            
            // Early exit if we're the first task
            if (siblings.length > 0 && siblings[0].id() === taskId) {
              return false;
            }
            
            for (let i = 0; i < siblings.length; i++) {
              const sibling = siblings[i];
              if (sibling.id() === taskId) {
                break; // Found our task, so all previous siblings should be complete
              }
              if (!sibling.completed()) {
                return true; // Previous sibling not complete, so we're blocked
              }
            }
          }
        }
        
        // Only check project if no parent group or parent is not sequential
        // This avoids redundant checks
        if (!parent || !parent.sequential || !parent.sequential()) {
          const project = task.containingProject();
          if (project && project.sequential) {
            // CRITICAL FIX: Check project status before determining blocking
            // Tasks in on-hold, dropped, or completed projects should not be considered blocked
            const projectStatus = safeGetStatus(project);
            if (projectStatus === 'onHold' || projectStatus === 'dropped' || projectStatus === 'done') {
              return false; // Project is not active, so task cannot be blocked
            }
            
            const isSequential = project.sequential();
            if (isSequential) {
              const taskId = task.id(); // Cache our ID
              const projectTasks = project.tasks();
              
              // Early exit if we're the first task
              if (projectTasks.length > 0 && projectTasks[0].id() === taskId) {
                return false;
              }
              
              for (let i = 0; i < projectTasks.length; i++) {
                const projectTask = projectTasks[i];
                if (projectTask.id() === taskId) {
                  break; // Found our task
                }
                if (!projectTask.completed()) {
                  return true; // Previous task in sequential project not complete
                }
              }
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
  
  function safeGetStatus(project) {
    try {
      const status = project.status();
      if (!status) return 'active';
      
      // OmniFocus returns status as "active status", "done status", etc.
      // We need to normalize these to match our API expectations
      const statusStr = status.toString().toLowerCase();
      
      if (statusStr.includes('active')) return 'active';
      if (statusStr.includes('done')) return 'done';
      if (statusStr.includes('hold')) return 'onHold';
      if (statusStr.includes('dropped')) return 'dropped';
      
      return 'active'; // Default fallback
    } catch (e) {
      return 'active';
    }
  }
`;

/**
 * Helper to extract project validation
 */
export const PROJECT_VALIDATION = `
  function validateProject(projectId, doc) {
    if (!projectId) return { valid: true, project: null };
    
    // Find by iteration (avoid the whose method)
    let foundProject = null;
    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      try { if (projects[i].id() === projectId) { foundProject = projects[i]; break; } } catch (e) {}
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
      
      // Extract repeat rule information if present
      try {
        const repetitionRule = task.repetitionRule();
        if (repetitionRule) {
          // Extract the repeat rule info if the function exists
          if (typeof extractRepeatRuleInfo === 'function') {
            taskObj.repeatRule = extractRepeatRuleInfo(repetitionRule);
          } else {
            // Fallback: at least indicate it's recurring
            taskObj.repeatRule = {
              isRecurring: true,
              ruleString: safeGet(() => repetitionRule.ruleString()),
              method: safeGet(() => repetitionRule.method().toString())
            };
          }
        }
      } catch (e) {
        // No repeat rule or error accessing it
      }
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
 * @param context Configuration options for helper behavior
 */
/**
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getAllHelpers(context?: HelperContext): string {
  console.warn('[DEPRECATED] getAllHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    generateHelperConfig(context),
    SAFE_UTILITIES,
    PROJECT_VALIDATION,
    TASK_SERIALIZATION,
    ERROR_HANDLING,
    // REPEAT_HELPERS removed to prevent script size bloat - use getRecurrenceHelpers() when needed
  ].join('\n');
}

/**
 * Get all helpers with bridge support
 * @param context Configuration options for helper behavior
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getAllHelpersWithBridge(context?: HelperContext): string {
  console.warn('[DEPRECATED] getAllHelpersWithBridge() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    generateHelperConfig(context),
    SAFE_UTILITIES,
    PROJECT_VALIDATION,
    TASK_SERIALIZATION,
    ERROR_HANDLING,
    // REPEAT_HELPERS removed to prevent script size bloat - use getRecurrenceHelpers() when needed
    // Bridge helpers should be imported separately when needed
  ].join('\n');
}

/**
 * CORE HELPERS: Essential functions used by almost every script (~50 lines)
 * Basic error handling and safe getters
 * @param context Configuration options for helper behavior
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getCoreHelpers(context?: HelperContext): string {
  console.warn('[DEPRECATED] getCoreHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  const config = generateHelperConfig(context);
  return `
  ${config}

  // Core safe utility functions for OmniFocus automation
  function safeGet(getter, defaultValue = null) {
    try {
      const result = getter();
      return result !== null && result !== undefined ? result : defaultValue;
    } catch (e) {
      return defaultValue;
    }
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
  
  function isValidDate(date) {
    return date && date.toString() !== 'missing value' && !isNaN(date.getTime());
  }
  `;
}

/**
 * DATE HELPERS: Date handling and validation functions (~40 lines)
 */
export function getDateHelpers(): string {
  return `
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
  `;
}

/**
 * TASK HELPERS: Basic task property access with bridge optimization (~80 lines)
 * Includes JXA bridge optimization for tag operations
 */
export function getTaskHelpers(): string {
  return `
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
  
  // OPTIMIZED: Bridge-aware tag getter for operations that modify tags
  function safeGetTagsWithBridge(task, app) {
    try {
      // Try bridge first for better reliability after tag modifications
      if (app && app.evaluateJavascript) {
        const taskId = task.id();
        // ✅ Fixed: Use JSON.stringify for proper escaping of taskId
        const script = \`(() => { const t = Task.byIdentifier(\${JSON.stringify(taskId)}); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()\`;
        const result = app.evaluateJavascript(script);
        return JSON.parse(result);
      }

      // Fallback to JXA
      return safeGetTags(task);
    } catch (e) {
      // Final fallback to JXA
      return safeGetTags(task);
    }
  }
  
  function safeIsCompleted(task) {
    try {
      return task.completed() === true;
    } catch (e) {
      return false;
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
  
  function safeGetEstimatedMinutes(task) {
    try {
      const estimate = task.estimatedMinutes();
      return typeof estimate === 'number' ? estimate : null;
    } catch (e) {
      return null;
    }
  }
  
  function isFlagged(obj) {
    try {
      return obj.flagged() === true;
    } catch (e) {
      return false;
    }
  }
  `;
}

/**
 * OPTIMIZED PROJECT HELPERS: Leverages direct count APIs (~100 lines)
 * Uses discovered undocumented API methods for 50-80% performance improvement
 */
export function getProjectHelpers(): string {
  return `
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
      // OPTIMIZED: Use direct API - already using this
      return project.numberOfTasks() || 0;
    } catch (e) {
      return 0;
    }
  }
  
  function safeGetCompletedTaskCount(project) {
    try {
      // OPTIMIZED: Use direct count API (discovered method)
      return project.rootTask().numberOfCompletedTasks() || 0;
    } catch (e) {
      // Fallback to manual count
      try {
        return project.numberOfCompletedTasks() || 0;
      } catch (fallbackError) {
        return 0;
      }
    }
  }
  
  function safeGetAvailableTaskCount(project) {
    try {
      // OPTIMIZED: Use direct count API (discovered method)  
      return project.rootTask().numberOfAvailableTasks() || 0;
    } catch (e) {
      // Fallback to manual count
      try {
        return project.numberOfAvailableTasks() || 0;
      } catch (fallbackError) {
        return 0;
      }
    }
  }
  
  function safeGetNextTask(project) {
    try {
      // OPTIMIZED: Use direct API to get next actionable task
      const nextTask = project.nextTask();
      if (nextTask) {
        return {
          id: safeGet(() => nextTask.id()),
          name: safeGet(() => nextTask.name())
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetStatus(project) {
    try {
      const status = project.status();
      if (!status) return 'active';
      
      // OmniFocus returns status as "active status", "done status", etc.
      // We need to normalize these to match our API expectations
      const statusStr = status.toString().toLowerCase();
      
      if (statusStr.includes('active')) return 'active';
      if (statusStr.includes('done')) return 'done';
      if (statusStr.includes('hold')) return 'onHold';
      if (statusStr.includes('dropped')) return 'dropped';
      
      return 'active'; // Default fallback
    } catch (e) {
      return 'active';
    }
  }
  
  function safeGetEffectiveStatus(project) {
    try {
      // OPTIMIZED: Use discovered API method for effective status
      return project.effectiveStatus() || 'active';
    } catch (e) {
      // Fallback to regular status
      return safeGetStatus(project);
    }
  }
  `;
}

/**
 * OPTIMIZED TASK STATUS HELPERS: Direct API calls (~50 lines vs 150 lines - 67% reduction!)
 * Uses recently discovered undocumented but official OmniFocus API methods
 * Performance: 40-80% faster, eliminates complex iteration logic
 */
export function getTaskStatusHelpers(): string {
  return `
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
      // OPTIMIZED: Use direct API method (discovered in API_OPTIMIZATION_JOURNEY.md)
      return task.effectivelyCompleted() === true;
    } catch (e) {
      // Fallback to manual check
      try {
        if (task.completed()) return true;
        if (task.dropped && task.dropped()) return true;
        
        const container = task.containingProject();
        if (container) {
          if (container.completed && container.completed()) return true;
          if (container.dropped && container.dropped()) return true;
          if (container.status && container.status() === 'dropped') return true;
          if (container.status && container.status() === 'done') return true;
        }
        return false;
      } catch (fallbackError) {
        return false;
      }
    }
  }
  
  function getTaskStatus(task) {
    try {
      const status = task.taskStatus();
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
      // OPTIMIZED: Use direct API method (40-80% faster than complex iteration)
      return task.blocked() === true;
    } catch (e) {
      // Fallback to taskStatus check
      try {
        const status = task.taskStatus();
        return status && status.toString() === 'Blocked';
      } catch (fallbackError) {
        return false;
      }
    }
  }
  
  function isTaskNext(task) {
    try {
      // OPTIMIZED: Use direct API method  
      return task.next() === true;
    } catch (e) {
      // Fallback to taskStatus check
      try {
        const status = task.taskStatus();
        return status && status.toString() === 'Next';
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
        if (task.completed()) return false;
        
        const deferDate = task.deferDate();
        if (deferDate && isValidDate(deferDate) && deferDate > new Date()) {
          return false;
        }
        
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
  
  function isTaskInInbox(task) {
    try {
      // OPTIMIZED: Use direct API method
      return task.inInbox() === true;
    } catch (e) {
      // Fallback to manual check
      try {
        return task.inInbox() === true;
      } catch (fallbackError) {
        return false;
      }
    }
  }
  `;
}

/**
 * Get minimal helpers for scripts that need smaller payloads
 * Only includes the most essential utility functions
 */
/**
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getMinimalHelpers(context?: HelperContext): string {
  console.warn('[DEPRECATED] getMinimalHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  // getCoreHelpers already includes generateHelperConfig, so don't duplicate it
  return getCoreHelpers(context);
}

/**
 * VALIDATION HELPERS: Project and data validation (~50 lines)
 */
export function getValidationHelpers(): string {
  return PROJECT_VALIDATION;
}

/**
 * SERIALIZATION HELPERS: Task serialization with full details (~100 lines)
 */
export function getSerializationHelpers(): string {
  return TASK_SERIALIZATION;
}

/**
 * CONVENIENCE COMPOSITE FUNCTIONS
 * Combine focused helpers for common use cases
 */

/**
 * Basic script helpers: Core + dates + basic task props (~130 lines)
 * For simple scripts that just need safe getters and basic task data
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getBasicHelpers(): string {
  console.warn('[DEPRECATED] getBasicHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    getCoreHelpers(),
    getDateHelpers(),
    getTaskHelpers(),
  ].join('\n');
}

/**
 * Analytics helpers: Core + dates + basic task props (~130 lines)
 * For analytics scripts that need minimal overhead
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getAnalyticsHelpers(): string {
  console.warn('[DEPRECATED] getAnalyticsHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return getBasicHelpers(); // Same as basic for now
}

/**
 * List helpers: Basic + project helpers + serialization (~310 lines)
 * For list/query scripts that need full task details
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getListHelpers(): string {
  console.warn('[DEPRECATED] getListHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    getCoreHelpers(),
    getDateHelpers(),
    getTaskHelpers(),
    getProjectHelpers(),
    getSerializationHelpers(),
  ].join('\n');
}

/**
 * OPTIMIZED Full status helpers: Basic + all status logic + validation (~280 lines vs 380 lines)
 * For scripts that need complex task status analysis (blocked/available/next)
 * Uses direct API methods for 40-80% performance improvement in status checks
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getFullStatusHelpers(context?: HelperContext): string {
  console.warn('[DEPRECATED] getFullStatusHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    getCoreHelpers(context), // Already includes generateHelperConfig
    getDateHelpers(),
    getTaskHelpers(),
    getProjectHelpers(),
    getTaskStatusHelpers(),
    getValidationHelpers(),
  ].join('\n');
}

/**
 * Recurrence helpers: Basic + repeat logic (~330 lines)
 * For scripts dealing with recurring tasks
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getRecurrenceHelpers(context?: HelperContext): string {
  console.warn('[DEPRECATED] getRecurrenceHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    generateHelperConfig(context),
    getCoreHelpers(context),
    getDateHelpers(),
    getTaskHelpers(),
    REPEAT_HELPERS,
  ].join('\n');
}

/**
 * Recurrence apply functions - just the functions without config
 * For composing with other helpers that already include config
 */
export const RECURRENCE_APPLY_FUNCTIONS = `
  function convertToRRULE(rule) {
    if (!rule || !rule.unit || !rule.steps) return '';
    const u = rule.unit;
    const s = rule.steps;
    const F = u === 'minute' ? 'MINUTELY' : u === 'hour' ? 'HOURLY' : u === 'day' ? 'DAILY' : u === 'week' ? 'WEEKLY' : u === 'month' ? 'MONTHLY' : u === 'year' ? 'YEARLY' : '';
    if (!F) return '';
    let r = 'FREQ=' + F;
    if (s > 1) r += ';INTERVAL=' + s;
    if (Array.isArray(rule.weekdays) && rule.weekdays.length) {
      const M = {sunday:'SU',monday:'MO',tuesday:'TU',wednesday:'WE',thursday:'TH',friday:'FR',saturday:'SA'};
      const days = rule.weekdays.map(d => M[d] || '').filter(Boolean).join(',');
      if (days) r += ';BYDAY=' + days;
    }
    if (rule.weekPosition && rule.weekday) {
      const M = {sunday:'SU',monday:'MO',tuesday:'TU',wednesday:'WE',thursday:'TH',friday:'FR',saturday:'SA'};
      const w = M[rule.weekday];
      if (w) {
        if (Array.isArray(rule.weekPosition)) {
          const pos = rule.weekPosition.map(p => p === 'last' ? ('-1' + w) : (p + w)).join(',');
          r += ';BYDAY=' + pos;
        } else {
          const p = rule.weekPosition === 'last' ? '-1' : String(rule.weekPosition);
          r += ';BYDAY=' + p + w;
        }
      }
    }
    return r;
  }
  function convertToOmniMethod(method) {
    return method === 'start-after-completion' ? 'DeferUntilDate' : method === 'due-after-completion' ? 'DueDate' : method === 'fixed' ? 'Fixed' : 'None';
  }
  function prepareRepetitionRuleData(rule) {
    if (!rule || !rule.unit || !rule.steps) return null;
    try {
      const ruleString = convertToRRULE(rule);
      const method = convertToOmniMethod(rule.method || 'fixed');
      if (!ruleString) return null;
      return { ruleString, method, needsBridge: true };
    } catch (e) { return null }
  }
  function applyRepetitionRuleViaBridge(taskId, ruleData) {
    if (!ruleData || !ruleData.ruleString || !taskId) return false;
    try {
      const app = Application('OmniFocus');
      if (typeof setRepeatRuleViaBridge === 'function') {
        const res = setRepeatRuleViaBridge(taskId, ruleData.ruleString, ruleData.method || 'Fixed', app);
        return !!(res && res.success);
      }
      try {
        const escapedTaskId = JSON.stringify(taskId);
        const escapedRule = JSON.stringify(ruleData.ruleString);
        const method = ruleData.method === 'DeferUntilDate' ? 'Task.RepetitionMethod.DeferUntilDate' : ruleData.method === 'DueDate' ? 'Task.RepetitionMethod.DueDate' : 'Task.RepetitionMethod.Fixed';
        const script = [
          'const task = Task.byIdentifier(' + escapedTaskId + ');',
          'if (task) {',
          '  const rule = new Task.RepetitionRule(' + escapedRule + ', ' + method + ');',
          '  task.repetitionRule = rule;',
          '  "success";',
          '} else {',
          '  "task_not_found";',
          '}'
        ].join('');
        return app.evaluateJavascript(script) === 'success';
      } catch (e2) { return false }
    } catch (e) { return false }
  }
  function applyDeferAnother(task, rule) {
    if (!rule || !rule.deferAnother || !task.dueDate()) return;
    const u = rule.deferAnother.unit, n = rule.deferAnother.steps;
    let ms = 0;
    if (u === 'minute') ms = n * 60 * 1000; else if (u === 'hour') ms = n * 3600000; else if (u === 'day') ms = n * 86400000; else if (u === 'week') ms = n * 604800000; else if (u === 'month') ms = n * 2592000000; else if (u === 'year') ms = n * 31536000000;
    if (ms > 0) task.deferDate = new Date(task.dueDate().getTime() - ms);
  }
`;

/**
 * Minimal recurrence helpers for creation/update only (~150 lines)
 * Includes: convertToRRULE, convertToOmniMethod, prepareRepetitionRuleData,
 *           applyRepetitionRuleViaBridge, applyDeferAnother
 * Excludes heavy repeat rule extraction/analysis to keep scripts small.
 * @param context Configuration options for helper behavior
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getRecurrenceApplyHelpers(context?: HelperContext): string {
  console.warn('[DEPRECATED] getRecurrenceApplyHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  const config = generateHelperConfig(context);
  return `
  ${config}
${RECURRENCE_APPLY_FUNCTIONS}
  `;
}

/**
 * OPTIMIZED TAG HELPERS: Direct count APIs for analytics (~120 lines)
 * Uses discovered tag count methods for 60-90% performance improvement
 * @deprecated Since v2.2.0 - Use getUnifiedHelpers() instead
 * This function will be removed in v2.3.0
 */
export function getTagHelpers(): string {
  console.warn('[DEPRECATED] getTagHelpers() is deprecated. Use getUnifiedHelpers() instead. Will be removed in v2.3.0');
  return [
    getCoreHelpers(),
    getTaskHelpers(), // Includes safeGetTags
    `
  function safeGetTagTaskCount(tag) {
    try {
      // OPTIMIZED: Use direct count API for remaining (incomplete) tasks  
      return tag.remainingTaskCount() || 0;
    } catch (e) {
      return 0;
    }
  }
  
  function safeGetTagAvailableTaskCount(tag) {
    try {
      // OPTIMIZED: Use direct count API for available (unblocked/incomplete) tasks
      return tag.availableTaskCount() || 0;  
    } catch (e) {
      return 0;
    }
  }
  
  function getTagStats(tag) {
    try {
      // OPTIMIZED: Get comprehensive tag statistics using direct APIs
      const remaining = safeGetTagTaskCount(tag);
      const available = safeGetTagAvailableTaskCount(tag);
      const blocked = Math.max(0, remaining - available); // Blocked = remaining - available
      
      return {
        name: safeGet(() => tag.name()),
        id: safeGet(() => tag.id()),
        remainingTasks: remaining,
        availableTasks: available,
        blockedTasks: blocked,
        completionRate: remaining > 0 ? ((remaining - available) / remaining * 100).toFixed(1) : '0'
      };
    } catch (e) {
      return {
        name: safeGet(() => tag.name()),
        id: safeGet(() => tag.id()),
        remainingTasks: 0,
        availableTasks: 0, 
        blockedTasks: 0,
        completionRate: '0'
      };
    }
  }
    `,
  ].join('\n');
}

/**
 * BRIDGE HELPERS: JXA bridge optimizations for critical operations (~200 lines)
 * For scripts that modify tasks/projects and need reliable operations
 * Essential for create/update operations that use evaluateJavaScript
 */
// Note: legacy getBridgeHelpers() removed; use BRIDGE_HELPERS from bridge-helpers.ts

/**
 * Legacy export for backward compatibility
 */
export const SAFE_UTILITIES_SCRIPT = SAFE_UTILITIES;

/**
 * ===========================================================================
 * UNIFIED HELPER BUNDLE - SIMPLIFIED ARCHITECTURE (v2.2+)
 * ===========================================================================
 *
 * This bundle includes ALL helper functions needed by any script.
 *
 * WHY: Empirical testing shows JXA supports 523KB scripts. Our largest bundle
 * is ~50KB (10% of limit). The complexity of fragmenting helpers (18 functions,
 * composition rules, duplicate config risks) far outweighs a 20-30KB size increase.
 *
 * BENEFITS:
 * - Zero composition complexity
 * - Impossible to duplicate HELPER_CONFIG
 * - All functions always available
 * - Consistent across all scripts
 * - Safe to refactor without breaking composition
 *
 * SIZE: ~50KB (well under 523KB JXA limit)
 *
 * See docs/HELPER_ARCHITECTURE_SIMPLIFICATION.md for full rationale.
 */
export function getUnifiedHelpers(context?: HelperContext): string {
  return [
    '// ===== UNIFIED OMNIFOCUS HELPERS =====',
    '// Generated: ' + new Date().toISOString(),
    '',
    generateHelperConfig(context),
    '',
    '// ----- Safe Utilities -----',
    SAFE_UTILITIES,
    '',
    '// ----- Project Validation -----',
    PROJECT_VALIDATION,
    '',
    '// ----- Error Handling -----',
    ERROR_HANDLING,
    '',
    '// ----- Task Serialization -----',
    TASK_SERIALIZATION,
    '',
    '// ----- Recurrence Functions -----',
    RECURRENCE_APPLY_FUNCTIONS,
    '',
    '// ===== END HELPERS =====',
  ].join('\n');
}

/**
 * Alias for semantic clarity - this is THE helper bundle to use
 */
export const OMNIFOCUS_HELPERS = getUnifiedHelpers;
