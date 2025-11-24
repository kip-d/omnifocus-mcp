import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to count tasks matching filters in OmniFocus
 * OPTIMIZED: Uses OmniJS bridge for fast counting of simple filters (flagged, completed, available)
 */
export const GET_TASK_COUNT_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const filter = {{filter}};

    try {
      let count = 0;
      const startTime = Date.now();

      // Determine if we can use the fast OmniJS bridge path
      // Fast path: only simple boolean filters (flagged, completed, available) without tags, search, dates, or project
      const hasComplexFilters = filter.search || filter.tags || filter.dueBefore || filter.dueAfter || filter.projectId;
      const hasSimpleFilters = filter.flagged !== undefined || filter.completed !== undefined || filter.available !== undefined;
      const useFastPath = !hasComplexFilters && hasSimpleFilters;

      if (useFastPath) {
        // FAST PATH: Use OmniJS bridge for counting (much faster than JXA iteration)
        const omniScript = '(' +
          '(() => {' +
            'let count = 0;' +
            'const wantFlagged = ' + (filter.flagged === true ? 'true' : filter.flagged === false ? 'false' : 'null') + ';' +
            'const wantCompleted = ' + (filter.completed === true ? 'true' : filter.completed === false ? 'false' : 'null') + ';' +
            'const wantAvailable = ' + (filter.available === true ? 'true' : filter.available === false ? 'false' : 'null') + ';' +
            'const checkInbox = ' + (filter.inInbox === true ? 'true' : 'false') + ';' +
            '' +
            'const tasks = checkInbox ? document.inbox : flattenedTasks;' +
            'tasks.forEach(task => {' +
              // Skip completed unless explicitly requested
              'if (wantCompleted !== true && task.completed) return;' +
              // Check flagged filter
              'if (wantFlagged !== null && task.flagged !== wantFlagged) return;' +
              // Check completed filter (if explicitly set)
              'if (wantCompleted !== null && task.completed !== wantCompleted) return;' +
              // Check available filter
              'if (wantAvailable !== null) {' +
                'const isAvail = !task.effectivelyBlocked && (!task.deferDate || task.deferDate <= new Date());' +
                'if (isAvail !== wantAvailable) return;' +
              '}' +
              'count++;' +
            '});' +
            'return JSON.stringify({count: count, optimization: "omnijs_bridge"});' +
          '})' +
        ')()';

        const bridgeResult = JSON.parse(app.evaluateJavascript(omniScript));
        count = bridgeResult.count;

        const endTime = Date.now();
        return JSON.stringify({
          count: count,
          filters_applied: filter,
          query_time_ms: endTime - startTime,
          optimization: 'omnijs_bridge_fast_path'
        });
      }

      // SLOW PATH: Use JXA iteration for complex filters
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
          const name = safeGet(() => task.name(), '').toLowerCase();
          const note = safeGet(() => task.note(), '').toLowerCase();
          if (!name.includes(searchTerm) && !note.includes(searchTerm)) {
            return false;
          }
        }

        return true;
      }

      // If no filters at all, just return collection length
      if (!hasComplexFilters && !hasSimpleFilters) {
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
