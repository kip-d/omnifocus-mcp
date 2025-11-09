/**
 * Pure OmniJS v3 - Query Perspective Script
 *
 * Already optimized with OmniJS bridge - just updated to v3 response format
 *
 * Features:
 * - Queries tasks from perspectives using OmniJS global collections
 * - Fast bulk property access for Inbox, Projects, Tags perspectives
 * - Direct property access in OmniJS bridge scripts
 */
export const QUERY_PERSPECTIVE_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const perspectiveName = {{perspectiveName}};
    const limit = {{limit}} || 50;
    const includeDetails = {{includeDetails}} || false;

    const startTime = Date.now();

    try {
      // Simple built-in perspective optimization using OmniJS bridge
      if (perspectiveName === "Inbox") {
        const inboxScript = \`
          (() => {
            const results = [];
            inbox.forEach(task => {
              results.push({
                id: task.id.primaryKey,
                name: task.name,
                flagged: task.flagged || false,
                completed: task.completed || false,
                dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                deferDate: task.deferDate ? task.deferDate.toISOString() : null,
                project: null,
                projectId: null,
                tags: task.tags ? task.tags.map(t => t.name) : [],
                available: task.taskStatus === Task.Status.Available,
                note: \${includeDetails} ? (task.note || '') : undefined,
                estimatedMinutes: \${includeDetails} ? (task.estimatedMinutes || null) : undefined
              });
            });
            return JSON.stringify(results);
          })()
        \`;
        const resultJson = app.evaluateJavascript(inboxScript);
        const optimizedResult = JSON.parse(resultJson);

        return {
          ok: true,
          v: '3',
          data: {
            perspectiveName: perspectiveName,
            perspectiveType: "builtin",
            tasks: optimizedResult.slice(0, limit),
            metadata: {
              total_count: optimizedResult.length,
              limit_applied: limit,
              optimization: "omniJs_inbox_collection"
            }
          },
          query_time_ms: Date.now() - startTime
        };
      }

      if (perspectiveName === "Projects") {
        const projectsScript = \`
          (() => {
            const results = [];
            flattenedProjects.forEach(project => {
              if (project.status === Project.Status.Active) {
                results.push({
                  id: project.id.primaryKey,
                  name: project.name,
                  flagged: project.flagged || false,
                  completed: false,
                  dueDate: project.dueDate ? project.dueDate.toISOString() : null,
                  deferDate: project.deferDate ? project.deferDate.toISOString() : null,
                  project: project.parentFolder ? project.parentFolder.name : null,
                  projectId: project.id.primaryKey,
                  tags: project.tags ? project.tags.map(t => t.name) : [],
                  available: true,
                  note: \${includeDetails} ? (project.note || '') : undefined,
                  estimatedMinutes: \${includeDetails} ? null : undefined,
                  type: 'project'
                });
              }
            });
            return JSON.stringify(results);
          })()
        \`;
        const resultJson = app.evaluateJavascript(projectsScript);
        const optimizedResult = JSON.parse(resultJson);

        return {
          ok: true,
          v: '3',
          data: {
            perspectiveName: perspectiveName,
            perspectiveType: "builtin",
            tasks: optimizedResult.slice(0, limit),
            metadata: {
              total_count: optimizedResult.length,
              limit_applied: limit,
              optimization: "omniJs_projects_collection"
            }
          },
          query_time_ms: Date.now() - startTime
        };
      }

      if (perspectiveName === "Tags") {
        const tagsScript = \`
          (() => {
            const results = [];
            const seenTaskIds = new Set();
            flattenedTags.forEach(tag => {
              tag.remainingTasks.forEach(task => {
                if (!seenTaskIds.has(task.id.primaryKey)) {
                  seenTaskIds.add(task.id.primaryKey);
                  const project = task.containingProject;
                  results.push({
                    id: task.id.primaryKey,
                    name: task.name,
                    flagged: task.flagged || false,
                    completed: task.completed || false,
                    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                    deferDate: task.deferDate ? task.deferDate.toISOString() : null,
                    project: project ? project.name : null,
                    projectId: project ? project.id.primaryKey : null,
                    tags: task.tags ? task.tags.map(t => t.name) : [],
                    available: task.taskStatus === Task.Status.Available,
                    note: \${includeDetails} ? (task.note || '') : undefined,
                    estimatedMinutes: \${includeDetails} ? (task.estimatedMinutes || null) : undefined
                  });
                }
              });
            });
            return JSON.stringify(results);
          })()
        \`;
        const resultJson = app.evaluateJavascript(tagsScript);
        const optimizedResult = JSON.parse(resultJson);

        return {
          ok: true,
          v: '3',
          data: {
            perspectiveName: perspectiveName,
            perspectiveType: "builtin",
            tasks: optimizedResult.slice(0, limit),
            metadata: {
              total_count: optimizedResult.length,
              limit_applied: limit,
              optimization: "omniJs_tags_collection"
            }
          },
          query_time_ms: Date.now() - startTime
        };
      }

      // For all other perspectives (Flagged, Custom, etc), return unsupported message
      return {
        ok: true,
        v: '3',
        data: {
          perspectiveName: perspectiveName,
          perspectiveType: "unsupported",
          tasks: [],
          metadata: {
            total_count: 0,
            limit_applied: limit,
            optimization: "not_optimized",
            message: "This perspective type is not yet optimized. Supported: Inbox, Projects, Tags"
          }
        },
        query_time_ms: Date.now() - startTime
      };

    } catch (error) {
      return {
        ok: false,
        v: '3',
        error: {
          message: error.message || String(error),
          stack: error.stack,
          operation: 'query_perspective'
        }
      };
    }
  })();
`;
