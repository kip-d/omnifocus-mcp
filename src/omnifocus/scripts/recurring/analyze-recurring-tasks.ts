import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to analyze recurring tasks in OmniFocus
 * 
 * Features:
 * - Detects recurring patterns from repetition rules
 * - Smart inference from task names and project context
 * - Gaming-specific pattern detection
 * - Overdue tracking and next occurrence calculation
 * - Frequency summarization
 */
export const ANALYZE_RECURRING_TASKS_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
  const options = {{options}};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    
    const recurringTasks = [];
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    const now = new Date();
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Check if task has repetition rule
      const repetitionRule = task.repetitionRule();
      if (!repetitionRule) continue;
      
      // Apply filtering logic with granular control
      const isCompleted = task.completed();
      const isDropped = task.dropped();
      
      // Skip completed tasks unless includeCompleted is true
      if (isCompleted && !options.includeCompleted) continue;
      
      // Skip dropped tasks unless includeDropped is true  
      if (isDropped && !options.includeDropped) continue;
      
      // If activeOnly is true and neither includeCompleted nor includeDropped override, skip non-active tasks
      if (options.activeOnly && !options.includeCompleted && !options.includeDropped && (isCompleted || isDropped)) continue;
      
      const taskInfo = {
        id: task.id(),
        name: task.name(),
        repetitionRule: {}
      };
      
      // Extract repetition rule properties using official OmniFocus API
      const ruleData = {};
      
      // Try official OmniFocus API properties first
      const officialProperties = [
        'method', 'ruleString', 'anchorDateKey', 'catchUpAutomatically', 'scheduleType'
      ];
      
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
          
          // Parse FREQ= part
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
          
          // Parse INTERVAL= part for custom frequencies
          const intervalMatch = ruleStr.match(/INTERVAL=(\\d+)/);
          if (intervalMatch) {
            ruleData.steps = parseInt(intervalMatch[1]);
          }
          
          ruleData._inferenceSource = 'ruleString';
        } catch (e) {}
      }
      
      // Fallback to older property access patterns if official ones don't work
      if (!ruleData.unit && !ruleData.steps) {
        const fallbackMappings = [
          ['unit', 'unit'], ['steps', 'steps'], ['interval', 'interval'],
          ['frequency', 'frequency'], ['every', 'steps'], ['period', 'unit']
        ];
        
        fallbackMappings.forEach(([prop, targetProp]) => {
          try { 
            const value = repetitionRule[prop];
            if (value !== undefined && value !== null && value !== '') {
              ruleData[targetProp] = value;
            }
          } catch (e) {}
          
          try { 
            if (typeof repetitionRule[prop] === 'function') {
              const value = repetitionRule[prop]();
              if (value !== undefined && value !== null && value !== '') {
                ruleData[targetProp] = value;
              }
            }
          } catch (e) {}
        });
        
        if (ruleData.unit || ruleData.steps) {
          ruleData._inferenceSource = 'api';
        }
      }
      
      // Try some hardcoded common patterns from OmniFocus automation
      try {
        // Check if it has a description or string representation
        if (typeof repetitionRule.toString === 'function') {
          const str = repetitionRule.toString();
          if (str && str !== '[object Object]' && str.length > 0) {
            // Try to parse common patterns like "every 1 week", "daily", etc.
            if (str.includes('day') || str.includes('daily')) {
              ruleData.unit = 'days';
              ruleData.steps = 1;
            } else if (str.includes('week') || str.includes('weekly')) {
              ruleData.unit = 'weeks';
              ruleData.steps = 1;
            } else if (str.includes('month') || str.includes('monthly')) {
              ruleData.unit = 'months';
              ruleData.steps = 1;
            } else if (str.includes('year') || str.includes('yearly')) {
              ruleData.unit = 'years';
              ruleData.steps = 1;
            }
            // Try to extract numbers
            const numbers = str.match(/\\d+/g);
            if (numbers && numbers.length > 0) {
              ruleData.steps = parseInt(numbers[0]);
            }
          }
        }
      } catch (e) {}
      
      taskInfo.repetitionRule = ruleData;
      
      // Add project info
      try {
        const project = task.containingProject();
        if (project) {
          taskInfo.project = project.name();
          taskInfo.projectId = project.id();
        }
      } catch (e) {}
      
      // Add dates
      const deferDate = task.deferDate();
      if (deferDate) taskInfo.deferDate = deferDate.toISOString();
      
      const dueDate = task.dueDate();
      if (dueDate) taskInfo.dueDate = dueDate.toISOString();
      
      // Calculate next occurrence
      if (dueDate && !task.completed()) {
        taskInfo.nextDue = dueDate.toISOString();
        taskInfo.daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
        
        if (taskInfo.daysUntilDue < 0) {
          taskInfo.isOverdue = true;
          taskInfo.overdueDays = Math.abs(taskInfo.daysUntilDue);
        }
      }
      
      // Add completion history if available
      if (options.includeHistory) {
        try {
          const completionDate = task.completionDate();
          if (completionDate) {
            taskInfo.lastCompleted = completionDate.toISOString();
          }
        } catch (e) {}
      }
      
      // Calculate frequency description using extracted rule data OR smart inference
      let frequencyDesc = '';
      
      // First try the extracted rule data
      if (ruleData.unit && ruleData.steps) {
        switch(ruleData.unit) {
          case 'hours':
            if (ruleData.steps === 1) frequencyDesc = 'Hourly';
            else if (ruleData.steps === 2) frequencyDesc = 'Every 2 hours';
            else if (ruleData.steps === 4) frequencyDesc = 'Every 4 hours';
            else if (ruleData.steps === 6) frequencyDesc = 'Every 6 hours';
            else if (ruleData.steps === 8) frequencyDesc = 'Every 8 hours';
            else if (ruleData.steps === 12) frequencyDesc = 'Every 12 hours';
            else frequencyDesc = 'Every ' + ruleData.steps + ' hours';
            break;
          case 'days':
            if (ruleData.steps === 1) frequencyDesc = 'Daily';
            else if (ruleData.steps === 7) frequencyDesc = 'Weekly';
            else if (ruleData.steps === 14) frequencyDesc = 'Biweekly';
            else frequencyDesc = 'Every ' + ruleData.steps + ' days';
            break;
          case 'weeks':
            if (ruleData.steps === 1) frequencyDesc = 'Weekly';
            else if (ruleData.steps === 4) frequencyDesc = 'Every 4 weeks';
            else frequencyDesc = 'Every ' + ruleData.steps + ' weeks';
            break;
          case 'months':
            if (ruleData.steps === 1) frequencyDesc = 'Monthly';
            else if (ruleData.steps === 3) frequencyDesc = 'Quarterly';
            else if (ruleData.steps === 6) frequencyDesc = 'Every 6 months';
            else frequencyDesc = 'Every ' + ruleData.steps + ' months';
            break;
          case 'years':
            if (ruleData.steps === 1) frequencyDesc = 'Yearly';
            else if (ruleData.steps === 2) frequencyDesc = 'Every 2 years';
            else if (ruleData.steps === 3) frequencyDesc = 'Every 3 years';
            else frequencyDesc = 'Every ' + ruleData.steps + ' years';
            break;
        }
      }
      
      // Fallback: Smart inference from task name and context
      if (!frequencyDesc) {
        const taskName = task.name().toLowerCase();
        
        // Pattern matching for common recurring task patterns
        // Gaming hourly patterns first
        if (taskName.includes('energy available') || taskName.includes('mines should be harvested') || 
            taskName.includes('hourly') || taskName.includes('every hour')) {
          frequencyDesc = 'Hourly';
          ruleData.unit = 'hours';
          ruleData.steps = 1;
        } else if (taskName.includes('daily') || taskName.includes('every day')) {
          frequencyDesc = 'Daily';
          ruleData.unit = 'days';
          ruleData.steps = 1;
        } else if (taskName.includes('weekly') || taskName.includes('every week') || 
                  taskName.includes('helpdesk tickets') || taskName.includes('review recent activity')) {
          frequencyDesc = 'Weekly';
          ruleData.unit = 'weeks';
          ruleData.steps = 1;
        } else if (taskName.includes('monthly') || taskName.includes('every month') || taskName.includes('of each month') || taskName.includes('of the month')) {
          frequencyDesc = 'Monthly';
          ruleData.unit = 'months';
          ruleData.steps = 1;
        } else if (taskName.includes('yearly') || taskName.includes('annually') || taskName.includes('every year') || 
                  taskName.includes('domain renewal') || taskName.includes('.com') || taskName.includes('.org')) {
          frequencyDesc = 'Yearly';
          ruleData.unit = 'years';
          ruleData.steps = 1;
        } else if (taskName.includes('quarterly') || taskName.includes('every 3 months')) {
          frequencyDesc = 'Quarterly';
          ruleData.unit = 'months';
          ruleData.steps = 3;
        } else if (taskName.includes('biweekly') || taskName.includes('every 2 weeks') || taskName.includes('every two weeks')) {
          frequencyDesc = 'Biweekly';
          ruleData.unit = 'weeks';
          ruleData.steps = 2;
        }
        // Extract number patterns like "every 4 weeks"
        else {
          const weekMatch = taskName.match(/every (\\d+) weeks?/);
          const monthMatch = taskName.match(/every (\\d+) months?/);
          const dayMatch = taskName.match(/every (\\d+) days?/);
          
          if (weekMatch) {
            const num = parseInt(weekMatch[1]);
            frequencyDesc = num === 1 ? 'Weekly' : \`Every \${num} weeks\`;
            ruleData.unit = 'weeks';
            ruleData.steps = num;
          } else if (monthMatch) {
            const num = parseInt(monthMatch[1]);
            frequencyDesc = num === 1 ? 'Monthly' : \`Every \${num} months\`;
            ruleData.unit = 'months';
            ruleData.steps = num;
          } else if (dayMatch) {
            const num = parseInt(dayMatch[1]);
            frequencyDesc = num === 1 ? 'Daily' : \`Every \${num} days\`;
            ruleData.unit = 'days';
            ruleData.steps = num;
          }
        }
        
        // If still no pattern, try to infer from context
        if (!frequencyDesc) {
          // Check project context for patterns
          try {
            const project = task.containingProject();
            if (project) {
              const projectName = project.name().toLowerCase();
              if (projectName.includes('daily')) {
                frequencyDesc = 'Daily';
                ruleData.unit = 'days';
                ruleData.steps = 1;
              } else if (projectName.includes('weekly')) {
                frequencyDesc = 'Weekly';
                ruleData.unit = 'weeks';
                ruleData.steps = 1;
              } else if (projectName.includes('monthly') || projectName.includes('bills')) {
                frequencyDesc = 'Monthly';
                ruleData.unit = 'months';
                ruleData.steps = 1;
              }
            }
          } catch (e) {}
          
          // Final fallback based on common task types
          if (!frequencyDesc) {
            if (taskName.includes('bill') || taskName.includes('payment') || taskName.includes('pay') || taskName.includes('subscription')) {
              frequencyDesc = 'Monthly';
              ruleData.unit = 'months';
              ruleData.steps = 1;
            } else {
              // Enhanced gaming-specific pattern detection
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
                        frequencyDesc = 'Every ' + Math.round(hoursDiff) + ' hours';
                        ruleData.unit = 'hours';
                        ruleData.steps = Math.round(hoursDiff);
                      }
                    } else if (dueDate) {
                      // Gaming projects - look for common gaming intervals
                      const dueHour = dueDate.getHours();
                      // Common gaming reset times suggest specific intervals
                      if (dueHour === 0 || dueHour === 6 || dueHour === 12 || dueHour === 18) {
                        frequencyDesc = 'Every 6 hours';
                        ruleData.unit = 'hours';
                        ruleData.steps = 6;
                      } else if (dueHour === 8 || dueHour === 16) {
                        frequencyDesc = 'Every 8 hours';
                        ruleData.unit = 'hours';
                        ruleData.steps = 8;
                      } else {
                        frequencyDesc = 'Every 4 hours';
                        ruleData.unit = 'hours';
                        ruleData.steps = 4;
                      }
                    }
                  }
                }
              } catch (e) {}
              
              if (!frequencyDesc) {
                frequencyDesc = 'Unknown Pattern';
              }
            }
          }
        }
      }
      
      taskInfo.frequency = frequencyDesc;
      taskInfo.repetitionRule = ruleData; // Update with inferred data
      
      recurringTasks.push(taskInfo);
    }
    
    // Sort tasks
    switch(options.sortBy) {
      case 'dueDate':
        recurringTasks.sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        });
        break;
      case 'frequency':
        recurringTasks.sort((a, b) => {
          const aFreq = a.repetitionRule.steps * (
            a.repetitionRule.unit === 'days' ? 1 :
            a.repetitionRule.unit === 'weeks' ? 7 :
            a.repetitionRule.unit === 'months' ? 30 :
            365
          );
          const bFreq = b.repetitionRule.steps * (
            b.repetitionRule.unit === 'days' ? 1 :
            b.repetitionRule.unit === 'weeks' ? 7 :
            b.repetitionRule.unit === 'months' ? 30 :
            365
          );
          return aFreq - bFreq;
        });
        break;
      case 'project':
        recurringTasks.sort((a, b) => {
          if (!a.project) return 1;
          if (!b.project) return -1;
          return a.project.localeCompare(b.project);
        });
        break;
      case 'name':
      default:
        recurringTasks.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    // Calculate summary statistics
    const summary = {
      totalRecurring: recurringTasks.length,
      overdue: recurringTasks.filter(t => t.isOverdue).length,
      dueThisWeek: recurringTasks.filter(t => t.daysUntilDue >= 0 && t.daysUntilDue <= 7).length,
      byFrequency: {}
    };
    
    // Count by frequency
    recurringTasks.forEach(task => {
      if (!summary.byFrequency[task.frequency]) {
        summary.byFrequency[task.frequency] = 0;
      }
      summary.byFrequency[task.frequency]++;
    });
    
    return JSON.stringify({
      tasks: recurringTasks,
      summary: summary
    });
  } catch (error) {
    return formatError(error, 'analyze_recurring_tasks');
  }
  })();
`;