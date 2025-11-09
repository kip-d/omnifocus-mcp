/**
 * Bridge helper functions that ensure consistent use of evaluateJavascript
 * for operations that require it to bypass JXA limitations
 */

export const BRIDGE_HELPERS = `
  // Safe parameterized script formatter for bridge calls
  function __formatBridgeScript(template, params) {
    let script = template;
    for (const key in params) {
      const re = new RegExp('\\\\$' + key + '\\\\$', 'g');
      const v = params[key];
      let rep;
      if (v === null || v === undefined) rep = 'null';
      else if (typeof v === 'boolean' || typeof v === 'number') rep = String(v);
      else rep = JSON.stringify(v);
      script = script.replace(re, rep);
    }
    const leftovers = script.match(/\\$[A-Z_]+\\$/g);
    if (leftovers) throw new Error('Missing template parameters: ' + leftovers.join(', '));
    return script;
  }

  // Templates
  const __TEMPLATES = {
    GET_TAGS: '(() => { const t = Task.byIdentifier($TASK_ID$); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()',
    SET_TAGS: [
      '(() => {',
      '  const task = Task.byIdentifier($TASK_ID$);',
      '  if (!task) return JSON.stringify({success: false, error: "task_not_found"});',
      '  const tagNames = $TAGS$;',
      '  task.clearTags();',
      '  const added = [];',
      '  for (const name of tagNames) {',
      '    let tag = flattenedTags.byName(name);',
      '    if (!tag) tag = new Tag(name);',
      '    task.addTag(tag);',
      '    added.push(name);',
      '  }',
      '  return JSON.stringify({success: true, tags: added});',
      '})()'
    ].join('\n'),
    GET_REPEAT_RULE: [
      '(() => {',
      '  const task = Task.byIdentifier($TASK_ID$);',
      '  if (!task || !task.repetitionRule) return "null";',
      '  const rule = task.repetitionRule;',
      '  return JSON.stringify({ ruleString: rule.ruleString, method: rule.method.name });',
      '})()'
    ].join('\n'),
    MOVE_TASK: [
      '(() => {',
      '  const task = Task.byIdentifier($TASK_ID$);',
      '  if (!task) return JSON.stringify({ success: false, error: "task_not_found" });',
      '  const targetType = $TARGET_TYPE$;',
      '  const targetId = $TARGET_ID$;',
      '  try {',
      '    if (targetType === "inbox") {',
      '      moveTasks([task], inbox.beginning);',
      '      return JSON.stringify({ success: true, moved: "inbox" });',
      '    } else if (targetType === "project") {',
      '      const project = Project.byIdentifier(targetId);',
      '      if (!project) return JSON.stringify({ success: false, error: "project_not_found" });',
      '      moveTasks([task], project.beginning);',
      '      return JSON.stringify({ success: true, moved: "project", projectId: targetId });',
      '    } else if (targetType === "parent") {',
      '      const parent = Task.byIdentifier(targetId);',
      '      if (!parent) return JSON.stringify({ success: false, error: "parent_not_found" });',
      '      moveTasks([task], parent);',
      '      return JSON.stringify({ success: true, moved: "parent", parentId: targetId });',
      '    } else {',
      '      return JSON.stringify({ success: false, error: "invalid_target_type" });',
      '    }',
      '  } catch (e) {',
      '    return JSON.stringify({ success: false, error: String(e) });',
      '  }',
      '})()'
    ].join('\n')
  };

  // Bridge helpers built on templates
  function getTagsViaBridge(taskId, app) {
    try {
      const script = __formatBridgeScript(__TEMPLATES.GET_TAGS, { TASK_ID: taskId });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) { return [] }
  }

  function setTagsViaBridge(taskId, tagNames, app) {
    try {
      const script = __formatBridgeScript(__TEMPLATES.SET_TAGS, { TASK_ID: taskId, TAGS: tagNames });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) { return { success: false, error: String(e) } }
  }

  function getRepeatRuleViaBridge(taskId, app) {
    try {
      const script = __formatBridgeScript(__TEMPLATES.GET_REPEAT_RULE, { TASK_ID: taskId });
      const result = app.evaluateJavascript(script);
      return result === 'null' ? null : JSON.parse(result);
    } catch (e) { return null }
  }

  function moveTaskViaBridge(taskId, targetType, targetId, app) {
    try {
      const script = __formatBridgeScript(__TEMPLATES.MOVE_TASK, { TASK_ID: taskId, TARGET_TYPE: targetType, TARGET_ID: targetId });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result); // { success: boolean, ... }
    } catch (e) { return { success: false, error: String(e) } }
  }

  // Set repetition rule on a task
  const __SET_RULE = [
    '(() => {',
    '  const task = Task.byIdentifier($TASK_ID$);',
    '  if (!task) return JSON.stringify({ success: false, error: "task_not_found" });',
    '  try {',
    '    const rule = new Task.RepetitionRule($RULE_STRING$, Task.RepetitionMethod[$METHOD$]);',
    '    task.repetitionRule = rule;',
    '    return JSON.stringify({ success: true });',
    '  } catch (e) {',
    '    return JSON.stringify({ success: false, error: String(e) });',
    '  }',
    '})()'
  ].join('\n');

  function setRepeatRuleViaBridge(taskId, ruleString, methodName, app) {
    try {
      const script = __formatBridgeScript(__SET_RULE, { TASK_ID: taskId, RULE_STRING: ruleString, METHOD: methodName });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) { return { success: false, error: String(e) } }
  }

  // Clear repetition rule
  const __CLEAR_RULE = '(() => { const t = Task.byIdentifier($TASK_ID$); if (!t) return JSON.stringify({success:false,error:"task_not_found"}); t.repetitionRule = null; JSON.stringify({success:true}) })()';
  function clearRepeatRuleViaBridge(taskId, app) {
    try {
      const script = __formatBridgeScript(__CLEAR_RULE, { TASK_ID: taskId });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) { return { success: false, error: String(e) } }
  }

  // Safer version of safeGetTags that tries bridge first
  function safeGetTagsWithBridge(task, app) {
    try {
      return getTagsViaBridge(task.id(), app);
    } catch (e) {
      try {
        const tags = task.tags();
        if (!tags) return [];
        const names = [];
        for (let i = 0; i < tags.length; i++) {
          const n = tags[i].name();
          if (n) names.push(n);
        }
        return names;
      } catch (e2) { return [] }
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
