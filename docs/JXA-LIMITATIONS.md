# JXA (JavaScript for Automation) Limitations in OmniFocus

This document describes known limitations when using JavaScript for Automation (JXA) with OmniFocus, and available workarounds.

## Important Distinction: JXA vs Omni Automation

There are two different JavaScript environments for OmniFocus automation:

1. **JXA (JavaScript for Automation)** - External Apple scripting via `osascript`
   - Used by this MCP server
   - Runs outside OmniFocus
   - Limited API access
   - Cannot access RepetitionRule, RepetitionMethod, etc.

2. **Omni Automation** - Internal OmniFocus plugin/script system
   - Runs inside OmniFocus
   - Full API access including RepetitionRule
   - Documented at omni-automation.com
   - Not accessible from external tools

## RepetitionRule Creation - SOLVED with evaluateJavascript() Bridge

### The Solution (Implemented)

We discovered that `Application("OmniFocus").evaluateJavascript()` provides a bridge between JXA and Omni Automation. This allows us to:
1. Create tasks/projects in JXA (for consistency)
2. Apply recurrence rules via evaluateJavascript (accessing full Omni Automation API)
3. Continue working with the items in JXA

### How It Works

```javascript
// In JXA, after creating a task:
const taskId = task.id();

// Apply recurrence via evaluateJavascript bridge:
app.evaluateJavascript(`
  const task = Task.byIdentifier("${taskId}");
  const rule = new Task.RepetitionRule(
    "FREQ=DAILY;INTERVAL=1",
    Task.RepetitionMethod.Fixed
  );
  task.repetitionRule = rule;
`);
```

### Original Issue (Now Resolved)

The `Task.RepetitionRule` class and related APIs are only available in Omni Automation (internal plugins), not directly in JXA:

```javascript
// These DO NOT work in JXA:
app.Task.RepetitionRule // undefined
app.Task.RepetitionMethod.Fixed // TypeError: undefined is not an object
```

### Impact

- Cannot create recurring tasks programmatically via JXA
- Cannot create recurring projects programmatically via JXA
- Cannot modify recurrence rules on existing tasks/projects via JXA

### Attempted Workarounds

1. **Direct Constructor Access**: `app.Task.RepetitionRule(ruleString, method)` - Not available
2. **Property Assignment**: `task.repetitionRule = {...}` - Type conversion error
3. **String Property**: `task.repetitionString = 'FREQ=DAILY'` - Accepted but doesn't work
4. **Copy from Existing**: Cannot copy RepetitionRule objects between tasks
5. **AppleScript Bridge**: Requires privilege escalation, security issues

### Current Status

**NOT SUPPORTED** - Recurrence creation/modification is not possible via JXA as of OmniFocus 4.6.1.

### Recommended Alternative

Use AppleScript directly for automation that requires recurrence:

```applescript
tell application "OmniFocus"
  tell default document
    set newTask to make new inbox task with properties {name:"Daily Task", flagged:true}
    set repetition rule of newTask to {recurrence:"FREQ=DAILY;INTERVAL=1", repetition method:fixed repetition}
  end tell
end tell
```

## Tag Assignment During Creation

### The Issue

Tags cannot be assigned when creating a new task. They must be applied in a separate update operation.

### Workaround

```javascript
// Step 1: Create task
const task = app.Task({name: "My Task"});
doc.inboxTasks.push(task);

// Step 2: Update with tags (must be done separately)
const tag = doc.flattenedTags.whose({name: "work"})()[0];
task.addTag(tag);
```

## Date Handling

### The Issue

OmniFocus expects JavaScript Date objects, not ISO strings.

### Workaround

Always convert date strings to Date objects:

```javascript
task.dueDate = new Date("2025-03-01T17:00:00.000Z");
```

## Performance with whose() Clauses

### The Issue

Complex `whose()` queries can be extremely slow or timeout with large databases.

### Workaround

Use simple queries and filter in JavaScript:

```javascript
// Slow:
tasks.whose({dueDate: {_lessThan: date}, completed: false})();

// Faster:
const allTasks = doc.flattenedTasks();
const filtered = allTasks.filter(t => 
  t.dueDate() < date && !t.completed()
);
```

## Summary

While JXA provides access to most OmniFocus functionality, critical features like recurrence are not available. For complete automation capabilities, AppleScript remains the more reliable choice despite its less modern syntax.
