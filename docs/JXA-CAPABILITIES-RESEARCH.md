# JXA Capabilities Research

## Overview
This document summarizes research into JXA (JavaScript for Automation) capabilities from the JXA Cookbook and community resources, with specific focus on improvements for the OmniFocus MCP project.

## Key JXA Capabilities

### 1. Core Application Control
- **Application Object**: Use `Application('AppName')` to get application instances
- **ES6 Support**: Modern JavaScript features like destructuring, arrow functions, spread operators
- **Objective-C Bridge**: Access to Cocoa frameworks via `ObjC.import()`
- **Shell Integration**: Execute shell commands and scripts from within JXA

### 2. Collection and Filtering Patterns
- **whose() clauses**: Filter collections with predicate-based queries
- **Array-like operations**: Collections support map, filter, forEach operations
- **Property access**: Both dot notation and bracket notation for properties

### 3. User Interaction
- **Dialogs**: Display alerts, prompts, file/folder selection dialogs
- **System Events**: Simulate keystrokes, mouse clicks, menu interactions
- **Notifications**: Create system notifications

### 4. Performance Considerations
- **Batch operations**: Process collections in single operations when possible
- **Caching references**: Store object references to avoid repeated lookups
- **Async operations**: Use Promises for non-blocking operations

## Current OmniFocus MCP Implementation

### What We're Already Using Well
1. **evaluateJavascript() bridge**: Successfully bridging JXA to Omni Automation for RepetitionRule
2. **whose() clauses**: Filtering tasks and projects with complex predicates
3. **Batch reading**: Fetching collections efficiently
4. **Error handling**: Try-catch blocks with proper error propagation

### Current Limitations We're Working Around
1. **RepetitionRule**: Cannot create directly in JXA (solved via evaluateJavascript)
2. **Tag assignment on creation**: Must update after creation
3. **Complex date queries**: Limited by whose() clause restrictions
4. **Transaction support**: No native atomic operations

## Potential Improvements from Research

### 1. Enhanced Objective-C Bridge Usage
```javascript
// We could potentially use ObjC bridge for:
ObjC.import('Foundation');
// - Better date handling with NSDate
// - Regular expressions with NSRegularExpression
// - File operations with NSFileManager
```

### 2. System Events Integration
```javascript
// Could add features like:
const se = Application('System Events');
// - Check if OmniFocus is running before operations
// - Bring OmniFocus to foreground when needed
// - Monitor for OmniFocus quit/launch events
```

### 3. Performance Optimizations
```javascript
// Cache application reference
const omni = Application('OmniFocus');
omni.includeStandardAdditions = true;

// Batch operations pattern
const tasks = omni.defaultDocument.flattenedTasks.whose({
    completed: false,
    flagged: true
})();
// Process all at once instead of iterating
```

### 4. Advanced Dialog Features
```javascript
// Could add interactive features:
app.chooseFromList(['Option 1', 'Option 2'], {
    withPrompt: 'Select tasks to process:',
    multipleSelectionsAllowed: true
});
```

### 5. Shell Command Integration
```javascript
// Direct shell execution for utilities
app.doShellScript('osascript -e "tell application \\"OmniFocus\\" to quit"');
// Could be useful for cleanup or restart scenarios
```

## Recommended Enhancements for OmniFocus MCP

### High Priority
1. **Perspective Access via UI Scripting**: Use System Events to access perspectives menu
2. **Batch Create with Templates**: Use ObjC bridge for JSON parsing of complex templates
3. **Performance Monitoring**: Add timing measurements using Date.now()
4. **Smart Caching**: Cache app reference and commonly accessed collections

### Medium Priority
1. **Notification on Long Operations**: Use displayNotification for operations > 5 seconds
2. **File Export Improvements**: Use ObjC.import('Foundation') for better file handling
3. **Regular Expression Search**: Implement via NSRegularExpression for advanced filtering

### Low Priority
1. **UI Automation**: Automate perspective switching via System Events
2. **Clipboard Integration**: Add copy/paste functionality for task templates
3. **AppleScript Bridge**: For features only available in AppleScript

## Implementation Notes

### Pattern: Safer Property Access
```javascript
// Instead of direct access that might fail:
// task.deferDate.toISOString()

// Use safe navigation:
function safeGet(obj, path, defaultValue = null) {
    return path.split('.').reduce((acc, part) => 
        acc && acc[part] !== undefined ? acc[part] : defaultValue, obj);
}
```

### Pattern: Batch Operations with Progress
```javascript
function batchProcess(items, operation, chunkSize = 100) {
    const results = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        results.push(...chunk.map(operation));
        // Could add progress callback here
    }
    return results;
}
```

### Pattern: Error Recovery
```javascript
function withRetry(fn, maxRetries = 3, delay = 1000) {
    return async function(...args) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn(...args);
            } catch (e) {
                if (i === maxRetries - 1) throw e;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    };
}
```

## Debugging Techniques

1. **Safari Web Inspector**: Enable for JavaScript debugging of automation scripts
2. **Console Logging**: Use `console.log()` for debugging (output appears in Script Editor)
3. **Error Boundaries**: Wrap operations in try-catch with detailed error messages
4. **Type Checking**: Add runtime type checks for API responses

## Resources for Further Learning
- [JXA Cookbook Wiki](https://github.com/JXA-Cookbook/JXA-Cookbook/wiki)
- [Apple Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/)
- [JXA Resources Gist](https://gist.github.com/JMichaelTX/d29adaa18088572ce6d4)
- [Sal Soghoian's MacOSXAutomation.com](http://macosxautomation.com/)

## Conclusion
JXA provides powerful automation capabilities that we're already leveraging well in the OmniFocus MCP project. The main opportunities for improvement lie in:
1. Better use of the Objective-C bridge for system integration
2. Performance optimizations through caching and batching
3. Enhanced error handling and recovery
4. Potential UI automation for features not exposed in the API

The evaluateJavascript() bridge discovery was a breakthrough that shows creative solutions exist for JXA limitations.