import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to export projects from OmniFocus in various formats
 * 
 * Features:
 * - Export to JSON or CSV format
 * - Optional project statistics
 * - Includes project hierarchy (parent/child relationships)
 * - Project status and metadata
 * - Proper CSV formatting with flattened stats
 */
export const EXPORT_PROJECTS_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const format = {{format}};
    const includeStats = {{includeStats}};
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
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
    return formatError(error, 'export_projects');
  }
  })();
`;