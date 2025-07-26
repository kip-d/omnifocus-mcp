# JXA whose() Method - Key Findings Summary

## Executive Summary

The `whose()` method in JXA for OmniFocus has significant limitations that make it unsuitable for complex queries, especially with large task databases. While it works for simple boolean filters, it fails or times out for more complex operations.

## Confirmed Working Patterns

### ✅ Simple Boolean Properties
```javascript
// These work reliably
doc.flattenedTasks.whose({completed: false})()
doc.flattenedTasks.whose({flagged: true})()
doc.flattenedTasks.whose({completed: false, flagged: true})() // AND logic
```

### ✅ Direct Value Comparisons
```javascript
// Exact string match
doc.flattenedTasks.whose({name: 'Exact Task Name'})()

// Checking for null values (not undefined)
doc.flattenedTasks.whose({dueDate: null})()
```

### ✅ Basic Date Comparisons
```javascript
const today = new Date();
doc.flattenedTasks.whose({dueDate: {'>': today}})()  // Future tasks
doc.flattenedTasks.whose({dueDate: {'<': today}})()  // Past tasks
```

### ✅ Logical Operators
```javascript
// _and operator
doc.flattenedTasks.whose({
  _and: [{completed: false}, {flagged: true}]
})()

// _or operator  
doc.flattenedTasks.whose({
  _or: [{flagged: true}, {inInbox: true}]
})()
```

## Confirmed Failing Patterns

### ❌ Null Inequality
```javascript
// These ALL throw "Illegal comparison or logical" error
doc.flattenedTasks.whose({dueDate: {'!=': null}})()
doc.flattenedTasks.whose({dueDate: {_not: null}})()
doc.flattenedTasks.whose({dueDate: {'_not': null}})()

// There is NO working syntax for "not null" in JXA whose()
```

### ❌ String Contains/Pattern Matching
```javascript
// Throws "Illegal comparison or logical" error
doc.flattenedTasks.whose({name: {'contains': 'email'}})()
doc.flattenedTasks.whose({name: {'beginsWith': 'Test'}})()
doc.flattenedTasks.whose({name: {'endsWith': 'task'}})()
```

### ❌ Complex Nested Queries
- Combining multiple date comparisons with other filters often times out
- Deep property access (e.g., `project.name`) is unreliable

## Performance Characteristics

### With Large Databases (2000+ tasks)

1. **Simple whose() queries**: Can work but may take several seconds
2. **Complex whose() queries**: Often timeout (>20-30 seconds)
3. **Manual iteration**: More predictable performance, typically 2-5 seconds

### Performance Impact Factors

1. **Database size**: Performance degrades significantly with larger task counts
2. **Query complexity**: Each additional condition multiplies execution time
3. **Property access**: Accessing related objects (projects, tags) adds overhead

## Practical Implications

### 1. Query Strategy

For simple filters, `whose()` can be used:
```javascript
// Good for basic filtering
const incompleteTasks = doc.flattenedTasks.whose({completed: false})();
```

For complex queries, manual iteration is more reliable:
```javascript
// Better for complex date ranges or multiple conditions
const allTasks = doc.flattenedTasks();
const filtered = allTasks.filter(task => {
  // Complex logic here
  return condition1 && condition2 && condition3;
});
```

### 2. Error Handling

Always wrap `whose()` queries in try-catch:
```javascript
try {
  const tasks = doc.flattenedTasks.whose(query)();
} catch (e) {
  if (e.message.includes('Illegal comparison')) {
    // Fall back to manual filtering
  }
}
```

### 3. Timeout Considerations

For MCP tools with 60-second timeouts:
- Limit result sets aggressively
- Use simple filters only
- Consider caching strategies
- Implement pagination

## Recommendations

1. **Avoid whose() for production tools** with complex requirements
2. **Use manual filtering** for predictable performance
3. **Implement result limits** to prevent timeouts
4. **Cache aggressively** to avoid repeated expensive queries
5. **Document limitations** clearly for users

## Technical Details

### How whose() Works

1. `doc.flattenedTasks` returns an object specifier (not an array)
2. `.whose()` creates a filtered specifier
3. Calling the result `()` executes the query and returns an array
4. The filtering happens at the OSA (Open Scripting Architecture) level

### Why It's Limited

1. **JXA Bridge Limitations**: Not all AppleScript operators translate to JXA
2. **Type Coercion Issues**: JavaScript and AppleScript handle types differently
3. **Missing Operators**: Many useful operators like `contains` don't work
4. **Performance**: Large result sets can overwhelm the bridge

## Conclusion

While `whose()` is theoretically more efficient than manual filtering, its limitations and unpredictable performance make it unsuitable for complex queries in production environments. A hybrid approach using simple `whose()` filters combined with JavaScript array methods provides the best balance of functionality and reliability.