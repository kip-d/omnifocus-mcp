/**
 * Ultra-minimal update task script using JSON.parse to avoid parameter expansion
 */
export const UPDATE_TASK_ULTRA_MINIMAL_SCRIPT = `
  (() => {
    // Parse parameters from JSON strings to avoid expansion issues
    const taskId = {{taskId}};
    const updatesJson = {{updatesJson}};
    const updates = JSON.parse(updatesJson);
    
    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      
      // Find task
      let task = null;
      const tasks = doc.flattenedTasks();
      for (let i = 0; i < tasks.length; i++) {
        try {
          if (tasks[i].id() === taskId) {
            task = tasks[i];
            break;
          }
        } catch (e) {
          // Skip inaccessible tasks
        }
      }
      
      if (!task) {
        return JSON.stringify({ 
          error: true, 
          message: "Task not found: " + taskId
        });
      }
      
      // Simple property updates
      if (updates.name !== undefined) task.name = updates.name;
      if (updates.note !== undefined) task.note = updates.note || '';
      if (updates.flagged !== undefined) task.flagged = updates.flagged;
      if (updates.sequential !== undefined) task.sequential = updates.sequential;
      if (updates.estimatedMinutes !== undefined) task.estimatedMinutes = updates.estimatedMinutes;
      
      // Date updates
      if (updates.dueDate !== undefined) {
        task.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
      }
      if (updates.deferDate !== undefined) {
        task.deferDate = updates.deferDate ? new Date(updates.deferDate) : null;
      }
      
      // Clear operations via bridge
      if (updates.clearRepeatRule) {
        app.evaluateJavascript('Task.byIdentifier("' + taskId + '").repetitionRule = null; "ok"');
      }
      
      // Tag updates via bridge (critical for consistency)
      if (updates.tags !== undefined && Array.isArray(updates.tags)) {
        const tagScript = '(() => { const t = Task.byIdentifier("' + taskId + '"); if (!t) return "err"; t.clearTags(); ' +
          'for (const name of ' + JSON.stringify(updates.tags) + ') { ' +
          'let tag = flattenedTags.byName(name) || new Tag(name); t.addTag(tag); } ' +
          'return "ok"; })()';
        app.evaluateJavascript(tagScript);
      }
      
      // Project move via bridge
      if (updates.projectId !== undefined) {
        if (updates.projectId === null || updates.projectId === "" || updates.projectId === "null") {
          // Move to inbox
          app.evaluateJavascript('moveTasks([Task.byIdentifier("' + taskId + '")], inbox.beginning); "ok"');
        } else {
          // Validate and move to project
          const exists = app.evaluateJavascript('Project.byIdentifier("' + updates.projectId + '") ? "yes" : "no"');
          if (exists === "no") {
            return JSON.stringify({
              error: true,
              message: "Project not found: " + updates.projectId
            });
          }
          app.evaluateJavascript('moveTasks([Task.byIdentifier("' + taskId + '")], Project.byIdentifier("' + updates.projectId + '").beginning); "ok"');
        }
      }
      
      // Parent task assignment (action group support) via bridge
      if (updates.parentTaskId !== undefined) {
        if (updates.parentTaskId === null || updates.parentTaskId === "") {
          // Remove from parent - move to project root
          const moveResult = app.evaluateJavascript('(() => { const t = Task.byIdentifier("' + taskId + '"); if (!t) return "not_found"; const proj = t.containingProject; if (proj) { moveTasks([t], proj); return "moved"; } return "no_project"; })()');
          if (moveResult === "not_found") {
            return JSON.stringify({
              error: true,
              message: "Task not found when removing from parent: " + taskId
            });
          }
        } else {
          // Move to new parent task
          const parentExists = app.evaluateJavascript('Task.byIdentifier("' + updates.parentTaskId + '") ? "yes" : "no"');
          if (parentExists === "no") {
            return JSON.stringify({
              error: true,
              message: "Parent task not found: " + updates.parentTaskId
            });
          }
          const moveResult = app.evaluateJavascript('(() => { const t = Task.byIdentifier("' + taskId + '"); const p = Task.byIdentifier("' + updates.parentTaskId + '"); if (!t || !p) return "not_found"; moveTasks([t], p); return "moved"; })()');
          if (moveResult === "not_found") {
            return JSON.stringify({
              error: true,
              message: "Failed to move task to parent - task or parent not found"
            });
          }
        }
      }
      
      // Repeat rule via bridge
      if (updates.repeatRule) {
        const rule = updates.repeatRule;
        let rrule = '';
        
        if (rule.weekdays && rule.weekdays.length > 0) {
          const dayMap = {sunday: 'SU', monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH', friday: 'FR', saturday: 'SA'};
          const days = rule.weekdays.map(d => dayMap[d.toLowerCase()]).filter(d => d).join(',');
          rrule = 'FREQ=WEEKLY;INTERVAL=' + (rule.steps || 1) + ';BYDAY=' + days;
        } else {
          const freqMap = {day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY'};
          rrule = 'FREQ=' + (freqMap[rule.unit] || 'DAILY') + ';INTERVAL=' + (rule.steps || 1);
        }
        
        let method = 'Task.RepetitionMethod.Fixed';
        if (rule.method === 'start-after-completion') method = 'Task.RepetitionMethod.DeferUntilDate';
        else if (rule.method === 'due-after-completion') method = 'Task.RepetitionMethod.DueDate';
        
        // Set the repeat rule with the calculated method
        
        const ruleResult = app.evaluateJavascript('(() => { const t = Task.byIdentifier("' + taskId + '"); if (!t) return "not_found"; t.repetitionRule = new Task.RepetitionRule("' + rrule + '", ' + method + '); return t.repetitionRule ? "set" : "failed"; })()');
        
        if (ruleResult === "not_found") {
          return JSON.stringify({ error: true, message: "Task not found when setting repeat rule" });
        }
        if (ruleResult === "failed") {
          return JSON.stringify({ error: true, message: "Failed to set repeat rule" });
        }
      }
      
      // Return ultra-minimal response for maximum context savings
      // Level 2: success + ID only (83% token reduction vs full state)
      return JSON.stringify({
        success: true,
        id: taskId
      });
      
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error)
      });
    }
  })();
`;
