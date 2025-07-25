# OmniFocus JXA API Discovery Guide

## Understanding the Three APIs

### 1. OmniAutomation (Internal Plugin API)
- **Context**: Runs inside OmniFocus
- **Access**: Plugin scripts, Automation menu
- **Features**: Full API with Task.byIdentifier(), etc.
- **Docs**: https://omni-automation.com/omnifocus/

### 2. AppleScript/JXA Bridge (External Scripting)
- **Context**: External scripts via osascript
- **Access**: Application('OmniFocus')
- **Features**: Limited to AppleScript dictionary
- **Docs**: Script Editor > Open Dictionary > OmniFocus

### 3. URL Scheme
- **Context**: Inter-app communication
- **Access**: omnifocus:// URLs
- **Features**: Very limited (add, open)
- **Docs**: https://support.omnigroup.com/omnifocus-url-scheme/

## Discovering Available JXA Methods

```javascript
#!/usr/bin/env osascript -l JavaScript

// Get the application
const app = Application('OmniFocus');
app.includeStandardAdditions = true;

// Get the document
const doc = app.defaultDocument();

// Discover document properties
console.log("Document properties:");
console.log(Object.getOwnPropertyNames(doc).sort().join('\n'));

// Get tasks collection
const tasks = doc.flattenedTasks();
console.log("\nFlattenedTasks methods:");
console.log(Object.getOwnPropertyNames(tasks).sort().join('\n'));

// Get a single task (if any exist)
if (tasks.length > 0) {
    const task = tasks[0];
    console.log("\nTask properties:");
    console.log(Object.getOwnPropertyNames(task).sort().join('\n'));
    
    // Test what works
    console.log("\nTask property examples:");
    console.log("name:", task.name());
    console.log("id:", task.id());
    console.log("completed:", task.completed());
}

// Check for namespace availability
console.log("\nChecking namespaces:");
console.log("typeof Task:", typeof Task);
console.log("typeof Project:", typeof Project);
console.log("typeof Tag:", typeof Tag);
```

## Key JXA API Discoveries (July 2025)

### What Works:
1. **`whose()` filtering** - Fast O(1) lookups!
   - `doc.flattenedTasks.whose({id: taskId})` - 2ms vs 7ms for iteration
   - `doc.flattenedTasks.whose({completed: false})` - Pre-filtered collections
   - `doc.flattenedTasks.whose({flagged: true})` - Much faster than iteration

2. **Document methods exist but throw errors**:
   - `doc.Task.byIdentifier` exists but throws "Can't convert types"
   - `doc.taskWithID()` exists but throws "Can't convert types"
   - Same for `projectWithID()`, `folderWithID()`, `tagWithID()`

3. **Hidden properties**:
   - Object.keys() returns empty arrays
   - for...in loops find nothing
   - But methods ARE accessible when called directly

### What Doesn't Work:
1. **Static namespace methods**:
   - `app.Task.byIdentifier` is undefined
   - `Task.byIdentifier` (global) doesn't exist
   - Only `doc.Task` exists as a constructor function

2. **Type conversion errors**:
   - Any method ending in `WithID` throws "Can't convert types"
   - This appears to be a JXA bridge limitation

### Performance Implications:
- `whose()` is 3-5x faster than iteration
- Should be used for all ID-based lookups
- Falls back gracefully to iteration if it fails

## Practical Workarounds

### Finding a task by ID (JXA)
```javascript
// Slow but reliable
function findTaskById(doc, taskId) {
    const tasks = doc.flattenedTasks();
    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].id() === taskId) {
            return tasks[i];
        }
    }
    return null;
}
```

### Using whose() for filtering (faster)
```javascript
// Get incomplete tasks
const incompleteTasks = doc.flattenedTasks.whose({completed: false});

// Get flagged tasks
const flaggedTasks = doc.flattenedTasks.whose({flagged: true});

// Get tasks in inbox
const inboxTasks = doc.flattenedTasks.whose({inInbox: true});
```

## References

1. **AppleScript Language Guide**: https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/
2. **JavaScript for Automation Cookbook**: https://github.com/JXA-Cookbook/JXA-Cookbook
3. **OmniGroup Forums**: https://discourse.omnigroup.com/c/omnifocus
4. **Script Debugger** (paid app): Much better than Script Editor for exploring dictionaries