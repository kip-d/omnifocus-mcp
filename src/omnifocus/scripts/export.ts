// Import shared safe utilities
import { SAFE_UTILITIES_SCRIPT } from './tasks.js';

export const EXPORT_TASKS_SCRIPT = `
  const filter = {{filter}};
  const format = {{format}};
  const fields = {{fields}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const tasks = [];
    const allTasks = doc.flattenedTasks();
    
    // Check if allTasks is null or undefined
    if (!allTasks) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve tasks from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedTasks() returned null or undefined"
      });
    }
    const allFields = fields || ['name', 'note', 'project', 'tags', 'deferDate', 'dueDate', 'completed', 'flagged'];
    
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      
      // Apply filters
      if (filter.available !== undefined && safeGet(() => task.effectivelyHidden(), false) === filter.available) continue;
      
      if (filter.completed !== undefined && safeIsCompleted(task) !== filter.completed) continue;
      
      if (filter.flagged !== undefined && safeIsFlagged(task) !== filter.flagged) continue;
      
      if (filter.project) {
        try {
          const project = safeGetProject(task);
          if (!project || project.name !== filter.project) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.projectId) {
        try {
          const project = safeGetProject(task);
          if (!project || project.id !== filter.projectId) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.tags && filter.tags.length > 0) {
        try {
          const taskTags = safeGetTags(task);
          const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
          if (!hasAllTags) continue;
        } catch (e) {
          continue;
        }
      }
      
      if (filter.search) {
        try {
          const name = safeGet(() => task.name(), '') || '';
          const note = safeGet(() => task.note(), '') || '';
          const searchText = (name + ' ' + note).toLowerCase();
          if (!searchText.includes(filter.search.toLowerCase())) continue;
        } catch (e) {
          continue;
        }
      }
      
      // Build task object with requested fields
      const taskData = {};
      
      if (allFields.includes('id')) {
        taskData.id = safeGet(() => task.id(), 'unknown');
      }
      
      if (allFields.includes('name')) {
        taskData.name = safeGet(() => task.name(), 'Unnamed Task');
      }
      
      if (allFields.includes('note')) {
        const note = safeGet(() => task.note());
        if (note) taskData.note = note;
      }
      
      if (allFields.includes('project')) {
        try {
          const project = safeGetProject(task);
          if (project) {
            taskData.project = project.name;
            taskData.projectId = project.id;
          }
        } catch (e) {}
      }
      
      if (allFields.includes('tags')) {
        try {
          const tags = safeGetTags(task);
          if (tags && tags.length > 0) {
            taskData.tags = tags;
          }
        } catch (e) {}
      }
      
      if (allFields.includes('deferDate')) {
        const deferDate = safeGet(() => task.deferDate());
        if (deferDate) taskData.deferDate = deferDate.toISOString();
      }
      
      if (allFields.includes('dueDate')) {
        const dueDate = safeGet(() => task.dueDate());
        if (dueDate) taskData.dueDate = dueDate.toISOString();
      }
      
      if (allFields.includes('completed')) {
        taskData.completed = task.completed();
        if (task.completed()) {
          const completionDate = safeGet(() => task.completionDate());
          if (completionDate) taskData.completionDate = completionDate.toISOString();
        }
      }
      
      if (allFields.includes('flagged')) {
        taskData.flagged = task.flagged();
      }
      
      if (allFields.includes('estimated')) {
        const minutes = safeGet(() => task.estimatedMinutes());
        if (minutes && minutes > 0) {
          taskData.estimatedMinutes = minutes;
        }
      }
      
      if (allFields.includes('created')) {
        const created = safeGet(() => task.creationDate());
        if (created) taskData.createdDate = created.toISOString();
      }
      
      if (allFields.includes('modified')) {
        const modified = safeGet(() => task.modificationDate());
        if (modified) taskData.modifiedDate = modified.toISOString();
      }
      
      tasks.push(taskData);
    }
    
    // Format output based on requested format
    if (format === 'csv') {
      // Build CSV
      const headers = Object.keys(tasks[0] || {});
      let csv = headers.join(',') + '\\n';
      
      for (const task of tasks) {
        const row = headers.map(h => {
          const value = task[h];
          if (value === undefined || value === null) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          if (Array.isArray(value)) {
            return '"' + value.join('; ') + '"';
          }
          return value.toString();
        });
        csv += row.join(',') + '\\n';
      }
      
      return JSON.stringify({
        format: 'csv',
        data: csv,
        count: tasks.length
      });
    } else {
      // Default to JSON
      return JSON.stringify({
        format: 'json',
        data: tasks,
        count: tasks.length
      });
    }
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to export tasks: " + error.toString()
    });
  }
`;

export const EXPORT_PROJECTS_SCRIPT = `
  const includeStats = {{includeStats}};
  const format = {{format}};
  
  ${SAFE_UTILITIES_SCRIPT}
  
  try {
    const projects = [];
    const allProjects = doc.flattenedProjects();
    
    // Check if allProjects is null or undefined
    if (!allProjects) {
      return JSON.stringify({
        error: true,
        message: "Failed to retrieve projects from OmniFocus. The document may not be available or OmniFocus may not be running properly.",
        details: "doc.flattenedProjects() returned null or undefined"
      });
    }
    
    for (let i = 0; i < allProjects.length; i++) {
      const project = allProjects[i];
      
      const projectData = {
        id: project.id(),
        name: project.name()
      };
      
      // Add status with safe access
      try {
        const statusObj = project.status();
        // Status might be an object with a name property or a string
        if (statusObj && typeof statusObj === 'object' && statusObj.name) {
          projectData.status = statusObj.name;
        } else if (typeof statusObj === 'string') {
          // Clean up status string if it contains redundant words
          projectData.status = statusObj.replace(/\s*status\s*/i, '').trim() || 'active';
        } else {
          projectData.status = 'active';
        }
      } catch (e) {
        projectData.status = 'active';
      }
      
      // Add note if present
      try {
        const note = project.note();
        if (note) projectData.note = note;
      } catch (e) {}
      
      // Add parent info
      try {
        const parent = project.parentFolder();
        if (parent) {
          projectData.parentId = parent.id();
          projectData.parentName = parent.name();
        }
      } catch (e) {}
      
      // Add dates with safe access
      try {
        const deferDate = safeGet(() => project.deferDate());
        if (deferDate) projectData.deferDate = deferDate.toISOString();
      } catch (e) {}
      
      try {
        const dueDate = safeGet(() => project.dueDate());
        if (dueDate) projectData.dueDate = dueDate.toISOString();
      } catch (e) {}
      
      try {
        const completionDate = safeGet(() => project.completionDate());
        if (completionDate) projectData.completionDate = completionDate.toISOString();
      } catch (e) {}
      
      try {
        const modifiedDate = project.modificationDate();
        if (modifiedDate) projectData.modifiedDate = modifiedDate.toISOString();
      } catch (e) {}
      
      // Add statistics if requested
      if (includeStats) {
        try {
          const tasks = project.flattenedTasks();
          let totalTasks = 0;
          let completedTasks = 0;
          let availableTasks = 0;
          let overdueCount = 0;
          let flaggedCount = 0;
          const now = new Date();
          
          for (let j = 0; j < tasks.length; j++) {
            const task = tasks[j];
            totalTasks++;
            
            try {
              if (task.completed()) {
                completedTasks++;
              } else {
                try {
                  if (!safeGet(() => task.effectivelyHidden(), true)) {
                    availableTasks++;
                  }
                } catch (e) {
                  availableTasks++;
                }
                try {
                  const dueDate = safeGet(() => task.dueDate());
                  if (dueDate && dueDate < now) {
                    overdueCount++;
                  }
                } catch (e) {}
              }
              
              if (task.flagged()) {
                flaggedCount++;
              }
            } catch (e) {}
          }
          
          projectData.stats = {
            totalTasks: totalTasks,
            completedTasks: completedTasks,
            availableTasks: availableTasks,
            completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            overdueCount: overdueCount,
            flaggedCount: flaggedCount
          };
        } catch (e) {
          // If we can't get tasks, just skip stats
          projectData.stats = {
            totalTasks: 0,
            completedTasks: 0,
            availableTasks: 0,
            completionRate: 0,
            overdueCount: 0,
            flaggedCount: 0
          };
        }
      }
      
      projects.push(projectData);
    }
    
    // Format output based on requested format
    if (format === 'csv') {
      // Flatten the data for CSV
      const headers = ['id', 'name', 'status', 'note', 'parentName', 'deferDate', 'dueDate', 'completionDate'];
      if (includeStats) {
        headers.push('totalTasks', 'completedTasks', 'availableTasks', 'completionRate', 'overdueCount', 'flaggedCount');
      }
      
      let csv = headers.join(',') + '\\n';
      
      for (const project of projects) {
        const row = headers.map(h => {
          let value = project[h];
          if (h.includes('Tasks') || h.includes('Count') || h === 'completionRate') {
            value = project.stats ? project.stats[h] : '';
          }
          if (value === undefined || value === null) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          return value.toString();
        });
        csv += row.join(',') + '\\n';
      }
      
      return JSON.stringify({
        format: 'csv',
        data: csv,
        count: projects.length
      });
    } else {
      // Default to JSON
      return JSON.stringify({
        format: 'json',
        data: projects,
        count: projects.length
      });
    }
  } catch (error) {
    return JSON.stringify({
      error: true,
      message: "Failed to export projects: " + error.toString()
    });
  }
`;
