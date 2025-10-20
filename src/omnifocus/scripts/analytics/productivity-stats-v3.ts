/**
 * productivity-stats-v3.ts - OmniJS-First Productivity Statistics
 *
 * Performance improvement: 7.7s → <1s expected (8-10x faster)
 *
 * Key optimizations:
 * - JXA iteration through flattenedProjects → OmniJS bridge
 * - JXA iteration through flattenedTags → OmniJS bridge
 * - JXA iteration through flattenedTasks → OmniJS bridge (already done in V1)
 * - ALL property access in OmniJS context (~0.001ms vs JXA 16.662ms)
 * - Single evaluateJavascript() call for all statistics
 *
 * Bottlenecks eliminated:
 * - Project stats: ~50 projects × 5 properties × 16.662ms = ~4s → <0.1s
 * - Tag stats: ~30 tags × 3 properties × 16.662ms = ~1.5s → <0.05s
 * - Task stats: Already using OmniJS bridge in V1
 *
 * Pattern based on: task-velocity-v3.ts, get-project-stats-v3.ts, list-tags-v3.ts
 */

export const PRODUCTIVITY_STATS_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // Calculate period boundaries
      const now = new Date();
      const periodStart = new Date();

      switch(options.period) {
        case 'today':
          periodStart.setHours(0, 0, 0, 0);
          break;
        case 'week':
          periodStart.setDate(now.getDate() - 7);
          periodStart.setHours(0, 0, 0, 0);
          break;
        case 'month':
          periodStart.setMonth(now.getMonth() - 1);
          periodStart.setHours(0, 0, 0, 0);
          break;
        case 'quarter':
          periodStart.setMonth(now.getMonth() - 3);
          periodStart.setHours(0, 0, 0, 0);
          break;
        case 'year':
          periodStart.setFullYear(now.getFullYear() - 1);
          periodStart.setHours(0, 0, 0, 0);
          break;
      }

      const periodStartTime = periodStart.getTime();
      const nowTime = now.getTime();

      // Extract options in JXA context to pass to OmniJS
      const includeProjectStats = options.includeProjectStats || false;
      const includeTagStats = options.includeTagStats || false;
      const includeInactive = options.includeInactive || false;

      // Build comprehensive OmniJS script for ALL statistics in one bridge call
      const statsScript = \`
        (() => {
          const periodStartTime = \${periodStartTime};
          const nowTime = \${nowTime};
          const includeProjectStats = \${includeProjectStats};
          const includeTagStats = \${includeTagStats};
          const includeInactive = \${includeInactive};

          // Overall task statistics
          let totalTasks = 0;
          let totalCompleted = 0;
          let totalAvailable = 0;
          let completedInPeriod = 0;

          // OmniJS: Iterate through all tasks for overall statistics
          flattenedTasks.forEach(task => {
            try {
              totalTasks++;

              const isCompleted = task.completed || false;

              if (isCompleted) {
                totalCompleted++;

                // Check if completed in period
                const completionDate = task.completionDate;
                if (completionDate) {
                  const completionTime = completionDate.getTime();

                  // Count tasks completed within the period (>= start AND <= now)
                  if (completionTime >= periodStartTime && completionTime <= nowTime) {
                    completedInPeriod++;
                  }
                }
              } else {
                // Check if available (not blocked, not deferred)
                const blocked = task.taskStatus === Task.Status.Blocked;
                const deferDate = task.deferDate;
                const isDeferred = deferDate && deferDate.getTime() > nowTime;

                if (!blocked && !isDeferred) {
                  totalAvailable++;
                }
              }
            } catch (e) {
              // Skip tasks that cause errors
            }
          });

          // Project statistics
          const projectStats = {};
          if (includeProjectStats) {
            flattenedProjects.forEach(project => {
              try {
                const projectName = project.name || 'Unnamed Project';
                const projectStatus = project.status;

                // Skip inactive projects unless requested (use enum comparison)
                if (projectStatus !== Project.Status.Active && !includeInactive) {
                  return;
                }

                const rootTask = project.task;
                if (rootTask) {
                  const totalTasks = rootTask.numberOfTasks || 0;
                  const completedTasks = rootTask.numberOfCompletedTasks || 0;
                  const availableTasks = rootTask.numberOfAvailableTasks || 0;

                  // Check if project had activity in the period
                  const completionDate = project.completionDate;
                  const modificationDate = project.modified;

                  let hadActivity = false;
                  if (completionDate && completionDate.getTime() >= periodStartTime) {
                    hadActivity = true;
                  } else if (modificationDate && modificationDate.getTime() >= periodStartTime) {
                    hadActivity = true;
                  }

                  if (hadActivity || totalTasks > 0) {
                    projectStats[projectName] = {
                      total: totalTasks,
                      completed: completedTasks,
                      available: availableTasks,
                      completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : '0.0',
                      status: String(projectStatus).toLowerCase().replace(' status', '').trim(),
                      hadRecentActivity: hadActivity
                    };
                  }
                }
              } catch (e) {
                // Skip projects that cause errors
              }
            });
          }

          // Tag statistics
          const tagStats = {};
          if (includeTagStats) {
            flattenedTags.forEach(tag => {
              try {
                const tagName = tag.name;
                if (!tagName) return;

                const availableCount = tag.availableTaskCount || 0;
                const remainingCount = tag.remainingTaskCount || 0;

                if (availableCount > 0 || remainingCount > 0) {
                  tagStats[tagName] = {
                    available: availableCount,
                    remaining: remainingCount,
                    completionRate: remainingCount > 0 ?
                      ((remainingCount - availableCount) / remainingCount * 100).toFixed(1) : '100.0'
                  };
                }
              } catch (e) {
                // Skip tags that cause errors
              }
            });
          }

          return JSON.stringify({
            totalTasks: totalTasks,
            totalCompleted: totalCompleted,
            totalAvailable: totalAvailable,
            completedInPeriod: completedInPeriod,
            projectStats: projectStats,
            tagStats: tagStats
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(statsScript);
      const counts = JSON.parse(resultJson);

      // Calculate summary statistics
      const projectStats = counts.projectStats || {};
      const tagStats = counts.tagStats || {};

      let totalProjects = Object.keys(projectStats).length;
      let activeProjects = 0;

      for (const projectName in projectStats) {
        const stats = projectStats[projectName];
        if (stats.status === 'active') activeProjects++;
      }

      const completionRate = counts.totalTasks > 0 ?
        (counts.totalCompleted / counts.totalTasks * 100).toFixed(1) : '0.0';

      const daysInPeriod = Math.ceil((nowTime - periodStartTime) / (1000 * 60 * 60 * 24));
      const dailyAverage = (counts.completedInPeriod / daysInPeriod).toFixed(1);

      // Generate insights
      const insights = [];

      if (counts.completedInPeriod === 0) {
        insights.push("No tasks completed in this period");
      } else if (counts.completedInPeriod < 5) {
        insights.push("Low task completion rate - consider reviewing your workflow");
      } else if (counts.completedInPeriod > 50) {
        insights.push("High productivity! " + counts.completedInPeriod + " tasks completed");
      }

      if (activeProjects > 10) {
        insights.push("Many active projects (" + activeProjects + ") - consider focusing");
      } else if (activeProjects === 0) {
        insights.push("No active projects found");
      }

      if (parseFloat(completionRate) > 80) {
        insights.push("Excellent completion rate: " + completionRate + "%");
      } else if (parseFloat(completionRate) < 30) {
        insights.push("Low completion rate - many tasks remain incomplete");
      }

      const endTime = Date.now();

      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          summary: {
            period: options.period,
            totalProjects: totalProjects,
            activeProjects: activeProjects,
            totalTasks: counts.totalTasks,
            completedTasks: counts.totalCompleted,
            completedInPeriod: counts.completedInPeriod,
            availableTasks: counts.totalAvailable,
            completionRate: parseFloat(completionRate),
            dailyAverage: parseFloat(dailyAverage),
            daysInPeriod: daysInPeriod
          },
          projectStats: projectStats,
          tagStats: tagStats,
          insights: insights,
          metadata: {
            generated_at: new Date().toISOString(),
            method: 'omnijs_v3_single_bridge',
            optimization: 'omnijs_v3',
            query_time_ms: endTime - startTime,
            note: 'All statistics calculated in single OmniJS bridge call for maximum performance'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: {
          message: 'Failed to get productivity statistics: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        },
        v: '3'
      });
    }
  })();
`;
