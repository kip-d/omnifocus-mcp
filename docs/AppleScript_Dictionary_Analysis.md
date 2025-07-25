# OmniFocus AppleScript Dictionary Analysis

## Overview
This document analyzes the OmniFocus AppleScript Dictionary to identify JXA-accessible methods and properties that could improve our implementation.

## Key Discoveries

### 1. Methods We Haven't Tried Yet

#### Document-level Methods
- **`parse tasks into`** - Converts textual representation into tasks
  ```javascript
  doc.parseTasksInto({
    withTransportText: "Task 1\nTask 2\nTask 3",
    asSingleTask: false
  })
  ```

- **`complete`** - Generate completions for autocomplete
  ```javascript
  doc.complete("proj", {
    as: "project",
    maximumMatches: 10
  })
  ```

- **`import into`** - Import files into document
  ```javascript
  doc.importInto({
    from: fileRef,
    at: location,
    withTagsAt: tagLocation
  })
  ```

#### Collection-specific Lookups
The dictionary confirms these collection types exist:
- `tasks()` - Root-level only (usually empty)
- `flattenedTasks()` - ALL tasks recursively
- `inboxTasks()` - Inbox tasks specifically
- `availableTasks` - Tasks available for action
- `remainingTasks` - Incomplete tasks (including blocked)

### 2. Task Properties We're Not Using

#### Read-only Properties
- `effectiveDeferDate()` - Inherited defer date
- `effectiveDueDate()` - Inherited due date
- `effectivelyCompleted()` - Including parent completion
- `effectivelyDropped()` - Including parent dropped status
- `numberOfTasks()` - Child task count
- `numberOfAvailableTasks()` - Available child count
- `numberOfCompletedTasks()` - Completed child count
- `nextDeferDate()` - For repeating tasks
- `nextDueDate()` - For repeating tasks
- `blocked()` - If task is blocked
- `next()` - If task is the next action

#### Settable Properties
- `shouldUseFloatingTimeZone` - For dates
- `assignedContainer` - For inbox task assignment
- `estimatedMinutes` - Task duration estimate
- `repetitionRule` - For repeating tasks
- `completedByChildren` - Completion behavior
- `sequential` - Sequential task behavior

### 3. Project-specific Properties

- `rootTask` - The project's root task object
- `nextTask` - Next actionable task in project
- `lastReviewDate` / `nextReviewDate` - Review dates
- `reviewInterval` - Review repetition
- `status` - active/on hold/done/dropped
- `effectiveStatus` - Including inheritance
- `singletonActionHolder` - For single actions
- `defaultSingletonActionHolder` - Default project

### 4. Tag Properties

- `allowsNextAction` - Skip in next action calculation
- `availableTaskCount` - Unblocked incomplete count
- `remainingTaskCount` - All incomplete count
- `location` - Physical location for tag

### 5. Commands We Could Use

#### Task/Project Commands
- **`mark complete`** / **`mark incomplete`** / **`mark dropped`**
  - These might work better than setting properties directly
  - Support completion date parameter
  - Handle repeating tasks automatically

#### Document Commands
- **`compact`** - Process inbox items
- **`synchronize`** - Sync with database
- **`undo`** / **`redo`** - Undo/redo support

### 6. Potential Performance Improvements

#### Using Specific Collections
Instead of filtering all tasks, we could use:
```javascript
// Get only inbox tasks
const inboxTasks = doc.inboxTasks();

// Get only available (unblocked, incomplete) tasks
const available = tag.availableTasks();

// Get remaining (incomplete but maybe blocked) tasks
const remaining = tag.remainingTasks();
```

#### Using whose() with More Conditions
The dictionary confirms complex whose clauses:
```javascript
// Multiple conditions
doc.flattenedTasks.whose({
  completed: false,
  flagged: true,
  dueDate: {_lessThan: new Date()}
})

// Nested properties (might work)
doc.flattenedTasks.whose({
  project: {status: "active"}
})
```

### 7. Tree/Hierarchy Navigation

The dictionary shows tree navigation properties:
- `descendantTrees` - All descendants
- `ancestorTrees` - All ancestors
- `leaves` - Terminal nodes
- `followingSiblings` / `precedingSiblings`

This could help with:
- Finding all tasks under a project
- Finding parent project of a task
- Navigating task hierarchies

### 8. Quick Entry Panel

There's a `quickEntry` object with methods:
```javascript
const qe = doc.quickEntry();
qe.open();
qe.save();
qe.close();
// Can contain tasks, projects, folders
```

### 9. Perspectives

The dictionary shows perspective access:
```javascript
// List all perspective names
const perspectiveNames = doc.perspectiveNames();

// Access perspectives
const perspectives = doc.perspectives();
```

## Recommendations for Implementation

### 1. Immediate Improvements

1. **Use `mark complete` instead of `task.completed = true`**
   - Handles repeating tasks correctly
   - Supports backdating completion

2. **Use specific collections for better performance**
   - `doc.inboxTasks()` for inbox-only queries
   - `tag.availableTasks()` for actionable tasks

3. **Add missing read-only properties to task info**
   - `blocked`, `next`, `effectiveDueDate`, etc.
   - Child task counts

### 2. New Features to Implement

1. **Task Parsing**
   ```javascript
   // Parse multi-line text into tasks
   const tasks = doc.parseTasksInto({
     withTransportText: "Buy milk\nCall mom\nFinish report"
   });
   ```

2. **Autocomplete Support**
   ```javascript
   const matches = doc.complete(searchTerm, {
     as: "project", // or "tag", "folder"
     maximumMatches: 10
   });
   ```

3. **Review Management**
   - Access/set review dates on projects
   - Filter projects needing review

4. **Location-based Tags**
   - Access tag location information
   - Support location triggers

### 3. Performance Optimizations

1. **Batch Operations**
   - Use `mark complete` with arrays
   - Process multiple tasks in one script

2. **Smarter Filtering**
   - Use collection-specific methods
   - Combine multiple whose conditions

3. **Hierarchy Navigation**
   - Use tree properties for parent/child access
   - Avoid repeated lookups

## Next Steps

1. Test these methods in isolation to verify JXA compatibility
2. Update our implementation to use more efficient approaches
3. Add new tools for features we're missing
4. Document which AppleScript methods work in JXA

## Notes on JXA Compatibility

Not all AppleScript dictionary methods work in JXA:
- Methods expecting object specifiers fail
- Some parameters need different formats
- Collection access patterns differ

Each method needs testing to confirm JXA compatibility.