import { getUnifiedHelpers } from '../shared/helpers.js';

/**
 * Script to analyze and summarize recurring task patterns in OmniFocus
 *
 * OPTIMIZED FOR SIZE: Uses minimal helpers to stay under 19KB limit
 * Features:
 * - Pattern detection and grouping
 * - Frequency distribution analysis
 * - Project-based pattern breakdown
 * - Gaming-specific pattern recognition
 * - Most common pattern identification
 */
export const GET_RECURRING_PATTERNS_SCRIPT = `
  ${getUnifiedHelpers()}
  
  
  (() => {
  const options = {{options}};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    const patterns = {};
    const projectPatterns = {};
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    let totalRecurring = 0;
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      const repetitionRule = task.repetitionRule();
      if (!repetitionRule) continue;
      
      // Apply filtering logic with granular control
      try {
        const isCompleted = task.completed();
        const isDropped = task.dropped();
        
        // Skip completed tasks unless includeCompleted is true
        if (isCompleted && !options.includeCompleted) continue;
        
        // Skip dropped tasks unless includeDropped is true  
        if (isDropped && !options.includeDropped) continue;
        
        // If activeOnly is true and neither includeCompleted nor includeDropped override, skip non-active tasks
        if (options.activeOnly && !options.includeCompleted && !options.includeDropped && (isCompleted || isDropped)) continue;
      } catch (e) {}
      
      totalRecurring++;
      
      // Extract repetition rule properties using same approach as main script
      const ruleData = {};
      
      // Try official OmniFocus API properties first
      const officialProperties = ['method', 'ruleString', 'anchorDateKey', 'catchUpAutomatically', 'scheduleType'];
      
      officialProperties.forEach(prop => {
        try {
          const value = repetitionRule[prop];
          if (value !== undefined && value !== null && value !== '') {
            ruleData[prop] = value;
          }
        } catch (e) {}
      });
      
      // Parse ruleString (RRULE format) to extract frequency details
      if (ruleData.ruleString) {
        try {
          const ruleStr = ruleData.ruleString.toString();
          
          if (ruleStr.includes('FREQ=HOURLY')) {
            ruleData.unit = 'hours';
            ruleData.steps = 1;
          } else if (ruleStr.includes('FREQ=DAILY')) {
            ruleData.unit = 'days';
            ruleData.steps = 1;
          } else if (ruleStr.includes('FREQ=WEEKLY')) {
            ruleData.unit = 'weeks';
            ruleData.steps = 1;
          } else if (ruleStr.includes('FREQ=MONTHLY')) {
            ruleData.unit = 'months';
            ruleData.steps = 1;
          } else if (ruleStr.includes('FREQ=YEARLY')) {
            ruleData.unit = 'years';
            ruleData.steps = 1;
          }
          
          const intervalMatch = ruleStr.match(/INTERVAL=(\\d+)/);
          if (intervalMatch) {
            ruleData.steps = parseInt(intervalMatch[1]);
          }
        } catch (e) {}
      }
      
      // Fallback pattern inference if API doesn't work
      if (!ruleData.unit || !ruleData.steps) {
        const taskName = task.name().toLowerCase();
        
        // Gaming hourly patterns first
        if (taskName.includes('energy available') || taskName.includes('mines should be harvested') || 
            taskName.includes('hourly') || taskName.includes('every hour')) {
          ruleData.unit = 'hours';
          ruleData.steps = 1;
        } else if (taskName.includes('daily') || taskName.includes('every day')) {
          ruleData.unit = 'days';
          ruleData.steps = 1;
        } else if (taskName.includes('weekly') || taskName.includes('every week') || 
                  taskName.includes('helpdesk tickets') || taskName.includes('review recent activity')) {
          ruleData.unit = 'weeks';
          ruleData.steps = 1;
        } else if (taskName.includes('monthly') || taskName.includes('of each month') || taskName.includes('of the month')) {
          ruleData.unit = 'months';
          ruleData.steps = 1;
        } else if (taskName.includes('yearly') || taskName.includes('annually') || 
                  taskName.includes('domain renewal') || taskName.includes('.com') || taskName.includes('.org')) {
          ruleData.unit = 'years';
          ruleData.steps = 1;
        } else if (taskName.includes('quarterly')) {
          ruleData.unit = 'months';
          ruleData.steps = 3;
        } else if (taskName.includes('biweekly')) {
          ruleData.unit = 'weeks';
          ruleData.steps = 2;
        } else {
          // Check for number patterns
          const weekMatch = taskName.match(/every (\\d+) weeks?/);
          const monthMatch = taskName.match(/every (\\d+) months?/);
          const dayMatch = taskName.match(/every (\\d+) days?/);
          
          if (weekMatch) {
            ruleData.unit = 'weeks';
            ruleData.steps = parseInt(weekMatch[1]);
          } else if (monthMatch) {
            ruleData.unit = 'months';
            ruleData.steps = parseInt(monthMatch[1]);
          } else if (dayMatch) {
            ruleData.unit = 'days';
            ruleData.steps = parseInt(dayMatch[1]);
          } else if (taskName.includes('payment') || taskName.includes('bill') || taskName.includes('subscription')) {
            ruleData.unit = 'months';
            ruleData.steps = 1;
          }
        }
        
        // Enhanced gaming-specific pattern detection if still no pattern
        if (!ruleData.unit || !ruleData.steps) {
          try {
            const project = task.containingProject();
            if (project) {
              const projectName = project.name().toLowerCase();
              if (projectName.includes('troops') || projectName.includes('blitz') || 
                  projectName.includes('titans') || projectName.includes('game')) {
                // Gaming projects - analyze due dates for patterns
                const dueDate = task.dueDate();
                const deferDate = task.deferDate();
                
                if (dueDate && deferDate) {
                  const hoursDiff = Math.abs(dueDate - deferDate) / (1000 * 60 * 60);
                  // Gaming task patterns (2-12 hour intervals)
                  if (hoursDiff >= 2 && hoursDiff <= 12 && hoursDiff % 1 === 0) {
                    ruleData.unit = 'hours';
                    ruleData.steps = Math.round(hoursDiff);
                  }
                } else if (dueDate) {
                  // Gaming projects - look for common gaming intervals
                  const dueHour = dueDate.getHours();
                  // Common gaming reset times suggest specific intervals
                  if (dueHour === 0 || dueHour === 6 || dueHour === 12 || dueHour === 18) {
                    ruleData.unit = 'hours';
                    ruleData.steps = 6;
                  } else if (dueHour === 8 || dueHour === 16) {
                    ruleData.unit = 'hours';
                    ruleData.steps = 8;
                  } else {
                    ruleData.unit = 'hours';
                    ruleData.steps = 4;
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
      
      // Create pattern key
      const patternKey = (ruleData.unit || 'unknown') + '_' + (ruleData.steps || 'unknown');
      if (!patterns[patternKey]) {
        patterns[patternKey] = {
          unit: ruleData.unit || 'unknown',
          steps: ruleData.steps || 'unknown',
          count: 0,
          tasks: []
        };
      }
      
      patterns[patternKey].count++;
      if (patterns[patternKey].tasks.length < 5) { // Limit examples
        patterns[patternKey].tasks.push(task.name());
      }
      
      // Track by project
      try {
        const project = task.containingProject();
        if (project) {
          const projectName = project.name();
          if (!projectPatterns[projectName]) {
            projectPatterns[projectName] = {
              total: 0,
              patterns: {}
            };
          }
          projectPatterns[projectName].total++;
          if (!projectPatterns[projectName].patterns[patternKey]) {
            projectPatterns[projectName].patterns[patternKey] = 0;
          }
          projectPatterns[projectName].patterns[patternKey]++;
        }
      } catch (e) {}
    }
    
    // Convert patterns to array and sort by count
    const patternArray = Object.entries(patterns).map(([key, data]) => ({
      pattern: key,
      unit: data.unit,
      steps: data.steps,
      count: data.count,
      percentage: Math.round((data.count / totalRecurring) * 100),
      examples: data.tasks
    }));
    
    patternArray.sort((a, b) => b.count - a.count);
    
    // Convert project patterns to array
    const projectArray = Object.entries(projectPatterns)
      .map(([name, data]) => ({
        project: name,
        recurringCount: data.total,
        patterns: Object.entries(data.patterns).map(([pattern, count]) => ({
          pattern: pattern,
          count: count
        }))
      }))
      .sort((a, b) => b.recurringCount - a.recurringCount);
    
    return JSON.stringify({
      totalRecurring: totalRecurring,
      patterns: patternArray,
      byProject: projectArray,
      mostCommon: patternArray.length > 0 ? patternArray[0] : null
    });
  } catch (error) {
    return formatError(error, 'get_recurring_patterns');
  }
  })();
`;
