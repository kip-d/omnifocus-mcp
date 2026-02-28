/**
 * ScriptBuilder -- generates safe JXA/OmniJS scripts with a single injection point.
 *
 * Design principles:
 * 1. ALL external data enters via `const PARAMS = <json>;` -- one line, no other interpolation.
 * 2. No template placeholders (no `{{}}` style).
 * 3. Never use whose()/where() -- they cause 25+ second timeouts.
 * 4. JXA uses method calls: task.name(), task.id()
 * 5. OmniJS uses property access: task.name, task.id.primaryKey
 * 6. Bridge required for: tag assignment, plannedDate, repetitionRule, task movement.
 */

import type {
  ExecStrategy,
  GeneratedScript,
  ProductivityStatsParams,
  ProjectFilter,
  ScriptParams,
  TaskCreateData,
  TaskFilter,
  TaskUpdateChanges,
} from './types.js';

// Re-export for convenience
export { ExecStrategy } from './types.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a script body in a JXA IIFE with PARAMS injection.
 * The body can assume `PARAMS`, `app`, and `doc` are in scope.
 */
function wrapJxa(params: ScriptParams, body: string): string {
  return [
    '(() => {',
    `  const PARAMS = ${JSON.stringify(params)};`,
    '  const app = Application("OmniFocus");',
    '  const doc = app.defaultDocument();',
    body,
    '})()',
  ].join('\n');
}

/**
 * Wrap an OmniJS bridge script. Runs inside app.evaluateJavascript().
 * The body can assume `PARAMS` is in scope and should return a JSON string.
 */
function wrapBridge(params: ScriptParams, body: string): string {
  const innerScript = ['(() => {', `  const PARAMS = ${JSON.stringify(params)};`, body, '})()'].join('\n');

  return [
    '(() => {',
    '  const app = Application("OmniFocus");',
    `  const result = app.evaluateJavascript(${JSON.stringify(innerScript)});`,
    '  return result;',
    '})()',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Script body constants
// ---------------------------------------------------------------------------

/**
 * JXA body: list tasks with filtering.
 * Iterates flattenedTasks() with a for loop, applies filters from PARAMS,
 * collects results up to PARAMS.limit. Never uses whose()/where().
 */
const LIST_TASKS_BODY = `
  var allTasks = doc.flattenedTasks();
  var results = [];
  var total = 0;
  var offset = PARAMS.offset || 0;
  var limit = PARAMS.limit || 50;
  var skipped = 0;

  for (var i = 0; i < allTasks.length; i++) {
    var t = allTasks[i];

    // Filter: completed
    if (PARAMS.completed === false && t.completed()) continue;
    if (PARAMS.completed === true && !t.completed()) continue;

    // Filter: flagged
    if (PARAMS.flagged === true && !t.flagged()) continue;
    if (PARAMS.flagged === false && t.flagged()) continue;

    // Filter: inbox (project === null means inbox only)
    if (PARAMS.project === null) {
      if (t.containingProject()) continue;
    } else if (PARAMS.project !== undefined) {
      var proj = t.containingProject();
      if (!proj || proj.name() !== PARAMS.project) continue;
    }

    // Filter: tags
    if (PARAMS.tag !== undefined) {
      var taskTags = t.tags();
      var tagNames = taskTags ? taskTags.map(function(tg) { return tg.name(); }) : [];
      var filterTags = Array.isArray(PARAMS.tag) ? PARAMS.tag : [PARAMS.tag];
      var tagMode = PARAMS.tagMode || 'any';

      if (tagMode === 'any') {
        var found = false;
        for (var ti = 0; ti < filterTags.length; ti++) {
          if (tagNames.indexOf(filterTags[ti]) !== -1) { found = true; break; }
        }
        if (!found) continue;
      } else if (tagMode === 'all') {
        var hasAll = true;
        for (var ti = 0; ti < filterTags.length; ti++) {
          if (tagNames.indexOf(filterTags[ti]) === -1) { hasAll = false; break; }
        }
        if (!hasAll) continue;
      } else if (tagMode === 'none') {
        var hasAny = false;
        for (var ti = 0; ti < filterTags.length; ti++) {
          if (tagNames.indexOf(filterTags[ti]) !== -1) { hasAny = true; break; }
        }
        if (hasAny) continue;
      }
    }

    // Filter: search (case-insensitive substring match on name and note)
    if (PARAMS.search) {
      var searchLower = PARAMS.search.toLowerCase();
      var nameStr = t.name() || '';
      var noteStr = t.note() || '';
      if (nameStr.toLowerCase().indexOf(searchLower) === -1 &&
          noteStr.toLowerCase().indexOf(searchLower) === -1) continue;
    }

    // Filter: date ranges
    if (PARAMS.dueBefore || PARAMS.dueAfter) {
      var due = t.dueDate();
      if (!due) { if (PARAMS.dueBefore || PARAMS.dueAfter) continue; }
      else {
        if (PARAMS.dueBefore && due > new Date(PARAMS.dueBefore)) continue;
        if (PARAMS.dueAfter && due < new Date(PARAMS.dueAfter)) continue;
      }
    }

    if (PARAMS.deferBefore || PARAMS.deferAfter) {
      var defer = t.deferDate();
      if (!defer) continue;
      if (PARAMS.deferBefore && defer > new Date(PARAMS.deferBefore)) continue;
      if (PARAMS.deferAfter && defer < new Date(PARAMS.deferAfter)) continue;
    }

    if (PARAMS.plannedBefore || PARAMS.plannedAfter) {
      var planned = t.plannedDate();
      if (!planned) continue;
      if (PARAMS.plannedBefore && planned > new Date(PARAMS.plannedBefore)) continue;
      if (PARAMS.plannedAfter && planned < new Date(PARAMS.plannedAfter)) continue;
    }

    // Filter: available / blocked
    if (PARAMS.available === true && t.blocked()) continue;
    if (PARAMS.blocked === true && !t.blocked()) continue;

    // Filter: since (modification date)
    if (PARAMS.since) {
      var modified = t.modificationDate();
      if (!modified || modified < new Date(PARAMS.since)) continue;
    }

    // Passed all filters
    total++;
    if (skipped < offset) { skipped++; continue; }
    if (results.length >= limit) continue;

    // Build result object
    var taskObj = {};
    taskObj.id = t.id();
    taskObj.name = t.name();

    var fields = PARAMS.fields;
    if (!fields || fields.indexOf('completed') !== -1) taskObj.completed = t.completed() || false;
    if (!fields || fields.indexOf('flagged') !== -1) taskObj.flagged = t.flagged() || false;

    if (!fields || fields.indexOf('dueDate') !== -1) {
      var dd = t.dueDate();
      taskObj.dueDate = dd ? dd.toISOString() : null;
    }
    if (!fields || fields.indexOf('deferDate') !== -1) {
      var dfd = t.deferDate();
      taskObj.deferDate = dfd ? dfd.toISOString() : null;
    }
    if (!fields || fields.indexOf('plannedDate') !== -1) {
      var pd = t.plannedDate();
      taskObj.plannedDate = pd ? pd.toISOString() : null;
    }
    if (!fields || fields.indexOf('note') !== -1) taskObj.note = t.note() || '';
    if (!fields || fields.indexOf('tags') !== -1) {
      var tgs = t.tags();
      taskObj.tags = tgs ? tgs.map(function(tg) { return tg.name(); }) : [];
    }
    if (!fields || fields.indexOf('project') !== -1) {
      var p = t.containingProject();
      taskObj.project = p ? p.name() : null;
      taskObj.projectId = p ? p.id() : null;
    }
    if (!fields || fields.indexOf('estimatedMinutes') !== -1) {
      var est = t.estimatedMinutes();
      taskObj.estimatedMinutes = est || null;
    }
    if (!fields || fields.indexOf('repetitionRule') !== -1) {
      taskObj.repetitionRule = t.repetitionRule() || null;
    }

    results.push(taskObj);
  }

  return JSON.stringify({ tasks: results, total: total });
`;

/**
 * JXA body: get a single task by ID.
 */
const GET_TASK_BODY = `
  var allTasks = doc.flattenedTasks();
  for (var i = 0; i < allTasks.length; i++) {
    var t = allTasks[i];
    if (t.id() !== PARAMS.id) continue;

    var taskObj = {};
    taskObj.id = t.id();
    taskObj.name = t.name();
    taskObj.completed = t.completed() || false;
    taskObj.flagged = t.flagged() || false;

    var dd = t.dueDate();
    taskObj.dueDate = dd ? dd.toISOString() : null;
    var dfd = t.deferDate();
    taskObj.deferDate = dfd ? dfd.toISOString() : null;
    var pd = t.plannedDate();
    taskObj.plannedDate = pd ? pd.toISOString() : null;

    taskObj.note = t.note() || '';

    var tgs = t.tags();
    taskObj.tags = tgs ? tgs.map(function(tg) { return tg.name(); }) : [];

    var p = t.containingProject();
    taskObj.project = p ? p.name() : null;
    taskObj.projectId = p ? p.id() : null;

    taskObj.estimatedMinutes = t.estimatedMinutes() || null;
    taskObj.repetitionRule = t.repetitionRule() || null;

    var parent = t.parentTask();
    taskObj.parentTaskId = parent ? parent.id() : null;

    taskObj.blocked = t.blocked() || false;

    return JSON.stringify({ task: taskObj });
  }
  return JSON.stringify({ task: null, error: "Task not found" });
`;

/**
 * JXA body: create a task (simple properties only).
 */
const CREATE_TASK_SIMPLE_BODY = `
  var props = { name: PARAMS.name };
  if (PARAMS.note !== undefined) props.note = PARAMS.note;
  if (PARAMS.flagged !== undefined) props.flagged = PARAMS.flagged;
  if (PARAMS.dueDate) props.dueDate = new Date(PARAMS.dueDate);
  if (PARAMS.deferDate) props.deferDate = new Date(PARAMS.deferDate);
  if (PARAMS.estimatedMinutes) props.estimatedMinutes = PARAMS.estimatedMinutes;

  var task = app.Task(props);

  if (PARAMS.project) {
    var projects = doc.flattenedProjects();
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].name() === PARAMS.project) {
        projects[i].tasks.push(task);
        break;
      }
    }
  } else {
    doc.inboxTasks.push(task);
  }

  return JSON.stringify({
    id: task.id(),
    name: task.name()
  });
`;

/**
 * JXA body: create a task, then bridge for tags/plannedDate (HYBRID).
 * Bridge sub-scripts receive data via a BP (bridgeParams) object -- no string concatenation.
 */
const CREATE_TASK_HYBRID_BODY = `
  var props = { name: PARAMS.name };
  if (PARAMS.note !== undefined) props.note = PARAMS.note;
  if (PARAMS.flagged !== undefined) props.flagged = PARAMS.flagged;
  if (PARAMS.dueDate) props.dueDate = new Date(PARAMS.dueDate);
  if (PARAMS.deferDate) props.deferDate = new Date(PARAMS.deferDate);
  if (PARAMS.estimatedMinutes) props.estimatedMinutes = PARAMS.estimatedMinutes;

  var task = app.Task(props);

  if (PARAMS.project) {
    var projects = doc.flattenedProjects();
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].name() === PARAMS.project) {
        projects[i].tasks.push(task);
        break;
      }
    }
  } else {
    doc.inboxTasks.push(task);
  }

  var taskId = task.id();

  // Bridge for complex properties -- data injected via BP object
  if (PARAMS.plannedDate) {
    var bp1 = { taskId: taskId, plannedDate: PARAMS.plannedDate };
    var bridgePlanned = '(() => {' +
      'var BP = ' + JSON.stringify(bp1) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) { t.plannedDate = new Date(BP.plannedDate); }' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgePlanned);
  }

  if (PARAMS.tags && PARAMS.tags.length > 0) {
    var bp2 = { taskId: taskId, tags: PARAMS.tags };
    var bridgeTags = '(() => {' +
      'var BP = ' + JSON.stringify(bp2) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) {' +
        'BP.tags.forEach(function(n) {' +
          'var tag = flattenedTags.byName(n);' +
          'if (!tag) { tag = new Tag(n); }' +
          't.addTag(tag);' +
        '});' +
      '}' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgeTags);
  }

  return JSON.stringify({
    id: taskId,
    name: task.name()
  });
`;

/**
 * JXA body: update simple task properties (name, note, flagged, dueDate, deferDate).
 */
const UPDATE_TASK_SIMPLE_BODY = `
  var allTasks = doc.flattenedTasks();
  var found = null;
  for (var i = 0; i < allTasks.length; i++) {
    if (allTasks[i].id() === PARAMS.id) { found = allTasks[i]; break; }
  }
  if (!found) return JSON.stringify({ error: "Task not found" });

  if (PARAMS.changes.name !== undefined) found.name = PARAMS.changes.name;
  if (PARAMS.changes.note !== undefined) found.note = PARAMS.changes.note;
  if (PARAMS.changes.flagged !== undefined) found.flagged = PARAMS.changes.flagged;
  if (PARAMS.changes.dueDate !== undefined) {
    found.dueDate = PARAMS.changes.dueDate ? new Date(PARAMS.changes.dueDate) : null;
  }
  if (PARAMS.changes.deferDate !== undefined) {
    found.deferDate = PARAMS.changes.deferDate ? new Date(PARAMS.changes.deferDate) : null;
  }
  if (PARAMS.changes.estimatedMinutes !== undefined) {
    found.estimatedMinutes = PARAMS.changes.estimatedMinutes;
  }

  return JSON.stringify({
    id: found.id(),
    name: found.name(),
    updated: true
  });
`;

/**
 * JXA body: update task with bridge for complex properties (tags, plannedDate, repetition).
 * Bridge sub-scripts receive data via a BP (bridgeParams) object -- no string concatenation.
 */
const UPDATE_TASK_BRIDGE_BODY = `
  var allTasks = doc.flattenedTasks();
  var found = null;
  for (var i = 0; i < allTasks.length; i++) {
    if (allTasks[i].id() === PARAMS.id) { found = allTasks[i]; break; }
  }
  if (!found) return JSON.stringify({ error: "Task not found" });

  // Simple properties in JXA
  if (PARAMS.changes.name !== undefined) found.name = PARAMS.changes.name;
  if (PARAMS.changes.note !== undefined) found.note = PARAMS.changes.note;
  if (PARAMS.changes.flagged !== undefined) found.flagged = PARAMS.changes.flagged;
  if (PARAMS.changes.dueDate !== undefined) {
    found.dueDate = PARAMS.changes.dueDate ? new Date(PARAMS.changes.dueDate) : null;
  }
  if (PARAMS.changes.deferDate !== undefined) {
    found.deferDate = PARAMS.changes.deferDate ? new Date(PARAMS.changes.deferDate) : null;
  }
  if (PARAMS.changes.estimatedMinutes !== undefined) {
    found.estimatedMinutes = PARAMS.changes.estimatedMinutes;
  }

  var taskId = found.id();

  // Bridge for complex properties -- data injected via BP object
  if (PARAMS.changes.plannedDate !== undefined) {
    var bp1 = { taskId: taskId, plannedDate: PARAMS.changes.plannedDate };
    var bridgePlanned = '(() => {' +
      'var BP = ' + JSON.stringify(bp1) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) { t.plannedDate = BP.plannedDate ? new Date(BP.plannedDate) : null; }' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgePlanned);
  }

  if (PARAMS.changes.tags !== undefined) {
    var bp2 = { taskId: taskId, tags: PARAMS.changes.tags };
    var bridgeTags = '(() => {' +
      'var BP = ' + JSON.stringify(bp2) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) {' +
        't.clearTags();' +
        'BP.tags.forEach(function(n) {' +
          'var tag = flattenedTags.byName(n);' +
          'if (!tag) { tag = new Tag(n); }' +
          't.addTag(tag);' +
        '});' +
      '}' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgeTags);
  }

  if (PARAMS.changes.addTags && PARAMS.changes.addTags.length > 0) {
    var bp3 = { taskId: taskId, addTags: PARAMS.changes.addTags };
    var bridgeAdd = '(() => {' +
      'var BP = ' + JSON.stringify(bp3) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) {' +
        'BP.addTags.forEach(function(n) {' +
          'var tag = flattenedTags.byName(n);' +
          'if (!tag) { tag = new Tag(n); }' +
          't.addTag(tag);' +
        '});' +
      '}' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgeAdd);
  }

  if (PARAMS.changes.removeTags && PARAMS.changes.removeTags.length > 0) {
    var bp4 = { taskId: taskId, removeTags: PARAMS.changes.removeTags };
    var bridgeRemove = '(() => {' +
      'var BP = ' + JSON.stringify(bp4) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) {' +
        'BP.removeTags.forEach(function(n) {' +
          'var tag = flattenedTags.byName(n);' +
          'if (tag) { t.removeTag(tag); }' +
        '});' +
      '}' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgeRemove);
  }

  if (PARAMS.changes.repetitionRule !== undefined) {
    var bp5 = { taskId: taskId, repetitionRule: PARAMS.changes.repetitionRule };
    var bridgeRule = '(() => {' +
      'var BP = ' + JSON.stringify(bp5) + ';' +
      'var t = Task.byIdentifier(BP.taskId);' +
      'if (t) { t.repetitionRule = BP.repetitionRule; }' +
      'return JSON.stringify({success: true});' +
    '})()';
    app.evaluateJavascript(bridgeRule);
  }

  return JSON.stringify({
    id: taskId,
    name: found.name(),
    updated: true
  });
`;

/**
 * JXA body: mark a task as completed.
 */
const COMPLETE_TASK_BODY = `
  var allTasks = doc.flattenedTasks();
  for (var i = 0; i < allTasks.length; i++) {
    if (allTasks[i].id() === PARAMS.id) {
      allTasks[i].completed = true;
      return JSON.stringify({ id: PARAMS.id, completed: true });
    }
  }
  return JSON.stringify({ error: "Task not found" });
`;

/**
 * JXA body: delete a task.
 */
const DELETE_TASK_BODY = `
  var allTasks = doc.flattenedTasks();
  for (var i = 0; i < allTasks.length; i++) {
    if (allTasks[i].id() === PARAMS.id) {
      app.delete(allTasks[i]);
      return JSON.stringify({ id: PARAMS.id, deleted: true });
    }
  }
  return JSON.stringify({ error: "Task not found" });
`;

/**
 * JXA body: list projects with optional filtering.
 */
const LIST_PROJECTS_BODY = `
  var allProjects = doc.flattenedProjects();
  var results = [];
  var limit = PARAMS.limit || 100;

  for (var i = 0; i < allProjects.length; i++) {
    if (results.length >= limit) break;
    var p = allProjects[i];

    if (PARAMS.status && PARAMS.status !== 'all') {
      var st = p.status();
      if (PARAMS.status === 'active' && st !== 'active status') continue;
      if (PARAMS.status === 'done' && st !== 'done status') continue;
      if (PARAMS.status === 'dropped' && st !== 'dropped status') continue;
    }

    if (PARAMS.folder) {
      var f = p.folder();
      if (!f || f.name() !== PARAMS.folder) continue;
    }

    if (PARAMS.flagged === true && !p.flagged()) continue;

    var projObj = {};
    projObj.id = p.id();
    projObj.name = p.name();

    var fields = PARAMS.fields;
    if (!fields || fields.indexOf('status') !== -1) projObj.status = p.status() || null;
    if (!fields || fields.indexOf('flagged') !== -1) projObj.flagged = p.flagged() || false;
    if (!fields || fields.indexOf('note') !== -1) projObj.note = p.note() || '';
    if (!fields || fields.indexOf('folder') !== -1) {
      var fl = p.folder();
      projObj.folder = fl ? fl.name() : null;
    }
    if (!fields || fields.indexOf('dueDate') !== -1) {
      var dd = p.dueDate();
      projObj.dueDate = dd ? dd.toISOString() : null;
    }
    if (!fields || fields.indexOf('deferDate') !== -1) {
      var dfd = p.deferDate();
      projObj.deferDate = dfd ? dfd.toISOString() : null;
    }

    results.push(projObj);
  }

  return JSON.stringify({ projects: results, total: results.length });
`;

/**
 * JXA body: list all tags.
 */
const LIST_TAGS_BODY = `
  var allTags = doc.flattenedTags();
  var results = [];

  for (var i = 0; i < allTags.length; i++) {
    var tg = allTags[i];
    results.push({
      id: tg.id(),
      name: tg.name(),
      available: tg.availableTaskCount() || 0
    });
  }

  return JSON.stringify({ tags: results, total: results.length });
`;

/**
 * JXA body: list all folders with hierarchy.
 */
const LIST_FOLDERS_BODY = `
  var results = [];

  function processFolder(folder, parentPath) {
    var name = folder.name();
    var path = parentPath ? parentPath + '/' + name : name;
    results.push({
      id: folder.id(),
      name: name,
      path: path
    });

    var children = folder.folders();
    for (var j = 0; j < children.length; j++) {
      processFolder(children[j], path);
    }
  }

  var topFolders = doc.folders();
  for (var i = 0; i < topFolders.length; i++) {
    processFolder(topFolders[i], '');
  }

  return JSON.stringify({ folders: results, total: results.length });
`;

/**
 * OmniJS bridge body: productivity stats (completion rates, velocity).
 * Uses OmniJS for bulk access -- avoids N round-trips per task.
 */
const PRODUCTIVITY_STATS_BODY = `
  var tasks = flattenedTasks;
  var startDate = PARAMS.dateRange ? new Date(PARAMS.dateRange.start) : null;
  var endDate = PARAMS.dateRange ? new Date(PARAMS.dateRange.end) : null;
  var totalTasks = 0;
  var completedTasks = 0;
  var overdueTasks = 0;
  var now = new Date();
  var completionsByPeriod = {};

  tasks.forEach(function(t) {
    totalTasks++;
    if (t.taskStatus === Task.Status.Completed || t.taskStatus === Task.Status.Dropped) {
      completedTasks++;
      var compDate = t.completionDate;
      if (compDate) {
        if (startDate && compDate < startDate) return;
        if (endDate && compDate > endDate) return;
        var key;
        if (PARAMS.groupBy === 'day') {
          key = compDate.toISOString().slice(0, 10);
        } else if (PARAMS.groupBy === 'month') {
          key = compDate.toISOString().slice(0, 7);
        } else {
          var d = new Date(compDate);
          d.setDate(d.getDate() - d.getDay());
          key = d.toISOString().slice(0, 10);
        }
        completionsByPeriod[key] = (completionsByPeriod[key] || 0) + 1;
      }
    } else {
      var due = t.dueDate;
      if (due && due < now) overdueTasks++;
    }
  });

  return JSON.stringify({
    totalTasks: totalTasks,
    completedTasks: completedTasks,
    overdueTasks: overdueTasks,
    completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : '0.0',
    completionsByPeriod: completionsByPeriod
  });
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if updates require the OmniJS bridge (tags, plannedDate, repetitionRule).
 */
function needsBridge(changes: TaskUpdateChanges): boolean {
  return (
    changes.tags !== undefined ||
    changes.addTags !== undefined ||
    changes.removeTags !== undefined ||
    changes.plannedDate !== undefined ||
    changes.repetitionRule !== undefined
  );
}

/**
 * Returns true if task creation requires the HYBRID strategy (tags or plannedDate).
 */
function needsHybrid(data: TaskCreateData): boolean {
  return (data.tags !== undefined && data.tags.length > 0) || data.plannedDate !== undefined;
}

export class ScriptBuilder {
  /** List tasks with filtering -- JXA_DIRECT */
  static listTasks(filter: TaskFilter = {}): GeneratedScript {
    const params: ScriptParams = { ...filter };
    // Default: exclude completed unless explicitly requested
    if (params.completed === undefined) params.completed = false;
    return {
      source: wrapJxa(params, LIST_TASKS_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: 'List tasks with filtering',
    };
  }

  /** Get a single task by ID -- JXA_DIRECT */
  static getTask(id: string): GeneratedScript {
    return {
      source: wrapJxa({ id }, GET_TASK_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: `Get task ${id}`,
    };
  }

  /** Create a task -- JXA_DIRECT for simple, HYBRID for tags/plannedDate */
  static createTask(data: TaskCreateData): GeneratedScript {
    const hybrid = needsHybrid(data);
    return {
      source: wrapJxa({ ...data }, hybrid ? CREATE_TASK_HYBRID_BODY : CREATE_TASK_SIMPLE_BODY),
      strategy: (hybrid ? 'hybrid' : 'jxa_direct') as ExecStrategy,
      description: `Create task "${data.name}"`,
    };
  }

  /** Update a task -- JXA_DIRECT for simple, OMNIJS_BRIDGE for tags/plannedDate/repetition */
  static updateTask(id: string, changes: TaskUpdateChanges): GeneratedScript {
    const bridge = needsBridge(changes);
    return {
      source: wrapJxa({ id, changes }, bridge ? UPDATE_TASK_BRIDGE_BODY : UPDATE_TASK_SIMPLE_BODY),
      strategy: (bridge ? 'omnijs_bridge' : 'jxa_direct') as ExecStrategy,
      description: `Update task ${id}`,
    };
  }

  /** Complete a task -- JXA_DIRECT */
  static completeTask(id: string): GeneratedScript {
    return {
      source: wrapJxa({ id }, COMPLETE_TASK_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: `Complete task ${id}`,
    };
  }

  /** Delete a task -- JXA_DIRECT */
  static deleteTask(id: string): GeneratedScript {
    return {
      source: wrapJxa({ id }, DELETE_TASK_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: `Delete task ${id}`,
    };
  }

  /** List projects with optional filtering -- JXA_DIRECT */
  static listProjects(filter: ProjectFilter = {}): GeneratedScript {
    return {
      source: wrapJxa({ ...filter }, LIST_PROJECTS_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: 'List projects',
    };
  }

  /** List all tags -- JXA_DIRECT */
  static listTags(): GeneratedScript {
    return {
      source: wrapJxa({}, LIST_TAGS_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: 'List tags',
    };
  }

  /** List all folders with hierarchy -- JXA_DIRECT */
  static listFolders(): GeneratedScript {
    return {
      source: wrapJxa({}, LIST_FOLDERS_BODY),
      strategy: 'jxa_direct' as ExecStrategy,
      description: 'List folders',
    };
  }

  /** Productivity stats -- OMNIJS_BRIDGE (bulk access avoids N round-trips) */
  static productivityStats(params: ProductivityStatsParams = {}): GeneratedScript {
    return {
      source: wrapBridge({ ...params }, PRODUCTIVITY_STATS_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: 'Calculate productivity statistics',
    };
  }
}
