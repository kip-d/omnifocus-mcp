# OmniFocus MCP Server v1.7.5 Release Notes

## Fixed: Critical Script Execution Failures

### 1. Export Tasks Date Handling Bug

### Issue
- `export_tasks` was failing with "Script execution failed with code null"
- Root cause: Unsafe date handling when calling `toISOString()` on OmniFocus date objects
- OmniFocus can return "missing value" or other non-Date objects for date fields
- Calling `toISOString()` on these invalid dates caused script crashes

### Solution
- Updated `safeGetDate()` helper to validate dates before calling `toISOString()`
- Added check for "missing value" and proper Date object validation
- Fixed all date field handling in export-tasks.ts (dueDate, deferDate, completionDate, creationDate, modificationDate)

### Technical Details
The fix ensures that:
1. Date objects are validated using `isValidDate()` before conversion
2. Invalid dates (including "missing value") return null instead of crashing
3. All date fields now use `safeGetDate()` instead of unsafe `safeGet()` + `toISOString()`

### Impact
- Export functionality now works reliably even with tasks that have missing or invalid dates
- No more "Script execution failed with code null" errors
- Export performance remains unchanged

### 2. Get Task Count Performance Issue

### Issue
- `get_task_count` was timing out with "Script execution failed with code null"
- Root cause: Iterating through all tasks (2000+) took 70+ seconds, exceeding 60-second timeout
- No actual script errors, just performance bottleneck

### Solution
- Optimized to use pre-filtered collections when possible (using whose() queries)
- Added 5000 task iteration limit with extrapolation for larger sets
- Increased script timeout from 60 to 120 seconds for edge cases
- Added warnings when counts are estimated

### Impact
- Task counting now completes in ~18 seconds instead of 70+ seconds
- No more timeout errors for get_task_count
- Accurate counts for simple filters, estimated counts for complex filters on large datasets

### Testing
- Confirmed working with various export formats (CSV, JSON, Markdown)
- Tested with tasks containing missing dates
- Verified with user-reported parameters that previously failed

## Recommendations for Users
- When exporting large task lists, always specify a limit to prevent timeouts
- Example: `filter: { completed: false, limit: 1000 }`
- Default limit is 1000 tasks if not specified

---

This is a critical bug fix release. All users experiencing export failures should upgrade immediately.