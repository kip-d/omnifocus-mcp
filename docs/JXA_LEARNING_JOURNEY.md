# JXA Learning Journey: Understanding OmniFocus Automation

## Overview
This document summarizes our journey discovering how to properly use JavaScript for Automation (JXA) with OmniFocus, including the mistakes we made and why certain approaches don't work.

## The Three JavaScript APIs Confusion

### Initial Mistake
We found TypeScript definitions in OmniFocus and assumed they applied to our JXA scripts. This led to trying methods like `Task.byIdentifier()` which consistently failed.

### Key Discovery
OmniFocus has THREE different JavaScript contexts:
1. **OmniJS (Plugin API)** - Runs inside OmniFocus, has globals like `Task`
2. **JXA (External Automation)** - What we use via `osascript`, no globals
3. **AppleScript Bridge** - Methods that exist but expect different types

The TypeScript definitions document OmniJS, but we're using JXA.

## Major Discoveries

### 1. The whose() Method Mystery
**Initial approach**: We tried `Task.byIdentifier(id)` and `doc.taskWithID(id)`  
**Why it failed**: These are OmniJS or AppleScript bridge methods  
**Solution**: `doc.flattenedTasks.whose({id: taskId})` - 3-5x faster than iteration

**Critical insight**: `whose()` is on the collection FUNCTION, not the array:
- ✅ `doc.flattenedTasks.whose({id: 'xyz'})`
- ❌ `doc.flattenedTasks().whose({id: 'xyz'})`

### 2. Task Completion Limitations
**Initial approach**: `task.completed = true`  
**Why it failed**: "Can't set that. Access not allowed" in some contexts  
**Alternative tried**: `doc.markComplete(task)`  
**Why that failed**: AppleScript commands don't work in JXA - "Can't convert types"  
**Current solution**: Continue using property setters despite occasional errors

### 3. Collection Differences
**Initial confusion**: Why does `doc.tasks()` return 0 items?  
**Discovery**: 
- `tasks()` = root-level only (usually empty)
- `flattenedTasks()` = ALL tasks recursively
- Same pattern for projects, folders, tags

### 4. Performance Optimizations
**Initial approach**: Iterate through all tasks O(n)  
**Discovery**: `whose()` provides O(1) lookups and pre-filtering
```javascript
// Slow: ~7ms
for (let task of doc.flattenedTasks()) {
    if (task.id() === targetId) return task;
}

// Fast: ~2ms
doc.flattenedTasks.whose({id: targetId})[0]
```

## Test Files Created and Why

We created numerous test files to understand the API:
- `test-byIdentifier.js` - Proved Task.byIdentifier doesn't exist in JXA
- `test-collections-difference.js` - Discovered whose() is on functions
- `test-applescript-specifiers.js` - Understood why methods expect different types
- `test-command-syntax.js` - Confirmed AppleScript commands don't work
- `test-working-collections.js` - Mapped what actually works

These tests were essential for empirical discovery since documentation was misleading.

## What We Learned

### Do Use:
1. `flattenedTasks.whose()` for fast lookups
2. Collection functions without parentheses for whose()
3. Property access with parentheses: `task.name()`
4. Tag-specific collections: `tag.availableTasks()`
5. Complex whose queries with multiple conditions

### Don't Use:
1. `Task.byIdentifier()` - Wrong API
2. `doc.taskWithID()` - Expects AppleScript specifier
3. AppleScript commands - Parameter passing fails
4. `doc.tasks()` - Use `flattenedTasks()` instead

### Key Properties Discovered:
- `task.blocked()` - If task is blocked by another
- `task.next()` - If task is the next action
- `task.effectiveDueDate()` - Inherited due date
- `task.inInbox()` - If task is in inbox
- `project.rootTask()` - Access project's task tree

## Conclusion

The journey taught us that:
1. **Documentation can be misleading** - Always test empirically
2. **Multiple APIs exist** - Ensure you're using the right one
3. **JXA has limitations** - Some things just won't work
4. **whose() is powerful** - Master it for performance
5. **Read operations work well** - Write operations are limited

This understanding now guides our implementation to work within JXA's constraints while maximizing performance.