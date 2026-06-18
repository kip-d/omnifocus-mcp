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

import { ROUND1_HELPER } from '../shared/helpers.js';

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
          ${ROUND1_HELPER}
          const nowTime = \${nowTime};
          const maxTasks = \${maxTasks};
          const includeRecentlyCompleted = \${includeRecentlyCompleted};
          const groupBy = "\${groupBy}";

          const now = new Date(nowTime);
          const overdueTasks = [];
          const projectBottlenecks = {};
          const tagBottlenecks = {};

          let tasksProcessed = 0;
          let totalActive = 0;
          // OMN-187: full-population overdue aggregates. The maxTasks cap below limits
          // only the per-task DETAIL arrays (overdueTasks/bottlenecks = payload size);
          // these counters reflect EVERY overdue task, so totalOverdue, avgDaysOverdue,
          // blockedCount, overduePercentage, and oldestOverdueDate stay correct even
          // when there are more than maxTasks overdue tasks.
          let totalOverdueCount = 0;
          let totalDaysOverdueAll = 0;
          let blockedOverdueCount = 0;
          let oldestDueTime = Infinity;
          let oldestDueISO = null;

          // OmniJS: Iterate through all tasks for overdue analysis
          flattenedTasks.forEach(task => {
            try {
              // OMN-187: one "active" predicate drives BOTH the overduePercentage
              // denominator (totalActive) and the overdue numerator below, so the
              // numerator is a subset of the denominator by construction (percentage
              // can never exceed 100%). taskStatus is the effective status — a task in
              // a dropped/completed project counts as terminal, the right universe for
              // "% of active tasks overdue".
              const activeStatus = task.taskStatus;
              const isActive =
                activeStatus !== Task.Status.Completed && activeStatus !== Task.Status.Dropped;
              if (isActive) {
                totalActive++;
              }

              // Only active tasks can be overdue. These cheap checks run for EVERY task
              // (before the detail cap) so the aggregates below see the full population.
              if (!isActive) return;

              const dueDate = task.dueDate;
              if (!dueDate) return;

              const dueDateTime = dueDate.getTime();
              if (dueDateTime >= nowTime) return;

              // Task is overdue. Full-population aggregates (UNCAPPED):
              const daysOverdue = Math.floor((nowTime - dueDateTime) / (1000 * 60 * 60 * 24));
              const isBlocked = activeStatus === Task.Status.Blocked;
              totalOverdueCount++;
              totalDaysOverdueAll += daysOverdue;
              if (isBlocked) blockedOverdueCount++;
              if (dueDateTime < oldestDueTime) {
                oldestDueTime = dueDateTime;
                oldestDueISO = dueDate.toISOString();
              }

              // Per-task DETAIL recording is capped for payload size — the summary
              // aggregates above are already complete.
              if (tasksProcessed >= maxTasks) return;
              tasksProcessed++;

              const taskId = task.id.primaryKey || 'unknown';
              const taskName = task.name || 'Unnamed Task';

              // Next action: reuse the cached activeStatus (OMN-187 — no re-read).
              const isNext = !isBlocked && activeStatus === Task.Status.Available;

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

          // Calculate statistics from the FULL-POPULATION counters (uncapped), not the
          // capped overdueTasks detail array — see the loop above (OMN-187).
          const totalOverdue = totalOverdueCount;
          const blockedCount = blockedOverdueCount;
          const unblockedCount = totalOverdue - blockedCount;
          const blockedPercentage = totalOverdue > 0 ?
            round1(blockedCount / totalOverdue * 100) : 0;

          const avgDaysOverdue = totalOverdue > 0 ?
            round1(totalDaysOverdueAll / totalOverdue) : 0;

          // OMN-187: share of active tasks that are overdue (numerator ⊆ denominator,
          // both full-population → always 0–100%).
          const overduePercentage = totalActive > 0 ?
            round1(totalOverdue / totalActive * 100) : 0;

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

            if (blockedPercentage > 50) {
              insights.push("High blockage rate (" + blockedPercentage + "%) - review dependencies");
            } else if (blockedPercentage > 25) {
              insights.push("Moderate blockage (" + blockedPercentage + "%) - some tasks waiting on others");
            }

            if (avgDaysOverdue > 30) {
              insights.push("Tasks significantly overdue (avg " + avgDaysOverdue + " days)");
            } else if (avgDaysOverdue > 7) {
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
            totalActive: totalActive,
            blockedCount: blockedCount,
            unblockedCount: unblockedCount,
            blockedPercentage: blockedPercentage,
            avgDaysOverdue: avgDaysOverdue,
            overduePercentage: overduePercentage,
            oldestOverdueDate: oldestDueISO,
            mostOverdue: overdueTasks[0] || null,
            insights: insights,
            groupedByUrgency: groupedByUrgency,
            projectBottlenecks: projectList.slice(0, 5),
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
            overduePercentage: analysis.overduePercentage,
            totalActive: analysis.totalActive,
            oldestOverdueDate: analysis.oldestOverdueDate,
            mostOverdue: analysis.mostOverdue
          },
          insights: analysis.insights,
          groupedByUrgency: analysis.groupedByUrgency,
          projectBottlenecks: analysis.projectBottlenecks,
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
