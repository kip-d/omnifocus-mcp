/**
 * ScriptBuilder -- generates safe JXA/OmniJS scripts with a single injection point.
 *
 * Design principles:
 * 1. ALL external data enters via `const PARAMS = <json>;` -- one line, no other interpolation.
 * 2. No template placeholders (no `{{}}` style).
 * 3. Never use whose()/where() -- they cause 25+ second timeouts.
 * 4. OmniJS uses property access: task.name, task.id.primaryKey
 * 5. Bridge required for: tag assignment, plannedDate, repetitionRule, task movement.
 * 6. All read/write scripts use OmniJS bridge for performance (in-process property access).
 *    Only createTask remains JXA_DIRECT/HYBRID since app.Task() is a JXA constructor.
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
// Script body constants -- OmniJS bridge (in-process property access)
// ---------------------------------------------------------------------------

/**
 * OmniJS bridge body: list tasks with filtering.
 * Iterates flattenedTasks with a for loop, applies filters from PARAMS,
 * collects results up to PARAMS.limit. Never uses whose()/where().
 * OmniJS syntax: property access (t.name, t.id.primaryKey), NOT method calls.
 */
const LIST_TASKS_BODY = `
  var tasks = flattenedTasks;
  var results = [];
  var total = 0;
  var offset = PARAMS.offset || 0;
  var limit = PARAMS.limit || 50;
  var skipped = 0;
  var includeCompleted = PARAMS.completed === true;
  var countTotal = PARAMS.countTotal === true;

  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];

    // Filter: completed (excluded by default)
    var isCompleted = (t.taskStatus === Task.Status.Completed || t.taskStatus === Task.Status.Dropped);
    if (!includeCompleted && isCompleted) continue;
    if (PARAMS.completed === true && !isCompleted) continue;

    // Filter: flagged
    if (PARAMS.flagged === true && !t.flagged) continue;
    if (PARAMS.flagged === false && t.flagged) continue;

    // Filter: inbox (project === null means inbox only)
    if (PARAMS.project === null) {
      if (t.containingProject) continue;
    } else if (PARAMS.project !== undefined) {
      var proj = t.containingProject;
      if (!proj || proj.name !== PARAMS.project) continue;
    }

    // Filter: tags
    if (PARAMS.tag !== undefined) {
      var taskTags = t.tags;
      var tagNames = taskTags.map(function(tg) { return tg.name; });
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
      var nameStr = t.name || '';
      var noteStr = t.note || '';
      if (nameStr.toLowerCase().indexOf(searchLower) === -1 &&
          noteStr.toLowerCase().indexOf(searchLower) === -1) continue;
    }

    // Filter: date ranges
    if (PARAMS.dueBefore || PARAMS.dueAfter) {
      var due = t.dueDate;
      if (!due) { if (PARAMS.dueBefore || PARAMS.dueAfter) continue; }
      else {
        if (PARAMS.dueBefore && due > new Date(PARAMS.dueBefore)) continue;
        if (PARAMS.dueAfter && due < new Date(PARAMS.dueAfter)) continue;
      }
    }

    if (PARAMS.deferBefore || PARAMS.deferAfter) {
      var defer = t.deferDate;
      if (!defer) continue;
      if (PARAMS.deferBefore && defer > new Date(PARAMS.deferBefore)) continue;
      if (PARAMS.deferAfter && defer < new Date(PARAMS.deferAfter)) continue;
    }

    if (PARAMS.plannedBefore || PARAMS.plannedAfter) {
      var planned = t.plannedDate;
      if (!planned) continue;
      if (PARAMS.plannedBefore && planned > new Date(PARAMS.plannedBefore)) continue;
      if (PARAMS.plannedAfter && planned < new Date(PARAMS.plannedAfter)) continue;
    }

    // Filter: available / blocked
    if (PARAMS.available === true) {
      if (t.taskStatus !== Task.Status.Available) continue;
    }
    if (PARAMS.blocked === true) {
      if (t.taskStatus !== Task.Status.Blocked) continue;
    }

    // Filter: since (modification date)
    if (PARAMS.since) {
      var modified = t.modificationDate;
      if (!modified || modified < new Date(PARAMS.since)) continue;
    }

    // Passed all filters
    total++;
    if (skipped < offset) { skipped++; continue; }
    if (results.length >= limit) {
      if (!countTotal) break;
      continue;
    }

    // Build result object
    var taskObj = {};
    taskObj.id = t.id.primaryKey;
    taskObj.name = t.name;

    var fields = PARAMS.fields;
    if (!fields || fields.indexOf('completed') !== -1) taskObj.completed = isCompleted;
    if (!fields || fields.indexOf('flagged') !== -1) taskObj.flagged = t.flagged || false;

    if (!fields || fields.indexOf('dueDate') !== -1) {
      var dd = t.dueDate;
      taskObj.dueDate = dd ? dd.toISOString() : null;
    }
    if (!fields || fields.indexOf('deferDate') !== -1) {
      var dfd = t.deferDate;
      taskObj.deferDate = dfd ? dfd.toISOString() : null;
    }
    if (!fields || fields.indexOf('plannedDate') !== -1) {
      var pd = t.plannedDate;
      taskObj.plannedDate = pd ? pd.toISOString() : null;
    }
    if (!fields || fields.indexOf('note') !== -1) taskObj.note = t.note || '';
    if (!fields || fields.indexOf('tags') !== -1) {
      taskObj.tags = t.tags.map(function(tg) { return tg.name; });
    }
    if (!fields || fields.indexOf('project') !== -1) {
      var p = t.containingProject;
      taskObj.project = p ? p.name : null;
      taskObj.projectId = p ? p.id.primaryKey : null;
    }
    if (!fields || fields.indexOf('estimatedMinutes') !== -1) {
      taskObj.estimatedMinutes = t.estimatedMinutes || null;
    }
    if (!fields || fields.indexOf('repetitionRule') !== -1) {
      var rr = t.repetitionRule;
      taskObj.repetitionRule = rr ? rr.toString() : null;
    }

    results.push(taskObj);
  }

  return JSON.stringify({ tasks: results, total: total });
`;

/**
 * OmniJS bridge body: get a single task by ID.
 * Uses Task.byIdentifier() for O(1) lookup.
 */
const GET_TASK_BODY = `
  var t = Task.byIdentifier(PARAMS.id);
  if (!t) return JSON.stringify({ task: null, error: "Task not found" });

  var taskObj = {};
  taskObj.id = t.id.primaryKey;
  taskObj.name = t.name;
  taskObj.completed = (t.taskStatus === Task.Status.Completed || t.taskStatus === Task.Status.Dropped);
  taskObj.flagged = t.flagged || false;

  var dd = t.dueDate;
  taskObj.dueDate = dd ? dd.toISOString() : null;
  var dfd = t.deferDate;
  taskObj.deferDate = dfd ? dfd.toISOString() : null;
  var pd = t.plannedDate;
  taskObj.plannedDate = pd ? pd.toISOString() : null;

  taskObj.note = t.note || '';

  taskObj.tags = t.tags.map(function(tg) { return tg.name; });

  var p = t.containingProject;
  taskObj.project = p ? p.name : null;
  taskObj.projectId = p ? p.id.primaryKey : null;

  taskObj.estimatedMinutes = t.estimatedMinutes || null;
  var rr = t.repetitionRule;
  taskObj.repetitionRule = rr ? rr.toString() : null;

  var parent = t.parent;
  taskObj.parentTaskId = parent ? parent.id.primaryKey : null;

  taskObj.blocked = (t.taskStatus === Task.Status.Blocked);

  return JSON.stringify({ task: taskObj });
`;

/**
 * JXA body: create a task (simple properties only).
 * Remains JXA because app.Task() is a JXA constructor.
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
 * Remains JXA+HYBRID because app.Task() is a JXA constructor.
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
 * OmniJS bridge body: update simple task properties.
 * Uses Task.byIdentifier() for O(1) lookup.
 */
const UPDATE_TASK_SIMPLE_BODY = `
  var t = Task.byIdentifier(PARAMS.id);
  if (!t) return JSON.stringify({ error: "Task not found" });

  if (PARAMS.changes.name !== undefined) t.name = PARAMS.changes.name;
  if (PARAMS.changes.note !== undefined) t.note = PARAMS.changes.note;
  if (PARAMS.changes.flagged !== undefined) t.flagged = PARAMS.changes.flagged;
  if (PARAMS.changes.dueDate !== undefined) {
    t.dueDate = PARAMS.changes.dueDate ? new Date(PARAMS.changes.dueDate) : null;
  }
  if (PARAMS.changes.deferDate !== undefined) {
    t.deferDate = PARAMS.changes.deferDate ? new Date(PARAMS.changes.deferDate) : null;
  }
  if (PARAMS.changes.estimatedMinutes !== undefined) {
    t.estimatedMinutes = PARAMS.changes.estimatedMinutes;
  }

  return JSON.stringify({
    id: t.id.primaryKey,
    name: t.name,
    updated: true
  });
`;

/**
 * OmniJS bridge body: update task with complex properties (tags, plannedDate, repetition).
 * All operations run in-process -- no sub-bridge calls needed.
 */
const UPDATE_TASK_BRIDGE_BODY = `
  var t = Task.byIdentifier(PARAMS.id);
  if (!t) return JSON.stringify({ error: "Task not found" });

  // Simple properties
  if (PARAMS.changes.name !== undefined) t.name = PARAMS.changes.name;
  if (PARAMS.changes.note !== undefined) t.note = PARAMS.changes.note;
  if (PARAMS.changes.flagged !== undefined) t.flagged = PARAMS.changes.flagged;
  if (PARAMS.changes.dueDate !== undefined) {
    t.dueDate = PARAMS.changes.dueDate ? new Date(PARAMS.changes.dueDate) : null;
  }
  if (PARAMS.changes.deferDate !== undefined) {
    t.deferDate = PARAMS.changes.deferDate ? new Date(PARAMS.changes.deferDate) : null;
  }
  if (PARAMS.changes.estimatedMinutes !== undefined) {
    t.estimatedMinutes = PARAMS.changes.estimatedMinutes;
  }

  // Complex properties (already in OmniJS, no sub-bridge needed)
  if (PARAMS.changes.plannedDate !== undefined) {
    t.plannedDate = PARAMS.changes.plannedDate ? new Date(PARAMS.changes.plannedDate) : null;
  }

  if (PARAMS.changes.tags !== undefined) {
    t.clearTags();
    PARAMS.changes.tags.forEach(function(n) {
      var tag = flattenedTags.byName(n);
      if (!tag) { tag = new Tag(n); }
      t.addTag(tag);
    });
  }

  if (PARAMS.changes.addTags && PARAMS.changes.addTags.length > 0) {
    PARAMS.changes.addTags.forEach(function(n) {
      var tag = flattenedTags.byName(n);
      if (!tag) { tag = new Tag(n); }
      t.addTag(tag);
    });
  }

  if (PARAMS.changes.removeTags && PARAMS.changes.removeTags.length > 0) {
    PARAMS.changes.removeTags.forEach(function(n) {
      var tag = flattenedTags.byName(n);
      if (tag) { t.removeTag(tag); }
    });
  }

  if (PARAMS.changes.repetitionRule !== undefined) {
    t.repetitionRule = PARAMS.changes.repetitionRule;
  }

  return JSON.stringify({
    id: t.id.primaryKey,
    name: t.name,
    updated: true
  });
`;

/**
 * OmniJS bridge body: mark a task as completed.
 * Uses Task.byIdentifier() for O(1) lookup + in-process markComplete().
 */
const COMPLETE_TASK_BODY = `
  var t = Task.byIdentifier(PARAMS.id);
  if (!t) return JSON.stringify({ error: "Task not found" });
  t.markComplete();
  return JSON.stringify({ id: PARAMS.id, completed: true });
`;

/**
 * OmniJS bridge body: delete a task.
 * Uses Task.byIdentifier() for O(1) lookup + deleteObject().
 */
const DELETE_TASK_BODY = `
  var t = Task.byIdentifier(PARAMS.id);
  if (!t) return JSON.stringify({ error: "Task not found" });
  deleteObject(t);
  return JSON.stringify({ id: PARAMS.id, deleted: true });
`;

/**
 * OmniJS bridge body: list projects with optional filtering.
 */
const LIST_PROJECTS_BODY = `
  var projects = flattenedProjects;
  var results = [];
  var limit = PARAMS.limit || 100;

  for (var i = 0; i < projects.length; i++) {
    if (results.length >= limit) break;
    var p = projects[i];

    if (PARAMS.status && PARAMS.status !== 'all') {
      var st = p.status;
      if (PARAMS.status === 'active' && st !== Project.Status.Active) continue;
      if (PARAMS.status === 'done' && st !== Project.Status.Done) continue;
      if (PARAMS.status === 'dropped' && st !== Project.Status.Dropped) continue;
    }

    if (PARAMS.folder) {
      var f = p.parentFolder;
      if (!f || f.name !== PARAMS.folder) continue;
    }

    if (PARAMS.flagged === true && !p.flagged) continue;

    var projObj = {};
    projObj.id = p.id.primaryKey;
    projObj.name = p.name;

    var fields = PARAMS.fields;
    if (!fields || fields.indexOf('status') !== -1) {
      var s = p.status;
      projObj.status = s === Project.Status.Active ? 'active' :
                       s === Project.Status.Done ? 'done' :
                       s === Project.Status.Dropped ? 'dropped' : String(s);
    }
    if (!fields || fields.indexOf('flagged') !== -1) projObj.flagged = p.flagged || false;
    if (!fields || fields.indexOf('note') !== -1) projObj.note = p.note || '';
    if (!fields || fields.indexOf('folder') !== -1) {
      var fl = p.parentFolder;
      projObj.folder = fl ? fl.name : null;
    }
    if (!fields || fields.indexOf('dueDate') !== -1) {
      var dd = p.dueDate;
      projObj.dueDate = dd ? dd.toISOString() : null;
    }
    if (!fields || fields.indexOf('deferDate') !== -1) {
      var dfd = p.deferDate;
      projObj.deferDate = dfd ? dfd.toISOString() : null;
    }

    results.push(projObj);
  }

  return JSON.stringify({ projects: results, total: results.length });
`;

/**
 * OmniJS bridge body: list all tags.
 */
const LIST_TAGS_BODY = `
  var tags = flattenedTags;
  var results = [];

  for (var i = 0; i < tags.length; i++) {
    var tg = tags[i];
    results.push({
      id: tg.id.primaryKey,
      name: tg.name,
      available: tg.availableTasks.length
    });
  }

  return JSON.stringify({ tags: results, total: results.length });
`;

/**
 * OmniJS bridge body: list all folders with hierarchy.
 */
const LIST_FOLDERS_BODY = `
  var results = [];

  function processFolder(folder, parentPath) {
    var name = folder.name;
    var path = parentPath ? parentPath + '/' + name : name;
    results.push({
      id: folder.id.primaryKey,
      name: name,
      path: path
    });

    folder.folders.forEach(function(child) {
      processFolder(child, path);
    });
  }

  folders.forEach(function(f) {
    processFolder(f, '');
  });

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
 * Returns true if updates require complex property handling (tags, plannedDate, repetitionRule).
 * Both simple and bridge paths now use OmniJS bridge, but with different script bodies.
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
  /** List tasks with filtering -- OMNIJS_BRIDGE (in-process property access) */
  static listTasks(filter: TaskFilter = {}): GeneratedScript {
    const params: ScriptParams = { ...filter };
    // Default: exclude completed unless explicitly requested
    if (params.completed === undefined) params.completed = false;
    return {
      source: wrapBridge(params, LIST_TASKS_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: 'List tasks with filtering',
    };
  }

  /** Get a single task by ID -- OMNIJS_BRIDGE (O(1) lookup via Task.byIdentifier) */
  static getTask(id: string): GeneratedScript {
    return {
      source: wrapBridge({ id }, GET_TASK_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
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

  /** Update a task -- OMNIJS_BRIDGE (simple or complex properties, all in-process) */
  static updateTask(id: string, changes: TaskUpdateChanges): GeneratedScript {
    const bridge = needsBridge(changes);
    return {
      source: wrapBridge({ id, changes }, bridge ? UPDATE_TASK_BRIDGE_BODY : UPDATE_TASK_SIMPLE_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: `Update task ${id}`,
    };
  }

  /** Complete a task -- OMNIJS_BRIDGE (O(1) lookup + in-process markComplete) */
  static completeTask(id: string): GeneratedScript {
    return {
      source: wrapBridge({ id }, COMPLETE_TASK_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: `Complete task ${id}`,
    };
  }

  /** Delete a task -- OMNIJS_BRIDGE (O(1) lookup + deleteObject) */
  static deleteTask(id: string): GeneratedScript {
    return {
      source: wrapBridge({ id }, DELETE_TASK_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: `Delete task ${id}`,
    };
  }

  /** List projects with optional filtering -- OMNIJS_BRIDGE */
  static listProjects(filter: ProjectFilter = {}): GeneratedScript {
    return {
      source: wrapBridge({ ...filter }, LIST_PROJECTS_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: 'List projects',
    };
  }

  /** List all tags -- OMNIJS_BRIDGE */
  static listTags(): GeneratedScript {
    return {
      source: wrapBridge({}, LIST_TAGS_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
      description: 'List tags',
    };
  }

  /** List all folders with hierarchy -- OMNIJS_BRIDGE */
  static listFolders(): GeneratedScript {
    return {
      source: wrapBridge({}, LIST_FOLDERS_BODY),
      strategy: 'omnijs_bridge' as ExecStrategy,
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
