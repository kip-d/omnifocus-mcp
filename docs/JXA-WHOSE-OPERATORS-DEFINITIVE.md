# JXA whose() Operators - Definitive Guide

Based on extensive testing with OmniFocus JXA, here's what actually works:

## String Operators ✅

String operators use underscore prefix and work correctly:

```javascript
// String contains
doc.flattenedTasks.whose({name: {_contains: "email"}})()  // ✅ WORKS

// String begins with
doc.flattenedTasks.whose({name: {_beginsWith: "Email"}})()  // ✅ WORKS

// String ends with  
doc.flattenedTasks.whose({name: {_endsWith: "MCE"}})()  // ✅ WORKS

// String not equal
doc.flattenedTasks.whose({name: {_not: "Test task"}})()  // ✅ WORKS
```

## Date Operators ⚠️

Date operators use **symbol syntax**, NOT underscore prefix:

```javascript
const today = new Date();

// Date comparisons - CORRECT syntax
doc.flattenedTasks.whose({dueDate: {'>': today}})()   // ✅ WORKS
doc.flattenedTasks.whose({dueDate: {'<': today}})()   // ✅ WORKS
doc.flattenedTasks.whose({dueDate: {'>=': today}})()  // ✅ WORKS
doc.flattenedTasks.whose({dueDate: {'<=': today}})()  // ✅ WORKS

// WRONG - underscore syntax fails for dates
doc.flattenedTasks.whose({dueDate: {_gt: today}})()   // ❌ FAILS
doc.flattenedTasks.whose({dueDate: {_lt: today}})()   // ❌ FAILS
```

## Boolean Properties ✅

Direct property assignment works:

```javascript
// Boolean equality
doc.flattenedTasks.whose({completed: false})()  // ✅ WORKS
doc.flattenedTasks.whose({flagged: true})()     // ✅ WORKS

// Multiple conditions (implicit AND)
doc.flattenedTasks.whose({completed: false, flagged: true})()  // ✅ WORKS
```

## Null Comparisons ⚠️

Limited support:

```javascript
// Check for null - WORKS
doc.flattenedTasks.whose({dueDate: null})()  // ✅ WORKS

// Check for NOT null - NO WORKING SYNTAX
doc.flattenedTasks.whose({dueDate: {_not: null}})()   // ❌ FAILS
doc.flattenedTasks.whose({dueDate: {'!=': null}})()   // ❌ FAILS
doc.flattenedTasks.whose({dueDate: {'<>': null}})()   // ❌ FAILS
```

## Logical Operators ✅

```javascript
// AND operator
doc.flattenedTasks.whose({
  _and: [
    {completed: false},
    {flagged: true}
  ]
})()  // ✅ WORKS

// OR operator
doc.flattenedTasks.whose({
  _or: [
    {flagged: true},
    {inInbox: true}
  ]
})()  // ✅ WORKS
```

## Complete Operator Reference

| Operation | Working Syntax | Notes |
|-----------|---------------|-------|
| **Strings** | | |
| equals | `{name: "value"}` | Direct assignment |
| not equal | `{name: {_not: "value"}}` | Underscore prefix |
| contains | `{name: {_contains: "value"}}` | Case sensitive |
| begins with | `{name: {_beginsWith: "value"}}` | Case sensitive |
| ends with | `{name: {_endsWith: "value"}}` | Case sensitive |
| **Dates** | | |
| equals | `{dueDate: dateObject}` | Direct assignment |
| greater than | `{dueDate: {'>': dateObject}}` | Symbol syntax |
| less than | `{dueDate: {'<': dateObject}}` | Symbol syntax |
| greater or equal | `{dueDate: {'>=': dateObject}}` | Symbol syntax |
| less or equal | `{dueDate: {'<=': dateObject}}` | Symbol syntax |
| **Booleans** | | |
| equals | `{completed: true}` | Direct assignment |
| not equal | `{completed: {_not: true}}` | Works but rarely needed |
| **Null** | | |
| is null | `{dueDate: null}` | Direct assignment |
| is not null | **NOT SUPPORTED** | No working syntax |
| **Logical** | | |
| AND | `{_and: [...]}` | Array of conditions |
| OR | `{_or: [...]}` | Array of conditions |

## Key Takeaways

1. **String operators use underscore prefix** (`_contains`, `_beginsWith`, etc.)
2. **Date operators use symbol syntax** (`>`, `<`, etc.), NOT underscore
3. **Null inequality is not supported** - there's no way to query "not null"
4. **Mixed operator types** can cause issues - keep queries simple

## Performance Warning

Even with correct syntax, complex `whose()` queries can timeout on large databases (2000+ items). For production code, consider:

1. Using simple filters only
2. Implementing timeouts and fallbacks
3. Manual iteration for complex queries
4. Aggressive result limiting

## Example: Robust Query Pattern

```javascript
try {
  // Try optimized query first
  const tasks = doc.flattenedTasks.whose({
    completed: false,
    name: {_contains: "email"}
  })();
  
  // Further filter if needed
  return tasks.filter(task => task.dueDate() !== null);
  
} catch (error) {
  // Fall back to manual iteration
  const allTasks = doc.flattenedTasks();
  return allTasks.filter(task => 
    !task.completed() && 
    task.name().includes("email") &&
    task.dueDate() !== null
  );
}
```

This mixed approach leverages `whose()` for what it does well while avoiding its limitations.