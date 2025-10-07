import { getMinimalHelpers } from '../shared/helpers.js';

/**
 * Script to analyze and summarize recurring task patterns in OmniFocus
 *
 * Optimization: Uses OmniJS bridge for fast bulk property access (3-4x faster than JXA)
 *
 * Features:
 * - Pattern detection and grouping
 * - Frequency distribution analysis
 * - Project-based pattern breakdown
 * - Gaming-specific pattern recognition
 * - Most common pattern identification
 */
export const GET_RECURRING_PATTERNS_SCRIPT = `
  ${getMinimalHelpers()}

  (() => {
    const options = {{options}};

    try {
      const app = Application('OmniFocus');
      const startTime = Date.now();

      // Use OmniJS bridge for fast bulk property access
      const omniJsScript = \`
        (() => {
          const options = \${JSON.stringify(options)};
          const patterns = {};
          const projectPatterns = {};
          let totalRecurring = 0;

          // OmniJS: Use global flattenedTasks collection
          flattenedTasks.forEach(task => {
            // Skip tasks without repetition rules
            if (!task.repetitionRule) return;

            try {
              const isCompleted = task.completed || false;
              const isDropped = task.taskStatus === Task.Status.Dropped;

              // Apply filtering logic
              if (isCompleted && !options.includeCompleted) return;
              if (isDropped && !options.includeDropped) return;
              if (options.activeOnly && !options.includeCompleted && !options.includeDropped && (isCompleted || isDropped)) return;

              totalRecurring++;

              // Extract repetition rule properties
              const repetitionRule = task.repetitionRule;
              const ruleData = {};

              // Try official OmniFocus API properties
              const officialProperties = ['method', 'ruleString', 'anchorDateKey', 'catchUpAutomatically', 'scheduleType'];
              officialProperties.forEach(prop => {
                try {
                  const value = repetitionRule[prop];
                  if (value !== undefined && value !== null && value !== '') {
                    ruleData[prop] = value;
                  }
                } catch (e) {}
              });

              // Parse ruleString (RRULE format)
              if (ruleData.ruleString) {
                try {
                  const ruleStr = String(ruleData.ruleString);

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

                  const intervalMatch = ruleStr.match(/INTERVAL=(\\\\d+)/);
                  if (intervalMatch) {
                    ruleData.steps = parseInt(intervalMatch[1]);
                  }
                } catch (e) {}
              }

              // Fallback pattern inference
              if (!ruleData.unit || !ruleData.steps) {
                const taskName = (task.name || '').toLowerCase();

                // Gaming hourly patterns
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
                  const weekMatch = taskName.match(/every (\\\\d+) weeks?/);
                  const monthMatch = taskName.match(/every (\\\\d+) months?/);
                  const dayMatch = taskName.match(/every (\\\\d+) days?/);

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

                // Enhanced gaming-specific pattern detection
                if (!ruleData.unit || !ruleData.steps) {
                  try {
                    const project = task.containingProject;
                    if (project) {
                      const projectName = (project.name || '').toLowerCase();
                      if (projectName.includes('troops') || projectName.includes('blitz') ||
                          projectName.includes('titans') || projectName.includes('game')) {
                        const dueDate = task.dueDate;
                        const deferDate = task.deferDate;

                        if (dueDate && deferDate) {
                          const hoursDiff = Math.abs(dueDate.getTime() - deferDate.getTime()) / (1000 * 60 * 60);
                          if (hoursDiff >= 2 && hoursDiff <= 12 && hoursDiff % 1 === 0) {
                            ruleData.unit = 'hours';
                            ruleData.steps = Math.round(hoursDiff);
                          }
                        } else if (dueDate) {
                          const dueHour = dueDate.getHours();
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
              if (patterns[patternKey].tasks.length < 5) {
                patterns[patternKey].tasks.push(task.name || 'Unnamed Task');
              }

              // Track by project
              try {
                const project = task.containingProject;
                if (project) {
                  const projectName = project.name;
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
            } catch (taskError) {
              // Skip tasks that error
            }
          });

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
        })();
      \`;

      const bridgeResult = app.evaluateJavascript(omniJsScript);
      const parsed = JSON.parse(bridgeResult);
      const duration = Date.now() - startTime;

      return JSON.stringify({
        ...parsed,
        duration: duration,
        debug: {
          optimizationUsed: 'OmniJS bridge for 3-4x faster property access'
        }
      });
    } catch (error) {
      return formatError(error, 'get_recurring_patterns');
    }
  })();
`;
