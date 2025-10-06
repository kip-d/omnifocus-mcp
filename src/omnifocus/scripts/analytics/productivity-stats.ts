import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Optimized productivity statistics script using OmniJS bridge + direct API methods
 *
 * Optimizations:
 * - OmniJS bridge for task counting (125x faster property access than JXA)
 * - Direct API methods for project/tag statistics:
 *   - Project.task.numberOfTasks() for direct counts
 *   - Project.task.numberOfCompletedTasks() for completion counts
 *   - Tag.availableTaskCount() for tag statistics
 * - Fallback to JXA if bridge fails (graceful degradation)
 *
 * Performance improvements:
 * - 5-10x faster task iteration with OmniJS bridge
 * - No timeout issues with large databases
 * - Lower memory usage
 */
export const PRODUCTIVITY_STATS_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    const options = {{options}};
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      if (!doc) {
        return JSON.stringify({ ok: false, error: { message: "OmniFocus document is not available", details: "No default document found" }, v: '1' });
      }
      
      const now = new Date();
      const periodStart = new Date();
      
      // Calculate period start date
      switch(options.period) {
        case 'today':
          periodStart.setHours(0, 0, 0, 0);
          break;
        case 'week':
          periodStart.setDate(now.getDate() - 7);
          break;
        case 'month':
          periodStart.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          periodStart.setMonth(now.getMonth() - 3);
          break;
        case 'year':
          periodStart.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      // Get all projects for project-level statistics
      const allProjects = doc.flattenedProjects();
      let projectStats = {};
      let tagStats = {};
      
      // Gather project statistics using direct API methods
      if (options.includeProjectStats) {
        for (let i = 0; i < allProjects.length; i++) {
          const project = allProjects[i];
          
          try {
            const projectName = safeGet(() => project.name(), 'Unnamed Project');
            const projectStatus = safeGetStatus(project);
            
            // Skip inactive projects unless requested
            if (projectStatus !== 'active' && !options.includeInactive) {
              continue;
            }
            
            // Use direct API methods for counts - MUCH faster!
            const projectTask = safeGet(() => project.task());
            if (projectTask) {
              const totalTasks = safeGet(() => projectTask.numberOfTasks(), 0);
              const completedTasks = safeGet(() => projectTask.numberOfCompletedTasks(), 0);
              const availableTasks = safeGet(() => projectTask.numberOfAvailableTasks(), 0);
              
              // Check if project had activity in the period
              const completionDate = safeGetDate(() => project.completionDate());
              const modificationDate = safeGetDate(() => project.lastModifiedDate());
              
              let hadActivity = false;
              if (completionDate) {
                hadActivity = new Date(completionDate) >= periodStart;
              } else if (modificationDate) {
                hadActivity = new Date(modificationDate) >= periodStart;
              }
              
              if (hadActivity || totalTasks > 0) {
                projectStats[projectName] = {
                  total: totalTasks,
                  completed: completedTasks,
                  available: availableTasks,
                  completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0,
                  status: projectStatus,
                  hadRecentActivity: hadActivity
                };
              }
            }
          } catch (e) {
            // Skip projects that cause errors
            continue;
          }
        }
      }
      
      // Gather tag statistics using direct API methods
      if (options.includeTagStats) {
        const allTags = doc.flattenedTags();
        
        for (let i = 0; i < allTags.length; i++) {
          const tag = allTags[i];
          
          try {
            const tagName = safeGet(() => tag.name(), 'Unnamed Tag');
            
            // Use direct API methods for tag counts - includes descendants!
            const availableCount = safeGet(() => tag.availableTaskCount(), 0);
            const remainingCount = safeGet(() => tag.remainingTaskCount(), 0);
            
            if (availableCount > 0 || remainingCount > 0) {
              tagStats[tagName] = {
                available: availableCount,
                remaining: remainingCount,
                completionRate: remainingCount > 0 ? 
                  ((remainingCount - availableCount) / remainingCount * 100).toFixed(1) : 100
              };
            }
          } catch (e) {
            // Skip tags that cause errors
            continue;
          }
        }
      }
      
      // Calculate overall statistics using OmniJS bridge for performance
      // OmniJS provides much faster property access than JXA (125x faster for bulk operations)
      let totalTasks = 0;
      let totalCompleted = 0;
      let totalAvailable = 0;
      let completedInPeriod = 0;

      try {
        const periodStartTime = periodStart.getTime();
        const nowTime = now.getTime();

        const omniJsScript = \`
          (() => {
            const periodStartTime = \${periodStartTime};
            const nowTime = \${nowTime};

            let totalTasks = 0;
            let totalCompleted = 0;
            let totalAvailable = 0;
            let completedInPeriod = 0;

            flattenedTasks.forEach(task => {
              totalTasks++;

              const isCompleted = task.completed || false;

              if (isCompleted) {
                totalCompleted++;

                // Check if completed in period
                const completionDate = task.completionDate;
                if (completionDate) {
                  const completionTime = completionDate.getTime();
                  if (completionTime >= periodStartTime) {
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
            });

            return JSON.stringify({
              totalTasks,
              totalCompleted,
              totalAvailable,
              completedInPeriod
            });
          })()
        \`;

        const resultJson = app.evaluateJavascript(omniJsScript);
        const counts = JSON.parse(resultJson);

        totalTasks = counts.totalTasks;
        totalCompleted = counts.totalCompleted;
        totalAvailable = counts.totalAvailable;
        completedInPeriod = counts.completedInPeriod;

      } catch (bridgeError) {
        // Fall back to JXA if bridge fails
        const allTasks = doc.flattenedTasks();

        for (let i = 0; i < allTasks.length; i++) {
          const task = allTasks[i];
          try {
            totalTasks++;

            const isCompleted = safeIsCompleted(task);
            if (isCompleted) {
              totalCompleted++;

              const completionDateStr = safeGetDate(() => task.completionDate());
              if (completionDateStr) {
                const completionDate = new Date(completionDateStr);
                if (completionDate >= periodStart) {
                  completedInPeriod++;
                }
              }
            } else {
              const isAvailable = safeGet(() => {
                const blocked = task.blocked();
                const deferDateStr = safeGetDate(() => task.deferDate());
                const isDeferred = deferDateStr && new Date(deferDateStr) > now;
                return !blocked && !isDeferred;
              }, false);

              if (isAvailable) {
                totalAvailable++;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      // Calculate project-level statistics for project stats section
      let totalProjects = Object.keys(projectStats).length;
      let activeProjects = 0;
      
      for (const projectName in projectStats) {
        const stats = projectStats[projectName];
        if (stats.status === 'active') activeProjects++;
      }
      
      const completionRate = totalTasks > 0 ? 
        (totalCompleted / totalTasks * 100).toFixed(1) : 0;
      
      const daysInPeriod = Math.ceil((now - periodStart) / (1000 * 60 * 60 * 24));
      const dailyAverage = (completedInPeriod / daysInPeriod).toFixed(1);
      
      // Generate insights
      const insights = [];
      
      if (completedInPeriod === 0) {
        insights.push("No tasks completed in this period");
      } else if (completedInPeriod < 5) {
        insights.push("Low task completion rate - consider reviewing your workflow");
      } else if (completedInPeriod > 50) {
        insights.push("High productivity! " + completedInPeriod + " tasks completed");
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
      
      return JSON.stringify({
        ok: true,
        v: '1',
        data: {
          summary: {
            period: options.period,
            totalProjects: totalProjects,
            activeProjects: activeProjects,
            totalTasks: totalTasks,
            completedTasks: totalCompleted,
            completedInPeriod: completedInPeriod,
            availableTasks: totalAvailable,
            completionRate: parseFloat(completionRate),
            dailyAverage: parseFloat(dailyAverage),
            daysInPeriod: daysInPeriod
          },
          projectStats: projectStats,
          tagStats: tagStats,
          insights: insights,
          metadata: {
            generated_at: new Date().toISOString(),
            method: 'optimized_direct_api',
            note: 'Using numberOfTasks(), numberOfCompletedTasks(), and availableTaskCount() for performance'
          }
        }
      });
      
    } catch (error) {
      return JSON.stringify({ ok: false, error: { message: "Failed to get productivity statistics: " + (error && error.toString ? error.toString() : 'Unknown error'), details: error && error.message ? error.message : undefined }, v: '1' });
    }
  })();
`;
