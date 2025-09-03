import { getBasicHelpers } from '../shared/helpers.js';

/**
 * Script to count tasks matching filters in OmniFocus
 * OPTIMIZED: Uses basic helpers (~130 lines vs 551 lines - 76% reduction)
 */
export const GET_TASK_COUNT_SCRIPT = `
  ${getBasicHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const filter = {{filter}};
    
    try {
      let count = 0;
      // Avoid JXA whose() — use plain collections then filter in JS (per LESSONS_LEARNED)
      const baseCollection = (filter.inInbox === true)
        ? doc.inboxTasks()
        : doc.flattenedTasks();
      
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
      
      // If we have a large collection and simple filters, try to use whose() for better performance
      if (baseCollection.length > 500 && !filter.search && !filter.tags && !filter.dueBefore && !filter.dueAfter && filter.flagged === undefined && filter.available === undefined && !filter.projectId) {
        // Simple count - just return the length
        count = baseCollection.length;
      } else {
        // Complex filters - need to iterate
        // Add a reasonable limit to prevent timeouts
        const maxToCheck = Math.min(baseCollection.length, 5000);
        
        for (let i = 0; i < maxToCheck; i++) {
          try {
            if (matchesFilters(baseCollection[i])) {
              count++;
            }
          } catch (e) {
            // Skip tasks that throw errors
            continue;
          }
        }
        
        // If we hit the limit, add a warning
        if (baseCollection.length > maxToCheck) {
          count = Math.round(count * (baseCollection.length / maxToCheck)); // Extrapolate
        }
      }
      
      const endTime = Date.now();
      
      const result = {
        count: count,
        filters_applied: filter,
        query_time_ms: endTime - startTime
      };
      
      // Add warning if we had to limit/extrapolate
      if (baseCollection.length > 5000) {
        result.warning = 'Count is estimated due to large task volume. Actual count may vary.';
        result.tasks_checked = Math.min(baseCollection.length, 5000);
        result.total_tasks = baseCollection.length;
      }
      
      return JSON.stringify(result);
      
    } catch (error) {
      return formatError(error, 'get_task_count');
    }
  })();
`;
