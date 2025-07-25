# Abandoned Approaches and Why

This document explains approaches we tried but abandoned, and the reasons why. Understanding these dead ends helps future developers avoid repeating the same mistakes.

## 1. Using Task.byIdentifier() for Lookups

**What we tried:**
```javascript
const task = Task.byIdentifier(taskId);
```

**Why it failed:**
- `Task` is a global in OmniJS (plugin API) but doesn't exist in JXA
- We were reading OmniJS documentation while using JXA
- Led to "ReferenceError: Can't find variable: Task"

**What works instead:**
```javascript
const task = doc.flattenedTasks.whose({id: taskId})[0];
```

## 2. Using AppleScript Commands (markComplete, etc.)

**What we tried:**
```javascript
doc.markComplete(task);
app.markComplete(task);
task.markComplete();
```

**Why it failed:**
- These commands exist but expect AppleScript object specifiers
- JXA can't properly convert JavaScript objects to AppleScript specifiers
- Always results in "Can't convert types" or "Message not understood"

**What works instead:**
```javascript
task.completed = true;  // Direct property setter
```

## 3. Direct Property Access Without Parentheses

**What we tried:**
```javascript
const name = task.name;
const completed = task.completed;
```

**Why it failed:**
- JXA proxy objects require method calls for all properties
- Direct access returns undefined or function references

**What works instead:**
```javascript
const name = task.name();
const completed = task.completed();
```

## 4. Using doc.tasks() for All Tasks

**What we tried:**
```javascript
const allTasks = doc.tasks();
```

**Why it failed:**
- `tasks()` only returns root-level tasks (usually none)
- Most tasks are children of projects, not the document

**What works instead:**
```javascript
const allTasks = doc.flattenedTasks();  // Returns ALL tasks recursively
```

## 5. Setting task.completed in All Contexts

**What we tried:**
```javascript
task.completed = true;
```

**Why it sometimes fails:**
- In some contexts, returns "Can't set that. Access not allowed"
- Exact conditions unclear, possibly related to task state

**Current approach:**
- We continue using property setters despite occasional errors
- No alternative found that works reliably

## 6. Using availableTasks/remainingTasks on Document

**What we tried:**
```javascript
const available = doc.availableTasks();
const remaining = doc.remainingTasks();
```

**Why it failed:**
- These collections exist on tags but not on documents
- Returns "Can't get object" error

**What works instead:**
```javascript
// For a specific tag:
const tag = doc.flattenedTags.whose({name: "Work"})[0];
const available = tag.availableTasks();

// For all tasks:
const available = doc.flattenedTasks.whose({
  completed: false,
  blocked: false
});
```

## 7. URL Scheme Fallback for Permissions

**What we tried:**
- Using OmniAutomation URL schemes to bypass JXA permission issues
- Encoding scripts in URLs like `omnifocus:///omnijs-run?script=...`

**Why it's limited:**
- Works but requires user interaction for each operation
- Can't return data directly to the calling process
- Not suitable for bulk operations

**Current approach:**
- Use URL schemes only as last resort for operations that fail in JXA
- Primarily for task completion when property setter fails

## 8. Calling whose() on Array Results

**What we tried:**
```javascript
const tasks = doc.flattenedTasks();
const matches = tasks.whose({id: taskId});
```

**Why it failed:**
- `whose()` is only available on collection functions, not arrays
- Once you call the function, you get an array without `whose()`

**What works instead:**
```javascript
// Don't call the function before whose():
const matches = doc.flattenedTasks.whose({id: taskId});
```

## Key Lessons Learned

1. **Always verify which API you're using** - OmniJS vs JXA vs AppleScript
2. **Test everything empirically** - Documentation is often wrong or misleading
3. **Understand proxy object behavior** - JXA objects aren't regular JavaScript
4. **whose() is powerful but specific** - Only on collection functions
5. **Some things just don't work** - Accept limitations and find workarounds

## Useful Patterns That Emerged

Despite the failures, we discovered powerful patterns:

1. **whose() for fast filtering** - O(1) lookups instead of O(n)
2. **Safe property access** - Always wrap in try-catch
3. **Tag-specific collections** - Pre-filtered for performance
4. **Effective properties** - Access inherited values
5. **Batch operations where possible** - Minimize script executions

These discoveries came from extensive trial and error, but resulted in a robust implementation that works within JXA's constraints.