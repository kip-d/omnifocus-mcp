# OmniFocus JXA API Discovery Guide

## Critical Discovery: Three Different JavaScript APIs

After extensive testing (July 2025), we've identified that OmniFocus has THREE different JavaScript APIs that are often confused:

### 1. OmniJS (OmniAutomation) - Plugin API
- **Context**: Runs INSIDE OmniFocus as plugins
- **Access**: Via Automation menu, plugin files
- **Example**: `Task.byIdentifier('abc123')` ✓ Works here
- **Globals**: Task, Project, Document, etc. are available
- **Docs**: https://omni-automation.com/omnifocus/
- **TypeScript definitions**: The `.d.ts` files are for THIS API

### 2. JXA (JavaScript for Automation) - What we're using
- **Context**: External scripts via `osascript -l JavaScript`
- **Access**: `Application('OmniFocus')`
- **Example**: `doc.flattenedTasks.whose({id: 'abc123'})` ✓ Works here
- **No globals**: Must access everything through app/doc objects
- **Docs**: AppleScript Dictionary (very limited)
- **Key insight**: `whose` is on the collection function, not the result!

### 3. AppleScript Bridge Methods (Broken in JXA)
- **Context**: Methods that exist but expect AppleScript object specifiers
- **Examples**: `doc.taskWithID()`, `doc.Task.byIdentifier()`
- **Status**: These ALL throw "Can't convert types" ✗
- **Why**: They expect AppleScript object specifiers, not strings

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

### Critical Understanding: `whose` is Special
- **CORRECT**: `doc.flattenedTasks.whose({id: 'xyz'})` ✓
- **WRONG**: `doc.flattenedTasks().whose({id: 'xyz'})` ✗
- `whose` is a method on the collection FUNCTION, not the array result!

### What Works in JXA:
1. **`whose()` clause filtering** - The ONLY fast lookup method!
   - `doc.flattenedTasks.whose({id: taskId})` - 2ms (vs 7ms iteration)
   - `doc.flattenedTasks.whose({completed: false})` - Pre-filtered
   - `doc.flattenedTasks.whose({flagged: true})` - Very efficient
   - Works on all collection functions: tasks, projects, tags, etc.

2. **Collection differences**:
   - `doc.tasks()` - Returns 0 items (only root-level document tasks)
   - `doc.flattenedTasks()` - Returns ALL tasks (what you want)
   - Same pattern for projects, folders, tags

3. **Hidden properties**:
   - Object.keys() returns empty arrays (JXA proxy objects)
   - Methods work when called directly: `task.name()`, `task.id()`
   - All properties are hidden from enumeration

### What Doesn't Work in JXA:
1. **OmniJS methods** (wrong API):
   - `Task.byIdentifier()` - Not available (OmniJS only)
   - Global objects like Task, Project - Not available

2. **AppleScript bridge methods** (type mismatch):
   - `doc.taskWithID()` - Expects AppleScript object specifier
   - `doc.Task.byIdentifier()` - Same issue
   - ALL throw "Can't convert types" regardless of parameter

### The Confusion Explained:
- The TypeScript `.d.ts` files document OmniJS (plugin API)
- We're using JXA (external automation)
- Methods like `byIdentifier` exist in OmniJS but not JXA
- Methods like `taskWithID` expect AppleScript specifiers, not strings

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