/**
 * Minimal Tag Bridge - Focused only on tag assignment after task creation
 * Designed to fit within JXA size limits while providing reliable tag visibility
 */

export const MINIMAL_TAG_BRIDGE = `
  // Minimal template formatter for tag operations only
  function __formatTagScript(template, params) {
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
    return script;
  }

  // OmniJS template for setting tags - reliable visibility
  const __SET_TAGS_TEMPLATE = [
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
  ].join('\\n');

  // Apply tags using OmniJS bridge for immediate visibility
  function bridgeSetTags(app, taskId, tagNames) {
    if (!tagNames || tagNames.length === 0) {
      return {success: true, tags: []};
    }

    try {
      const script = __formatTagScript(__SET_TAGS_TEMPLATE, {
        TASK_ID: taskId,
        TAGS: tagNames
      });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) {
      return {success: false, error: e.message};
    }
  }

  // OmniJS template for setting plannedDate - reliable persistence
  const __SET_PLANNED_DATE_TEMPLATE = [
    '(() => {',
    '  const task = Task.byIdentifier($TASK_ID$);',
    '  if (!task) return JSON.stringify({success: false, error: "task_not_found"});',
    '  const dateValue = $DATE_VALUE$;',
    '  if (dateValue === null) {',
    '    task.plannedDate = null;',
    '  } else {',
    '    task.plannedDate = new Date(dateValue);',
    '  }',
    '  return JSON.stringify({success: true, plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null});',
    '})()'
  ].join('\\n');

  // Set plannedDate using OmniJS bridge for reliable persistence
  function bridgeSetPlannedDate(app, taskId, dateValue) {
    try {
      const script = __formatTagScript(__SET_PLANNED_DATE_TEMPLATE, {
        TASK_ID: taskId,
        DATE_VALUE: dateValue
      });
      const result = app.evaluateJavascript(script);
      return JSON.parse(result);
    } catch (e) {
      return {success: false, error: e.message};
    }
  }
`;

/**
 * Get minimal tag bridge helpers - only tag operations, ~1KB
 */
export function getMinimalTagBridge(): string {
  return MINIMAL_TAG_BRIDGE;
}
