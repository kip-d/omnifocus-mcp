# TODO for Next Session: Helper Function Optimization

## Problem Identified
The `getAllHelpers()` function injects **551 lines** of JavaScript helpers into EVERY script, regardless of what's actually needed. This is causing:
- Unnecessary script bloat
- Increased parsing time
- Wasted memory
- Potential timeout issues on slower systems

## Current State
`getAllHelpers()` includes:
- SAFE_UTILITIES (~100 lines)
- PROJECT_VALIDATION (~50 lines)
- TASK_SERIALIZATION (~100 lines)
- ERROR_HANDLING (~50 lines)
- REPEAT_HELPERS (~200+ lines)

Most scripts only need 1-2 of these sections.

## Proposed Solution

### 1. Create Focused Helper Functions
Instead of `getAllHelpers()`, create:
```javascript
getBasicHelpers()     // Just safeGet, safeGetDate, etc. (~50 lines)
getProjectHelpers()   // Project-specific helpers
getTaskHelpers()      // Task serialization/status helpers
getRecurrenceHelpers() // Only for recurring task scripts
getAnalyticsHelpers() // For analytics scripts
```

### 2. Update Each Script
Analyze what each script actually uses and import only those helpers:
```javascript
// productivity-stats-optimized.ts
${getBasicHelpers()}
${getProjectHelpers()}

// analyze-overdue-optimized.ts  
${getBasicHelpers()}
// No need for recurrence or serialization helpers!
```

### 3. Expected Impact
- **60-80% reduction** in script size for most operations
- Faster script execution
- Lower memory usage
- Better maintainability

## Examples of Waste

### ProductivityStatsToolV2
- Gets 551 lines of helpers
- Probably only needs ~100 lines (basic + project helpers)
- **450 lines of unnecessary code**

### OverdueAnalysisToolV2
- Gets 551 lines of helpers
- Probably only needs ~50 lines (basic helpers)
- **500 lines of unnecessary code**

## Implementation Priority
1. Create the focused helper functions
2. Audit each script for actual helper usage
3. Update scripts to use minimal helpers
4. Test performance improvements
5. Document the new helper system

## Note
This is especially important given our recent optimizations - we're making scripts faster but still sending way too much code. Combining API optimizations with helper optimization could yield dramatic improvements.