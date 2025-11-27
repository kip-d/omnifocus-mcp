/**
 * list-projects-v3.ts - OmniJS-First Architecture
 *
 * MAJOR REDESIGN: Achieves significant performance improvement by using OmniJS
 * property access instead of JXA per-property calls with safeGet() overhead.
 *
 * Key Innovation:
 * - No helper imports (0KB overhead vs 18KB)
 * - Single bridge call for all property access
 * - Filtering done in OmniJS context for maximum speed
 *
 * Performance Target:
 * - Before: 50 projects = 12-14 seconds (271ms/project)
 * - After: 50 projects = <2 seconds (target)
 *
 * Pattern based on: src/omnifocus/scripts/tasks/list-tasks-omnijs.ts
 */

/**
 * Build the list projects v3 script with parameters
 */
export function buildListProjectsScriptV3(params: {
  filter?: {
    status?: string[];
    flagged?: boolean;
    search?: string;
    folder?: string;
    needsReview?: boolean;
  };
  limit?: number;
  includeStats?: boolean;
  performanceMode?: 'normal' | 'lite';
  fields?: string[];
}): string {
  const {
    filter = {},
    limit = 50,
    includeStats = false,
    performanceMode = 'normal',
    fields = [],
  } = params;

  // Determine which fields to include
  const shouldInclude = (fieldName: string): boolean => {
    return !fields || fields.length === 0 || fields.includes(fieldName);
  };

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        // OmniJS script for bulk property access
        const omniJsScript = \`
          (() => {
            const results = [];
            let count = 0;
            const limit = ${limit};
            const filterStatus = ${JSON.stringify(filter.status || [])};
            const filterFlagged = ${filter.flagged === undefined ? 'undefined' : filter.flagged};
            const filterSearch = ${JSON.stringify(filter.search || '')}.toLowerCase();
            const filterFolder = ${JSON.stringify(filter.folder || '')};
            const filterNeedsReview = ${filter.needsReview === undefined ? 'undefined' : filter.needsReview};
            const includeStats = ${includeStats};
            const performanceMode = '${performanceMode}';

            // Helper to get project status string
            function getProjectStatus(project) {
              if (project.status === Project.Status.Done) return 'done';
              if (project.status === Project.Status.Dropped) return 'dropped';
              if (project.status === Project.Status.OnHold) return 'on-hold';
              return 'active';
            }

            // Helper to build folder path by walking up parent chain
            function getFolderPath(folder) {
              if (!folder) return '';
              const parts = [];
              let current = folder;
              while (current) {
                parts.unshift(current.name);
                current = current.parent;
              }
              return parts.join('/');
            }

            // Check if filter contains a path separator
            const filterIsPath = filterFolder.includes('/');

            // Process all projects
            flattenedProjects.forEach(project => {
              if (count >= limit) return;

              // Status filter
              if (filterStatus.length > 0) {
                const status = getProjectStatus(project);
                if (!filterStatus.includes(status)) return;
              }

              // Flagged filter
              if (filterFlagged !== undefined && project.flagged !== filterFlagged) return;

              // Search filter (name and note)
              if (filterSearch) {
                const name = (project.name || '').toLowerCase();
                const note = (project.note || '').toLowerCase();
                if (!name.includes(filterSearch) && !note.includes(filterSearch)) return;
              }

              // Folder filter (supports both simple name and nested path)
              if (filterFolder) {
                const folder = project.parentFolder;
                if (!folder) return;

                if (filterIsPath) {
                  // Path match: "Development/Fix OmniFocus MCP Bridge Issues"
                  const folderPath = getFolderPath(folder);
                  if (folderPath !== filterFolder && !folderPath.endsWith('/' + filterFolder)) return;
                } else {
                  // Simple name match: "Fix OmniFocus MCP Bridge Issues"
                  if (folder.name !== filterFolder) return;
                }
              }

              // Needs review filter
              if (filterNeedsReview !== undefined) {
                const nextReview = project.nextReviewDate;
                const needsReview = nextReview && nextReview <= new Date();
                if (filterNeedsReview !== !!needsReview) return;
              }

              // Build project object with direct OmniJS property access
              const proj = {
                ${shouldInclude('id') ? 'id: project.id.primaryKey,' : ''}
                ${shouldInclude('name') ? 'name: project.name || "Unnamed Project",' : ''}
                ${shouldInclude('status') ? 'status: getProjectStatus(project),' : ''}
                ${shouldInclude('flagged') ? 'flagged: project.flagged || false,' : ''}
                ${shouldInclude('note') ? 'note: project.note || "",' : ''}
                ${shouldInclude('dueDate') ? 'dueDate: project.dueDate ? project.dueDate.toISOString() : null,' : ''}
                ${shouldInclude('deferDate') ? 'deferDate: project.deferDate ? project.deferDate.toISOString() : null,' : ''}
                ${shouldInclude('folder') ? 'folder: project.parentFolder ? project.parentFolder.name : null,' : ''}
                ${shouldInclude('folder') ? 'folderPath: project.parentFolder ? getFolderPath(project.parentFolder) : null,' : ''}
                ${shouldInclude('sequential') ? 'sequential: project.sequential || false,' : ''}
                ${shouldInclude('lastReviewDate') ? 'lastReviewDate: project.lastReviewDate ? project.lastReviewDate.toISOString() : null,' : ''}
                ${shouldInclude('nextReviewDate') ? 'nextReviewDate: project.nextReviewDate ? project.nextReviewDate.toISOString() : null,' : ''}
              };

              // Performance mode: include task counts only in normal mode
              if (performanceMode !== 'lite') {
                ${shouldInclude('taskCounts') ? `
                const rootTask = project.rootTask;
                if (rootTask) {
                  proj.taskCounts = {
                    total: rootTask.numberOfTasks || 0,
                    available: rootTask.numberOfAvailableTasks || 0,
                    completed: rootTask.numberOfCompletedTasks || 0
                  };
                }
                ` : ''}

                ${shouldInclude('nextTask') ? `
                const nextTask = project.nextTask;
                if (nextTask) {
                  proj.nextTask = {
                    id: nextTask.id.primaryKey,
                    name: nextTask.name,
                    flagged: nextTask.flagged || false,
                    dueDate: nextTask.dueDate ? nextTask.dueDate.toISOString() : null
                  };
                }
                ` : ''}
              }

              // Include stats if requested (expensive)
              if (includeStats) {
                const tasks = project.flattenedTasks;
                if (tasks && tasks.length > 0) {
                  let active = 0, completed = 0, overdue = 0, flagged = 0;
                  const now = new Date();

                  tasks.forEach(task => {
                    if (task.completed) {
                      completed++;
                    } else {
                      active++;
                      if (task.dueDate && task.dueDate < now) overdue++;
                    }
                    if (task.flagged) flagged++;
                  });

                  proj.stats = {
                    active: active,
                    completed: completed,
                    total: tasks.length,
                    completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
                    overdue: overdue,
                    flagged: flagged
                  };
                }
              }

              results.push(proj);
              count++;
            });

            return JSON.stringify({
              projects: results,
              count: results.length,
              total_available: flattenedProjects.length
            });
          })()
        \`;

        // Execute OmniJS script - SINGLE BRIDGE CALL
        const resultJson = app.evaluateJavascript(omniJsScript);
        const result = JSON.parse(resultJson);

        return JSON.stringify({
          projects: result.projects,
          metadata: {
            total_available: result.total_available,
            returned_count: result.count,
            limit_applied: ${limit},
            performance_mode: '${performanceMode}',
            stats_included: ${includeStats},
            optimization: 'omnijs_v3'
          }
        });

      } catch (error) {
        return JSON.stringify({
          error: true,
          message: error.message || String(error),
          context: 'list_projects_v3'
        });
      }
    })();
  `;
}

/**
 * Main script export - template version for simple usage
 */
export const LIST_PROJECTS_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const filter = {{filter}};
    const limit = {{limit}} || 50;
    const includeStats = {{includeStats}} || false;
    const performanceMode = '{{performanceMode}}' || 'normal';

    try {
      const omniJsScript = \`
        (() => {
          const results = [];
          let count = 0;
          const limit = \${limit};
          const filterStatus = \${JSON.stringify(filter.status || [])};
          const filterFlagged = \${filter.flagged === undefined ? 'undefined' : filter.flagged};
          const filterSearch = \${JSON.stringify(filter.search || '')}.toLowerCase();
          const includeStats = \${includeStats};
          const performanceMode = '\${performanceMode}';

          function getProjectStatus(project) {
            if (project.status === Project.Status.Done) return 'done';
            if (project.status === Project.Status.Dropped) return 'dropped';
            if (project.status === Project.Status.OnHold) return 'on-hold';
            return 'active';
          }

          flattenedProjects.forEach(project => {
            if (count >= limit) return;

            if (filterStatus.length > 0) {
              const status = getProjectStatus(project);
              if (!filterStatus.includes(status)) return;
            }

            if (filterFlagged !== undefined && project.flagged !== filterFlagged) return;

            if (filterSearch) {
              const name = (project.name || '').toLowerCase();
              const note = (project.note || '').toLowerCase();
              if (!name.includes(filterSearch) && !note.includes(filterSearch)) return;
            }

            const proj = {
              id: project.id.primaryKey,
              name: project.name || 'Unnamed Project',
              status: getProjectStatus(project),
              flagged: project.flagged || false,
              note: project.note || '',
              dueDate: project.dueDate ? project.dueDate.toISOString() : null,
              deferDate: project.deferDate ? project.deferDate.toISOString() : null,
              folder: project.parentFolder ? project.parentFolder.name : null,
              sequential: project.sequential || false,
              lastReviewDate: project.lastReviewDate ? project.lastReviewDate.toISOString() : null,
              nextReviewDate: project.nextReviewDate ? project.nextReviewDate.toISOString() : null
            };

            if (performanceMode !== 'lite') {
              const rootTask = project.rootTask;
              if (rootTask) {
                proj.taskCounts = {
                  total: rootTask.numberOfTasks || 0,
                  available: rootTask.numberOfAvailableTasks || 0,
                  completed: rootTask.numberOfCompletedTasks || 0
                };
              }

              const nextTask = project.nextTask;
              if (nextTask) {
                proj.nextTask = {
                  id: nextTask.id.primaryKey,
                  name: nextTask.name,
                  flagged: nextTask.flagged || false,
                  dueDate: nextTask.dueDate ? nextTask.dueDate.toISOString() : null
                };
              }
            }

            if (includeStats) {
              const tasks = project.flattenedTasks;
              if (tasks && tasks.length > 0) {
                let active = 0, completed = 0, overdue = 0, flagged = 0;
                const now = new Date();

                tasks.forEach(task => {
                  if (task.completed) completed++;
                  else {
                    active++;
                    if (task.dueDate && task.dueDate < now) overdue++;
                  }
                  if (task.flagged) flagged++;
                });

                proj.stats = {
                  active, completed,
                  total: tasks.length,
                  completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
                  overdue, flagged
                };
              }
            }

            results.push(proj);
            count++;
          });

          return JSON.stringify({
            projects: results,
            count: results.length,
            total_available: flattenedProjects.length
          });
        })()
      \`;

      const resultJson = app.evaluateJavascript(omniJsScript);
      const result = JSON.parse(resultJson);

      return JSON.stringify({
        projects: result.projects,
        metadata: {
          total_available: result.total_available,
          returned_count: result.count,
          limit_applied: limit,
          performance_mode: performanceMode,
          stats_included: includeStats,
          optimization: 'omnijs_v3'
        }
      });

    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        context: 'list_projects_v3'
      });
    }
  })();
`;
