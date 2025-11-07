/**
 * analyze-overdue-v3.ts - Pure OmniJS Overdue Analysis
 *
 * Performance improvement: Expected 10-50x faster (based on Phase 1 results)
 *
 * Key optimizations:
 * - Removed getUnifiedHelpers() (~18KB overhead)
 * - Direct property access instead of safeGet() wrappers
 * - Single evaluateJavascript() call for all analysis
 * - ALL property access in OmniJS context
 *
 * Converted from helper-based to pure OmniJS following v3 pattern.
 *
 * Original script features:
 * - Overdue task detection with days past due calculation
 * - Blocked task identification (using task.blocked API)
 * - Next action detection (using task.next API)
 * - Project bottleneck tracking
 * - Tag bottleneck tracking
 * - Urgency grouping (critical, high, medium, low)
 * - Pattern insights and recommendations
 */

export const ANALYZE_OVERDUE_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // Calculate current time
      const now = new Date();
      const nowTime = now.getTime();

      // Extract options in JXA context to pass to OmniJS
      const maxTasks = options.limit || 100;
      const includeRecentlyCompleted = options.includeRecentlyCompleted || false;
      const groupBy = options.groupBy || 'project';

      // Build comprehensive OmniJS script for ALL overdue analysis in one bridge call
      const analysisScript = \`
        (() => {
          const nowTime = \${nowTime};
          const maxTasks = \${maxTasks};
          const includeRecentlyCompleted = \${includeRecentlyCompleted};
          const groupBy = "\${groupBy}";

          const now = new Date(nowTime);
          const overdueTasks = [];
          const blockedOverdue = [];
          const projectBottlenecks = {};
          const tagBottlenecks = {};

          let tasksProcessed = 0;

          // OmniJS: Iterate through all tasks for overdue analysis
          flattenedTasks.forEach(task => {
            try {
              // Limit processing for performance
              if (tasksProcessed >= maxTasks) return;

              // Check if task is effectively completed
              const isCompleted = task.completed || false;
              if (isCompleted) return;

              // Check if task has a due date
              const dueDate = task.dueDate;
              if (!dueDate) return;

              // Check if overdue
              const dueDateTime = dueDate.getTime();
              if (dueDateTime >= nowTime) return;

              // Task is overdue - gather information
              tasksProcessed++;

              const taskId = task.id.primaryKey || 'unknown';
              const taskName = task.name || 'Unnamed Task';

              // Check if blocked (using OmniJS Task.Status enum)
              const isBlocked = task.taskStatus === Task.Status.Blocked;

              // Check if next action (using shouldUseFloatingTimeZone as proxy for next status)
              // Note: OmniJS doesn't expose task.next() directly, use available properties
              const isNext = !isBlocked && task.taskStatus === Task.Status.Available;

              // Calculate days overdue
              const daysOverdue = Math.floor((nowTime - dueDateTime) / (1000 * 60 * 60 * 24));

              // Get project information
              const project = task.containingProject;
              const projectName = project ? (project.name || 'No Project') : 'Inbox';

              // Get tags
              const taskTags = task.tags || [];
              const tags = [];
              taskTags.forEach(tag => {
                try {
                  const tagName = tag.name;
                  if (tagName) tags.push(tagName);
                } catch (e) {
                  // Skip invalid tags
                }
              });

              const overdueTask = {
                id: taskId,
                name: taskName,
                dueDate: dueDate.toISOString(),
                daysOverdue: daysOverdue,
                project: projectName,
                tags: tags,
                blocked: isBlocked,
                isNext: isNext
              };

              overdueTasks.push(overdueTask);

              // Track blocked overdue tasks
              if (isBlocked) {
                blockedOverdue.push(overdueTask);

                // Track project bottlenecks
                if (projectName !== 'Inbox') {
                  if (!projectBottlenecks[projectName]) {
                    projectBottlenecks[projectName] = {
                      count: 0,
                      totalDaysOverdue: 0,
                      blockedCount: 0,
                      tasks: []
                    };
                  }
                  projectBottlenecks[projectName].blockedCount++;
                  projectBottlenecks[projectName].count++;
                  projectBottlenecks[projectName].totalDaysOverdue += daysOverdue;
                  projectBottlenecks[projectName].tasks.push(taskName);
                }

                // Track tag bottlenecks
                for (let i = 0; i < tags.length; i++) {
                  const tag = tags[i];
                  if (!tagBottlenecks[tag]) {
                    tagBottlenecks[tag] = {
                      count: 0,
                      blockedCount: 0,
                      tasks: []
                    };
                  }
                  tagBottlenecks[tag].blockedCount++;
                  tagBottlenecks[tag].tasks.push(taskName);
                }
              } else {
                // Track non-blocked overdue in projects
                if (projectName !== 'Inbox') {
                  if (!projectBottlenecks[projectName]) {
                    projectBottlenecks[projectName] = {
                      count: 0,
                      totalDaysOverdue: 0,
                      blockedCount: 0,
                      tasks: []
                    };
                  }
                  projectBottlenecks[projectName].count++;
                  projectBottlenecks[projectName].totalDaysOverdue += daysOverdue;
                  projectBottlenecks[projectName].tasks.push(taskName);
                }
              }

            } catch (e) {
              // Skip tasks that cause errors
            }
          });

          // Sort overdue tasks by days overdue
          overdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);

          // Calculate statistics
          const totalOverdue = overdueTasks.length;
          const blockedCount = blockedOverdue.length;
          const unblockedCount = totalOverdue - blockedCount;
          const blockedPercentage = totalOverdue > 0 ?
            (blockedCount / totalOverdue * 100).toFixed(1) : '0.0';

          // Calculate average days overdue
          let totalDaysOverdue = 0;
          for (let i = 0; i < overdueTasks.length; i++) {
            totalDaysOverdue += overdueTasks[i].daysOverdue;
          }
          const avgDaysOverdue = totalOverdue > 0 ?
            (totalDaysOverdue / totalOverdue).toFixed(1) : '0.0';

          // Find most problematic projects
          const projectList = [];
          for (const projectName in projectBottlenecks) {
            const stats = projectBottlenecks[projectName];
            projectList.push({
              name: projectName,
              overdueCount: stats.count,
              blockedCount: stats.blockedCount,
              avgDaysOverdue: (stats.totalDaysOverdue / stats.count).toFixed(1),
              blockageRate: stats.count > 0 ?
                (stats.blockedCount / stats.count * 100).toFixed(1) : '0.0'
            });
          }
          projectList.sort((a, b) => b.overdueCount - a.overdueCount);

          // Generate insights
          const insights = [];

          if (totalOverdue === 0) {
            insights.push("No overdue tasks found - excellent!");
          } else {
            insights.push(totalOverdue + " overdue tasks found");

            if (parseFloat(blockedPercentage) > 50) {
              insights.push("High blockage rate (" + blockedPercentage + "%) - review dependencies");
            } else if (parseFloat(blockedPercentage) > 25) {
              insights.push("Moderate blockage (" + blockedPercentage + "%) - some tasks waiting on others");
            }

            if (parseFloat(avgDaysOverdue) > 30) {
              insights.push("Tasks significantly overdue (avg " + avgDaysOverdue + " days)");
            } else if (parseFloat(avgDaysOverdue) > 7) {
              insights.push("Tasks moderately overdue (avg " + avgDaysOverdue + " days)");
            }

            if (projectList.length > 0 && projectList[0].overdueCount > 5) {
              insights.push("'" + projectList[0].name + "' has " + projectList[0].overdueCount + " overdue tasks");
            }
          }

          // Group tasks by how overdue they are
          const groupedByUrgency = {
            critical: [], // > 30 days
            high: [],     // 8-30 days
            medium: [],   // 3-7 days
            low: []       // 1-2 days
          };

          for (let i = 0; i < overdueTasks.length; i++) {
            const task = overdueTasks[i];
            if (task.daysOverdue > 30) {
              groupedByUrgency.critical.push(task);
            } else if (task.daysOverdue > 7) {
              groupedByUrgency.high.push(task);
            } else if (task.daysOverdue > 2) {
              groupedByUrgency.medium.push(task);
            } else {
              groupedByUrgency.low.push(task);
            }
          }

          return JSON.stringify({
            totalOverdue: totalOverdue,
            blockedCount: blockedCount,
            unblockedCount: unblockedCount,
            blockedPercentage: parseFloat(blockedPercentage),
            avgDaysOverdue: parseFloat(avgDaysOverdue),
            mostOverdue: overdueTasks[0] || null,
            insights: insights,
            groupedByUrgency: groupedByUrgency,
            projectBottlenecks: projectList.slice(0, 5),
            blockedTasks: blockedOverdue.slice(0, 10),
            tasksAnalyzed: tasksProcessed
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(analysisScript);
      const analysis = JSON.parse(resultJson);

      const endTime = Date.now();

      // Return v3 format matching original script structure
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          summary: {
            totalOverdue: analysis.totalOverdue,
            blockedCount: analysis.blockedCount,
            unblockedCount: analysis.unblockedCount,
            blockedPercentage: analysis.blockedPercentage,
            avgDaysOverdue: analysis.avgDaysOverdue,
            mostOverdue: analysis.mostOverdue
          },
          insights: analysis.insights,
          groupedByUrgency: analysis.groupedByUrgency,
          projectBottlenecks: analysis.projectBottlenecks,
          blockedTasks: analysis.blockedTasks,
          metadata: {
            generated_at: new Date().toISOString(),
            method: 'omnijs_v3_single_bridge',
            optimization: 'omnijs_v3',
            query_time_ms: endTime - startTime,
            tasksAnalyzed: analysis.tasksAnalyzed,
            note: 'All analysis calculated in single OmniJS bridge call for maximum performance'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to analyze overdue tasks: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
