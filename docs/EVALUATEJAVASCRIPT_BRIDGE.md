# The evaluateJavascript() Bridge: Technical Documentation

## Overview

The `evaluateJavascript()` method provides a critical bridge between JXA (JavaScript for Automation) and Omni Automation, solving what initially appeared to be an impossible limitation.

## The Problem

When building external automation tools for OmniFocus using JXA, many APIs are undefined:
- `Task.RepetitionRule`
- `Task.RepetitionMethod`
- `Task.RepetitionScheduleType`
- `Task.AnchorDateKey`
- And potentially others

This prevents creating recurring tasks/projects from external automation tools.

## The Solution

```javascript
Application("OmniFocus").evaluateJavascript(omniAutomationCode)
```

This method executes JavaScript in the Omni Automation context (inside OmniFocus), not the JXA context, providing full API access.

## Implementation Pattern

### Step 1: Create in JXA
```javascript
const app = Application('OmniFocus');
const doc = app.defaultDocument();

// Create task using JXA
const task = app.Task({
  name: "My Recurring Task",
  flagged: true
});
doc.inboxTasks.push(task);
const taskId = task.id();
```

### Step 2: Apply Recurrence via Bridge
```javascript
// Use evaluateJavascript to access Omni Automation APIs
const result = app.evaluateJavascript(`
  const task = Task.byIdentifier("${taskId}");
  if (task) {
    const rule = new Task.RepetitionRule(
      "FREQ=DAILY;INTERVAL=1",
      Task.RepetitionMethod.Fixed
    );
    task.repetitionRule = rule;
    "success";
  } else {
    "task_not_found";
  }
`);
```

### Step 3: Continue in JXA
```javascript
// Can continue working with the task in JXA
if (result === 'success') {
  // Task now has recurrence rule applied
  task.dueDate = new Date("2025-03-01");
}
```

## Supported Recurrence Patterns

### Daily
```javascript
"FREQ=DAILY;INTERVAL=1"  // Every day
"FREQ=DAILY;INTERVAL=2"  // Every 2 days
```

### Weekly
```javascript
"FREQ=WEEKLY;INTERVAL=1"  // Every week
"FREQ=WEEKLY;BYDAY=MO,WE,FR"  // Monday, Wednesday, Friday
```

### Monthly
```javascript
"FREQ=MONTHLY;INTERVAL=1"  // Every month
"FREQ=MONTHLY;BYDAY=1TU"  // First Tuesday of month
"FREQ=MONTHLY;BYDAY=-1FR"  // Last Friday of month
```

### Yearly
```javascript
"FREQ=YEARLY;INTERVAL=1"  // Every year
```

## Repetition Methods

The second parameter to `Task.RepetitionRule` controls when the next occurrence is scheduled:

- `Task.RepetitionMethod.Fixed` - Fixed schedule regardless of completion
- `Task.RepetitionMethod.DeferUntilDate` - Start after completion (defer-based)
- `Task.RepetitionMethod.DueDate` - Due after completion (due-based)

## Full Example: Creating a Recurring Project

```javascript
const app = Application('OmniFocus');

// Create project in JXA
const project = app.Project({
  name: "Weekly Sprint",
  flagged: true
});
app.defaultDocument.projects.push(project);
const projectId = project.id();

// Add recurrence via bridge
app.evaluateJavascript(`
  const project = Project.byIdentifier("${projectId}");
  if (project) {
    project.dueDate = new Date("2025-03-07");
    const rule = new Task.RepetitionRule(
      "FREQ=WEEKLY;INTERVAL=1",
      Task.RepetitionMethod.Fixed
    );
    project.repetitionRule = rule;
    "success";
  }
`);
```

## Important Notes

### Performance
- The bridge adds minimal overhead (~50-100ms per call)
- Best practice: Batch operations when possible

### Error Handling
```javascript
try {
  const result = app.evaluateJavascript(code);
  if (result === 'success') {
    // Handle success
  } else {
    // Handle failure
  }
} catch (error) {
  // Handle execution error
}
```

### Data Exchange
For complex data exchange between contexts:
```javascript
// Send data to Omni Automation
const data = {name: "Task", tags: ["work", "urgent"]};
app.evaluateJavascript(`
  const data = ${JSON.stringify(data)};
  // Use data in Omni Automation context
`);

// Return data from Omni Automation
const result = app.evaluateJavascript(`
  const task = Task.byIdentifier("${taskId}");
  JSON.stringify({
    name: task.name,
    hasRule: task.repetitionRule !== null
  });
`);
const parsed = JSON.parse(result);
```

## Discovery Timeline

1. **Initial Investigation** (Hours 1-4): Confirmed RepetitionRule unavailable in JXA
2. **Workaround Attempts** (Hours 4-7): Tried AppleScript bridge, various hacks
3. **Near Abandonment** (Hour 7): Documented as "impossible" limitation
4. **External Research** (Hour 8): Found reference to evaluateJavascript
5. **Breakthrough** (Hour 8): Confirmed bridge works perfectly
6. **Implementation** (Hour 9): Integrated into MCP server

## Why This Matters

### Developer Impact
- Developers waste hours thinking features are impossible
- Projects get abandoned or compromised
- Workarounds become complex and fragile

### What Should Happen
1. **Short term**: Document this bridge officially
2. **Medium term**: Provide TypeScript definitions
3. **Long term**: Full JXA API parity or official bridge API

## Community Action Needed

If you're reading this and want to help:

1. **Test the bridge** with other "impossible" APIs
2. **Document findings** in public forums
3. **Contact Omni Group** (see EVALUATEJAVASCRIPT_BRIDGE_RESEARCH.md)
4. **Share this solution** with other developers

## Technical Details for Omni Group

Should Omni Group read this, here's what would help:

### Option 1: Document Current State
```javascript
// Add to official docs
class Application {
  evaluateJavascript(code: string): any;  // Bridges to Omni Automation
}
```

### Option 2: Provide Direct Access
```javascript
// Make these available in JXA directly
app.Task.RepetitionRule  // Currently undefined
app.Task.RepetitionMethod  // Currently undefined
```

### Option 3: Official Bridge API
```javascript
// Create a proper bridge
app.bridge.omniAutomation(code: string): Promise<any>;
app.bridge.createRepetitionRule(config: RepetitionConfig): RepetitionRule;
```

## Conclusion

The `evaluateJavascript()` bridge is a powerful solution to JXA limitations, but it shouldn't be a hidden feature. This functionality is too important for external automation to remain undocumented or accidental.

**Time spent discovering this: 8+ hours**
**Lines of code attempted before solution: 500+**
**Number of times we nearly gave up: 3**

Don't let other developers go through the same struggle.