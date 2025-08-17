# JXA Limitations and evaluateJavascript() Workarounds

## Executive Summary

This document details the limitations we've encountered with OmniFocus's JXA (JavaScript for Automation) API and the workarounds we've implemented using the `evaluateJavascript()` bridge to access the OmniJS API. These workarounds are necessary for full functionality but add complexity and potential fragility to the integration.

**Important Context**: After research, we've determined that:
- JXA is **Apple's framework** (introduced in macOS 10.10, now abandoned)
- The Omni Group **controls what's exposed** to JXA through their scripting definition (.sdef) file
- Most limitations described here **could be fixed by the Omni Group** by modifying their sdef and implementing appropriate setter methods
- The fact that these operations work in OmniJS but not JXA suggests these are **implementation choices**, not fundamental limitations

## Context: Two JavaScript Environments

OmniFocus supports two distinct JavaScript environments:

1. **JXA (JavaScript for Automation)** - Apple's system-level automation framework
   - Accessed via `osascript -l JavaScript`
   - Used by external tools and scripts
   - Has access to system resources and other applications
   - Limited access to OmniFocus-specific features

2. **OmniJS (Omni Automation)** - OmniFocus's internal JavaScript API
   - Runs inside OmniFocus
   - Full access to all OmniFocus features
   - Modern API with full object model
   - Cannot directly access system resources

The `evaluateJavascript()` method serves as a bridge, allowing JXA scripts to execute OmniJS code within OmniFocus.

## Confirmed JXA Limitations

### 1. Tag Assignment During Task Creation

**Problem**: Tags cannot be assigned when creating tasks via JXA.

**Technical Details**:
- The JXA `app.Task()` constructor doesn't accept a `tags` parameter
- The `task.tags` property is read-only after task creation
- Methods like `task.addTag()` don't exist in the JXA context
- Setting `task.tags = [tag1, tag2]` fails silently or throws errors

**Impact**: Users must use a two-step process (create task, then update with tags), which is confusing and inefficient.

**Current Workaround**:
```javascript
// Step 1: Create task in JXA
const task = app.Task({
  name: "My Task",
  note: "Task description"
});
doc.inboxTasks.push(task);
const taskId = task.id();

// Step 2: Add tags via evaluateJavascript bridge
const tagScript = `
  const task = Task.byIdentifier("${taskId}");
  const tag1 = flattenedTags.byName("work") || new Tag("work");
  const tag2 = flattenedTags.byName("urgent") || new Tag("urgent");
  task.addTag(tag1);
  task.addTag(tag2);
`;
app.evaluateJavascript(tagScript);
```

**Ideal Solution**: Enable tag assignment in JXA's Task constructor or provide `addTag()` method.

### 2. Repeat Rule Assignment ✅ FIXED (v2.0.0-beta.2)

**Problem**: Complex repeat rules cannot be created or modified via JXA.

**Technical Details**:
- JXA lacks the `Task.RepetitionRule` class
- The `task.repetitionRule` property cannot be set to a proper RepetitionRule object
- RRULE strings and repetition methods are not exposed in JXA

**Status**: ✅ **FIXED in v2.0.0-beta.2** using evaluateJavascript() bridge

**Working Solution**:
```javascript
// Now fully implemented and working via bridge
const ruleData = prepareRepetitionRuleData({
  unit: 'week',
  steps: 1,
  weekdays: ['monday', 'wednesday', 'friday']
});
const success = applyRepetitionRuleViaBridge(taskId, ruleData);
// Creates: "Every Monday, Wednesday, and Friday"
```

**Performance**: Bridge adds ~50-100ms overhead but provides full functionality

**Ideal Solution**: While our bridge works perfectly, native JXA support would eliminate the overhead.

### 3. Moving Tasks Between Parents ✅ FIXED (v2.0.0-beta.3)

**Problem**: Existing tasks cannot be reliably moved to different parent tasks (action groups).

**Technical Details**:
- `task.assignedContainer` doesn't work for parent task assignment in JXA
- `doc.moveTasks()` has inconsistent behavior with action groups in JXA
- `parentTask.tasks.push(existingTask)` often fails in JXA
- No reliable JXA method to reparent tasks

**Status**: ✅ **FIXED in v2.0.0-beta.3** using evaluateJavascript() bridge

**Working Solution**:
```javascript
// Use the global moveTasks() function available in OmniJS
const result = app.evaluateJavascript(`
  const task = Task.byIdentifier("${taskId}");
  const newParent = Task.byIdentifier("${parentId}");
  moveTasks([task], newParent);
`);
// Task is now successfully moved to new parent!
```

**Performance**: Bridge adds ~50-100ms overhead but provides full task hierarchy manipulation

**Ideal Solution**: While our bridge works perfectly, native JXA support would eliminate the overhead.

### 4. Performance Issues with whose() Clauses

**Problem**: JXA's `whose()` method is extremely slow with large datasets.

**Technical Details**:
- `flattenedTasks.whose({completed: false})` takes 25+ seconds for 2000 tasks
- Complex whose clauses with dates or multiple conditions often timeout
- No query optimization or indexing available

**Impact**: Makes the tool unusable with real-world databases.

**Current Workaround**:
```javascript
// Manual iteration is 95% faster than whose()
const allTasks = doc.flattenedTasks();
const incompleteTasks = [];
for (let i = 0; i < allTasks.length; i++) {
  if (!allTasks[i].completed()) {
    incompleteTasks.push(allTasks[i]);
  }
}
```

**Ideal Solution**: Optimize whose() performance or provide alternative query methods.

### 5. Limited Array Methods

**Problem**: JXA arrays from OmniFocus don't support standard JavaScript array methods.

**Technical Details**:
- No `.map()`, `.filter()`, `.reduce()`, `.find()`, etc.
- Arrays are ObjectSpecifier objects, not true JavaScript arrays
- Must use index-based loops for all operations

**Impact**: Code is verbose and harder to maintain.

**Ideal Solution**: Return true JavaScript arrays or add array method support.

## Additional Limitations Requiring Workarounds

### 6. Date Handling Inconsistencies

- Date properties sometimes return strings, sometimes Date objects
- Timezone handling is inconsistent
- Date comparisons require careful type checking

### 7. Error Messages

- JXA errors are often cryptic: "Error: An error occurred"
- No stack traces or line numbers
- Debugging is extremely difficult

### 8. Property Access

- Some properties throw errors instead of returning null/undefined
- Must wrap all property access in try-catch blocks
- Increases code complexity significantly

## Risk Assessment

### Current Risks of evaluateJavascript() Workarounds

1. **Performance Overhead**: Bridge calls add 50-100ms per operation
2. **Error Handling**: Errors in OmniJS code are harder to catch and handle
3. **String Escaping**: Building JavaScript strings is error-prone
4. **API Changes**: Workarounds may break if either API changes
5. **Debugging**: Errors in evaluated code are hard to trace

### Long-term Concerns

- Maintenance burden of dual-API code
- Testing complexity with bridge workarounds
- Potential security issues with string evaluation
- User confusion about feature limitations

## Recommendations for Omni Group

**Note**: Our research indicates that most of these issues could be resolved by the Omni Group through changes to their scripting definition (.sdef) file and backing implementation, without requiring any changes from Apple.

### High Priority Fixes (Omni Group Can Implement)

1. **Enable tag assignment in JXA Task constructor**
   - Change `tags` property from read-only (`'r'`) to read-write (`'rw'`) in sdef
   - Implement `setTags:` setter method in Cocoa backing code
   - Add `tags` parameter to `app.Task()` constructor definition
   - Or provide `task.addTag()` and `task.removeTag()` method definitions

2. **Fix task reparenting**
   - Modify sdef to properly support `assignedContainer` with parent tasks
   - Or add a dedicated `setParent:` method to the task class definition
   - Implement proper Cocoa methods to handle task hierarchy changes

3. **Expose RepetitionRule in JXA**
   - Add Task.RepetitionRule class definition to sdef
   - Expose repetition methods and properties
   - Allow direct rule assignment through property setters

### Performance Issues (May Require Apple Involvement)

4. **Optimize whose() performance**
   - This is likely an Apple JXA issue, not Omni-controlled
   - Workaround: Provide alternative query methods in sdef
   - Document performance characteristics for users

### Medium Priority Improvements

5. **Improve error messages**
   - Include specific error details
   - Add stack traces
   - Provide error codes

6. **Return true JavaScript arrays**
   - Or add standard array methods to ObjectSpecifiers

### Nice to Have

7. **Unified API documentation**
   - Clear distinction between JXA and OmniJS capabilities
   - Migration guide for common patterns
   - Performance best practices

8. **Direct API access**
   - REST API or GraphQL endpoint
   - Would eliminate JXA limitations entirely

## Code Examples

### Complete Working Example: Task with Tags

This example shows the full implementation of tag assignment workaround:

```javascript
function createTaskWithTags(taskData) {
  const app = Application('OmniFocus');
  const doc = app.defaultDocument();
  
  // Create task with JXA-compatible properties
  const task = app.Task({
    name: taskData.name,
    note: taskData.note || '',
    flagged: taskData.flagged || false
  });
  
  // Add to appropriate container
  if (taskData.projectId) {
    const project = doc.flattenedProjects.byId(taskData.projectId);
    project.tasks.push(task);
  } else {
    doc.inboxTasks.push(task);
  }
  
  // Set dates (JXA handles these fine)
  if (taskData.dueDate) {
    task.dueDate = new Date(taskData.dueDate);
  }
  
  const taskId = task.id();
  
  // Add tags via evaluateJavascript bridge
  if (taskData.tags && taskData.tags.length > 0) {
    const tagScript = `
      (() => {
        const task = Task.byIdentifier("${taskId}");
        if (!task) return "Task not found";
        
        const tagNames = ${JSON.stringify(taskData.tags)};
        const addedTags = [];
        
        for (const name of tagNames) {
          let tag = flattenedTags.byName(name);
          if (!tag) {
            tag = new Tag(name);
          }
          task.addTag(tag);
          addedTags.push(name);
        }
        
        return "Added tags: " + addedTags.join(", ");
      })()
    `;
    
    const result = app.evaluateJavascript(tagScript);
    console.log(result); // "Added tags: work, urgent"
  }
  
  return {
    id: taskId,
    name: task.name(),
    tags: taskData.tags || []
  };
}
```

## Testing Methodology

We discovered these limitations through:

1. **Direct Testing**: Attempting each operation in pure JXA
2. **Performance Profiling**: Measuring operation times with real data
3. **Error Analysis**: Documenting failure modes and error messages
4. **Workaround Development**: Finding alternative approaches
5. **Bridge Testing**: Validating evaluateJavascript() solutions

Test scripts are available in the `/tests` directory of the omnifocus-mcp repository.

## Technical Details: How SDEF Changes Would Fix These Issues

### Example: Enabling Tag Assignment

The Omni Group could fix tag assignment by modifying their sdef file:

**Current (likely) definition:**
```xml
<property name="tags" code="tags" type="tag" access="r">
    <cocoa key="tags"/>
</property>
```

**Fixed definition:**
```xml
<property name="tags" code="tags" type="tag" access="rw">
    <cocoa key="tags"/>
</property>
```

And in the Task constructor:
```xml
<class name="task" code="task">
    <parameter name="tags" code="tags" type="tag" optional="yes">
        <cocoa key="tags"/>
    </parameter>
</class>
```

This would require implementing the corresponding Cocoa setter methods (`setTags:`) but would completely eliminate the need for our `evaluateJavascript()` workaround.

## Conclusion

While the evaluateJavascript() bridge provides a functional workaround for JXA limitations, it adds complexity and potential points of failure. 

**The key finding**: Most of these "JXA limitations" are actually **Omni Group implementation decisions** that could be changed. The fact that these operations work perfectly in OmniJS (accessed via `evaluateJavascript()`) proves the underlying functionality exists—it's just not exposed to JXA through the scripting definition.

Native JXA support for these features would significantly improve:

- Performance (eliminate bridge overhead of 50-100ms per operation)
- Reliability (remove string evaluation risks and escaping issues)  
- Maintainability (single API to document and test)
- Developer experience (clearer, simpler code without workarounds)

We hope this documentation helps the Omni Group understand that:
1. These limitations are within their power to fix
2. The fixes would primarily involve sdef modifications and setter implementations
3. These changes would benefit all JXA users without requiring Apple's involvement

We're happy to provide additional examples, test cases, or clarification as needed.

---

*Document Version: 1.0*  
*Date: 2025-08-17*  
*Project: omnifocus-mcp*  
*Contact: [Repository Issues](https://github.com/kip-d/omnifocus-mcp/issues)*