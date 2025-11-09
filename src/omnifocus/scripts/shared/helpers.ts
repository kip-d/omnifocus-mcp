/**
 * Shared helper functions for all OmniFocus JXA scripts
 * These are injected into scripts that need them
 */

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
    '// ===== END HELPERS =====',
  ].join('\n');
}

