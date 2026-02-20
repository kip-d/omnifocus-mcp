/**
 * workflow-analysis-v3.ts - Pure OmniJS Workflow Analysis
 *
 * Performance improvement: Expected 10-30x faster (based on Phase 1 results)
 *
 * Key optimizations:
 * - Removed getUnifiedHelpers() (~18KB overhead)
 * - Direct property access instead of safeGet() wrappers
 * - Single evaluateJavascript() call for all analysis
 * - ALL property access in OmniJS context
 *
 * Converted from helper-based to pure OmniJS following v3 pattern.
 *
 * Original script features (ALL PRESERVED):
 * - Cross-project pattern analysis
 * - Workload distribution analysis
 * - Time pattern discovery
 * - Bottleneck identification
 * - Productivity insights
 * - Project health assessment
 * - Strategic vs problematic deferral analysis
 * - Tag bottleneck tracking
 * - Multiple focus areas (productivity, workload, bottlenecks, project_health, time_patterns, opportunities)
 * - Accurate project counts using OmniFocus API
 */

export const WORKFLOW_ANALYSIS_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // Calculate current time
      const now = new Date();
      const nowTime = now.getTime();

      // Extract options in JXA context to pass to OmniJS
      const analysisDepth = options.analysisDepth || 'standard';
      const focusAreas = options.focusAreas || ['productivity', 'workload', 'bottlenecks'];
      const maxInsights = options.maxInsights || 15;
      const includeRawData = options.includeRawData || false;

      // Build comprehensive OmniJS script for ALL workflow analysis in one bridge call
      const analysisScript = \`
        (() => {
          const nowTime = \${nowTime};
          const analysisDepth = "\${analysisDepth}";
          const focusAreas = \${JSON.stringify(focusAreas)};
          const maxInsights = \${maxInsights};
          const includeRawData = \${includeRawData};

          const now = new Date(nowTime);

          // Initialize analysis structures
          const insights = [];
          const patterns = {};
          const recommendations = [];
          const data = {
            tasks: [],
            projects: [],
            workload: {},
            timePatterns: {},
            projectHealth: {}
          };

          // Analysis counters - focus on workflow health, not completion
          let overdueTasks = 0;
          let flaggedTasks = 0;
          let blockedTasks = 0;
          let availableTasks = 0;
          let totalEstimatedTime = 0;
          let totalOverdueDays = 0;
          let totalDeferredTasks = 0;
          let totalInboxTasks = 0;

          // Deferral analysis - distinguish good vs. problematic deferrals
          let strategicDeferrals = 0;
          let problematicDeferrals = 0;
          const deferredTaskDetails = [];

          // Project analysis - focus on momentum and health
          const projectStats = {};

          // Time analysis
          const timeBuckets = {
            '0-1 days': 0,
            '1-3 days': 0,
            '3-7 days': 0,
            '1-2 weeks': 0,
            '2-4 weeks': 0,
            '1-3 months': 0,
            '3+ months': 0
          };

          // Workload analysis
          const workloadByTag = {};

          // PHASE 1: Get accurate project statistics using OmniFocus's own counts
          // This ensures we have accurate available rates for all projects
          const projectAccurateStats = {};

          flattenedProjects.forEach(project => {
            try {
              const projectName = project.name || 'Unnamed Project';
              const rootTask = project.rootTask;

              if (rootTask) {
                // Use OmniFocus's own accurate counts - this fixes the "Pending Purchase Orders" issue
                const totalTasks = rootTask.numberOfTasks || 0;
                const availableTasks = rootTask.numberOfAvailableTasks || 0;
                const completedTasks = rootTask.numberOfCompletedTasks || 0;

                if (totalTasks > 0) {
                  projectAccurateStats[projectName] = {
                    total: totalTasks,
                    available: availableTasks,
                    completed: completedTasks,
                    availableRate: (availableTasks / totalTasks * 100).toFixed(1)
                  };
                }
              }
            } catch (e) {
              // Skip projects that cause errors
            }
          });

          // PHASE 2: Process tasks for analysis
          const allTasks = flattenedTasks;
          const allProjects = flattenedProjects;
          const totalTasks = allTasks.length;
          const totalProjects = allProjects.length;

          const maxTasksToProcess = analysisDepth === 'deep' ? totalTasks : Math.min(1000, totalTasks);

          for (let i = 0; i < maxTasksToProcess; i++) {
            const task = allTasks[i];

            try {
              const completed = task.completed || false;

              // CRITICAL FIX: Skip project tasks (tasks that represent projects themselves)
              // Project tasks have childCounts and should not be counted in task-level analysis
              const hasChildren = (task.numberOfTasks || 0) > 0;
              if (hasChildren) {
                // This is a project task, skip it for task-level analysis
                continue;
              }

              const flagged = task.flagged || false;
              const blocked = task.taskStatus === Task.Status.Blocked;
              const isNext = !blocked && task.taskStatus === Task.Status.Available;

              // Get dates
              const dueDate = task.dueDate;
              const deferDate = task.deferDate;
              const creationDate = task.creationDate;
              const modificationDate = task.modificationDate;

              // Calculate overdue days
              let overdueDays = 0;
              if (dueDate && !completed) {
                const dueDateMs = dueDate.getTime();
                if (dueDateMs < nowTime) {
                  overdueDays = Math.floor((nowTime - dueDateMs) / (1000 * 60 * 60 * 24));
                }
              }

              // Calculate task age
              const createdOrModified = creationDate || modificationDate;
              const taskAge = createdOrModified ?
                Math.floor((nowTime - createdOrModified.getTime()) / (1000 * 60 * 60 * 24)) : 0;

              const estimatedMinutes = task.estimatedMinutes || 0;
              const inInbox = task.inInbox;

              // Update counters - focus on workflow health
              if (overdueDays > 0) {
                overdueTasks++;
                totalOverdueDays += overdueDays;
              }
              if (flagged) flaggedTasks++;
              if (blocked) blockedTasks++;
              if (!completed && !blocked && isNext) availableTasks++;

              // Get project info
              const project = task.containingProject;
              const projectName = project ? (project.name || 'No Project') : 'Inbox';

              // Smart deferral analysis
              if (deferDate && deferDate.getTime() > nowTime) {
                totalDeferredTasks++;

                // Analyze if this is a strategic deferral or problematic
                const deferDays = Math.floor((deferDate.getTime() - nowTime) / (1000 * 60 * 60 * 24));
                const taskName = task.name || 'Unnamed Task';
                const taskNameLower = taskName.toLowerCase();

                // Strategic deferrals: time-based, seasonal, or dependency-based
                const isStrategic = deferDays <= 90 || // Within 3 months (reasonable planning horizon)
                                   taskNameLower.includes('renewal') ||
                                   taskNameLower.includes('movie') ||
                                   taskNameLower.includes('annual') ||
                                   taskNameLower.includes('seasonal') ||
                                   taskNameLower.includes('quarterly') ||
                                   taskNameLower.includes('monthly');

                if (isStrategic) {
                  strategicDeferrals++;
                } else {
                  problematicDeferrals++;
                }

                // Store deferral details for pattern analysis
                deferredTaskDetails.push({
                  name: taskName,
                  deferDays: deferDays,
                  isStrategic: isStrategic,
                  project: projectName
                });
              }

              if (inInbox) totalInboxTasks++;

              totalEstimatedTime += estimatedMinutes;

              // Time bucket analysis
              if (overdueDays <= 1) timeBuckets['0-1 days']++;
              else if (overdueDays <= 3) timeBuckets['1-3 days']++;
              else if (overdueDays <= 7) timeBuckets['3-7 days']++;
              else if (overdueDays <= 14) timeBuckets['1-2 weeks']++;
              else if (overdueDays <= 28) timeBuckets['2-4 weeks']++;
              else if (overdueDays <= 90) timeBuckets['1-3 months']++;
              else timeBuckets['3+ months']++;

              // Project analysis - focus on momentum and workflow health
              if (!inInbox) {
                if (!projectStats[projectName]) {
                  projectStats[projectName] = {
                    total: 0,
                    overdue: 0,
                    flagged: 0,
                    blocked: 0,
                    available: 0,
                    deferred: 0,
                    strategicDeferred: 0,
                    problematicDeferred: 0,
                    estimatedTime: 0,
                    avgAge: 0,
                    totalAge: 0,
                    // Use OmniFocus's own available count for accuracy
                    omniFocusAvailable: 0,
                    omniFocusTotal: 0
                  };
                }

                projectStats[projectName].total++;
                if (overdueDays > 0) projectStats[projectName].overdue++;
                if (flagged) projectStats[projectName].flagged++;
                if (blocked) projectStats[projectName].blocked++;
                if (!completed && !blocked && isNext) projectStats[projectName].available++;

                // Track deferrals by type
                if (deferDate && deferDate.getTime() > nowTime) {
                  projectStats[projectName].deferred++;

                  const deferDays = Math.floor((deferDate.getTime() - nowTime) / (1000 * 60 * 60 * 24));
                  const taskName = task.name || 'Unnamed Task';
                  const taskNameLower = taskName.toLowerCase();
                  const isStrategic = deferDays <= 90 ||
                                     taskNameLower.includes('renewal') ||
                                     taskNameLower.includes('movie') ||
                                     taskNameLower.includes('annual') ||
                                     taskNameLower.includes('seasonal') ||
                                     taskNameLower.includes('quarterly') ||
                                     taskNameLower.includes('monthly');

                  if (isStrategic) {
                    projectStats[projectName].strategicDeferred++;
                  } else {
                    projectStats[projectName].problematicDeferred++;
                  }
                }

                projectStats[projectName].estimatedTime += estimatedMinutes;
                projectStats[projectName].totalAge += taskAge;
              }

              // Tag analysis
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

              tags.forEach(tag => {
                if (!workloadByTag[tag]) {
                  workloadByTag[tag] = {
                    total: 0,
                    completed: 0,
                    overdue: 0,
                    estimatedTime: 0
                  };
                }
                workloadByTag[tag].total++;
                if (completed) workloadByTag[tag].completed++;
                if (overdueDays > 0) workloadByTag[tag].overdue++;
                workloadByTag[tag].estimatedTime += estimatedMinutes;
              });

              // Include task data if requested
              if (includeRawData) {
                data.tasks.push({
                  id: task.id.primaryKey || 'unknown',
                  name: task.name || 'Unnamed Task',
                  completed,
                  flagged,
                  blocked,
                  next: isNext,
                  overdueDays,
                  taskAge,
                  estimatedMinutes,
                  project: projectName,
                  tags,
                  dueDate: dueDate ? dueDate.toISOString() : null,
                  deferDate: deferDate ? deferDate.toISOString() : null
                });
              }

            } catch (e) {
              // Skip tasks that cause errors
              continue;
            }
          }

          // PHASE 3: Merge the accurate OmniFocus counts with our task-level stats
          Object.keys(projectAccurateStats).forEach(projectName => {
            if (!projectStats[projectName]) {
              projectStats[projectName] = {
                total: 0,
                overdue: 0,
                flagged: 0,
                blocked: 0,
                available: 0,
                deferred: 0,
                strategicDeferred: 0,
                problematicDeferred: 0,
                estimatedTime: 0,
                avgAge: 0,
                totalAge: 0,
                omniFocusAvailable: 0,
                omniFocusTotal: 0
              };
            }

            // Use OmniFocus's accurate counts
            const accurate = projectAccurateStats[projectName];
            projectStats[projectName].omniFocusTotal = accurate.total;
            projectStats[projectName].omniFocusAvailable = accurate.available;

            // Update total to match OmniFocus's count if we have it
            if (accurate.total > 0) {
              projectStats[projectName].total = accurate.total;
            }
          });

          // PHASE 4: Calculate project momentum and workflow health scores
          Object.keys(projectStats).forEach(projectName => {
            const stats = projectStats[projectName];
            const avgAge = stats.total > 0 ? Math.round(stats.totalAge / stats.total) : 0;

            // CRITICAL FIX: Use OmniFocus's own available count when available
            let availableRate;
            if (stats.omniFocusAvailable > 0 && stats.omniFocusTotal > 0) {
              // Use OmniFocus's accurate count - this fixes the "Pending Purchase Orders" issue
              availableRate = (stats.omniFocusAvailable / stats.omniFocusTotal * 100).toFixed(1);
            } else {
              // Fall back to our manual calculation for projects without OmniFocus counts
              availableRate = stats.total > 0 ? (stats.available / stats.total * 100).toFixed(1) : 0;
            }

            const overdueRate = stats.total > 0 ? (stats.overdue / stats.total * 100).toFixed(1) : 0;

            stats.avgAge = avgAge;
            stats.availableRate = parseFloat(availableRate);
            stats.overdueRate = parseFloat(overdueRate);

            // Project workflow health scoring - focus on system efficiency
            let healthScore = 100;

            // Overdue tasks hurt workflow health
            if (stats.overdue > 0) healthScore -= (stats.overdue / stats.total) * 25;

            // Blocked tasks slow down the system
            if (stats.blocked > 0) healthScore -= (stats.blocked / stats.total) * 20;

            // Very old projects may be stale
            if (avgAge > 120) healthScore -= 15;

            // Smart deferral analysis - only penalize problematic deferrals
            if (stats.problematicDeferred > 0) {
              const problematicDeferralRate = stats.problematicDeferred / stats.total;
              if (problematicDeferralRate > 0.2) healthScore -= 15; // High problematic deferral rate
            }

            // Strategic deferrals are actually GOOD - don't penalize
            if (stats.strategicDeferred > 0) {
              // This might actually improve the score slightly
              healthScore = Math.min(100, healthScore + 5);
            }

            // Low available tasks suggest project may be stalled
            if (availableRate < 20) healthScore -= 10;

            stats.healthScore = Math.max(0, healthScore);

            // Calculate momentum (how much forward progress is possible)
            const momentumScore = Math.max(0, 100 - (parseFloat(overdueRate) * 0.5) - (parseFloat(availableRate) * 0.3));
            stats.momentumScore = momentumScore;
          });

          // PHASE 5: Generate insights based on focus areas
          if (focusAreas.includes('productivity')) {
            const availableRate = totalTasks > 0 ? (availableTasks / totalTasks * 100).toFixed(1) : 0;
            insights.push({
              category: 'productivity',
              insight: availableRate + '% of tasks are ready to work on (' + availableTasks + ' of ' + totalTasks + ' tasks)',
              priority: 'medium'
            });

            if (overdueTasks > 0) {
              const avgOverdue = Math.round(totalOverdueDays / overdueTasks);
              insights.push({
                category: 'productivity',
                insight: overdueTasks + ' tasks are overdue, averaging ' + avgOverdue + ' days late',
                priority: 'high'
              });
            }

            if (totalDeferredTasks > 0) {
              const deferredRate = totalTasks > 0 ? (totalDeferredTasks / totalTasks * 100).toFixed(1) : 0;
              const strategicRate = totalTasks > 0 ? (strategicDeferrals / totalTasks * 100).toFixed(1) : 0;
              const problematicRate = totalTasks > 0 ? (problematicDeferrals / totalTasks * 100).toFixed(1) : 0;

              insights.push({
                category: 'productivity',
                insight: deferredRate + '% of tasks are deferred (' + totalDeferredTasks + ' total)',
                priority: 'medium'
              });

              if (strategicDeferrals > 0) {
                insights.push({
                  category: 'productivity',
                  insight: strategicRate + '% are strategic deferrals (' + strategicDeferrals + ' tasks) - Good GTD practice!',
                  priority: 'low'
                });
              }

              if (problematicDeferrals > 0) {
                insights.push({
                  category: 'productivity',
                  insight: problematicRate + '% are problematic deferrals (' + problematicDeferrals + ' tasks) - May need attention',
                  priority: 'medium'
                });
              }
            }
          }

          if (focusAreas.includes('workload')) {
            const totalHours = Math.round(totalEstimatedTime / 60);
            insights.push({
              category: 'workload',
              insight: 'Total estimated workload: ' + totalHours + ' hours across ' + totalProjects + ' projects',
              priority: 'medium'
            });

            // Find projects with high momentum (many available tasks)
            const highMomentumProjects = [];
            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.available > 0 && (stats.available / stats.total) > 0.3) {
                highMomentumProjects.push({ name, stats });
              }
            });
            highMomentumProjects.sort((a, b) => (b.stats.available / b.stats.total) - (a.stats.available / a.stats.total));

            if (highMomentumProjects.length > 0) {
              const top3 = highMomentumProjects.slice(0, 3);
              const projectList = top3.map(p => p.name + ' (' + p.stats.available + ' available tasks)').join(', ');
              insights.push({
                category: 'workload',
                insight: 'High-momentum projects: ' + projectList,
                priority: 'medium'
              });
            }

            // Find projects with problematic deferral patterns
            const problematicDeferralProjects = [];
            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.problematicDeferred > 0 && (stats.problematicDeferred / stats.total) > 0.3) {
                problematicDeferralProjects.push({ name, stats });
              }
            });
            problematicDeferralProjects.sort((a, b) =>
              (b.stats.problematicDeferred / b.stats.total) - (a.stats.problematicDeferred / a.stats.total)
            );

            if (problematicDeferralProjects.length > 0) {
              const top3 = problematicDeferralProjects.slice(0, 3);
              const projectList = top3.map(p =>
                p.name + ' (' + Math.round((p.stats.problematicDeferred / p.stats.total) * 100) + '% problematic deferrals)'
              ).join(', ');
              insights.push({
                category: 'workload',
                insight: 'Projects with high problematic deferral rates: ' + projectList,
                priority: 'high'
              });
            }

            // Celebrate projects with good strategic deferral practices
            const strategicDeferralProjects = [];
            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.strategicDeferred > 0 && stats.problematicDeferred === 0) {
                strategicDeferralProjects.push({ name, stats });
              }
            });
            strategicDeferralProjects.sort((a, b) =>
              (b.stats.strategicDeferred / b.stats.total) - (a.stats.strategicDeferred / a.stats.total)
            );

            if (strategicDeferralProjects.length > 0) {
              const top3 = strategicDeferralProjects.slice(0, 3);
              const projectList = top3.map(p =>
                p.name + ' (' + Math.round((p.stats.strategicDeferred / p.stats.total) * 100) + '% strategic deferrals)'
              ).join(', ');
              insights.push({
                category: 'workload',
                insight: 'Projects with good deferral practices: ' + projectList,
                priority: 'low'
              });
            }
          }

          if (focusAreas.includes('bottlenecks')) {
            if (blockedTasks > 0) {
              insights.push({
                category: 'bottlenecks',
                insight: blockedTasks + ' tasks are blocked, potentially slowing down ' + Math.round(blockedTasks * 1.5) + ' dependent tasks',
                priority: 'high'
              });
            }

            // Find projects with high overdue rates
            const problematicProjects = [];
            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.overdue > 0 && (stats.overdue / stats.total) > 0.3) {
                problematicProjects.push({ name, stats });
              }
            });
            problematicProjects.sort((a, b) =>
              (b.stats.overdue / b.stats.total) - (a.stats.overdue / a.stats.total)
            );

            if (problematicProjects.length > 0) {
              const top3 = problematicProjects.slice(0, 3);
              const projectList = top3.map(p =>
                p.name + ' (' + Math.round((p.stats.overdue / p.stats.total) * 100) + '%)'
              ).join(', ');
              insights.push({
                category: 'bottlenecks',
                insight: 'Projects with high overdue rates: ' + projectList,
                priority: 'high'
              });
            }
          }

          if (focusAreas.includes('project_health')) {
            let healthyProjects = 0;
            let unhealthyProjects = 0;
            let highMomentumProjects = 0;

            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.healthScore >= 80) healthyProjects++;
              if (stats.healthScore < 50) unhealthyProjects++;
              if (stats.momentumScore >= 80) highMomentumProjects++;
            });

            insights.push({
              category: 'project_health',
              insight: 'Workflow health: ' + healthyProjects + ' healthy projects, ' + unhealthyProjects + ' need attention',
              priority: 'medium'
            });

            insights.push({
              category: 'project_health',
              insight: highMomentumProjects + ' projects have high momentum (ready for progress)',
              priority: 'medium'
            });
          }

          if (focusAreas.includes('time_patterns')) {
            let mostOverdueBucket = null;
            let maxCount = 0;

            Object.keys(timeBuckets).forEach(bucket => {
              if (timeBuckets[bucket] > maxCount) {
                maxCount = timeBuckets[bucket];
                mostOverdueBucket = bucket;
              }
            });

            if (mostOverdueBucket && maxCount > 0) {
              insights.push({
                category: 'time_patterns',
                insight: 'Most overdue tasks cluster in: ' + mostOverdueBucket + ' (' + maxCount + ' tasks)',
                priority: 'medium'
              });
            }
          }

          if (focusAreas.includes('opportunities')) {
            if (availableTasks > 0) {
              insights.push({
                category: 'opportunities',
                insight: availableTasks + ' tasks are ready to work on now',
                priority: 'low'
              });
            }

            // Find projects with high momentum
            const momentumProjects = [];
            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.momentumScore >= 75) {
                momentumProjects.push({ name, stats });
              }
            });
            momentumProjects.sort((a, b) => b.stats.momentumScore - a.stats.momentumScore);

            if (momentumProjects.length > 0) {
              const top3 = momentumProjects.slice(0, 3);
              const projectList = top3.map(p =>
                p.name + ' (momentum: ' + Math.round(p.stats.momentumScore) + ')'
              ).join(', ');
              insights.push({
                category: 'opportunities',
                insight: 'High-momentum projects ready for focus: ' + projectList,
                priority: 'low'
              });
            }

            // Find projects that could benefit from attention
            const attentionProjects = [];
            Object.keys(projectStats).forEach(name => {
              const stats = projectStats[name];
              if (stats.momentumScore < 50 && stats.blocked === 0) {
                attentionProjects.push({ name, stats });
              }
            });
            attentionProjects.sort((a, b) => a.stats.momentumScore - b.stats.momentumScore);

            if (attentionProjects.length > 0) {
              const top3 = attentionProjects.slice(0, 3);
              const projectList = top3.map(p =>
                p.name + ' (momentum: ' + Math.round(p.stats.momentumScore) + ')'
              ).join(', ');
              insights.push({
                category: 'opportunities',
                insight: 'Projects that could use attention: ' + projectList,
                priority: 'medium'
              });
            }
          }

          // Generate recommendations focused on workflow health
          if (overdueTasks > totalTasks * 0.15) {
            recommendations.push({
              category: 'workflow_management',
              recommendation: 'High overdue rate suggests workflow bottlenecks - consider reviewing task flow and dependencies',
              priority: 'high'
            });
          }

          if (blockedTasks > 0) {
            recommendations.push({
              category: 'dependency_management',
              recommendation: 'Review blocked tasks to identify and resolve dependencies that slow down your system',
              priority: 'high'
            });
          }

          // Smart deferral recommendations
          if (problematicDeferrals > totalTasks * 0.15) {
            recommendations.push({
              category: 'deferral_optimization',
              recommendation: 'High problematic deferral rate suggests avoidance or overwhelm - review if these tasks are truly necessary or if you need to break them down',
              priority: 'high'
            });
          }

          if (strategicDeferrals > 0 && strategicDeferrals > problematicDeferrals * 2) {
            recommendations.push({
              category: 'deferral_practice',
              recommendation: 'Your strategic deferral practices are excellent! You are using deferrals appropriately for time-based and seasonal tasks',
              priority: 'low'
            });
          }

          if (totalInboxTasks > 50) {
            recommendations.push({
              category: 'inbox_management',
              recommendation: 'Large inbox suggests processing backlog - consider batch processing to clear the way',
              priority: 'medium'
            });
          }

          // Calculate average project health
          let totalHealthScore = 0;
          let projectCount = 0;
          Object.keys(projectStats).forEach(name => {
            totalHealthScore += projectStats[name].healthScore;
            projectCount++;
          });
          const avgProjectHealth = projectCount > 0 ? totalHealthScore / projectCount : 0;

          if (avgProjectHealth < 70) {
            recommendations.push({
              category: 'workflow_optimization',
              recommendation: 'Overall workflow health is low - consider reviewing project portfolio and task flow',
              priority: 'medium'
            });
          }

          // Calculate average momentum
          let totalMomentum = 0;
          Object.keys(projectStats).forEach(name => {
            totalMomentum += projectStats[name].momentumScore;
          });
          const avgMomentum = projectCount > 0 ? totalMomentum / projectCount : 0;

          if (avgMomentum < 60) {
            recommendations.push({
              category: 'momentum_building',
              recommendation: 'Low project momentum suggests focus issues - consider concentrating on fewer, high-impact projects',
              priority: 'medium'
            });
          }

          // Limit insights to requested maximum
          if (insights.length > maxInsights) {
            insights.splice(maxInsights);
          }
          // Cap recommendations at 10
          if (recommendations.length > 10) {
            recommendations.splice(10);
          }

          // Build patterns object focused on workflow health
          const workloadByProject = {};
          Object.keys(projectStats).forEach(name => {
            const stats = projectStats[name];
            workloadByProject[name] = {
              totalTasks: stats.total,
              estimatedHours: Math.round(stats.estimatedTime / 60),
              availableRate: stats.availableRate,
              momentumScore: stats.momentumScore,
              healthScore: stats.healthScore
            };
          });

          patterns.workloadDistribution = {
            byProject: workloadByProject,
            byTag: workloadByTag,
            timeBuckets: timeBuckets
          };

          patterns.workflowMetrics = {
            availablePercentage: totalTasks > 0 ? (availableTasks / totalTasks * 100).toFixed(1) : 0,
            overduePercentage: totalTasks > 0 ? (overdueTasks / totalTasks * 100).toFixed(1) : 0,
            flaggedPercentage: totalTasks > 0 ? (flaggedTasks / totalTasks * 100).toFixed(1) : 0,
            blockedPercentage: totalTasks > 0 ? (blockedTasks / totalTasks * 100).toFixed(1) : 0,
            deferredPercentage: totalTasks > 0 ? (totalDeferredTasks / totalTasks * 100).toFixed(1) : 0,
            strategicDeferredPercentage: totalTasks > 0 ? (strategicDeferrals / totalTasks * 100).toFixed(1) : 0,
            problematicDeferredPercentage: totalTasks > 0 ? (problematicDeferrals / totalTasks * 100).toFixed(1) : 0,
            inboxPercentage: totalTasks > 0 ? (totalInboxTasks / totalTasks * 100).toFixed(1) : 0
          };

          // Add deferral pattern analysis
          patterns.deferralAnalysis = {
            totalDeferred: totalDeferredTasks,
            strategicDeferrals: strategicDeferrals,
            problematicDeferrals: problematicDeferrals,
            strategicRate: totalTasks > 0 ? (strategicDeferrals / totalTasks * 100).toFixed(1) : 0,
            problematicRate: totalTasks > 0 ? (problematicDeferrals / totalTasks * 100).toFixed(1) : 0,
            deferralDetails: deferredTaskDetails.slice(0, 10) // Top 10 for analysis
          };

          return JSON.stringify({
            insights: insights,
            patterns: patterns,
            recommendations: recommendations,
            data: includeRawData ? data : undefined,
            totalTasks: totalTasks,
            totalProjects: totalProjects,
            dataPoints: maxTasksToProcess,
            metadata: {
              analysisDepth: analysisDepth,
              focusAreas: focusAreas,
              maxInsights: maxInsights
            }
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(analysisScript);
      const analysis = JSON.parse(resultJson);

      const endTime = Date.now();
      const analysisTime = endTime - startTime;

      // Return v3 format matching original script structure
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          insights: analysis.insights,
          patterns: analysis.patterns,
          recommendations: analysis.recommendations,
          data: analysis.data,
          totalTasks: analysis.totalTasks,
          totalProjects: analysis.totalProjects,
          analysisTime: analysisTime,
          dataPoints: analysis.dataPoints,
          metadata: {
            ...analysis.metadata,
            method: 'omnijs_v3_single_bridge',
            optimization: 'omnijs_v3',
            query_time_ms: analysisTime,
            note: 'All analysis calculated in single OmniJS bridge call for maximum performance'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to analyze workflow: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
