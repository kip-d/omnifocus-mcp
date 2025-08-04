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
        if (!statusObj) {
          projectData.status = 'active';
        } else {
          // OmniFocus returns status as "active status", "done status", etc.
          // Normalize to match our API expectations
          const statusStr = statusObj.toString().toLowerCase();
          
          if (statusStr.includes('active')) projectData.status = 'active';
          else if (statusStr.includes('done')) projectData.status = 'done';
          else if (statusStr.includes('hold')) projectData.status = 'onHold';
          else if (statusStr.includes('dropped')) projectData.status = 'dropped';
          else projectData.status = 'active'; // Default
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
          // Use built-in properties for basic counts (much faster)
          const totalTasks = safeGet(() => project.numberOfTasks(), 0);
          const completedTasks = safeGet(() => project.numberOfCompletedTasks(), 0);
          const availableTasks = safeGet(() => project.numberOfAvailableTasks(), 0);
          
          // Only calculate detailed stats for smaller projects
          let overdueCount = 0;
          let flaggedCount = 0;
          
          // Skip detailed iteration for very large projects
          if (totalTasks > 0 && totalTasks < 500) {
            const tasks = project.flattenedTasks();
            const now = new Date();
            
            for (let j = 0; j < tasks.length; j++) {
              const task = tasks[j];
              
              try {
                if (!task.completed()) {
                  const dueDate = safeGet(() => task.dueDate());
                  if (dueDate && dueDate < now) {
                    overdueCount++;
                  }
                }
                
                if (task.flagged()) {
                  flaggedCount++;
                }
              } catch (e) {}
            }
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
    } else if (format === 'markdown') {
      // Build Markdown
      let markdown = '# OmniFocus Projects Export\\n\\n';
      markdown += 'Export date: ' + new Date().toISOString() + '\\n\\n';
      markdown += 'Total projects: ' + projects.length + '\\n\\n';
      
      // Group by status
      const byStatus = {
        active: [],
        onHold: [],
        done: [],
        dropped: []
      };
      
      for (const project of projects) {
        byStatus[project.status].push(project);
      }
      
      // Active projects
      if (byStatus.active.length > 0) {
        markdown += '## Active Projects\\n\\n';
        for (const project of byStatus.active) {
          markdown += '### ' + project.name + '\\n\\n';
          if (project.note) {
            markdown += project.note + '\\n\\n';
          }
          if (project.dueDate) {
            markdown += '- 📅 Due: ' + project.dueDate + '\\n';
          }
          if (project.deferDate) {
            markdown += '- ⏳ Deferred until: ' + project.deferDate + '\\n';
          }
          if (includeStats && project.stats) {
            markdown += '- 📊 Tasks: ' + project.stats.availableTasks + ' available / ' + project.stats.totalTasks + ' total (' + project.stats.completionRate + '% complete)\\n';
            if (project.stats.overdueCount > 0) {
              markdown += '- ⚠️ Overdue tasks: ' + project.stats.overdueCount + '\\n';
            }
            if (project.stats.flaggedCount > 0) {
              markdown += '- 🚩 Flagged tasks: ' + project.stats.flaggedCount + '\\n';
            }
          }
          markdown += '\\n';
        }
      }
      
      // On Hold projects
      if (byStatus.onHold.length > 0) {
        markdown += '## On Hold Projects\\n\\n';
        for (const project of byStatus.onHold) {
          markdown += '### ' + project.name + '\\n';
          if (project.note) {
            markdown += project.note + '\\n';
          }
          if (includeStats && project.stats) {
            markdown += 'Tasks: ' + project.stats.totalTasks + ' (' + project.stats.completionRate + '% complete)\\n';
          }
          markdown += '\\n';
        }
      }
      
      // Completed projects
      if (byStatus.done.length > 0) {
        markdown += '## Completed Projects\\n\\n';
        for (const project of byStatus.done) {
          markdown += '- ✅ ' + project.name;
          if (project.completionDate) {
            markdown += ' (completed ' + project.completionDate + ')';
          }
          markdown += '\\n';
        }
        markdown += '\\n';
      }
      
      // Dropped projects
      if (byStatus.dropped.length > 0) {
        markdown += '## Dropped Projects\\n\\n';
        for (const project of byStatus.dropped) {
          markdown += '- ❌ ' + project.name + '\\n';
        }
      }
      
      return JSON.stringify({
        format: 'markdown',
        data: markdown,
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