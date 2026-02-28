# Execution Strategy Reference

How OmniFocus CLI generates and runs JXA/OmniJS scripts. This document codifies empirical findings from testing against
the OmniFocus automation APIs.

## The Three Strategies

| Strategy          | Syntax                        | Mechanism                                           | Use when                                |
| ----------------- | ----------------------------- | --------------------------------------------------- | --------------------------------------- |
| **JXA_DIRECT**    | `task.name()` (method calls)  | `Application("OmniFocus")` via osascript            | Simple property reads/writes            |
| **OMNIJS_BRIDGE** | `task.name` (property access) | `app.evaluateJavascript()` runs OmniAutomation      | Tags, plannedDate, repetition, bulk ops |
| **HYBRID**        | Both                          | JXA creates/verifies, then bridge for complex props | createTask with tags, completeTask      |

### JXA_DIRECT

Runs JavaScript for Automation directly via `osascript -l JavaScript`. The script gets `Application("OmniFocus")` and
operates on its scripting interface.

```javascript
(() => {
  const PARAMS = { limit: 10, completed: false };
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();

  var allTasks = doc.flattenedTasks();
  for (var i = 0; i < allTasks.length; i++) {
    var t = allTasks[i];
    t.name(); // method call -- JXA requires parens
    t.flagged(); // method call
  }
  return JSON.stringify({ tasks: results });
})();
```

### OMNIJS_BRIDGE

Passes an OmniAutomation script as a string to `app.evaluateJavascript()`. The inner script runs inside OmniFocus's
OmniJS runtime, which has different syntax and different capabilities.

```javascript
(() => {
  const app = Application('OmniFocus');
  const result = app.evaluateJavascript(`
    (() => {
      const PARAMS = {"groupBy":"week"};
      var tasks = flattenedTasks;
      tasks.forEach(function(t) {
        t.taskStatus;       // property access -- no parens in OmniJS
        t.completionDate;   // property access
      });
      return JSON.stringify({ totalTasks: count });
    })()
  `);
  return result;
})();
```

### HYBRID

JXA handles creation or verification; bridge handles properties that JXA cannot set.

```javascript
(() => {
  const PARAMS = { name: 'Buy milk', tags: ['errands'] };
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();

  // Step 1: JXA creates the task
  var task = app.Task({ name: PARAMS.name });
  doc.inboxTasks.push(task);
  var taskId = task.id();

  // Step 2: Bridge assigns tags (JXA tag assignment silently fails)
  var bp = { taskId: taskId, tags: PARAMS.tags };
  var bridgeScript =
    '(() => {' +
    'var BP = ' +
    JSON.stringify(bp) +
    ';' +
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
  app.evaluateJavascript(bridgeScript);

  return JSON.stringify({ id: taskId, name: task.name() });
})();
```

## Decision Matrix

| Operation                                | Strategy      | Reason                                                |
| ---------------------------------------- | ------------- | ----------------------------------------------------- |
| listTasks                                | JXA_DIRECT    | Fast iteration, property reads only                   |
| getTask                                  | JXA_DIRECT    | Single item lookup                                    |
| createTask (simple)                      | JXA_DIRECT    | `app.Task(props)` + `push()` works natively           |
| createTask (with tags/plannedDate)       | HYBRID        | JXA creates, bridge sets complex props                |
| updateTask (name/note/flagged/due/defer) | JXA_DIRECT    | Direct property assignment in JXA                     |
| updateTask (tags/plannedDate/repetition) | OMNIJS_BRIDGE | JXA sets simple props, bridge handles the rest        |
| completeTask                             | HYBRID        | JXA verifies existence, bridge calls `markComplete()` |
| deleteTask                               | JXA_DIRECT    | `app.delete()` works natively                         |
| listProjects                             | JXA_DIRECT    | Property reads via `flattenedProjects()`              |
| listTags                                 | JXA_DIRECT    | Property reads via `flattenedTags()`                  |
| listFolders                              | JXA_DIRECT    | Recursive `folder.folders()` traversal                |
| productivityStats                        | OMNIJS_BRIDGE | Bulk data access avoids N round-trips                 |

**Strategy selection in code** (`ScriptBuilder`):

- `needsHybrid(data)` -- returns true if `tags.length > 0` or `plannedDate` is set
- `needsBridge(changes)` -- returns true if `tags`, `addTags`, `removeTags`, `plannedDate`, or `repetitionRule` is
  present

## Single PARAMS Injection Pattern

All external data enters scripts through one serialized object. This prevents injection and double-quoting bugs.

### Outer scripts: `PARAMS`

```javascript
const PARAMS = { name: 'Task with "quotes"', flagged: true };
// All runtime values accessed via PARAMS.name, PARAMS.flagged, etc.
```

`JSON.stringify` handles escaping of quotes, backslashes, newlines, and unicode.

### Bridge sub-scripts: `BP`

Bridge scripts that run inside `evaluateJavascript()` receive their own parameter object:

```javascript
// Built inside the outer JXA script:
var bp = { taskId: taskId, tags: PARAMS.tags };
var bridgeScript =
  '(() => {' +
  'var BP = ' +
  JSON.stringify(bp) +
  ';' +
  'var t = Task.byIdentifier(BP.taskId);' +
  // ... use BP.tags, BP.plannedDate, etc.
  'return JSON.stringify({success: true});' +
  '})()';
app.evaluateJavascript(bridgeScript);
```

**Rules:**

- Never concatenate runtime values into script strings
- Each script has exactly one `const PARAMS = ...` assignment
- Bridge sub-scripts use `var BP = ...` for their own data
- No template placeholders (`{{}}` style) anywhere

## JXA vs OmniJS Syntax

| Context                                | Property read | Property write    | Example                    |
| -------------------------------------- | ------------- | ----------------- | -------------------------- |
| **JXA** (outer script)                 | `task.name()` | `task.name = "x"` | Method call with parens    |
| **OmniJS** (inside evaluateJavascript) | `task.name`   | `task.name = "x"` | Property access, no parens |

**Common errors:**

| Error message                    | Cause                        | Fix                             |
| -------------------------------- | ---------------------------- | ------------------------------- |
| "X is not a function"            | Using `()` in OmniJS context | Remove parentheses: `task.name` |
| Property returns function object | Missing `()` in JXA context  | Add parentheses: `task.name()`  |

**OmniJS-only APIs** (not available in JXA):

- `Task.byIdentifier(id)` -- look up task by ID
- `flattenedTags.byName(name)` -- look up tag by name
- `task.addTag(tag)`, `task.removeTag(tag)`, `task.clearTags()`
- `task.markComplete()` -- JXA's `completed` property is read-only
- `task.plannedDate` -- not accessible in JXA
- `task.repetitionRule` -- settable only via OmniJS
- `project.parentFolder`, `folder.parent` -- parent traversal

## Performance Rules

### Never use `.whose()` / `.where()`

These Apple Event query methods cause 25+ second timeouts on databases with thousands of tasks. Every generated script
is tested to confirm absence of these methods.

```javascript
// WRONG -- causes timeout
var urgent = doc.flattenedTasks.whose({ flagged: true });

// RIGHT -- manual iteration
var allTasks = doc.flattenedTasks();
for (var i = 0; i < allTasks.length; i++) {
  if (allTasks[i].flagged()) {
    /* ... */
  }
}
```

### Limit result sets

- Default limit: 50 tasks per query
- Use `offset` for pagination
- Apply filters (project, tag, flagged, date ranges) to reduce iteration
- Large databases (10k+ tasks) may take 30-60s for full unfiltered iteration

### Script execution

- Scripts written to temp files, never passed via `-e` flag
- Default timeout: 120 seconds (2 minutes)
- Max output buffer: 10MB
- Temp files cleaned up after execution, even on error

### Script size limits

| Context                            | Limit  |
| ---------------------------------- | ------ |
| JXA direct                         | ~523KB |
| OmniJS bridge (evaluateJavascript) | ~261KB |

Current largest generated script is well under these limits.

## Known Limitations

| Limitation                                              | Workaround                                               |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `completed` property is read-only in JXA (error -10003) | Use bridge: `task.markComplete()`                        |
| Tag assignment via JXA silently fails                   | Use bridge: `task.addTag(tag)`                           |
| `plannedDate` not accessible in JXA                     | Use bridge: `task.plannedDate = date`                    |
| Parent folder/project traversal fails in JXA            | Use OmniJS: `project.parentFolder`, `folder.parent`      |
| `folder.parent()` fails in JXA scripts                  | Build hierarchy via recursive `folder.folders()` descent |
| MCP clients send numbers/booleans as strings            | Parse with type coercion at the CLI/MCP boundary         |

## File Reference

| File                                                     | Purpose                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/cli/src/scripts/types.ts`                      | `ExecStrategy` enum, `GeneratedScript` interface, filter/data types |
| `packages/cli/src/scripts/script-builder.ts`             | Script generation with strategy selection                           |
| `packages/cli/src/scripts/executor.ts`                   | `osascript` execution, temp file management, JSON parsing           |
| `packages/cli/tests/unit/scripts/script-builder.test.ts` | Strategy selection, injection safety, syntax verification           |
