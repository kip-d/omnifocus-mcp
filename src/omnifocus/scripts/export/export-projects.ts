import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to export projects from OmniFocus in various formats
 *
 * Optimization: Uses OmniJS bridge for fast bulk property access (5-10x faster than JXA)
 *
 * Features:
 * - Export to JSON, CSV, or Markdown format
 * - Optional project statistics
 * - Includes project hierarchy (parent/child relationships)
 * - Project status and metadata
 * - Proper CSV formatting with flattened stats
 */
export const EXPORT_PROJECTS_SCRIPT = `
  ${getUnifiedHelpers()}

  (() => {
    const format = {{format}};
    const includeStats = {{includeStats}};

    try {
      const app = Application('OmniFocus');
      const startTime = Date.now();

      // Use OmniJS bridge for fast bulk property access
      const omniJsScript = \`
        (() => {
          const includeStats = \${includeStats};
          const projects = [];
          const nowTime = Date.now();

          // OmniJS: Use global flattenedProjects collection
          flattenedProjects.forEach(project => {
            try {
              const projectData = {
                id: project.id.primaryKey,
                name: project.name || 'Unnamed Project'
              };

              // Status normalization
              const projectStatus = project.status;
              const statusStr = String(projectStatus).toLowerCase();

              if (statusStr.includes('done')) projectData.status = 'done';
              else if (statusStr.includes('hold')) projectData.status = 'onHold';
              else if (statusStr.includes('dropped')) projectData.status = 'dropped';
              else projectData.status = 'active';

              // Optional properties
              if (project.note) {
                projectData.note = project.note;
              }

              // Parent folder
              if (project.folder) {
                projectData.parentId = project.folder.id.primaryKey;
                projectData.parentName = project.folder.name;
              }

              // Dates
              if (project.deferDate) {
                projectData.deferDate = project.deferDate.toISOString();
              }

              if (project.dueDate) {
                projectData.dueDate = project.dueDate.toISOString();
              }

              if (project.completionDate) {
                projectData.completionDate = project.completionDate.toISOString();
              }

              if (project.modified) {
                projectData.modifiedDate = project.modified.toISOString();
              }

              // Statistics (if requested)
              if (includeStats) {
                const projectTasks = project.flattenedTasks;
                let totalTasks = 0;
                let completedTasks = 0;
                let availableTasks = 0;
                let overdueCount = 0;
                let flaggedCount = 0;

                projectTasks.forEach(task => {
                  totalTasks++;

                  if (task.completed) {
                    completedTasks++;
                  } else {
                    if (task.taskStatus === Task.Status.Available) {
                      availableTasks++;
                    }

                    // Check if overdue
                    if (task.dueDate) {
                      const dueTime = task.dueDate.getTime();
                      if (dueTime < nowTime) {
                        overdueCount++;
                      }
                    }
                  }

                  if (task.flagged) {
                    flaggedCount++;
                  }
                });

                projectData.stats = {
                  totalTasks: totalTasks,
                  completedTasks: completedTasks,
                  availableTasks: availableTasks,
                  completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                  overdueCount: overdueCount,
                  flaggedCount: flaggedCount
                };
              }

              projects.push(projectData);
            } catch (projectError) {
              // Skip projects that error during property access
            }
          });

          return JSON.stringify({
            projects: projects,
            totalProcessed: projects.length
          });
        })();
      \`;

      const bridgeResult = app.evaluateJavascript(omniJsScript);
      const parsed = JSON.parse(bridgeResult);
      const projects = parsed.projects;
      const duration = Date.now() - startTime;

      // Format output based on requested format
      if (format === 'csv') {
        // Flatten the data for CSV
        const headers = ['id', 'name', 'status', 'note', 'parentName', 'deferDate', 'dueDate', 'completionDate'];
        if (includeStats) {
          headers.push('totalTasks', 'completedTasks', 'availableTasks', 'completionRate', 'overdueCount', 'flaggedCount');
        }

        let csv = headers.join(',') + '\\n';

        for (const project of projects) {
          const row = headers.map(h => {
            let value = project[h];
            if (h.includes('Tasks') || h.includes('Count') || h === 'completionRate') {
              value = project.stats ? project.stats[h] : '';
            }
            if (value === undefined || value === null) return '';
            if (typeof value === 'string' && value.includes(',')) {
              return '"' + value.replace(/"/g, '""') + '"';
            }
            return value.toString();
          });
          csv += row.join(',') + '\\n';
        }

        return JSON.stringify({
          format: 'csv',
          data: csv,
          count: projects.length,
          duration: duration
        });
      } else if (format === 'markdown') {
        // Build Markdown
        let markdown = '# OmniFocus Projects Export\\n\\n';
        markdown += 'Export date: ' + new Date().toISOString() + '\\n\\n';
        markdown += 'Total projects: ' + projects.length + '\\n\\n';

        // Group by status
        const byStatus = {
          active: [],
          onHold: [],
          done: [],
          dropped: []
        };

        for (const project of projects) {
          const status = project.status || 'active';
          if (byStatus[status]) {
            byStatus[status].push(project);
          }
        }

        // Output each status group
        for (const status in byStatus) {
          if (byStatus[status].length > 0) {
            markdown += '## ' + status.charAt(0).toUpperCase() + status.slice(1) + ' Projects\\n\\n';
            for (const project of byStatus[status]) {
              markdown += '### ' + project.name + '\\n\\n';
              if (project.note) {
                markdown += project.note + '\\n\\n';
              }
              if (project.dueDate) {
                markdown += '**Due:** ' + project.dueDate + '\\n\\n';
              }
              if (includeStats && project.stats) {
                markdown += '**Stats:** ' + project.stats.completedTasks + '/' + project.stats.totalTasks + ' tasks completed';
                if (project.stats.overdueCount > 0) {
                  markdown += ', ' + project.stats.overdueCount + ' overdue';
                }
                markdown += '\\n\\n';
              }
            }
          }
        }

        return JSON.stringify({
          format: 'markdown',
          data: markdown,
          count: projects.length,
          duration: duration
        });
      } else {
        // Default to JSON
        return JSON.stringify({
          format: 'json',
          data: projects,
          count: projects.length,
          duration: duration,
          debug: {
            totalProjectsProcessed: parsed.totalProcessed,
            includeStats: includeStats,
            optimizationUsed: 'OmniJS bridge for 5-10x faster property access'
          }
        });
      }
    } catch (error) {
      return formatError(error, 'export_projects');
    }
  })();
`;
