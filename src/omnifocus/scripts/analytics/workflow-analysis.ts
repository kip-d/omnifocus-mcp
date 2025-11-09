import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script for deep workflow analysis across the complete OmniFocus dataset
 *
 * Features:
 * - Cross-project pattern analysis
 * - Workload distribution analysis
 * - Time pattern discovery
 * - Bottleneck identification
 * - Productivity insights
 * - Project health assessment
 */
export const WORKFLOW_ANALYSIS_SCRIPT = `
  ${getUnifiedHelpers()}
  
  (() => {
    const options = {{options}};
    
    // Helper to check if task is completed
    function safeIsCompleted(task) {
      try {
        return task.completed() === true;
      } catch (e) {
        return false;
      }
    }
    
    // Helper to check if task is flagged
    function safeIsFlagged(task) {
      try {
        return task.flagged() === true;
      } catch (e) {
        return false;
      }
    }
    
    // Helper to get task age in days
    function getTaskAge(task) {
      try {
        const created = safeGetDate(() => task.creationDate()) || safeGetDate(() => task.modificationDate());
        if (created) {
          return Math.floor((new Date() - new Date(created)) / (1000 * 60 * 60 * 24));
        }
      } catch (e) {}
      return 0;
    }
    
    // Helper to get overdue days
    function getOverdueDays(task) {
      try {
        const dueDate = safeGetDate(() => task.dueDate());
        if (dueDate && !safeIsCompleted(task)) {
          const overdue = new Date() - new Date(dueDate);
          return overdue > 0 ? Math.floor(overdue / (1000 * 60 * 60 * 24)) : 0;
        }
      } catch (e) {}
      return 0;
    }
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const startTime = Date.now();
      
      // Get all data
      const allTasks = doc.flattenedTasks();
      const allProjects = doc.flattenedProjects();
      
      if (!allTasks || !allProjects) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve data from OmniFocus",
          details: "Document may not be available"
        });
      }
      
      const totalTasks = allTasks.length;
      const totalProjects = allProjects.length;
      
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
      let deferredTaskDetails = [];
      
      // Project analysis - focus on momentum and health
      const projectStats = {};
      const projectMomentum = {};
      const projectHealth = {};
      
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
      const workloadByProject = {};
      const workloadByTag = {};
      
      // Process tasks for analysis
      const maxTasksToProcess = options.analysisDepth === 'deep' ? allTasks.length : Math.min(1000, allTasks.length);
      
      // CRITICAL FIX: First, get accurate project statistics using OmniFocus's own counts
      // This ensures we have accurate available rates for all projects
      const projectAccurateStats = {};
      
      for (let i = 0; i < allProjects.length; i++) {
        const project = allProjects[i];
        try {
          const projectName = safeGet(() => project.name(), 'Unnamed Project');
          const rootTask = safeGet(() => project.rootTask());
          
          if (rootTask) {
            // Use OmniFocus's own accurate counts - this fixes the "Pending Purchase Orders" issue
            const totalTasks = safeGet(() => rootTask.numberOfTasks(), 0);
            const availableTasks = safeGet(() => rootTask.numberOfAvailableTasks(), 0);
            const completedTasks = safeGet(() => rootTask.numberOfCompletedTasks(), 0);
            
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
          continue;
        }
      }
      
      for (let i = 0; i < maxTasksToProcess; i++) {
        const task = allTasks[i];
        
        try {
          const completed = safeIsCompleted(task);
          const flagged = safeIsFlagged(task);
          // Check if these methods exist in this OmniFocus version
          const blocked = (typeof task.blocked === 'function') ? safeGet(() => task.blocked(), false) : false;
          const next = (typeof task.next === 'function') ? safeGet(() => task.next(), false) : false;
          const overdueDays = getOverdueDays(task);
          const taskAge = getTaskAge(task);
          const estimatedMinutes = safeGetEstimatedMinutes(task) || 0;
          const inInbox = safeGet(() => task.inInbox(), false);
          const deferDate = safeGetDate(() => task.deferDate());
          
          // CRITICAL FIX: Skip project tasks (tasks that represent projects themselves)
          // Project tasks have childCounts and should not be counted in task-level analysis
          const hasChildren = safeGet(() => task.numberOfTasks(), 0) > 0;
          if (hasChildren) {
            // This is a project task, skip it for task-level analysis
            continue;
          }
          
          // Update counters - focus on workflow health
          if (overdueDays > 0) {
            overdueTasks++;
            totalOverdueDays += overdueDays;
          }
          if (flagged) flaggedTasks++;
          if (blocked) blockedTasks++;
          if (!completed && !blocked && next) availableTasks++;
          
          // Get project info once for this task
          const project = safeGetProject(task);
          
          // Smart deferral analysis
          if (deferDate && new Date(deferDate) > new Date()) {
            totalDeferredTasks++;
            
            // Analyze if this is a strategic deferral or problematic
            const deferDays = Math.floor((new Date(deferDate) - new Date()) / (1000 * 60 * 60 * 24));
            const taskName = safeGet(() => task.name(), 'Unnamed Task');
            
            // Strategic deferrals: time-based, seasonal, or dependency-based
            const isStrategic = deferDays <= 90 || // Within 3 months (reasonable planning horizon)
                               taskName.toLowerCase().includes('renewal') ||
                               taskName.toLowerCase().includes('movie') ||
                               taskName.toLowerCase().includes('annual') ||
                               taskName.toLowerCase().includes('seasonal') ||
                               taskName.toLowerCase().includes('quarterly') ||
                               taskName.toLowerCase().includes('monthly');
            
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
              project: project ? project.name : null
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
          if (project) {
            const projectName = project.name || 'No Project';
            const projectId = project.id || 'unknown';
            
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
            if (!completed && !blocked && next) projectStats[projectName].available++;
            
            // Track deferrals by type
            if (deferDate && new Date(deferDate) > new Date()) {
              projectStats[projectName].deferred++;
              
              const deferDays = Math.floor((new Date(deferDate) - new Date()) / (1000 * 60 * 60 * 24));
              const taskName = safeGet(() => task.name(), 'Unnamed Task');
              const isStrategic = deferDays <= 90 || 
                                 taskName.toLowerCase().includes('renewal') ||
                                 taskName.toLowerCase().includes('movie') ||
                                 taskName.toLowerCase().includes('annual') ||
                                 taskName.toLowerCase().includes('seasonal') ||
                                 taskName.toLowerCase().includes('quarterly') ||
                                 taskName.toLowerCase().includes('monthly');
              
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
          const tags = safeGetTags(task);
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
          if (options.includeRawData) {
            data.tasks.push({
              id: safeGet(() => task.id(), 'unknown'),
              name: safeGet(() => task.name(), 'Unnamed Task'),
              completed,
              flagged,
              blocked,
              next,
              overdueDays,
              taskAge,
              estimatedMinutes,
              project: project ? project.name : null,
              tags,
              dueDate: safeGetDate(() => task.dueDate()),
              deferDate: safeGetDate(() => task.deferDate())
            });
          }
          
        } catch (e) {
          // Skip tasks that cause errors
          continue;
        }
      }
      
      // CRITICAL FIX: Now merge the accurate OmniFocus counts with our task-level stats
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
      
      // Calculate project momentum and workflow health scores
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
        
        projectStats[projectName].avgAge = avgAge;
        projectStats[projectName].availableRate = parseFloat(availableRate);
        projectStats[projectName].overdueRate = parseFloat(overdueRate);
        
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
        
        projectStats[projectName].healthScore = Math.max(0, healthScore);
        
        // Calculate momentum (how much forward progress is possible)
        const momentumScore = Math.max(0, 100 - (overdueRate * 0.5) - (parseFloat(availableRate) * 0.3));
        projectStats[projectName].momentumScore = momentumScore;
      });
      
      // Generate insights based on focus areas
      if (options.focusAreas.includes('productivity')) {
        const availableRate = totalTasks > 0 ? (availableTasks / totalTasks * 100).toFixed(1) : 0;
        insights.push({
          category: 'productivity',
          insight: \`\${availableRate}% of tasks are ready to work on (\${availableTasks} of \${totalTasks} tasks)\`,
          priority: 'medium'
        });
        
        if (overdueTasks > 0) {
          const avgOverdue = Math.round(totalOverdueDays / overdueTasks);
          insights.push({
            category: 'productivity',
            insight: \`\${overdueTasks} tasks are overdue, averaging \${avgOverdue} days late\`,
            priority: 'high'
          });
        }
        
        if (totalDeferredTasks > 0) {
          const deferredRate = totalTasks > 0 ? (totalDeferredTasks / totalTasks * 100).toFixed(1) : 0;
          const strategicRate = totalTasks > 0 ? (strategicDeferrals / totalTasks * 100).toFixed(1) : 0;
          const problematicRate = totalTasks > 0 ? (problematicDeferrals / totalTasks * 100).toFixed(1) : 0;
          
          insights.push({
            category: 'productivity',
            insight: \`\${deferredRate}% of tasks are deferred (\${totalDeferredTasks} total)\`,
            priority: 'medium'
          });
          
          if (strategicDeferrals > 0) {
            insights.push({
              category: 'productivity',
              insight: \`\${strategicRate}% are strategic deferrals (\${strategicDeferrals} tasks) - Good GTD practice!\`,
              priority: 'low'
            });
          }
          
          if (problematicDeferrals > 0) {
            insights.push({
              category: 'productivity',
              insight: \`\${problematicRate}% are problematic deferrals (\${problematicDeferrals} tasks) - May need attention\`,
              priority: 'medium'
            });
          }
        }
      }
      
      if (options.focusAreas.includes('workload')) {
        const totalHours = Math.round(totalEstimatedTime / 60);
        insights.push({
          category: 'workload',
          insight: \`Total estimated workload: \${totalHours} hours across \${totalProjects} projects\`,
          priority: 'medium'
        });
        
        // Find projects with high momentum (many available tasks)
        const highMomentumProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.available > 0 && (stats.available / stats.total) > 0.3)
          .sort((a, b) => (b[1].available / b[1].total) - (a[1].available / a[1].total))
          .slice(0, 3);
        
        if (highMomentumProjects.length > 0) {
          insights.push({
            category: 'workload',
            insight: \`High-momentum projects: \${highMomentumProjects.map(([name, stats]) => \`\${name} (\${stats.available} available tasks)\`).join(', ')}\`,
            priority: 'medium'
          });
        }
        
        // Find projects with problematic deferral patterns (not strategic)
        const problematicDeferralProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.problematicDeferred > 0 && (stats.problematicDeferred / stats.total) > 0.3)
          .sort((a, b) => (b[1].problematicDeferred / b[1].total) - (a[1].problematicDeferred / b[1].total))
          .slice(0, 3);
        
        if (problematicDeferralProjects.length > 0) {
          insights.push({
            category: 'workload',
            insight: \`Projects with high problematic deferral rates: \${problematicDeferralProjects.map(([name, stats]) => \`\${name} (\${Math.round((stats.problematicDeferred / stats.total) * 100)}% problematic deferrals)\`).join(', ')}\`,
            priority: 'high'
          });
        }
        
        // Celebrate projects with good strategic deferral practices
        const strategicDeferralProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.strategicDeferred > 0 && stats.problematicDeferred === 0)
          .sort((a, b) => (b[1].strategicDeferred / b[1].total) - (a[1].strategicDeferred / a[1].total))
          .slice(0, 3);
        
        if (strategicDeferralProjects.length > 0) {
          insights.push({
            category: 'workload',
            insight: \`Projects with good deferral practices: \${strategicDeferralProjects.map(([name, stats]) => \`\${name} (\${Math.round((stats.strategicDeferred / stats.total) * 100)}% strategic deferrals)\`).join(', ')}\`,
            priority: 'low'
          });
        }
      }
      
      if (options.focusAreas.includes('bottlenecks')) {
        if (blockedTasks > 0) {
          insights.push({
            category: 'bottlenecks',
            insight: \`\${blockedTasks} tasks are blocked, potentially slowing down \${Math.round(blockedTasks * 1.5)} dependent tasks\`,
            priority: 'high'
          });
        }
        
        // Find projects with high overdue rates
        const problematicProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.overdue > 0 && (stats.overdue / stats.total) > 0.3)
          .sort((a, b) => (b[1].overdue / b[1].total) - (a[1].overdue / a[1].total));
        
        if (problematicProjects.length > 0) {
          insights.push({
            category: 'bottlenecks',
            insight: \`Projects with high overdue rates: \${problematicProjects.slice(0, 3).map(([name, stats]) => \`\${name} (\${Math.round((stats.overdue / stats.total) * 100)}%)\`).join(', ')}\`,
            priority: 'high'
          });
        }
      }
      
      if (options.focusAreas.includes('project_health')) {
        const healthyProjects = Object.values(projectStats).filter(stats => stats.healthScore >= 80).length;
        const unhealthyProjects = Object.values(projectStats).filter(stats => stats.healthScore < 50).length;
        const highMomentumProjects = Object.values(projectStats).filter(stats => stats.momentumScore >= 80).length;
        
        insights.push({
          category: 'project_health',
          insight: \`Workflow health: \${healthyProjects} healthy projects, \${unhealthyProjects} need attention\`,
          priority: 'medium'
        });
        
        insights.push({
          category: 'project_health',
          insight: \`\${highMomentumProjects} projects have high momentum (ready for progress)\`,
          priority: 'medium'
        });
      }
      
      if (options.focusAreas.includes('time_patterns')) {
        const mostOverdueBucket = Object.entries(timeBuckets)
          .sort((a, b) => b[1] - a[1])[0];
        
        if (mostOverdueBucket && mostOverdueBucket[1] > 0) {
          insights.push({
            category: 'time_patterns',
            insight: \`Most overdue tasks cluster in: \${mostOverdueBucket[0]} (\${mostOverdueBucket[1]} tasks)\`,
            priority: 'medium'
          });
        }
      }
      
      if (options.focusAreas.includes('opportunities')) {
        if (availableTasks > 0) {
          insights.push({
            category: 'opportunities',
            insight: \`\${availableTasks} tasks are ready to work on now\`,
            priority: 'low'
          });
        }
        
        // Find projects with high momentum (many available tasks)
        const momentumProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.momentumScore >= 75)
          .sort((a, b) => b[1].momentumScore - a[1].momentumScore)
          .slice(0, 3);
        
        if (momentumProjects.length > 0) {
          insights.push({
            category: 'opportunities',
            insight: \`High-momentum projects ready for focus: \${momentumProjects.map(([name, stats]) => \`\${name} (momentum: \${Math.round(stats.momentumScore)})\`).join(', ')}\`,
            priority: 'low'
          });
        }
        
        // Find projects that could benefit from attention (low momentum but not blocked)
        const attentionProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.momentumScore < 50 && stats.blocked === 0)
          .sort((a, b) => a[1].momentumScore - b[1].momentumScore)
          .slice(0, 3);
        
        if (attentionProjects.length > 0) {
          insights.push({
            category: 'opportunities',
            insight: \`Projects that could use attention: \${attentionProjects.map(([name, stats]) => \`\${name} (momentum: \${Math.round(stats.momentumScore)})\`).join(', ')}\`,
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
      
      const avgProjectHealth = Object.values(projectStats).reduce((sum, stats) => sum + stats.healthScore, 0) / Object.keys(projectStats).length;
      if (avgProjectHealth < 70) {
        recommendations.push({
          category: 'workflow_optimization',
          recommendation: 'Overall workflow health is low - consider reviewing project portfolio and task flow',
          priority: 'medium'
        });
      }
      
      const avgMomentum = Object.values(projectStats).reduce((sum, stats) => sum + stats.momentumScore, 0) / Object.keys(projectStats).length;
      if (avgMomentum < 60) {
        recommendations.push({
          category: 'momentum_building',
          recommendation: 'Low project momentum suggests focus issues - consider concentrating on fewer, high-impact projects',
          priority: 'medium'
        });
      }
      
      // Limit insights to requested maximum
      insights.splice(options.maxInsights);
      recommendations.splice(10); // Cap recommendations at 10
      
      // Build patterns object focused on workflow health
      patterns.workloadDistribution = {
        byProject: Object.fromEntries(
          Object.entries(projectStats).map(([name, stats]) => [name, {
            totalTasks: stats.total,
            estimatedHours: Math.round(stats.estimatedTime / 60),
            availableRate: stats.availableRate,
            momentumScore: stats.momentumScore,
            healthScore: stats.healthScore
          }])
        ),
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
      
      const endTime = Date.now();
      const analysisTime = endTime - startTime;
      
      return JSON.stringify({
        insights,
        patterns,
        recommendations,
        data: options.includeRawData ? data : undefined,
        totalTasks,
        totalProjects,
        analysisTime,
        dataPoints: maxTasksToProcess,
        metadata: {
          analysisDepth: options.analysisDepth,
          focusAreas: options.focusAreas,
          maxInsights: options.maxInsights
        }
      });
      
    } catch (error) {
      return formatError(error, 'workflow_analysis');
    }
  })();
`;
