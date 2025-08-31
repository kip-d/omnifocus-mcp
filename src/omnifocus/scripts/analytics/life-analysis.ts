import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script for deep life analysis across the complete OmniFocus dataset
 * 
 * Features:
 * - Cross-project pattern analysis
 * - Workload distribution analysis
 * - Time pattern discovery
 * - Bottleneck identification
 * - Productivity insights
 * - Project health assessment
 */
export const LIFE_ANALYSIS_SCRIPT = `
  ${getAllHelpers()}
  
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
      
      // Analysis counters
      let completedTasks = 0;
      let overdueTasks = 0;
      let flaggedTasks = 0;
      let blockedTasks = 0;
      let availableTasks = 0;
      let totalEstimatedTime = 0;
      let totalOverdueDays = 0;
      
      // Project analysis
      const projectStats = {};
      const projectTaskCounts = {};
      const projectCompletionRates = {};
      
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
      
      for (let i = 0; i < maxTasksToProcess; i++) {
        const task = allTasks[i];
        
        try {
          const completed = safeIsCompleted(task);
          const flagged = safeIsFlagged(task);
          const blocked = safeGet(() => task.blocked(), false);
          const next = safeGet(() => task.next(), false);
          const overdueDays = getOverdueDays(task);
          const taskAge = getTaskAge(task);
          const estimatedMinutes = safeGetEstimatedMinutes(task) || 0;
          
          // Update counters
          if (completed) completedTasks++;
          if (overdueDays > 0) {
            overdueTasks++;
            totalOverdueDays += overdueDays;
          }
          if (flagged) flaggedTasks++;
          if (blocked) blockedTasks++;
          if (!completed && !blocked && next) availableTasks++;
          
          totalEstimatedTime += estimatedMinutes;
          
          // Time bucket analysis
          if (overdueDays <= 1) timeBuckets['0-1 days']++;
          else if (overdueDays <= 3) timeBuckets['1-3 days']++;
          else if (overdueDays <= 7) timeBuckets['3-7 days']++;
          else if (overdueDays <= 14) timeBuckets['1-2 weeks']++;
          else if (overdueDays <= 28) timeBuckets['2-4 weeks']++;
          else if (overdueDays <= 90) timeBuckets['1-3 months']++;
          else timeBuckets['3+ months']++;
          
          // Project analysis
          const project = safeGetProject(task);
          if (project) {
            const projectName = project.name || 'No Project';
            const projectId = project.id || 'unknown';
            
            if (!projectStats[projectName]) {
              projectStats[projectName] = {
                total: 0,
                completed: 0,
                overdue: 0,
                flagged: 0,
                blocked: 0,
                estimatedTime: 0,
                avgAge: 0,
                totalAge: 0
              };
            }
            
            projectStats[projectName].total++;
            if (completed) projectStats[projectName].completed++;
            if (overdueDays > 0) projectStats[projectName].overdue++;
            if (flagged) projectStats[projectName].flagged++;
            if (blocked) projectStats[projectName].blocked++;
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
      
      // Calculate project completion rates and health scores
      Object.keys(projectStats).forEach(projectName => {
        const stats = projectStats[projectName];
        const completionRate = stats.total > 0 ? (stats.completed / stats.total * 100).toFixed(1) : 0;
        const avgAge = stats.total > 0 ? Math.round(stats.totalAge / stats.total) : 0;
        
        projectCompletionRates[projectName] = parseFloat(completionRate);
        projectStats[projectName].avgAge = avgAge;
        
        // Project health scoring
        let healthScore = 100;
        if (stats.overdue > 0) healthScore -= (stats.overdue / stats.total) * 30;
        if (stats.blocked > 0) healthScore -= (stats.blocked / stats.total) * 20;
        if (avgAge > 90) healthScore -= 20;
        if (completionRate < 50) healthScore -= 15;
        
        projectStats[projectName].healthScore = Math.max(0, healthScore);
      });
      
      // Generate insights based on focus areas
      if (options.focusAreas.includes('productivity')) {
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;
        insights.push({
          category: 'productivity',
          insight: \`Overall completion rate: \${completionRate}% (\${completedTasks} of \${totalTasks} tasks)\`,
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
      }
      
      if (options.focusAreas.includes('workload')) {
        const totalHours = Math.round(totalEstimatedTime / 60);
        insights.push({
          category: 'workload',
          insight: \`Total estimated workload: \${totalHours} hours across \${totalProjects} projects\`,
          priority: 'medium'
        });
        
        // Find most overloaded projects
        const overloadedProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.estimatedTime > 480) // More than 8 hours
          .sort((a, b) => b[1].estimatedTime - a[1].estimatedTime)
          .slice(0, 3);
        
        if (overloadedProjects.length > 0) {
          insights.push({
            category: 'workload',
            insight: \`Most time-intensive projects: \${overloadedProjects.map(([name, stats]) => \`\${name} (\${Math.round(stats.estimatedTime / 60)}h)\`).join(', ')}\`,
            priority: 'medium'
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
        
        insights.push({
          category: 'project_health',
          insight: \`Project health: \${healthyProjects} healthy projects, \${unhealthyProjects} need attention\`,
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
        
        // Find projects with high completion rates
        const successfulProjects = Object.entries(projectStats)
          .filter(([_, stats]) => stats.completionRate >= 80)
          .sort((a, b) => b[1].completionRate - a[1].completionRate)
          .slice(0, 3);
        
        if (successfulProjects.length > 0) {
          insights.push({
            category: 'opportunities',
            insight: \`High-performing projects: \${successfulProjects.map(([name, stats]) => \`\${name} (\${stats.completionRate}%)\`).join(', ')}\`,
            priority: 'low'
          });
        }
      }
      
      // Generate recommendations
      if (overdueTasks > totalTasks * 0.2) {
        recommendations.push({
          category: 'overdue_management',
          recommendation: 'Consider batch processing overdue tasks or rescheduling them to reduce backlog',
          priority: 'high'
        });
      }
      
      if (blockedTasks > 0) {
        recommendations.push({
          category: 'dependency_management',
          recommendation: 'Review blocked tasks to identify and resolve dependencies',
          priority: 'high'
        });
      }
      
      const avgProjectHealth = Object.values(projectStats).reduce((sum, stats) => sum + stats.healthScore, 0) / Object.keys(projectStats).length;
      if (avgProjectHealth < 70) {
        recommendations.push({
          category: 'project_management',
          recommendation: 'Overall project health is low - consider project portfolio review',
          priority: 'medium'
        });
      }
      
      // Limit insights to requested maximum
      insights.splice(options.maxInsights);
      recommendations.splice(10); // Cap recommendations at 10
      
      // Build patterns object
      patterns.workloadDistribution = {
        byProject: Object.fromEntries(
          Object.entries(projectStats).map(([name, stats]) => [name, {
            totalTasks: stats.total,
            estimatedHours: Math.round(stats.estimatedTime / 60),
            completionRate: projectCompletionRates[name],
            healthScore: stats.healthScore
          }])
        ),
        byTag: workloadByTag,
        timeBuckets: timeBuckets
      };
      
      patterns.productivityMetrics = {
        overallCompletionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0,
        overduePercentage: totalTasks > 0 ? (overdueTasks / totalTasks * 100).toFixed(1) : 0,
        flaggedPercentage: totalTasks > 0 ? (flaggedTasks / totalTasks * 100).toFixed(1) : 0,
        blockedPercentage: totalTasks > 0 ? (blockedTasks / totalTasks * 0) : 0,
        availablePercentage: totalTasks > 0 ? (availableTasks / totalTasks * 100).toFixed(1) : 0
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
      return formatError(error, 'life_analysis');
    }
  })();
`;
