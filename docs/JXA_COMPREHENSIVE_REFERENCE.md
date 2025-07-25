# OmniFocus JXA Comprehensive Reference

## Table of Contents
1. [Understanding the Three JavaScript APIs](#understanding-the-three-javascript-apis)
2. [JXA Fundamentals](#jxa-fundamentals)
3. [Performance Discoveries](#performance-discoveries)
4. [Working Methods and Properties](#working-methods-and-properties)
5. [Collection Types and Differences](#collection-types-and-differences)
6. [Error Patterns and Solutions](#error-patterns-and-solutions)
7. [Code Patterns That Work](#code-patterns-that-work)
8. [Testing Methodology](#testing-methodology)

## Understanding the Three JavaScript APIs

### 1. OmniJS (OmniAutomation) - Plugin API
- **Context**: Runs INSIDE OmniFocus as plugins/scripts
- **Access**: Automation menu, console, plugin files
- **Globals**: `Task`, `Project`, `Document`, etc. are available
- **Example**: `Task.byIdentifier('abc123')` ✓ Works here
- **Documentation**: https://omni-automation.com/omnifocus/
- **TypeScript definitions**: The `.d.ts` files document THIS API

### 2. JXA (JavaScript for Automation) - External Automation
- **Context**: External scripts via `osascript -l JavaScript`
- **Access**: `Application('OmniFocus')`
- **No globals**: Must access everything through app/doc objects
- **Example**: `doc.flattenedTasks.whose({id: 'abc123'})` ✓ Works here
- **Documentation**: Minimal (Apple's old release notes + community)
- **This is what we're using in omnifocus-mcp**

### 3. AppleScript Bridge Methods
- **Context**: Methods that exist but expect AppleScript object specifiers
- **Status**: These ALL throw "Can't convert types" in JXA
- **Examples**: `doc.taskWithID()`, `doc.Task.byIdentifier()`
- **Why broken**: They expect AppleScript object specifiers, not strings

## JXA Fundamentals

### Application and Document Access
```javascript
// Always start with these
const app = Application('OmniFocus');
app.includeStandardAdditions = true;  // For dialogs, file operations
const doc = app.defaultDocument();
```

### Key Discoveries About JXA
1. **All properties are methods**: Use `task.name()` not `task.name`
2. **Properties are hidden**: `Object.keys()` returns empty arrays on proxy objects
3. **whose() is special**: Only available on collection functions, not arrays
4. **Type coercion issues**: Many methods expect AppleScript types, not JS types

## Performance Discoveries

### O(1) vs O(n) Lookups

#### Fast: Using whose() - ~2ms
```javascript
// This is 3-5x faster than iteration
const matches = doc.flattenedTasks.whose({id: taskId});
if (matches && matches.length > 0) {
    const task = matches[0];
}
```

#### Slow: Manual iteration - ~7ms
```javascript
// Only use this as fallback
const tasks = doc.flattenedTasks();
for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id() === taskId) {
        const task = tasks[i];
        break;
    }
}
```

### Performance Benchmarks
- `whose({id: X})`: 2ms for lookup
- Manual iteration: 7ms for same lookup
- `whose({completed: false})`: Pre-filtered by OmniFocus
- Manual filtering: Must check every task

## Working Methods and Properties

### Task Properties (Verified Working)
```javascript
const task = doc.flattenedTasks()[0];

// Basic properties
task.name()                    // string
task.id()                      // string (unique identifier)
task.note()                    // string (rich text as plain text)
task.completed()               // boolean
task.completionDate()          // Date or null
task.flagged()                 // boolean
task.deferDate()               // Date or null
task.dueDate()                 // Date or null
task.effectiveDeferDate()      // Date or null (inherited)
task.effectiveDueDate()        // Date or null (inherited)
task.dropped()                 // boolean
task.repetitionRule()          // object or null
task.numberOfChildren()        // number
task.inInbox()                 // boolean

// Relationships
task.project()                 // Project or null
task.parentTask()              // Task or null
task.tags()                    // Array of Tags
task.attachments()             // Array

// Modification
task.name = "New name"         // Setter property
task.completed = true          // Setter property
task.flagged = false           // Setter property
task.deferDate = new Date()    // Setter property
task.dueDate = new Date()      // Setter property
task.note = "New note"         // Setter property
```

### Project Properties (Verified Working)
```javascript
const project = doc.flattenedProjects()[0];

// Basic properties
project.name()                 // string
project.id()                   // string
project.note()                 // string
project.status()               // "active", "on hold", "dropped", "done"
project.completed()            // boolean
project.completionDate()       // Date or null
project.deferDate()            // Date or null
project.dueDate()              // Date or null
project.flagged()              // boolean
project.numberOfTasks()        // number
project.numberOfAvailableTasks() // number

// Relationships
project.folder()               // Folder or null
project.tags()                 // Array of Tags
```

### Collection Methods (Critical Discovery)

#### whose() - The Magic Method
```javascript
// CORRECT: whose() on the function
doc.flattenedTasks.whose({id: taskId})              // ✓ Works
doc.flattenedTasks.whose({completed: false})        // ✓ Works
doc.flattenedTasks.whose({flagged: true})           // ✓ Works
doc.flattenedTasks.whose({project: projectObj})     // ✓ Works

// WRONG: whose() on the array result
doc.flattenedTasks().whose({id: taskId})             // ✗ Fails
```

#### Multiple Conditions
```javascript
// Combine conditions
doc.flattenedTasks.whose({
    completed: false,
    flagged: true
})

// Complex conditions (limited support)
doc.flattenedTasks.whose({
    dueDate: {_lessThan: new Date()}  // Due in past
})
```

## Collection Types and Differences

### Tasks Collections
```javascript
// Root-level only (usually empty)
doc.tasks()                    // []

// ALL tasks recursively (what you want)
doc.flattenedTasks()           // [Task, Task, ...]

// Inbox tasks
doc.inboxTasks()               // [Task, Task, ...]
```

### Projects Collections
```javascript
// Root-level projects
doc.projects()                 // [Project, ...]

// ALL projects recursively
doc.flattenedProjects()        // [Project, Project, ...]
```

### Other Collections
```javascript
doc.folders()                  // [Folder, ...]
doc.flattenedFolders()         // [Folder, Folder, ...]
doc.tags()                     // [Tag, ...]
doc.flattenedTags()            // [Tag, Tag, ...]
```

## Error Patterns and Solutions

### "Can't convert types" Errors
```javascript
// These ALL fail with "Can't convert types"
doc.taskWithID(taskId)                    // ✗ Expects specifier
doc.Task.byIdentifier(taskId)             // ✗ Wrong API
app.Task.byIdentifier(taskId)             // ✗ Wrong API
doc.projectWithID(projectId)              // ✗ Expects specifier

// Solution: Always use whose()
doc.flattenedTasks.whose({id: taskId})    // ✓ Works
```

### "undefined is not an object" Errors
```javascript
// Wrong: Trying OmniJS syntax
Task.byIdentifier(taskId)                 // ✗ Task is not defined

// Right: JXA syntax
doc.flattenedTasks.whose({id: taskId})    // ✓
```

### "whose is not a function" Errors
```javascript
// Wrong: Calling whose() on array
const tasks = doc.flattenedTasks();
tasks.whose({id: taskId})                 // ✗ whose undefined

// Right: Calling whose() on function
doc.flattenedTasks.whose({id: taskId})    // ✓
```

## Code Patterns That Work

### Safe Property Access Pattern
```javascript
function safeGet(fn) {
    try {
        return fn();
    } catch (e) {
        return null;
    }
}

// Use it everywhere
const taskName = safeGet(() => task.name());
const projectId = safeGet(() => task.project().id());
```

### Robust Task Lookup Pattern
```javascript
function findTaskById(doc, taskId) {
    // Try fast whose() first
    try {
        const matches = doc.flattenedTasks.whose({id: taskId});
        if (matches && matches.length > 0) {
            return matches[0];
        }
    } catch (e) {
        // Fall back to iteration if whose() fails
        const tasks = doc.flattenedTasks();
        for (let i = 0; i < tasks.length; i++) {
            if (safeGet(() => tasks[i].id()) === taskId) {
                return tasks[i];
            }
        }
    }
    return null;
}
```

### Creating New Items
```javascript
// Create task in inbox
const newTask = app.Task({
    name: "New task",
    note: "Task notes",
    flagged: true,
    dueDate: new Date()
});
doc.inboxTasks.push(newTask);

// Create task in project
const project = doc.flattenedProjects.whose({name: "My Project"})[0];
const projectTask = app.Task({
    name: "Project task"
});
project.tasks.push(projectTask);
```

### Modifying Tasks
```javascript
// Always check task exists first
const task = findTaskById(doc, taskId);
if (task) {
    // Direct property setters
    task.name = "Updated name";
    task.completed = true;
    task.flagged = false;
    
    // Date handling
    task.dueDate = new Date("2025-12-31");
    task.deferDate = null;  // Clear date
    
    // Add tags
    const tag = doc.flattenedTags.whose({name: "Important"})[0];
    if (tag) {
        task.addTag(tag);
    }
}
```

## Testing Methodology

### Discovery Scripts Created
1. `explore-jxa-better.js` - Revealed function vs array distinction
2. `test-byIdentifier.js` - Proved Task.byIdentifier doesn't work
3. `test-collections-difference.js` - Found whose() on functions
4. `test-omnijs-vs-jxa.js` - Confirmed we're in JXA, not OmniJS
5. `test-parameter-types.js` - Tested what parameters methods accept
6. `test-applescript-specifiers.js` - Understood the type conversion issue

### Key Testing Insights
1. **Always test both paths**: whose() and iteration fallback
2. **Check types carefully**: JXA proxy objects hide their true nature
3. **Benchmark everything**: whose() is 3-5x faster than iteration
4. **Test edge cases**: Empty results, null values, missing properties

### Running Test Scripts
```bash
# Direct execution
osascript -l JavaScript docs/test-script.js

# Or make executable
chmod +x docs/test-script.js
./docs/test-script.js
```

## Summary of Best Practices

1. **Always use flattenedTasks/flattenedProjects** - Never the non-flattened versions
2. **Use whose() for lookups** - It's much faster than iteration
3. **Everything is a method** - Always use parentheses for property access
4. **Handle errors gracefully** - JXA throws often, use try-catch
5. **Test empirically** - Documentation is often wrong or incomplete
6. **Cache when possible** - JXA calls are expensive
7. **Prefer batch operations** - Minimize script execution calls

## What We Still Don't Know

1. How to make `taskWithID()` and similar methods work (if possible)
2. Full extent of whose() clause capabilities
3. Whether there's a way to access OmniJS from JXA context
4. Complete list of all available methods (dictionary exploration needed)
5. Performance characteristics of different operations at scale

## AppleScript Dictionary Analysis Results

### Confirmed Working Collections

1. **Document-level collections that work**:
   - `doc.flattenedTasks()` - 2034 items (ALL tasks)
   - `doc.tasks()` - 0 items (root-level only, usually empty)
   - `doc.inboxTasks()` - 259 items (inbox tasks)
   - `doc.flattenedProjects()` - All projects
   - `doc.flattenedTags()` - All tags

2. **Tag-specific collections that work**:
   - `tag.tasks()` - Direct tasks with this tag
   - `tag.availableTasks()` - Unblocked incomplete tasks
   - `tag.remainingTasks()` - All incomplete tasks

3. **Project properties that work**:
   - `project.rootTask()` - The project's root task
   - `project.nextTask()` - Next actionable task (or null)
   - Task counts via root task:
     - `rootTask.numberOfTasks()`
     - `rootTask.numberOfAvailableTasks()`
     - `rootTask.numberOfCompletedTasks()`

### Newly Discovered Working Properties

All these properties work with the `()` syntax:
- `task.blocked()` - boolean, if task is blocked
- `task.next()` - boolean, if task is next action
- `task.effectiveDeferDate()` - inherited defer date
- `task.effectiveDueDate()` - inherited due date
- `task.effectivelyCompleted()` - including parent completion
- `task.effectivelyDropped()` - including parent dropped
- `task.estimatedMinutes()` - task duration estimate
- `task.repetitionRule()` - repetition settings object
- `task.inInbox()` - boolean, if in inbox
- `task.creationDate()` - when created
- `task.modificationDate()` - when last modified

### Complex whose() Queries That Work

```javascript
// Multiple conditions
doc.flattenedTasks.whose({
    completed: false,
    flagged: true
})  // Found 36 tasks

// Inbox filtering
doc.flattenedTasks.whose({inInbox: true})  // 259 tasks

// Available tasks (unblocked, incomplete)
doc.flattenedTasks.whose({
    blocked: false,
    completed: false
})  // 1201 tasks
```

### What Doesn't Work in JXA

1. **AppleScript Commands** - All throw "Can't convert types" or "Message not understood":
   - `markComplete()`, `markIncomplete()`, `markDropped()`
   - `parseTasksInto()`, `complete()` (autocomplete)
   - `compact()`, `synchronize()`
   - These exist as methods but parameter passing fails

2. **Document-level collections that don't work**:
   - `doc.availableTasks` - "Can't get object"
   - `doc.remainingTasks` - "Can't get object"

3. **Property setters with issues**:
   - `task.completed = true` - "Can't set that. Access not allowed."
   - Must use a different approach for task completion

### Key Insights

1. **Collection methods work, commands don't**: We can read and filter data efficiently but can't use AppleScript commands
2. **Tag collections are powerful**: `tag.availableTasks()` gives pre-filtered results
3. **Project structure is accessible**: Can navigate project->rootTask->children
4. **whose() is very capable**: Supports multiple conditions and all boolean properties
5. **Read-only access is comprehensive**: Almost all properties work for reading

This reference will be updated as we discover more about the JXA API through testing.