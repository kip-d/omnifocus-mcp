/**
 * Unified Task Cache Warming Script
 *
 * Optimization: Uses OmniJS bridge with flattenedTasks global collection
 * for fast bulk property access, filtering into multiple buckets in one pass.
 *
 * Performance: OmniJS property access is much faster than JXA for bulk operations
 */

/**
 * Warm multiple task query caches in one pass using OmniJS bridge
 * Returns: { today: [], overdue: [], upcoming: [] }
 */
export const WARM_TASK_CACHES_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const limit = {{limit}};
    const upcomingDays = {{upcomingDays}};

    try {
      const startTime = Date.now();

      // Use OmniJS bridge for fast bulk property access
      const omniJsScript = \`
        (() => {
          const nowTime = Date.now();
          const dayMs = 86400000;
          const todayStart = new Date().setHours(0, 0, 0, 0);
          const todayEnd = new Date().setHours(23, 59, 59, 999);
          const threeDaysFromNow = nowTime + (3 * dayMs);
          const upcomingStart = nowTime;
          const upcomingEnd = nowTime + (\${upcomingDays} * dayMs);

          const todayTasks = [];
          const overdueTasks = [];
          const upcomingTasks = [];

          let overdueCount = 0;
          let dueTodayCount = 0;
          let flaggedCount = 0;
          let processedCount = 0;

          // OmniJS: Use global flattenedTasks collection
          flattenedTasks.forEach(task => {
            processedCount++;

            // Skip completed tasks
            if (task.completed) return;
            if (task.taskStatus === Task.Status.Dropped) return;

            const taskId = task.id.primaryKey;
            const taskName = task.name;
            const isFlagged = task.flagged || false;
            const dueDate = task.dueDate;
            const project = task.containingProject;
            const note = task.note || null;

            const projectName = project ? project.name : null;
            const projectId = project ? project.id.primaryKey : null;

            const baseTask = {
              id: taskId,
              name: taskName,
              flagged: isFlagged,
              project: projectName,
              projectId: projectId,
              note: note
            };

            let dueTime = null;
            let dueDateISO = null;
            if (dueDate) {
              dueTime = dueDate.getTime();
              dueDateISO = dueDate.toISOString();
            }

            // TODAY bucket (due within 3 days OR flagged)
            if (todayTasks.length < \${limit}) {
              let shouldIncludeInToday = false;
              let reason = '';
              let daysOverdue = 0;

              if (dueTime) {
                if (dueTime < nowTime) {
                  shouldIncludeInToday = true;
                  reason = 'overdue';
                  daysOverdue = Math.floor((nowTime - dueTime) / dayMs);
                  overdueCount++;
                } else if (dueTime >= todayStart && dueTime <= todayEnd) {
                  shouldIncludeInToday = true;
                  reason = 'due_today';
                  dueTodayCount++;
                } else if (dueTime <= threeDaysFromNow) {
                  shouldIncludeInToday = true;
                  reason = 'due_soon';
                }
              }

              if (!shouldIncludeInToday && isFlagged) {
                shouldIncludeInToday = true;
                reason = 'flagged';
                flaggedCount++;
              }

              if (shouldIncludeInToday) {
                todayTasks.push({
                  ...baseTask,
                  dueDate: dueDateISO,
                  reason: reason,
                  daysOverdue: daysOverdue
                });
              }
            }

            // OVERDUE bucket
            if (overdueTasks.length < \${limit} && dueTime && dueTime < nowTime) {
              const daysOverdue = Math.floor((nowTime - dueTime) / dayMs);
              overdueTasks.push({
                ...baseTask,
                dueDate: dueDateISO,
                daysOverdue: daysOverdue,
                completed: false
              });
            }

            // UPCOMING bucket
            if (upcomingTasks.length < \${limit} && dueTime) {
              if (dueTime >= upcomingStart && dueTime <= upcomingEnd) {
                const daysUntilDue = Math.floor((dueTime - nowTime) / dayMs);
                upcomingTasks.push({
                  ...baseTask,
                  dueDate: dueDateISO,
                  daysUntilDue: daysUntilDue
                });
              }
            }

            // Early exit if all buckets full
            if (todayTasks.length >= \${limit} &&
                overdueTasks.length >= \${limit} &&
                upcomingTasks.length >= \${limit}) {
              return;
            }
          });

          // Sort each bucket
          todayTasks.sort((a, b) => {
            if (a.daysOverdue && b.daysOverdue) {
              return b.daysOverdue - a.daysOverdue;
            }
            if (a.daysOverdue) return -1;
            if (b.daysOverdue) return 1;
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            return 0;
          });

          overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);

          upcomingTasks.sort((a, b) => {
            if (a.dueDate && b.dueDate) {
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            }
            return 0;
          });

          return JSON.stringify({
            todayTasks,
            overdueTasks,
            upcomingTasks,
            metadata: {
              overdueCount,
              dueTodayCount,
              flaggedCount,
              processedCount
            }
          });
        })()
      \`;

      const resultJson = app.evaluateJavascript(omniJsScript);
      const omniResult = JSON.parse(resultJson);
      const totalTime = Date.now() - startTime;

      return JSON.stringify({
        ok: true,
        today: {
          tasks: omniResult.todayTasks,
          metadata: {
            overdueCount: omniResult.metadata.overdueCount,
            dueTodayCount: omniResult.metadata.dueTodayCount,
            flaggedCount: omniResult.metadata.flaggedCount,
            processedCount: omniResult.metadata.processedCount,
            totalTasks: omniResult.metadata.processedCount,
            optimizationUsed: 'omniJs_bridge'
          }
        },
        overdue: {
          tasks: omniResult.overdueTasks,
          metadata: {
            processedCount: omniResult.metadata.processedCount,
            totalTasks: omniResult.metadata.processedCount
          }
        },
        upcoming: {
          tasks: omniResult.upcomingTasks,
          metadata: {
            processedCount: omniResult.metadata.processedCount,
            totalTasks: omniResult.metadata.processedCount,
            daysAhead: upcomingDays
          }
        },
        performance: {
          totalTime: totalTime,
          tasksProcessed: omniResult.metadata.processedCount,
          bucketsPopulated: 3
        },
        v: '2'
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: {
          message: error.message || String(error),
          stack: error.stack
        },
        v: '2'
      });
    }
  })();
`;
