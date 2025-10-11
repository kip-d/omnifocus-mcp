import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to export tasks from OmniFocus in various formats
 *
 * Optimization: Uses OmniJS bridge for fast bulk property access (10-20x faster than JXA)
 *
 * Features:
 * - Export to JSON, CSV, or Markdown format
 * - Flexible field selection
 * - Comprehensive filtering options
 * - Preserves all task metadata
 * - Proper CSV escaping for complex data
 */
export const EXPORT_TASKS_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const filter = {{filter}};
    const format = {{format}};
    const fields = {{fields}};

    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();

      // Apply limit from filter if present, with reasonable default
      const maxTasks = (filter && filter.limit) ? filter.limit : 1000;
      const allFields = fields || ['name', 'project', 'dueDate', 'tags', 'flagged', 'note'];

      const startTime = Date.now();

      // Use OmniJS bridge for fast bulk property access
      const omniJsScript = \`
        (() => {
          const filter = \${JSON.stringify(filter)};
          const allFields = \${JSON.stringify(allFields)};
          const maxTasks = \${maxTasks};
          const tasks = [];
          let totalProcessed = 0;

          // OmniJS: Use global flattenedTasks collection
          flattenedTasks.forEach(task => {
            totalProcessed++;

            // Early exit if we've reached limit
            if (tasks.length >= maxTasks) return;

            try {
              // Apply filters using direct property access

              // Available filter
              if (filter.available !== undefined) {
                const isHidden = task.effectivelyHidden || false;
                const isAvailable = !isHidden;
                if (isAvailable !== filter.available) return;
              }

              // Completed filter
              if (filter.completed !== undefined) {
                const isCompleted = task.completed || false;
                if (isCompleted !== filter.completed) return;
              }

              // Flagged filter
              if (filter.flagged !== undefined) {
                const isFlagged = task.flagged || false;
                if (isFlagged !== filter.flagged) return;
              }

              // Project name filter
              if (filter.project) {
                const project = task.containingProject;
                if (!project || project.name !== filter.project) return;
              }

              // Project ID filter
              if (filter.projectId) {
                const project = task.containingProject;
                if (!project || project.id.primaryKey !== filter.projectId) return;
              }

              // Tags filter
              if (filter.tags && filter.tags.length > 0) {
                const taskTags = task.tags.map(t => t.name);
                const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
                if (!hasAllTags) return;
              }

              // Search filter
              if (filter.search) {
                const name = task.name || '';
                const note = task.note || '';
                const searchText = (name + ' ' + note).toLowerCase();
                if (!searchText.includes(filter.search.toLowerCase())) return;
              }

              // Build task object with requested fields (direct property access!)
              const taskData = {};

              if (allFields.includes('id')) {
                taskData.id = task.id.primaryKey;
              }

              if (allFields.includes('name')) {
                taskData.name = task.name || 'Unnamed Task';
              }

              if (allFields.includes('note')) {
                taskData.note = task.note || '';
              }

              if (allFields.includes('project')) {
                const project = task.containingProject;
                taskData.project = project ? project.name : '';
              }

              if (allFields.includes('projectId')) {
                const project = task.containingProject;
                taskData.projectId = project ? project.id.primaryKey : '';
              }

              if (allFields.includes('tags')) {
                taskData.tags = task.tags.map(t => t.name);
              }

              if (allFields.includes('deferDate')) {
                taskData.deferDate = task.deferDate ? task.deferDate.toISOString() : '';
              }

              if (allFields.includes('dueDate')) {
                taskData.dueDate = task.dueDate ? task.dueDate.toISOString() : '';
              }

              if (allFields.includes('completed')) {
                taskData.completed = isTaskEffectivelyCompleted(task);
              }

              if (allFields.includes('completionDate')) {
                taskData.completionDate = task.completionDate ? task.completionDate.toISOString() : '';
              }

              if (allFields.includes('flagged')) {
                taskData.flagged = task.flagged || false;
              }

              if (allFields.includes('estimated')) {
                taskData.estimatedMinutes = task.estimatedMinutes || 0;
              }

              if (allFields.includes('created') || allFields.includes('createdDate')) {
                taskData.createdDate = task.added ? task.added.toISOString() : '';
              }

              if (allFields.includes('modified') || allFields.includes('modifiedDate')) {
                taskData.modifiedDate = task.modified ? task.modified.toISOString() : '';
              }

              tasks.push(taskData);
            } catch (taskError) {
              // Skip tasks that error during property access
            }
          });

          return JSON.stringify({
            tasks: tasks,
            totalProcessed: totalProcessed,
            tasksCollected: tasks.length
          });
        })();
      \`;

      const bridgeResult = app.evaluateJavascript(omniJsScript);
      const parsed = JSON.parse(bridgeResult);
      const tasks = parsed.tasks;
      const tasksAdded = parsed.tasksCollected;

      const duration = Date.now() - startTime;

      // Format output based on requested format
      if (format === 'csv') {
        // Build CSV
        if (tasks.length === 0) {
          const emptyHeaders = allFields.join(',');
          return JSON.stringify({
            format: 'csv',
            data: emptyHeaders + '\\n',
            count: 0,
            duration: duration,
            message: 'No tasks found matching the filter criteria'
          });
        }

        const headers = allFields;
        let csv = headers.join(',') + '\\n';

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
          csv += row.join(',') + '\\n';
        }

        return JSON.stringify({
          format: 'csv',
          data: csv,
          count: tasks.length,
          duration: duration,
          limited: tasksAdded >= maxTasks,
          message: tasksAdded >= maxTasks ? 'Export limited to ' + maxTasks + ' tasks. Use filter.limit to adjust.' : undefined
        });
      } else if (format === 'markdown') {
        // Build Markdown
        let markdown = '# OmniFocus Tasks Export\\n\\n';
        markdown += 'Export date: ' + new Date().toISOString() + '\\n\\n';
        markdown += 'Total tasks: ' + tasks.length + '\\n\\n';

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
          markdown += '## Inbox\\n\\n';
          for (const task of inbox) {
            markdown += '- [' + (task.completed ? 'x' : ' ') + '] ' + task.name;
            if (task.flagged) markdown += ' 🚩';
            if (task.dueDate) markdown += ' 📅 Due: ' + task.dueDate;
            if (task.tags && task.tags.length > 0) markdown += ' 🏷️ ' + task.tags.join(', ');
            markdown += '\\n';
            if (task.note) {
              markdown += '  - Note: ' + task.note.replace(/\\n/g, '\\n    ') + '\\n';
            }
          }
          markdown += '\\n';
        }

        // Project tasks
        for (const projectName in byProject) {
          markdown += '## ' + projectName + '\\n\\n';
          for (const task of byProject[projectName]) {
            markdown += '- [' + (task.completed ? 'x' : ' ') + '] ' + task.name;
            if (task.flagged) markdown += ' 🚩';
            if (task.dueDate) markdown += ' 📅 Due: ' + task.dueDate;
            if (task.tags && task.tags.length > 0) markdown += ' 🏷️ ' + task.tags.join(', ');
            markdown += '\\n';
            if (task.note) {
              markdown += '  - Note: ' + task.note.replace(/\\n/g, '\\n    ') + '\\n';
            }
          }
          markdown += '\\n';
        }

        return JSON.stringify({
          format: 'markdown',
          data: markdown,
          count: tasks.length,
          duration: duration
        });
      } else {
        // Default to JSON
        return JSON.stringify({
          format: 'json',
          data: tasks,
          count: tasks.length,
          duration: duration,
          limited: tasksAdded >= maxTasks,
          debug: {
            totalTasksProcessed: parsed.totalProcessed,
            maxTasksAllowed: maxTasks,
            filtersApplied: Object.keys(filter || {}),
            fieldsRequested: allFields,
            optimizationUsed: 'OmniJS bridge for 10-20x faster property access'
          },
          message: tasksAdded >= maxTasks ? 'Export limited to ' + maxTasks + ' tasks. Use filter.limit to adjust.' :
                   tasksAdded === 0 ? 'No tasks matched the export filters. Try removing filters or checking filter values.' : undefined
        });
      }
    } catch (error) {
      return formatError(error, 'export_tasks');
    }
  })();
`;
