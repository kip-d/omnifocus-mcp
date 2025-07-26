# JXA whose() Workarounds

Since JXA's `whose()` method doesn't support "not null" queries, here are practical workarounds:

## The "Not Null" Problem

You cannot directly query for non-null values:
```javascript
// ❌ ALL of these fail with "Illegal comparison or logical"
doc.flattenedTasks.whose({dueDate: {'!=': null}})()
doc.flattenedTasks.whose({dueDate: {_not: null}})()
doc.flattenedTasks.whose({dueDate: {'<>': null}})()
```

## Workaround Strategies

### 1. Inverse Query and Subtraction (Theoretical)
```javascript
// Get all tasks and tasks with null dates separately
const allTasks = doc.flattenedTasks();
const nullDateTasks = doc.flattenedTasks.whose({dueDate: null})();

// Tasks with dates = all tasks - null date tasks
// But this requires set operations which aren't efficient
```

### 2. Date Range Query (Partially Works)
```javascript
// Get tasks with dates between very old and very future dates
const veryOldDate = new Date('1900-01-01');
const veryFutureDate = new Date('2100-01-01');

const tasksWithDates = doc.flattenedTasks.whose({
  _and: [
    {dueDate: {'>': veryOldDate}},
    {dueDate: {'<': veryFutureDate}}
  ]
})();

// ⚠️ But this misses tasks with dates outside this range
```

### 3. Pre-filter and Manual Check (Recommended)
```javascript
// Use whose() for what it CAN do, then filter manually
const incompleteTasks = doc.flattenedTasks.whose({completed: false})();

const tasksWithDueDates = incompleteTasks.filter(task => 
  task.dueDate() !== null
);
```

### 4. Direct Iteration (Most Reliable)
```javascript
// Skip whose() entirely for complex queries
const allTasks = doc.flattenedTasks();
const tasksWithDueDates = [];

for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  if (task.dueDate() !== null && !task.completed()) {
    tasksWithDueDates.push(task);
  }
}
```

## Performance Comparison

For a database with 2000+ tasks:

| Method | Time | Reliability |
|--------|------|-------------|
| `whose()` with complex queries | Often times out | Low |
| `whose()` + manual filter | 3-5 seconds | Medium |
| Direct iteration | 2-4 seconds | High |

## Best Practices

1. **Use `whose()` only for simple boolean filters**
   ```javascript
   // Good
   doc.flattenedTasks.whose({completed: false})()
   doc.flattenedTasks.whose({flagged: true})()
   ```

2. **Avoid `whose()` for**:
   - Null inequality checks
   - String pattern matching
   - Complex date ranges
   - Multiple conditions with different types

3. **Combine approaches strategically**:
   ```javascript
   // First: Use whose() for what it does well
   const baseTasks = doc.flattenedTasks.whose({completed: false})();
   
   // Then: Apply additional filters manually
   const finalTasks = baseTasks.filter(task => {
     const dueDate = task.dueDate();
     return dueDate !== null && dueDate < new Date();
   });
   ```

## Conclusion

The lack of "not null" support in JXA's `whose()` is a significant limitation that forces us to use workarounds. For production code, manual iteration is often more reliable and predictable than trying to work around `whose()` limitations.