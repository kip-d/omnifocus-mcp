/**
 * Bridge helper functions that ensure consistent use of evaluateJavascript
 * for operations that require it to bypass JXA limitations
 */

export const BRIDGE_HELPERS = `
  // Get tags via bridge - MUST use this after setting tags via bridge
  function getTagsViaBridge(taskId, app) {
    try {
      const script = '(() => { const t = Task.byIdentifier("' + taskId + '"); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()';
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) {
      // Fallback to empty array
      return [];
    }
  }
  
  // Set tags via bridge - ensures tags are properly created and assigned
  function setTagsViaBridge(taskId, tagNames, app) {
    try {
      const script = [
        '(() => {',
        '  const task = Task.byIdentifier("' + taskId + '");',
        '  if (!task) return JSON.stringify({success: false, error: "Task not found"});',
        '  ',
        '  task.clearTags();',
        '  const added = [];',
        '  ',
        '  for (const name of ' + JSON.stringify(tagNames) + ') {',
        '    let tag = flattenedTags.byName(name);',
        '    if (!tag) tag = new Tag(name);',
        '    task.addTag(tag);',
        '    added.push(name);',
        '  }',
        '  ',
        '  return JSON.stringify({success: true, tags: added});',
        '})()'
      ].join('');
      
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) {
      return {success: false, error: e.message};
    }
  }
  
  // Get repeat rule via bridge
  function getRepeatRuleViaBridge(taskId, app) {
    try {
      const script = [
        '(() => {',
        '  const task = Task.byIdentifier("' + taskId + '");',
        '  if (!task || !task.repetitionRule) return "null";',
        '  ',
        '  const rule = task.repetitionRule;',
        '  return JSON.stringify({',
        '    ruleString: rule.ruleString,',
        '    method: rule.method.name',
        '  });',
        '})()'
      ].join('');
      
      const result = app.evaluateJavascript(script);
      return result === "null" ? null : JSON.parse(result);
    } catch (e) {
      return null;
    }
  }
  
  // Move task via bridge - handles project/parent/inbox moves
  function moveTaskViaBridge(taskId, targetType, targetId, app) {
    try {
      let moveScript = '';
      
      if (targetType === 'inbox') {
        moveScript = [
          '(() => {',
          '  const task = Task.byIdentifier("' + taskId + '");',
          '  if (!task) return "not_found";',
          '  moveTasks([task], inbox.beginning);',
          '  return "moved";',
          '})()'
        ].join('');
      } else if (targetType === 'project') {
        moveScript = [
          '(() => {',
          '  const task = Task.byIdentifier("' + taskId + '");',
          '  const project = Project.byIdentifier("' + targetId + '");',
          '  if (!task || !project) return "not_found";',
          '  moveTasks([task], project.beginning);',
          '  return "moved";',
          '})()'
        ].join('');
      } else if (targetType === 'parent') {
        moveScript = [
          '(() => {',
          '  const task = Task.byIdentifier("' + taskId + '");',
          '  const parent = Task.byIdentifier("' + targetId + '");',
          '  if (!task || !parent) return "not_found";',
          '  moveTasks([task], parent);',
          '  return "moved";',
          '})()'
        ].join('');
      }
      
      const result = app.evaluateJavascript(moveScript);
      return result === "moved";
    } catch (e) {
      return false;
    }
  }
  
  // Safer version of safeGetTags that tries bridge first
  function safeGetTagsWithBridge(task, app) {
    try {
      // Try bridge first
      const taskId = task.id();
      return getTagsViaBridge(taskId, app);
    } catch (e) {
      // Fallback to JXA
      try {
        const tags = task.tags();
        if (!tags) return [];
        const tagNames = [];
        for (let i = 0; i < tags.length; i++) {
          const tagName = tags[i].name();
          if (tagName) tagNames.push(tagName);
        }
        return tagNames;
      } catch (e2) {
        return [];
      }
    }
  }
`;

/**
 * Replace all safeGetTags calls with bridge version
 */
export const BRIDGE_MIGRATION = `
  // Override the old safeGetTags to use bridge
  const originalSafeGetTags = safeGetTags;
  function safeGetTags(task) {
    const app = Application('OmniFocus');
    return safeGetTagsWithBridge(task, app);
  }
`;
