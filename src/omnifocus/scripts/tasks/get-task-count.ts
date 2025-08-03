import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to count tasks matching filters in OmniFocus
 */
export const GET_TASK_COUNT_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const filter = {{filter}};
    
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
`;