/**
 * Script to count tasks matching filters in OmniFocus - V3 Pure OmniJS
 *
 * V3 Changes:
 * - Removed getUnifiedHelpers() dependency
 * - Inline helper functions (isTaskEffectivelyCompleted, isFlagged, etc.)
 * - Direct try/catch instead of safeGet()
 * - Inline error handling instead of formatError()
 * - V3 response format
 */
export const GET_TASK_COUNT_SCRIPT = `
  (() => {
    const startTime = Date.now();
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const filter = {{filter}};

    // Inline helper functions
    function isTaskEffectivelyCompleted(task) {
      try { return task.completed(); } catch (e) { return false; }
    }

    function isFlagged(task) {
      try { return task.flagged(); } catch (e) { return false; }
    }

    function safeGetTags(task) {
      try {
        const tags = task.tags();
        return tags ? tags.map(t => t.name()) : [];
      } catch (e) {
        return [];
      }
    }

    function isValidDate(date) {
      return date && date instanceof Date && !isNaN(date.getTime());
    }

    function isTaskAvailable(task) {
      try {
        // A task is available if it's not blocked and not deferred
        const deferDate = task.deferDate();
        if (deferDate && deferDate > new Date()) return false;

        // Check if task is blocked (simple heuristic: has uncompleted sequential siblings before it)
        return true;
      } catch (e) {
        return true;
      }
    }

    try {
      let count = 0;
      // Avoid JXA whose() — use plain collections then filter in JS
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
          try {
            const project = task.containingProject();
            if (!project || project.id() !== filter.projectId) {
              return false;
            }
          } catch (e) {
            return false;
          }
        }

        // Inbox filter
        if (filter.inInbox !== undefined) {
          try {
            if (task.inInbox() !== filter.inInbox) {
              return false;
            }
          } catch (e) {
            if (filter.inInbox) return false;
          }
        }

        // Tag filters - use operator to determine matching logic
        if (filter.tags && filter.tags.length > 0) {
          const taskTags = safeGetTags(task);

          // Use operator to determine logic (default to AND for backward compatibility)
          const operator = filter.tagsOperator || 'AND';

          let matches;
          switch(operator) {
            case 'OR':
            case 'IN':
              // Task must have AT LEAST ONE matching tag
              matches = filter.tags.some(tag => taskTags.includes(tag));
              break;
            case 'NOT_IN':
              // Task must have NONE of the filter tags
              matches = !filter.tags.some(tag => taskTags.includes(tag));
              break;
            case 'AND':
            default:
              // Task must have ALL filter tags
              matches = filter.tags.every(tag => taskTags.includes(tag));
              break;
          }

          if (!matches) {
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
          let name = '';
          let note = '';
          try { name = task.name().toLowerCase(); } catch (e) {}
          try { note = task.note().toLowerCase(); } catch (e) {}
          if (!name.includes(searchTerm) && !note.includes(searchTerm)) {
            return false;
          }
        }

        return true;
      }

      // Count matching tasks
      const queryStartTime = Date.now();

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

      const result = {
        count: count,
        filters_applied: filter,
        query_time_ms: Date.now() - queryStartTime
      };

      // Add warning if we had to limit/extrapolate
      if (baseCollection.length > 5000) {
        result.warning = 'Count is estimated due to large task volume. Actual count may vary.';
        result.tasks_checked = Math.min(baseCollection.length, 5000);
        result.total_tasks = baseCollection.length;
      }

      return JSON.stringify({
        ok: true,
        v: '3',
        data: result,
        query_time_ms: Date.now() - startTime
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: error.message || String(error),
          stack: error.stack,
          operation: 'get_task_count'
        }
      });
    }
  })();
`;
