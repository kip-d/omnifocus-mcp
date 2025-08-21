# Script Length Management Strategy

## The Problem

When updating OmniFocus tasks with multiple parameters (especially tags and complex data), our JXA scripts were growing exponentially due to parameter expansion in the template system.

### Root Cause
The template system (`OmniAutomation.buildScript()`) performs string replacement on placeholders like `{{tags}}`, `{{updates}}`, etc. When these parameters contain arrays or objects with many properties, the expanded JavaScript code becomes enormous.

**Example of the problem:**
```javascript
// Template contains:
const updates = {{updates}};

// With a complex update object, this expands to:
const updates = {
  name: "Very long task name with special characters...",
  note: "Multi-line note with lots of content...",
  tags: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  dueDate: "2025-03-31T17:00:00.000Z",
  deferDate: "2025-03-30T09:00:00.000Z",
  // ... many more properties
};

// Result: 51KB+ script that gets truncated by osascript
```

### Impact
- Scripts over ~50KB get truncated with "Unexpected end of script" errors
- Complex updates fail silently or with cryptic errors
- Performance degradation from parsing huge scripts
- Memory pressure on the osascript process

## Current Solution: Ultra-Minimal Pattern

We solved this by passing complex data as JSON strings and parsing them inside the script, rather than expanding them in the template.

### Implementation
```typescript
// Instead of passing the object directly:
const script = buildScript(template, {
  updates: complexUpdateObject  // ❌ This expands to huge JavaScript
});

// We pass it as a JSON string:
const script = buildScript(template, {
  taskId: taskId,  // Simple string, minimal expansion
  updatesJson: JSON.stringify(complexUpdateObject)  // Compact JSON string
});

// Inside the script:
const updatesJson = {{updatesJson}};  // Just a string literal
const updates = JSON.parse(updatesJson);  // Parse at runtime
```

### Benefits
- **90% size reduction**: Scripts went from 51KB to ~5KB
- **No truncation**: All scripts fit well within osascript limits
- **Faster parsing**: Smaller scripts parse more quickly
- **Reliable**: No more "Unexpected end of script" errors

### Trade-offs
- **Slight overhead**: JSON.parse() adds minimal runtime cost (~1ms)
- **Error handling**: Need to handle JSON parsing errors
- **Debugging**: Harder to debug since data isn't visible in script source

## Alternative Approaches Considered

### 1. Script Chunking
**Idea**: Split large scripts into multiple smaller scripts
**Pros**: Could handle unlimited data sizes
**Cons**: 
- Complex coordination between scripts
- State management across script boundaries
- Multiple osascript invocations (slower)
**Verdict**: Too complex for marginal benefit

### 2. Direct OmniJS Evaluation
**Idea**: Use `app.evaluateJavascript()` exclusively instead of JXA
**Pros**: No osascript size limits
**Cons**:
- Limited access to system APIs
- Can't use JXA-specific features
- Would require complete rewrite
**Verdict**: Too restrictive, loses JXA capabilities

### 3. External File Loading
**Idea**: Write parameters to temp file, read from script
**Pros**: No size limits
**Cons**:
- File I/O overhead
- Cleanup complexity
- Security concerns with temp files
**Verdict**: Overkill for our use case

### 4. Base64 Encoding
**Idea**: Encode complex data as base64 to avoid escaping issues
**Pros**: Handles special characters well
**Cons**:
- 33% size increase from encoding
- Still doesn't solve core size issue
**Verdict**: Makes problem worse

### 5. Compression
**Idea**: Compress the script or parameters
**Pros**: Could reduce size significantly
**Cons**:
- Need compression library in JXA context
- Decompression overhead
- Added complexity
**Verdict**: Not practical in JXA environment

## Recommendations

### Current Best Practice
The ultra-minimal JSON approach is optimal for our use case because:
1. **Simple**: Easy to understand and maintain
2. **Reliable**: Proven to work in production
3. **Performant**: Minimal overhead (<1ms)
4. **Sufficient**: Handles all current requirements

### When to Use Which Pattern

#### Use Ultra-Minimal (JSON) Pattern for:
- Updates with many parameters
- Operations with arrays (tags, multiple items)
- Any script approaching 10KB in size
- Complex nested data structures

#### Use Direct Parameter Expansion for:
- Simple operations (1-3 parameters)
- Performance-critical paths (saves JSON.parse overhead)
- Read-only queries
- Boolean flags and simple strings

### Future Considerations

If we need to handle even larger data sets, consider:
1. **Streaming API**: Process data in chunks rather than all at once
2. **Batch endpoints**: Dedicated batch operations that minimize script generation
3. **Native module**: Write critical operations in Swift/Objective-C
4. **WebSocket bridge**: Maintain persistent connection to avoid script overhead

## Implementation Examples

### Ultra-Minimal Pattern (Recommended)
```typescript
// In TypeScript tool:
const script = buildScript(UPDATE_TASK_ULTRA_MINIMAL_SCRIPT, {
  taskId: JSON.stringify(taskId),
  updatesJson: JSON.stringify(updates)
});

// In script template:
const taskId = {{taskId}};
const updatesJson = {{updatesJson}};
const updates = JSON.parse(updatesJson);
```

### Direct Expansion (For Simple Cases)
```typescript
// In TypeScript tool:
const script = buildScript(COMPLETE_TASK_SCRIPT, {
  taskId: JSON.stringify(taskId),
  completionDate: completionDate ? JSON.stringify(completionDate) : 'null'
});

// In script template:
const taskId = {{taskId}};
const completionDate = {{completionDate}};
```

## Monitoring Script Size

To prevent regression, we should:
1. Add script size logging in development mode
2. Set warning threshold at 10KB
3. Set error threshold at 40KB
4. Include script size in error messages for debugging

```typescript
if (process.env.LOG_LEVEL === 'debug') {
  const sizeKB = script.length / 1024;
  if (sizeKB > 10) {
    logger.warn(`Large script generated: ${sizeKB.toFixed(1)}KB`);
  }
  if (sizeKB > 40) {
    logger.error(`Script dangerously large: ${sizeKB.toFixed(1)}KB - may fail`);
  }
}
```

## Conclusion

The ultra-minimal JSON pattern successfully solves our script size issues with minimal complexity and overhead. It should remain our primary approach unless requirements change significantly. The 90% size reduction achieved makes this solution robust for foreseeable future needs.