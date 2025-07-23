// Safe utility functions - shared across all scripts
export const SAFE_UTILITIES_SCRIPT = `
  // Safe utility functions for OmniFocus automation
  function safeGet(getter, defaultValue = null) {
    try {
      const result = getter();
      return result !== null && result !== undefined ? result : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
  
  function safeGetDate(getter) {
    try {
      const date = getter();
      return date ? date.toISOString() : null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetProject(task) {
    try {
      const project = task.containingProject();
      if (project) {
        return {
          name: safeGet(() => project.name()),
          id: safeGet(() => project.id())
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetTags(task) {
    try {
      const tags = task.tags();
      if (!tags) return [];
      const tagNames = [];
      for (let i = 0; i < tags.length; i++) {
        const tagName = safeGet(() => tags[i].name());
        if (tagName) {
          tagNames.push(tagName);
        }
      }
      return tagNames;
    } catch (e) {
      return [];
    }
  }
  
  function safeGetFolder(project) {
    try {
      const folder = project.folder();
      return folder ? safeGet(() => folder.name()) : null;
    } catch (e) {
      return null;
    }
  }
  
  function safeGetTaskCount(project) {
    try {
      const tasks = project.flattenedTasks();
      return tasks ? tasks.length : 0;
    } catch (e) {
      return 0;
    }
  }
  
  function safeGetStatus(obj) {
    try {
      const status = obj.status();
      return status || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }
  
  function safeIsCompleted(obj) {
    try {
      return obj.completed() === true;
    } catch (e) {
      return false;
    }
  }
  
  function safeIsFlagged(obj) {
    try {
      return obj.flagged() === true;
    } catch (e) {
      return false;
    }
  }
  
  function safeGetEstimatedMinutes(task) {
    try {
      const estimate = task.estimatedMinutes();
      return typeof estimate === 'number' ? estimate : null;
    } catch (e) {
      return null;
    }
  }
`;

export const LIST_TASKS_SCRIPT = `
  const filter = {{filter}};
  const tasks = [];
  
  // Check if we should skip recurring analysis (default to false for backwards compatibility)
  const skipRecurringAnalysis = filter.skipAnalysis === true;
  
  // Initialize plugin system
  function initializePlugins() {
    // Plugin registry (simplified for JXA environment)
    const analyzers = [];
    
    // Gaming analyzer
    const gamingAnalyzer = {
      name: 'gaming',
      priority: 100,
      patterns: {
        tasks: ['energy available', 'mines should be harvested', 'hourly', 'every hour'],
        projects: ['troops', 'blitz', 'titans', 'game']
      },
      analyze: function(task, rule) {
        const taskName = task.name().toLowerCase();
        const project = task.containingProject();
        const projectName = project ? project.name().toLowerCase() : '';
        
        const isGamingTask = this.patterns.tasks.some(p => taskName.includes(p)) ||
                            this.patterns.projects.some(p => projectName.includes(p));
        
        if (!isGamingTask) return null;
        
        const result = {
          isRecurring: true,
          type: 'new-instance',
          frequency: '',
          confidence: 0.8,
          source: 'gaming'
        };
        
        // Infer gaming rules
        if (!rule || (!rule.unit && !rule.steps)) {
          if (this.patterns.tasks.some(p => taskName.includes(p))) {
            rule = { unit: 'hours', steps: 1, _inferenceSource: 'gaming_task' };
          } else if (this.patterns.projects.some(p => projectName.includes(p))) {
            // Check for gaming reset times
            try {
              const dueDate = task.dueDate();
              if (dueDate) {
                const hour = dueDate.getHours();
                if ([0, 6, 12, 18].includes(hour)) {
                  rule = { unit: 'hours', steps: 6, _inferenceSource: 'gaming_6h' };
                } else if ([8, 16].includes(hour)) {
                  rule = { unit: 'hours', steps: 8, _inferenceSource: 'gaming_8h' };
                } else {
                  rule = { unit: 'hours', steps: 4, _inferenceSource: 'gaming_4h' };
                }
              }
            } catch (e) {}
          }
        }
        
        if (rule && rule.unit && rule.steps) {
          result.frequency = this.formatFrequency(rule);
        } else {
          result.frequency = 'Gaming task';
        }
        
        return result;
      },
      formatFrequency: function(rule) {
        if (rule.unit === 'hours') {
          return rule.steps === 1 ? 'Hourly (Gaming)' : 'Every ' + rule.steps + ' hours (Gaming)';
        }
        return 'Every ' + rule.steps + ' ' + rule.unit + ' (Gaming)';
      }
    };
    
    // Core analyzer
    const coreAnalyzer = {
      name: 'core',
      priority: 50,
      patterns: {
        daily: ['daily', 'every day'],
        weekly: ['weekly', 'every week', 'helpdesk tickets'],
        monthly: ['monthly', 'of each month'],
        yearly: ['yearly', 'annually', 'domain renewal', '.com', '.org']
      },
      analyze: function(task, rule) {
        if (!rule || (!rule.unit && !rule.steps)) {
          rule = this.inferRule(task);
        }
        
        if (!rule) {
          return { isRecurring: false, type: 'non-recurring', source: 'core' };
        }
        
        return {
          isRecurring: true,
          type: 'new-instance',
          frequency: this.formatFrequency(rule),
          confidence: 0.9,
          source: 'core'
        };
      },
      inferRule: function(task) {
        const taskName = task.name().toLowerCase();
        
        // Ensure patterns exists before using Object.entries
        if (!this.patterns) {
          return null;
        }
        
        for (const [interval, patterns] of Object.entries(this.patterns)) {
          for (const pattern of patterns) {
            if (taskName.includes(pattern)) {
              switch (interval) {
                case 'daily': return { unit: 'days', steps: 1 };
                case 'weekly': return { unit: 'weeks', steps: 1 };
                case 'monthly': return { unit: 'months', steps: 1 };
                case 'yearly': return { unit: 'years', steps: 1 };
              }
            }
          }
        }
        return null;
      },
      formatFrequency: function(rule) {
        if (rule.unit === 'hours' && rule.steps === 1) return 'Hourly';
        if (rule.unit === 'days' && rule.steps === 1) return 'Daily';
        if (rule.unit === 'weeks' && rule.steps === 1) return 'Weekly';
        if (rule.unit === 'months' && rule.steps === 1) return 'Monthly';
        if (rule.unit === 'years' && rule.steps === 1) return 'Yearly';
        return 'Every ' + rule.steps + ' ' + rule.unit;
      }
    };
    
    analyzers.push(gamingAnalyzer);
    analyzers.push(coreAnalyzer);
    analyzers.sort((a, b) => b.priority - a.priority);
    
    return analyzers;
  }
  
  ${SAFE_UTILITIES_SCRIPT}
  
  function safeExtractRuleProperties(repetitionRule) {
    const ruleData = {};
    const officialProperties = [
      'method', 'ruleString', 'anchorDateKey', 'catchUpAutomatically', 'scheduleType'
    ];
    
    officialProperties.forEach(prop => {
      const value = safeGet(() => repetitionRule[prop]);
      if (value !== null && value !== '') {
        ruleData[prop] = value;
      }
    });
    
    return ruleData;
  }
  
  function safeParseRuleString(ruleString) {
    return safeGet(() => {
      const ruleStr = ruleString.toString();
      const ruleData = { _inferenceSource: 'ruleString' };
      
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
      
      return ruleData;
    }, {});
  }
  
  function safeDateFilter(task, dateGetter, beforeDate, afterDate) {
    const date = safeGet(dateGetter);
    if (!date && (beforeDate || afterDate)) return false; // Skip tasks without dates when filtering by date
    if (beforeDate && date > new Date(beforeDate)) return false;
    if (afterDate && date < new Date(afterDate)) return false;
    return true;
  }

  // Helper function to analyze recurring task status using plugins
  function analyzeRecurringStatus(task, repetitionRule) {
    const analyzers = initializePlugins();
    
    // Try each analyzer in priority order
    for (const analyzer of analyzers) {
      try {
        const result = analyzer.analyze(task, repetitionRule);
        if (result) {
          return result;
        }
      } catch (e) {
        // Continue with next analyzer
      }
    }
    
    // Default fallback
    return {
      isRecurring: false,
      type: 'non-recurring',
      source: 'fallback'
    };
  }
  
  // Helper function to check if task matches filters
  function matchesFilters(task, filter) {
    // Basic property filters
    if (filter.completed !== undefined && task.completed() !== filter.completed) return false;
    if (filter.flagged !== undefined && task.flagged() !== filter.flagged) return false;
    if (filter.inInbox !== undefined && task.inInbox() !== filter.inInbox) return false;
    
    // Search filter
    if (filter.search) {
      const name = safeGet(() => task.name(), '') || '';
      const note = safeGet(() => task.note(), '') || '';
      const searchText = (name + ' ' + note).toLowerCase();
      if (!searchText.includes(filter.search.toLowerCase())) return false;
    }
    
    // Project filter
    if (filter.projectId !== undefined) {
      const project = safeGetProject(task);
      if (filter.projectId === null && project !== null) return false;
      if (filter.projectId !== null && (!project || project.id !== filter.projectId)) return false;
    }
    
    // Tags filter
    if (filter.tags && filter.tags.length > 0) {
      const taskTags = safeGetTags(task);
      const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
      if (!hasAllTags) return false;
    }
    
    // Date filters
    if (filter.dueBefore || filter.dueAfter) {
      if (!safeDateFilter(task, () => task.dueDate(), filter.dueBefore, filter.dueAfter)) return false;
    }
    
    if (filter.deferBefore || filter.deferAfter) {
      if (!safeDateFilter(task, () => task.deferDate(), filter.deferBefore, filter.deferAfter)) return false;
    }
    
    // Available filter
    if (filter.available) {
      if (task.completed() || task.dropped()) return false;
      const deferDate = safeGet(() => task.deferDate());
      if (deferDate && deferDate > new Date()) return false;
    }
    
    return true;
  }

  try {
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    
    const limit = Math.min(filter.limit || 100, 1000); // Cap at 1000
    let count = 0;
    const startTime = Date.now();
    let tasksScanned = 0;
    let filterTimeTotal = 0;
    let analysisTimeTotal = 0;
    
    for (let i = 0; i < allTasks.length && count < limit; i++) {
      const task = allTasks[i];
      tasksScanned++;
      
      // Skip if task doesn't match filters
      const filterStart = Date.now();
      const matches = matchesFilters(task, filter);
      filterTimeTotal += Date.now() - filterStart;
      
      if (!matches) continue;
      
      // Build task object with safe property access
      const taskObj = {
        id: safeGet(() => task.id(), 'unknown'),
        name: safeGet(() => task.name(), 'Unnamed Task'),
        completed: safeIsCompleted(task),
        flagged: safeIsFlagged(task),
        inInbox: safeGet(() => task.inInbox(), false)
      };
      
      // Add optional properties using safe utilities
      const note = safeGet(() => task.note());
      if (note) taskObj.note = note;
      
      const project = safeGetProject(task);
      if (project) {
        taskObj.project = project.name;
        taskObj.projectId = project.id;
      }
      
      const dueDate = safeGetDate(() => task.dueDate());
      if (dueDate) taskObj.dueDate = dueDate;
      
      const deferDate = safeGetDate(() => task.deferDate());
      if (deferDate) taskObj.deferDate = deferDate;
      
      taskObj.tags = safeGetTags(task);
      
      const added = safeGetDate(() => task.added());
      if (added) taskObj.added = added;
      
      // Add repetition rule and recurring status analysis
      const analysisStart = Date.now();
      if (skipRecurringAnalysis) {
        // Skip analysis for performance
        taskObj.recurringStatus = {
          isRecurring: false,
          type: 'analysis-skipped',
          skipped: true
        };
      } else {
        const repetitionRule = safeGet(() => task.repetitionRule());
        if (repetitionRule) {
          let ruleData = safeExtractRuleProperties(repetitionRule);
          
          // Parse ruleString if available
          if (ruleData.ruleString) {
            const parsedRule = safeParseRuleString(ruleData.ruleString);
            ruleData = { ...ruleData, ...parsedRule };
          }
          
          // Basic fallback - plugins will handle the advanced inference
          if (!ruleData.unit && !ruleData.steps) {
            ruleData._inferenceSource = 'none';
          }
          
          taskObj.repetitionRule = ruleData;
          taskObj.recurringStatus = analyzeRecurringStatus(task, ruleData);
        } else {
          taskObj.recurringStatus = {
            isRecurring: false,
            type: 'non-recurring'
          };
        }
      }
      analysisTimeTotal += Date.now() - analysisStart;
      
      tasks.push(taskObj);
      count++;
    }
    
    const endTime = Date.now();
    
    // For performance: estimate has_more based on whether we hit the limit
    const hasMore = count > tasks.length;
    
    return JSON.stringify({
      tasks: tasks,
      metadata: {
        total_items: count,
        items_returned: tasks.length,
        limit_applied: limit,
        has_more: hasMore,
        query_time_ms: endTime - startTime,
        filters_applied: {
          completed: filter.completed,
          flagged: filter.flagged,
          inInbox: filter.inInbox,
          search: filter.search,
          tags: filter.tags,
          projectId: filter.projectId,
          dueBefore: filter.dueBefore,
          dueAfter: filter.dueAfter,
          deferBefore: filter.deferBefore,
          deferAfter: filter.deferAfter,
          available: filter.available
        },
        performance_note: hasMore ? 
          "More tasks available. Consider using more specific filters for better performance." : 
          undefined,
        performance_metrics: {
          tasks_scanned: tasksScanned,
          filter_time_ms: filterTimeTotal,
          analysis_time_ms: analysisTimeTotal,
          analysis_skipped: skipRecurringAnalysis
        }
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to list tasks: " + error.toString(),
      details: error.message
    });
  }
`;

export const CREATE_TASK_SCRIPT = `
  const taskData = {{taskData}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    // Create task data object for JXA
    const taskObj = {
      name: taskData.name
    };
    
    // Add optional properties
    if (taskData.note !== undefined) taskObj.note = taskData.note;
    if (taskData.flagged !== undefined) taskObj.flagged = taskData.flagged;
    if (taskData.dueDate !== undefined && taskData.dueDate) taskObj.dueDate = new Date(taskData.dueDate);
    if (taskData.deferDate !== undefined && taskData.deferDate) taskObj.deferDate = new Date(taskData.deferDate);
    if (taskData.estimatedMinutes !== undefined) taskObj.estimatedMinutes = taskData.estimatedMinutes;
    
    // Handle tags before task creation
    const tagsToAdd = [];
    if (taskData.tags && taskData.tags.length > 0) {
      const existingTags = doc.flattenedTags();
      if (!existingTags) {
        // Tags not available, but continue with task creation
      } else {
        for (const tagName of taskData.tags) {
          let found = false;
          for (let i = 0; i < existingTags.length; i++) {
            if (safeGet(() => existingTags[i].name()) === tagName) {
              tagsToAdd.push(existingTags[i]);
            found = true;
            break;
          }
          }
          // Note: JXA doesn't support creating new tags reliably in task creation
        }
      }
    }
    
    // Determine where to create the task
    let targetContainer = null;
    let taskIsInInbox = true;
    
    // If projectId is provided, find the project and assign the task there
    if (taskData.projectId && taskData.projectId !== "") {
      const projects = doc.flattenedProjects();
      if (!projects) {
        return JSON.stringify({
          error: true,
          message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly."
        });
      }
      for (let i = 0; i < projects.length; i++) {
        if (safeGet(() => projects[i].id()) === taskData.projectId) {
          targetContainer = projects[i];
          taskIsInInbox = false;
          break;
        }
      }
      
      // If project not found, return error
      if (!targetContainer) {
        // Check if this looks like Claude Desktop extracted a number from an alphanumeric ID
        const isNumericOnly = /^\d+$/.test(taskData.projectId);
        let errorMessage = "Project with ID '" + taskData.projectId + "' not found";
        
        if (isNumericOnly) {
          errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
        }
        
        return JSON.stringify({
          error: true,
          message: errorMessage
        });
      }
    }
    
    // Create the task using JXA syntax
    let newTask;
    if (targetContainer) {
      // Create task in the specified project
      newTask = app.Task(taskObj);
      targetContainer.tasks.push(newTask);
    } else {
      // Create task in inbox
      newTask = app.InboxTask(taskObj);
      const inbox = doc.inboxTasks;
      inbox.push(newTask);
    }
    
    // Try to get the real OmniFocus ID by finding the task we just created
    let taskId = null;
    let createdTask = null;
    let actualTags = [];
    
    try {
      // Search in the appropriate container
      const tasksToSearch = targetContainer ? safeGet(() => targetContainer.tasks(), []) : safeGet(() => doc.inboxTasks(), []);
      for (let i = tasksToSearch.length - 1; i >= 0; i--) {
        const task = tasksToSearch[i];
        if (safeGet(() => task.name()) === taskData.name) {
          taskId = safeGet(() => task.id(), null);
          createdTask = task;
          
          // Add tags to the created task
          if (tagsToAdd.length > 0) {
            try {
              task.addTags(tagsToAdd);
              // Verify tags were actually added
              actualTags = safeGetTags(task);
            } catch (tagError) {
              // Tags failed to add, but task was created - log warning
              // Warning: Failed to add tags to task
              actualTags = [];
            }
          }
          
          break;
        }
      }
    } catch (e) {
      // If we can't get the real ID, generate a temporary one
      // Warning: Failed to get task ID from created task, using temporary ID
      taskId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    }
    
    // Build complete task response including all set fields
    const responseTask = {
      id: taskId,
      name: taskData.name,
      flagged: taskData.flagged || false,
      inInbox: taskIsInInbox,
      projectId: taskData.projectId || null,
      project: targetContainer ? safeGet(() => targetContainer.name(), null) : null
    };
    
    // Include all fields that were actually set in the creation
    if (taskData.note !== undefined) responseTask.note = taskData.note;
    if (taskData.dueDate !== undefined) responseTask.dueDate = taskData.dueDate;
    if (taskData.deferDate !== undefined) responseTask.deferDate = taskData.deferDate;
    if (taskData.estimatedMinutes !== undefined) responseTask.estimatedMinutes = taskData.estimatedMinutes;
    // Only include tags that were actually added to the task
    if (actualTags.length > 0) {
      responseTask.tags = actualTags;
    } else if (taskData.tags !== undefined && taskData.tags.length > 0) {
      // If tags were requested but not added, include empty array to indicate the attempt
      responseTask.tags = [];
      responseTask.tagWarning = 'Tags were requested but could not be added';
    }
    
    return JSON.stringify({
      success: true,
      taskId: taskId,
      task: responseTask
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to create task: " + error.toString(),
      details: error.message
    });
  }
`;


export const UPDATE_TASK_SCRIPT = `
  const taskId = {{taskId}};
  const updates = {{updates}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    // Find task by ID
    const tasks = doc.flattenedTasks();
    if (!tasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly."
      });
    }
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (safeGet(() => tasks[i].id()) === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ 
        error: true, 
        message: "Task with ID '" + taskId + "' not found. Use 'list_tasks' tool to see available tasks." 
      });
    }
    
    // Apply updates using property setters with null handling
    if (updates.name !== undefined) {
      task.name = updates.name;
    }
    if (updates.note !== undefined) {
      task.note = updates.note || '';
    }
    if (updates.flagged !== undefined) {
      task.flagged = updates.flagged;
    }
    if (updates.dueDate !== undefined) {
      try {
        // Handle null values explicitly to clear dates
        if (updates.dueDate === null || updates.dueDate === undefined) {
          task.dueDate = null;
        } else if (updates.dueDate) {
          // Handle date strings like create_task does (simplified approach)
          task.dueDate = new Date(updates.dueDate);
        }
      } catch (dateError) {
        // Skip invalid due date - log error details for debugging
      }
    }
    if (updates.deferDate !== undefined) {
      try {
        // Handle null values explicitly to clear dates
        if (updates.deferDate === null || updates.deferDate === undefined) {
          task.deferDate = null;
        } else if (updates.deferDate) {
          // Handle date strings like create_task does (simplified approach)
          task.deferDate = new Date(updates.deferDate);
        }
      } catch (dateError) {
        // Skip invalid defer date - log error details for debugging
      }
    }
    if (updates.estimatedMinutes !== undefined) {
      task.estimatedMinutes = updates.estimatedMinutes;
    }
    
    // Update project assignment with better error handling
    if (updates.projectId !== undefined) {
      try {
        if (updates.projectId === "") {
          // Move to inbox - set assignedContainer to null
          task.assignedContainer = null;
        } else if (updates.projectId === null) {
          // Move to inbox - set assignedContainer to null
          task.assignedContainer = null;
        } else {
          // Find and assign project
          const projects = doc.flattenedProjects();
          let projectFound = false;
          for (let i = 0; i < projects.length; i++) {
            if (projects[i].id() === updates.projectId) {
              task.assignedContainer = projects[i];
              projectFound = true;
              break;
            }
          }
          if (!projectFound) {
            // Check if this looks like Claude Desktop extracted a number from an alphanumeric ID
            const isNumericOnly = /^\d+$/.test(updates.projectId);
            let errorMessage = "Project with ID '" + updates.projectId + "' not found";
            
            if (isNumericOnly) {
              errorMessage += ". CLAUDE DESKTOP BUG DETECTED: Claude Desktop may have extracted numbers from an alphanumeric project ID (e.g., '547' from 'az5Ieo4ip7K'). Please use the list_projects tool to get the correct full project ID and try again.";
            }
            
            return JSON.stringify({
              error: true,
              message: errorMessage
            });
          }
        }
      } catch (projectError) {
        // Project assignment error
        return JSON.stringify({
          error: true,
          message: "Failed to update project assignment: " + projectError.toString()
        });
      }
    }
    
    // Update tags with error handling
    if (updates.tags !== undefined) {
      try {
        // Get current tags
        const currentTags = task.tags();
        
        // Remove all existing tags
        if (currentTags.length > 0) {
          task.removeTags(currentTags);
        }
        
        // Add new tags
        if (updates.tags && updates.tags.length > 0) {
          const existingTags = doc.flattenedTags();
          const tagsToAdd = [];
          
          for (const tagName of updates.tags) {
            if (typeof tagName !== 'string' || tagName.trim() === '') {
              // Skip invalid tag name
              continue;
            }
            
            let found = false;
            for (let i = 0; i < existingTags.length; i++) {
              if (existingTags[i].name() === tagName) {
                tagsToAdd.push(existingTags[i]);
                found = true;
                break;
              }
            }
            if (!found) {
              try {
                // Create new tag using make
                const newTag = app.make({
                  new: 'tag',
                  withProperties: { name: tagName },
                  at: doc.tags
                });
                tagsToAdd.push(newTag);
              } catch (makeError) {
                // If make fails, try alternate syntax
                try {
                  const newTag = app.Tag({name: tagName});
                  doc.tags.push(newTag);
                  tagsToAdd.push(newTag);
                } catch (tagError) {
                  // Skip tag creation error - tag won't be added
                }
              }
            }
          }
          
          if (tagsToAdd.length > 0) {
            task.addTags(tagsToAdd);
          }
        }
      } catch (tagError) {
        // Skip tag update errors
        // Don't fail the entire update for tag errors
      }
    }
    
    // Build response with updated fields
    const response = {
      id: task.id(),
      name: task.name(),
      updated: true,
      changes: {}
    };
    
    // Track what was actually changed
    if (updates.name !== undefined) response.changes.name = updates.name;
    if (updates.note !== undefined) response.changes.note = updates.note;
    if (updates.flagged !== undefined) response.changes.flagged = updates.flagged;
    if (updates.dueDate !== undefined) response.changes.dueDate = updates.dueDate;
    if (updates.deferDate !== undefined) response.changes.deferDate = updates.deferDate;
    if (updates.estimatedMinutes !== undefined) response.changes.estimatedMinutes = updates.estimatedMinutes;
    if (updates.tags !== undefined) response.changes.tags = updates.tags;
    if (updates.projectId !== undefined) {
      response.changes.projectId = updates.projectId;
      if (updates.projectId !== "") {
        const project = safeGetProject(task);
        if (project) {
          response.changes.projectName = project.name;
        }
      } else {
        response.changes.projectName = "Inbox";
      }
    }
    
    return JSON.stringify(response);
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to update task: " + error.toString(),
      details: error.message
    });
  }
`;

export const COMPLETE_TASK_SCRIPT = `
  const taskId = {{taskId}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    // Find task by ID
    const tasks = doc.flattenedTasks();
    if (!tasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly."
      });
    }
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (safeGet(() => tasks[i].id()) === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ 
        error: true, 
        message: "Task with ID '" + taskId + "' not found. Use 'list_tasks' tool to see available tasks." 
      });
    }
    
    if (task.completed()) {
      const taskName = safeGet(() => task.name(), 'Unknown Task');
      return JSON.stringify({ 
        error: true, 
        message: "Task '" + taskName + "' (ID: " + taskId + ") is already completed." 
      });
    }
    
    // Mark as complete using JXA markComplete method
    try {
      task.markComplete();
    } catch (markError) {
      // If markComplete fails, try property setter as fallback
      try {
        task.completed = true;
      } catch (propError) {
        return JSON.stringify({ 
          error: true, 
          message: "Failed to mark task as complete. Both markComplete() and property setter failed: " + markError.toString() + " / " + propError.toString()
        });
      }
    }
    
    const completionDate = safeGetDate(() => task.completionDate()) || new Date().toISOString();
    
    return JSON.stringify({
      id: task.id(),
      completed: true,
      completionDate: completionDate
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to complete task: " + error.toString(),
      details: error.message
    });
  }
`;

// Omni Automation script for completing tasks (bypasses JXA permission issues)
export const COMPLETE_TASK_OMNI_SCRIPT = `
  const taskId = {{taskId}};
  
  try {
    // Find task by ID using Omni Automation
    const tasks = flattenedTasks;
    let targetTask = null;
    
    tasks.forEach(task => {
      if (task.id() === taskId) {
        targetTask = task;
      }
    });
    
    if (!targetTask) {
      throw new Error("Task with ID '" + taskId + "' not found via URL scheme. Use 'list_tasks' tool to see available tasks.");
    }
    
    if (targetTask.completed) {
      throw new Error("Task '" + (targetTask.name || 'Unknown Task') + "' (ID: " + taskId + ") is already completed.");
    }
    
    // Mark as complete using Omni Automation method
    targetTask.markComplete();
    
    // Return success (URL scheme doesn't return values directly)
    return true;
  } catch (error) {
    throw new Error("Failed to complete task: " + error.toString());
  }
`;

export const DELETE_TASK_SCRIPT = `
  const taskId = {{taskId}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    // Find task by ID
    const tasks = doc.flattenedTasks();
    if (!tasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly."
      });
    }
    let task = null;
    for (let i = 0; i < tasks.length; i++) {
      if (safeGet(() => tasks[i].id()) === taskId) {
        task = tasks[i];
        break;
      }
    }
    if (!task) {
      return JSON.stringify({ 
        error: true, 
        message: "Task with ID '" + taskId + "' not found. Use 'list_tasks' tool to see available tasks." 
      });
    }
    
    const taskName = safeGet(() => task.name(), 'Unnamed Task');
    
    // Delete using JXA app.delete method
    app.delete(task);
    
    return JSON.stringify({
      success: true,
      id: taskId,
      deleted: true,
      name: taskName
    });
  } catch (error) {
    const errorMessage = error ? error.toString() : 'Unknown error';
    return JSON.stringify({
      error: true,
      message: "Failed to delete task: " + errorMessage,
      details: error && error.message ? error.message : 'No details available'
    });
  }
`;

// Omni Automation script for deleting tasks (bypasses JXA permission issues)
export const DELETE_TASK_OMNI_SCRIPT = `
  const taskId = {{taskId}};
  
  try {
    // Find task by ID using Omni Automation
    const tasks = flattenedTasks;
    let targetTask = null;
    
    tasks.forEach(task => {
      if (task.id() === taskId) {
        targetTask = task;
      }
    });
    
    if (!targetTask) {
      throw new Error("Task with ID '" + taskId + "' not found via URL scheme. Use 'list_tasks' tool to see available tasks.");
    }
    
    const taskName = targetTask.name;
    
    // Delete using Omni Automation method
    deleteObject(targetTask);
    
    // Return success (URL scheme doesn't return values directly)
    return true;
  } catch (error) {
    throw new Error("Failed to delete task: " + error.toString());
  }
`;

export const TODAYS_AGENDA_SCRIPT = `
  const options = {{options}};
  const tasks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    
    const startTime = Date.now();
    
    let dueTodayCount = 0;
    let overdueCount = 0;
    let flaggedCount = 0;
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip completed tasks
      if (safeIsCompleted(task)) continue;
      
      // Check if available (if required)
      if (options.includeAvailable) {
        const deferDate = safeGetDate(() => task.deferDate());
        if (deferDate && new Date(deferDate) > new Date()) continue;
        // Note: Full availability check would include blocked status
      }
      
      let includeTask = false;
      let reason = '';
      
      // Check due date
      const dueDateStr = safeGetDate(() => task.dueDate());
      if (dueDateStr) {
        const dueDate = new Date(dueDateStr);
        if (dueDate < today && options.includeOverdue) {
          includeTask = true;
          reason = 'overdue';
          overdueCount++;
        } else if (dueDate >= today && dueDate < tomorrow) {
          includeTask = true;
          reason = 'due_today';
          dueTodayCount++;
        }
      }
      
      // Check flagged status
      if (!includeTask && options.includeFlagged && safeIsFlagged(task)) {
        includeTask = true;
        reason = 'flagged';
        flaggedCount++;
      }
      
      if (includeTask) {
        // Build task object
        const taskObj = {
          id: safeGet(() => task.id(), 'unknown'),
          name: safeGet(() => task.name(), 'Unnamed Task'),
          completed: false,
          flagged: safeIsFlagged(task),
          reason: reason
        };
        
        // Add optional properties
        const note = safeGet(() => task.note());
        if (note) taskObj.note = note;
        
        const project = safeGetProject(task);
        if (project) {
          taskObj.project = project.name;
          taskObj.projectId = project.id;
        }
        
        const dueDate = safeGetDate(() => task.dueDate());
        if (dueDate) taskObj.dueDate = dueDate;
        
        const deferDate = safeGetDate(() => task.deferDate());
        if (deferDate) taskObj.deferDate = deferDate;
        
        const tags = safeGetTags(task);
        taskObj.tags = tags;
        
        tasks.push(taskObj);
      }
    }
    
    const endTime = Date.now();
    
    // Sort tasks by priority: overdue first, then due today, then flagged
    tasks.sort((a, b) => {
      const priority = {'overdue': 0, 'due_today': 1, 'flagged': 2};
      return priority[a.reason] - priority[b.reason];
    });
    
    return JSON.stringify({
      tasks: tasks,
      summary: {
        total: tasks.length,
        overdue: overdueCount,
        due_today: dueTodayCount,
        flagged: flaggedCount,
        query_time_ms: endTime - startTime
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to get today's agenda: " + error.toString(),
      details: error.message
    });
  }
`;

export const GET_TASK_COUNT_SCRIPT = `
  const filter = {{filter}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const allTasks = doc.flattenedTasks();
    let count = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Skip if task doesn't match filters
      if (filter.completed !== undefined && task.completed() !== filter.completed) continue;
      if (filter.flagged !== undefined && task.flagged() !== filter.flagged) continue;
      if (filter.inInbox !== undefined && task.inInbox() !== filter.inInbox) continue;
      
      // Additional filters that require more processing
      if (filter.projectId !== undefined) {
        try {
          const project = task.containingProject();
          if (filter.projectId === null && project !== null) continue;
          if (filter.projectId !== null && (!project || project.id() !== filter.projectId)) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.tags && filter.tags.length > 0) {
        const taskTags = safeGet(() => task.tags(), []).map(t => t.name());
        const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
        if (!hasAllTags) continue;
      }
      
      if (filter.search) {
        const name = safeGet(() => task.name(), '') || '';
        const note = safeGet(() => task.note(), '') || '';
        const searchText = (name + ' ' + note).toLowerCase();
        if (!searchText.includes(filter.search.toLowerCase())) continue;
      }
      
      if (filter.dueBefore || filter.dueAfter) {
        try {
          const dueDate = task.dueDate();
          if (filter.dueBefore && (!dueDate || dueDate > new Date(filter.dueBefore))) continue;
          if (filter.dueAfter && (!dueDate || dueDate < new Date(filter.dueAfter))) continue;
        } catch (e) {
          if (filter.dueBefore || filter.dueAfter) continue;
        }
      }
      
      if (filter.deferBefore || filter.deferAfter) {
        try {
          const deferDate = task.deferDate();
          if (filter.deferBefore && (!deferDate || deferDate > new Date(filter.deferBefore))) continue;
          if (filter.deferAfter && (!deferDate || deferDate < new Date(filter.deferAfter))) continue;
        } catch (e) {
          if (filter.deferBefore || filter.deferAfter) continue;
        }
      }
      
      if (filter.available) {
        try {
          if (task.completed() || task.dropped()) continue;
          const deferDate = task.deferDate();
          if (deferDate && deferDate > new Date()) continue;
          // Check if blocked (has incomplete sequential predecessors)
          // This is simplified - full availability logic is complex
        } catch (e) {
          continue;
        }
      }
      
      count++;
    }
    
    const endTime = Date.now();
    
    return JSON.stringify({
      count: count,
      query_time_ms: endTime - startTime,
      filters_applied: {
        completed: filter.completed,
        flagged: filter.flagged,
        inInbox: filter.inInbox,
        search: filter.search,
        tags: filter.tags,
        projectId: filter.projectId,
        dueBefore: filter.dueBefore,
        dueAfter: filter.dueAfter,
        deferBefore: filter.deferBefore,
        deferAfter: filter.deferAfter,
        available: filter.available
      }
    });
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to count tasks: " + error.toString(),
      details: error.message
    });
  }
`;
