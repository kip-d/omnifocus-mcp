import { getAllHelpers } from '../shared/helpers.js';

/**
 * Script to export tasks from OmniFocus in various formats
 * 
 * Features:
 * - Export to JSON or CSV format
 * - Flexible field selection
 * - Comprehensive filtering options
 * - Preserves all task metadata
 * - Proper CSV escaping for complex data
 */
export const EXPORT_TASKS_SCRIPT = `
  const filter = {{filter}};
  const format = {{format}};
  const fields = {{fields}};
  
  ${getAllHelpers()}
  
  try {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
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
      
      if (filter.flagged !== undefined && isFlagged(task) !== filter.flagged) continue;
      
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
    return formatError(error, 'export_tasks');
  }
`;