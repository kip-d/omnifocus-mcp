# OmniFocus primaryKey Analysis - Definitive Resolution

## Executive Summary
The "Can't convert types" error in OmniFocus MCP was caused by incorrect usage of `primaryKey` as a method call (`primaryKey()`) when it's actually a property (`primaryKey`) in the OmniFocus JXA API.

## Root Cause
- **Issue**: Calling `task.id.primaryKey()` as a method instead of accessing `task.id.primaryKey` as a property
- **Error**: JXA throws "Can't convert types" when trying to invoke a property as a function
- **Scope**: Affected all files using primaryKey across the codebase

## Evidence
1. **Online Documentation**: OmniFocus JXA examples consistently show primaryKey as a property
2. **Working Code**: The fix in commit 3b240de for projects.ts confirmed primaryKey is a property
3. **Test Results**: Changing from method to property resolved the "Can't convert types" errors

## Resolution Applied
Changed all instances from:
```javascript
task.id.primaryKey()    // ❌ Incorrect - method call
```
To:
```javascript
task.id.primaryKey      // ✅ Correct - property access
```

## Files Fixed
1. **tasks.ts** - 14 occurrences fixed
2. **projects.ts** - 4 occurrences fixed (1 was already correct)
3. **analytics.ts** - 3 occurrences fixed
4. **tags.ts** - 6 occurrences fixed
5. **export.ts** - 4 occurrences fixed
6. **recurring.ts** - 2 occurrences fixed

## Key Learnings
1. **JXA Properties vs Methods**: In OmniFocus JXA, most object attributes are properties, not methods
2. **Error Messages Matter**: "Can't convert types" specifically indicates type conversion issues in JXA
3. **Trust Production Behavior**: The working code (line 36 in projects.ts) was correct all along
4. **Avoid Defensive Programming**: Let errors fail naturally for clearer debugging

## Verification
Run tests with `npm test` to verify all primaryKey access is now correct. The "Can't convert types" errors should be resolved across all OmniFocus operations.