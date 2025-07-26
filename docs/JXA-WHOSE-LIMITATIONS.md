# JXA whose() Method Limitations in OmniFocus

This document details the limitations and capabilities of the `whose()` method when using JavaScript for Automation (JXA) with OmniFocus.

## Overview

The `whose()` method in JXA is used to filter collections of objects based on property values. However, it has significant limitations compared to AppleScript, especially when working with OmniFocus.

## Test Results Summary

### ✅ What Works

1. **Basic Boolean Properties**
   ```javascript
   // Works perfectly
   doc.flattenedTasks.whose({completed: false})()
   doc.flattenedTasks.whose({flagged: true})()
   doc.flattenedTasks.whose({completed: false, flagged: true})() // AND logic
   ```

2. **Direct Property Comparisons**
   ```javascript
   // String exact match
   doc.flattenedTasks.whose({name: 'Test Task'})()
   
   // Direct null comparison (checking for null values)
   doc.flattenedTasks.whose({dueDate: null})()
   ```

3. **Date Comparisons with Operators**
   ```javascript
   const today = new Date();
   doc.flattenedTasks.whose({dueDate: {'>': today}})()  // Tasks due after today
   doc.flattenedTasks.whose({dueDate: {'<': today}})()  // Tasks due before today
   ```

4. **Logical Operators**
   ```javascript
   // AND operator
   doc.flattenedTasks.whose({
     _and: [
       {completed: false},
       {flagged: true}
     ]
   })()
   
   // OR operator
   doc.flattenedTasks.whose({
     _or: [
       {flagged: true},
       {inInbox: true}
     ]
   })()
   ```

### ❌ What Doesn't Work

1. **Null Inequality Comparisons**
   ```javascript
   // This throws "Illegal comparison or logical" error
   doc.flattenedTasks.whose({dueDate: {'!=': null}})()
   ```

2. **String Operators (Corrected)**
   ```javascript
   // ✅ CORRECT - String operators use underscore prefix
   doc.flattenedTasks.whose({name: {_contains: 'email'}})()  // WORKS
   doc.flattenedTasks.whose({name: {_beginsWith: 'Email'}})() // WORKS
   doc.flattenedTasks.whose({name: {_endsWith: 'task'}})()   // WORKS
   
   // ❌ WRONG - Without underscore these fail
   doc.flattenedTasks.whose({name: {'contains': 'email'}})() // FAILS
   ```

3. **Complex Date Range Queries**
   - While individual date comparisons work, complex date range queries with multiple conditions can be problematic
   - Combining date comparisons with other filters can lead to timeouts

## Important Implementation Details

### 1. Method vs Property Access

- `doc.flattenedTasks` is a **method**, not a property
- Must be called as `doc.flattenedTasks()` to get the array of tasks
- The `whose()` method is available on the accessor object, not the array

### 2. Calling Pattern

The correct pattern for using `whose()` is:
```javascript
// Step 1: Get the accessor object
const accessor = doc.flattenedTasks;

// Step 2: Call whose() on the accessor
const specifier = accessor.whose({completed: false});

// Step 3: Call the specifier as a function to get results
const tasks = specifier();
```

Or more commonly, chained:
```javascript
const tasks = doc.flattenedTasks.whose({completed: false})();
```

### 3. Performance Implications

- `whose()` filtering happens at the AppleScript/OSA level, which should be faster than JavaScript iteration
- However, complex queries or certain operators can cause significant delays
- For large databases (2000+ tasks), some `whose()` queries can timeout

## Recommended Approach

Given these limitations, the recommended approach for complex filtering is:

1. **Use `whose()` for simple boolean filters** when possible:
   ```javascript
   // Fast: Get all incomplete tasks
   const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
   ```

2. **Iterate and filter manually for complex queries**:
   ```javascript
   // More reliable for complex date ranges
   const allTasks = doc.flattenedTasks();
   const filtered = [];
   
   for (let i = 0; i < allTasks.length; i++) {
     const task = allTasks[i];
     const dueDate = task.dueDate();
     
     if (dueDate && dueDate > startDate && dueDate < endDate) {
       filtered.push(task);
     }
   }
   ```

3. **Combine approaches** for optimal performance:
   ```javascript
   // First filter with whose() for simple criteria
   const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
   
   // Then filter further with JavaScript
   const overdueTasks = incompleteTasks.filter(task => {
     const dueDate = task.dueDate();
     return dueDate && dueDate < new Date();
   });
   ```

## Error Handling

When using `whose()`, always wrap in try-catch blocks:

```javascript
try {
  const tasks = doc.flattenedTasks.whose({someProperty: someValue})();
  // Process tasks
} catch (error) {
  if (error.message.includes('Illegal comparison')) {
    // Fall back to manual filtering
    const allTasks = doc.flattenedTasks();
    // Manual filter logic
  }
}
```

## Conclusion

While `whose()` is powerful for simple queries, its limitations in JXA require a hybrid approach for complex filtering. Understanding these limitations helps in designing efficient and reliable OmniFocus automation scripts.