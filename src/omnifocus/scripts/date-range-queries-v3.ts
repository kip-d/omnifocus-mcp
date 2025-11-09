/**
 * date-range-queries-v3.ts - Pure OmniJS V3
 *
 * Converted from helper-based to pure OmniJS following v3 pattern.
 *
 * Changes:
 * - Removed getUnifiedHelpers() import and usage (~18KB savings per script)
 * - Inlined isTaskEffectivelyCompleted() logic as direct OmniJS checks
 * - Converted JXA function calls to OmniJS property access
 * - Updated to v3 response format (ok: true, v: '3', data: {...})
 *
 * Performance: Expected 10-20x faster (no helper overhead, direct property access)
 */

/**
 * Get upcoming tasks - Pure OmniJS v3
 */
export const GET_UPCOMING_TASKS_V3_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};
    const days = options.days || 7;
    const includeToday = options.includeToday !== undefined ? options.includeToday : true;
    const limit = options.limit || 100;

    try {
      const startTime = Date.now();

      // Pre-calculate time boundaries as timestamps (faster comparisons)
      const nowTime = Date.now();
      const startTimeRange = includeToday ? nowTime : nowTime + 86400000; // 86400000 = 24*60*60*1000
      const endTimeRange = nowTime + days * 86400000;
      const dayMs = 86400000;

      // Build OmniJS script for single bridge call
      const omniScript = \`
        (() => {
          const nowTime = \${nowTime};
          const startTimeRange = \${startTimeRange};
          const endTimeRange = \${endTimeRange};
          const dayMs = \${dayMs};
          const limit = \${limit};

          const tasks = [];
          let processedCount = 0;

          // OmniJS: Iterate through all tasks
          flattenedTasks.forEach(task => {
            if (tasks.length >= limit) return;
            processedCount++;

            try {
              // Check if task is effectively completed
              // Inline: task.completed OR parent project is dropped/completed
              if (task.completed) return;

              const project = task.containingProject;
              if (project) {
                const projectStatus = project.status;
                if (projectStatus === Project.Status.Done || projectStatus === Project.Status.Dropped) {
                  return;
                }
              }

              // Check for due date in range
              const dueDate = task.dueDate;
              if (!dueDate) return;

              const dueTime = dueDate.getTime();
              if (dueTime < startTimeRange || dueTime > endTimeRange) return;

              // Gather task data
              const daysUntilDue = Math.floor((dueTime - nowTime) / dayMs);
              const dueDateObj = new Date(dueTime);
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

              tasks.push({
                id: task.id.primaryKey,
                name: task.name,
                dueDate: dueDate.toISOString(),
                flagged: task.flagged || false,
                project: project ? project.name : null,
                projectId: project ? project.id.primaryKey : null,
                daysUntilDue: daysUntilDue,
                dayOfWeek: dayNames[dueDateObj.getDay()],
                note: task.note || null
              });
            } catch (e) {
              // Skip errored tasks
            }
          });

          // Sort by due date
          tasks.sort((a, b) => {
            const aTime = new Date(a.dueDate).getTime();
            const bTime = new Date(b.dueDate).getTime();
            return aTime - bTime;
          });

          return JSON.stringify({
            tasks: tasks,
            processedCount: processedCount
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);

      const endTime = Date.now();

      // Return v3 format
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          tasks: result.tasks,
          summary: {
            total: result.tasks.length,
            days_ahead: days,
            include_today: includeToday,
            start_date: new Date(startTimeRange).toISOString(),
            end_date: new Date(endTimeRange).toISOString(),
            limited: result.tasks.length >= limit,
            tasks_scanned: result.processedCount,
            query_time_ms: endTime - startTime,
            query_method: 'omnijs_v3_single_bridge'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to get upcoming tasks: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined,
          operation: 'get_upcoming_tasks'
        }
      });
    }
  })();
`;

/**
 * Get overdue tasks - Pure OmniJS v3
 */
export const GET_OVERDUE_TASKS_V3_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};
    const limit = options.limit || 100;
    const includeCompleted = options.includeCompleted || false;

    try {
      const startTime = Date.now();
      const nowTime = Date.now();
      const dayMs = 86400000;

      // Build OmniJS script for single bridge call
      const omniScript = \`
        (() => {
          const nowTime = \${nowTime};
          const dayMs = \${dayMs};
          const limit = \${limit};
          const includeCompleted = \${includeCompleted};

          const tasks = [];
          let processedCount = 0;

          // OmniJS: Iterate through all tasks
          flattenedTasks.forEach(task => {
            if (tasks.length >= limit) return;
            processedCount++;

            try {
              // Check if task is effectively completed
              const isCompleted = task.completed;
              if (!includeCompleted && isCompleted) return;

              if (!includeCompleted) {
                const project = task.containingProject;
                if (project) {
                  const projectStatus = project.status;
                  if (projectStatus === Project.Status.Done || projectStatus === Project.Status.Dropped) {
                    return;
                  }
                }
              }

              // Check for overdue date
              const dueDate = task.dueDate;
              if (!dueDate) return;

              const dueTime = dueDate.getTime();
              if (dueTime >= nowTime) return;

              // Gather task data
              const project = task.containingProject;
              const daysOverdue = Math.floor((nowTime - dueTime) / dayMs);

              tasks.push({
                id: task.id.primaryKey,
                name: task.name,
                dueDate: dueDate.toISOString(),
                flagged: task.flagged || false,
                completed: isCompleted,
                project: project ? project.name : null,
                projectId: project ? project.id.primaryKey : null,
                daysOverdue: daysOverdue,
                note: task.note || null
              });
            } catch (e) {
              // Skip errored tasks
            }
          });

          // Sort by most overdue first
          tasks.sort((a, b) => {
            const aTime = new Date(a.dueDate).getTime();
            const bTime = new Date(b.dueDate).getTime();
            return aTime - bTime;
          });

          return JSON.stringify({
            tasks: tasks,
            processedCount: processedCount
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);

      const endTime = Date.now();

      // Return v3 format
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          tasks: result.tasks,
          summary: {
            total: result.tasks.length,
            limited: result.tasks.length >= limit,
            tasks_scanned: result.processedCount,
            query_time_ms: endTime - startTime,
            reference_date: new Date(nowTime).toISOString(),
            query_method: 'omnijs_v3_single_bridge'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to get overdue tasks: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined,
          operation: 'get_overdue_tasks'
        }
      });
    }
  })();
`;

/**
 * Get tasks in date range - Pure OmniJS v3
 */
export const GET_TASKS_IN_DATE_RANGE_V3_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const params = {{params}};
    const startDate = params.startDate;
    const endDate = params.endDate;
    const dateField = params.dateField || 'dueDate';
    const includeNullDates = params.includeNullDates || false;
    const limit = params.limit || 100;

    try {
      const startTime = Date.now();

      // Validate inputs
      if (!startDate && !endDate) {
        return JSON.stringify({
          ok: false,
          v: '3',
          error: {
            message: 'At least one of startDate or endDate must be provided',
            operation: 'get_tasks_in_date_range'
          }
        });
      }

      const startTimeRange = startDate ? new Date(startDate).getTime() : null;
      const endTimeRange = endDate ? new Date(endDate).getTime() : null;

      // Build OmniJS script for single bridge call
      const omniScript = \`
        (() => {
          const startTimeRange = \${startTimeRange};
          const endTimeRange = \${endTimeRange};
          const dateField = "\${dateField}";
          const includeNullDates = \${includeNullDates};
          const limit = \${limit};

          const tasks = [];
          let processedCount = 0;
          let nullDateCount = 0;

          // OmniJS: Iterate through all tasks
          flattenedTasks.forEach(task => {
            if (tasks.length >= limit) return;
            processedCount++;

            try {
              // For non-completion date queries, skip completed tasks
              if (dateField !== 'completionDate') {
                if (task.completed) return;

                const project = task.containingProject;
                if (project) {
                  const projectStatus = project.status;
                  if (projectStatus === Project.Status.Done || projectStatus === Project.Status.Dropped) {
                    return;
                  }
                }
              }

              // Get the appropriate date field
              let taskDate;
              if (dateField === 'dueDate') {
                taskDate = task.dueDate;
              } else if (dateField === 'deferDate') {
                taskDate = task.deferDate;
              } else if (dateField === 'completionDate') {
                taskDate = task.completionDate;
              }

              if (!taskDate) {
                nullDateCount++;
                if (includeNullDates) {
                  const project = task.containingProject;
                  const taskData = {
                    id: task.id.primaryKey,
                    name: task.name,
                    flagged: task.flagged || false,
                    completed: task.completed || false,
                    project: project ? project.name : null,
                    projectId: project ? project.id.primaryKey : null
                  };
                  taskData[dateField] = null;
                  tasks.push(taskData);
                }
                return;
              }

              // Range check using timestamps
              const taskTime = taskDate.getTime();
              if (startTimeRange && taskTime < startTimeRange) return;
              if (endTimeRange && taskTime > endTimeRange) return;

              // Gather task data
              const project = task.containingProject;
              const taskData = {
                id: task.id.primaryKey,
                name: task.name,
                flagged: task.flagged || false,
                completed: task.completed || false,
                project: project ? project.name : null,
                projectId: project ? project.id.primaryKey : null,
                note: task.note || null
              };
              taskData[dateField] = taskDate.toISOString();
              tasks.push(taskData);
            } catch (e) {
              // Skip errored tasks
            }
          });

          // Sort by date field
          tasks.sort((a, b) => {
            const aDate = a[dateField] ? new Date(a[dateField]).getTime() : 0;
            const bDate = b[dateField] ? new Date(b[dateField]).getTime() : 0;
            return aDate - bDate;
          });

          return JSON.stringify({
            tasks: tasks,
            processedCount: processedCount,
            nullDateCount: nullDateCount
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);

      const endTime = Date.now();

      // Return v3 format
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          tasks: result.tasks,
          summary: {
            total: result.tasks.length,
            date_field: dateField,
            start_date: startTimeRange ? new Date(startTimeRange).toISOString() : null,
            end_date: endTimeRange ? new Date(endTimeRange).toISOString() : null,
            include_null_dates: includeNullDates,
            null_date_count: result.nullDateCount,
            limited: result.tasks.length >= limit,
            tasks_scanned: result.processedCount,
            query_time_ms: endTime - startTime,
            query_method: 'omnijs_v3_single_bridge'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to get tasks in date range: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined,
          operation: 'get_tasks_in_date_range'
        }
      });
    }
  })();
`;
