/**
 * Hybrid export tasks script using evaluateJavascript bridge
 * Massive performance improvement for large exports
 */

import { getAllHelpers } from '../shared/helpers.js';

/**
 * Export tasks using Omni Automation API for better performance
 */
export const EXPORT_TASKS_HYBRID_SCRIPT = `
  ${getAllHelpers()}
  
  (() => {
    const filter = {{filter}};
    const format = {{format}};
    const fields = {{fields}};
    
    try {
      const startTime = Date.now();
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Build the Omni Automation script for fast export
      const omniScript = \`
        (() => {
          const filter = \${JSON.stringify(filter)};
          const format = '\${format}';
          const fields = \${JSON.stringify(fields)} || ['name', 'project', 'dueDate', 'tags', 'flagged', 'note'];
          const tasks = [];
          const limit = filter.limit || 1000;
          const now = new Date();
          
          // Helper to check if task matches date filter
          function matchesDateFilter(date, before, after) {
            if (!date) return !before && !after;
            const dateTime = date.getTime();
            if (before && dateTime > new Date(before).getTime()) return false;
            if (after && dateTime < new Date(after).getTime()) return false;
            return true;
          }
          
          // Helper to get task tags
          function getTaskTags(task) {
            try {
              return task.tags.map(t => t.name);
            } catch (e) {
              return [];
            }
          }
          
          // Process all tasks with filtering
          let count = 0;
          for (const task of flattenedTasks) {
            // Apply filters
            if (filter.available !== undefined && task.effectivelyHidden === filter.available) continue;
            if (filter.completed !== undefined && task.completed !== filter.completed) continue;
            if (filter.flagged !== undefined && task.flagged !== filter.flagged) continue;
            
            // Project filter
            if (filter.project || filter.projectId) {
              const project = task.containingProject;
              if (!project) continue;
              if (filter.project && project.name !== filter.project) continue;
              if (filter.projectId && project.id.primaryKey !== filter.projectId) continue;
            }
            
            // Tags filter
            if (filter.tags && filter.tags.length > 0) {
              const taskTags = getTaskTags(task);
              const hasAllTags = filter.tags.every(tag => taskTags.includes(tag));
              if (!hasAllTags) continue;
            }
            
            // Search filter
            if (filter.search) {
              const searchTerm = filter.search.toLowerCase();
              const nameMatch = task.name.toLowerCase().includes(searchTerm);
              const noteMatch = task.note ? task.note.toLowerCase().includes(searchTerm) : false;
              if (!nameMatch && !noteMatch) continue;
            }
            
            // Build task object with requested fields
            const taskData = {};
            
            if (fields.includes('id')) {
              taskData.id = task.id.primaryKey;
            }
            
            if (fields.includes('name')) {
              taskData.name = task.name;
            }
            
            if (fields.includes('note')) {
              taskData.note = task.note || '';
            }
            
            if (fields.includes('project') || fields.includes('projectId')) {
              const project = task.containingProject;
              if (project) {
                if (fields.includes('project')) taskData.project = project.name;
                if (fields.includes('projectId')) taskData.projectId = project.id.primaryKey;
              } else {
                if (fields.includes('project')) taskData.project = '';
                if (fields.includes('projectId')) taskData.projectId = '';
              }
            }
            
            if (fields.includes('tags')) {
              taskData.tags = getTaskTags(task);
            }
            
            if (fields.includes('deferDate')) {
              taskData.deferDate = task.deferDate ? task.deferDate.toISOString() : '';
            }
            
            if (fields.includes('dueDate')) {
              taskData.dueDate = task.dueDate ? task.dueDate.toISOString() : '';
            }
            
            if (fields.includes('completed')) {
              taskData.completed = task.completed;
            }
            
            if (fields.includes('completionDate')) {
              taskData.completionDate = task.completionDate ? task.completionDate.toISOString() : '';
            }
            
            if (fields.includes('flagged')) {
              taskData.flagged = task.flagged;
            }
            
            if (fields.includes('estimated') || fields.includes('estimatedMinutes')) {
              taskData.estimatedMinutes = task.estimatedMinutes || 0;
            }
            
            if (fields.includes('created') || fields.includes('createdDate')) {
              taskData.createdDate = task.creationDate ? task.creationDate.toISOString() : '';
            }
            
            if (fields.includes('modified') || fields.includes('modifiedDate')) {
              taskData.modifiedDate = task.modificationDate ? task.modificationDate.toISOString() : '';
            }
            
            tasks.push(taskData);
            count++;
            
            if (count >= limit) break;
          }
          
          return JSON.stringify({
            tasks: tasks,
            count: tasks.length,
            limited: count >= limit
          });
        })()
      \`;
      
      // Execute via bridge
      app.includeStandardAdditions = true;
      const resultJson = app.evaluateJavascript(omniScript);
      const result = JSON.parse(resultJson);
      
      // Format output based on requested format
      let outputData;
      
      if (format === 'csv') {
        // Build CSV
        if (result.tasks.length === 0) {
          const emptyHeaders = fields.join(',');
          outputData = emptyHeaders + '\\n';
        } else {
          // Use requested fields order for headers
          const headers = fields;
          let csv = headers.join(',') + '\\n';
          
          for (const task of result.tasks) {
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
          outputData = csv;
        }
      } else if (format === 'markdown') {
        // Build Markdown
        let markdown = '# OmniFocus Tasks Export\\n\\n';
        markdown += 'Export date: ' + new Date().toISOString() + '\\n\\n';
        markdown += 'Total tasks: ' + result.tasks.length + '\\n\\n';
        
        // Group by project
        const byProject = {};
        const inbox = [];
        
        for (const task of result.tasks) {
          if (task.project) {
            if (!byProject[task.project]) {
              byProject[task.project] = [];
            }
            byProject[task.project].push(task);
          } else {
            inbox.push(task);
          }
        }
        
        // Inbox tasks
        if (inbox.length > 0) {
          markdown += '## Inbox\\n\\n';
          for (const task of inbox) {
            markdown += '- [' + (task.completed ? 'x' : ' ') + '] ' + task.name;
            if (task.flagged) markdown += ' 🚩';
            if (task.dueDate) markdown += ' 📅 Due: ' + task.dueDate.split('T')[0];
            if (task.tags && task.tags.length > 0) markdown += ' 🏷️ ' + task.tags.join(', ');
            markdown += '\\n';
            if (task.note) {
              markdown += '  > ' + task.note.replace(/\\n/g, '\\n  > ') + '\\n';
            }
          }
        }
        
        // Project tasks
        for (const projectName in byProject) {
          markdown += '\\n## ' + projectName + '\\n\\n';
          for (const task of byProject[projectName]) {
            markdown += '- [' + (task.completed ? 'x' : ' ') + '] ' + task.name;
            if (task.flagged) markdown += ' 🚩';
            if (task.dueDate) markdown += ' 📅 Due: ' + task.dueDate.split('T')[0];
            if (task.tags && task.tags.length > 0) markdown += ' 🏷️ ' + task.tags.join(', ');
            markdown += '\\n';
            if (task.note) {
              markdown += '  > ' + task.note.replace(/\\n/g, '\\n  > ') + '\\n';
            }
          }
        }
        
        outputData = markdown;
      } else {
        // JSON format (default)
        outputData = result.tasks;
      }
      
      const endTime = Date.now();
      
      return JSON.stringify({
        format: format,
        data: outputData,
        count: result.count,
        limited: result.limited,
        query_time_ms: endTime - startTime,
        message: result.limited ? 'Export limited to ' + (filter.limit || 1000) + ' tasks. Use filter.limit to adjust.' : undefined
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: "Failed to export tasks: " + error.toString(),
        details: error.message
      });
    }
  })();
`;