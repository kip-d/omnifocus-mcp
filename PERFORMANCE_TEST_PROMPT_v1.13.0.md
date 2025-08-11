# OmniFocus MCP v1.13.0 Performance Testing Guide

## 🚀 Major Performance Release Testing

Please test the new v1.13.0 release which includes revolutionary performance improvements through our hybrid architecture. This testing focuses on validating the massive speed improvements while ensuring full backward compatibility.

## Setup Instructions

1. **Update to v1.13.0**:
   ```bash
   cd ~/src/omnifocus-mcp
   git pull
   npm install
   npm run build
   ```

2. **Restart Claude Desktop** to load the new version

3. **Verify version**: Ask Claude to list available MCP tools and confirm version 1.13.0

## 🎯 Performance Tests - Priority 1

### Test 1: List Tasks Performance
Compare the speed of listing tasks with the previous version:

```
# Test 1A: Basic list (should be <1 second)
Use list_tasks with completed=false, limit=50

# Test 1B: Complex filter (should be <1.5 seconds)
Use list_tasks with completed=false, flagged=true, tags=["work"], limit=100

# Test 1C: Search query (should be <2 seconds)
Use list_tasks with search="review", limit=50

# Test 1D: Skip analysis mode (should be <0.8 seconds)
Use list_tasks with completed=false, limit=100, skipAnalysis=true
```

**Expected**: All queries should complete in 1-2 seconds max (previously 3-5 seconds)

### Test 2: Today's Agenda Performance
Test the daily view performance:

```
# Test 2A: Standard agenda (should be <1 second)
Use todays_agenda with default settings

# Test 2B: Detailed agenda (should be <1.5 seconds)
Use todays_agenda with includeDetails=true, limit=100

# Test 2C: Available only (should be <1 second)
Use todays_agenda with includeAvailable=true, includeFlagged=false
```

**Expected**: Instant response, no timeouts even with large task counts

### Test 3: Upcoming Tasks Query
This had the biggest improvement (96% faster):

```
# Test 3A: Next 7 days (should be <1 second)
Use query_tasks with queryType="upcoming", daysAhead=7, limit=50

# Test 3B: Next 30 days (should be <1 second)
Use query_tasks with queryType="upcoming", daysAhead=30, limit=200

# Test 3C: Overdue tasks (should be <1 second)
Use query_tasks with queryType="overdue", limit=100
```

**Expected**: Sub-second response (previously 20+ seconds!)

### Test 4: Export Performance
Test large export operations:

```
# Test 4A: JSON export (should be <2 seconds)
Use export_tasks with format="json", filter={completed: false}, limit=500

# Test 4B: CSV export (should be <2 seconds)
Use export_tasks with format="csv", filter={completed: false}, limit=500

# Test 4C: Markdown export (should be <2 seconds)
Use export_tasks with format="markdown", filter={flagged: true}, limit=200
```

**Expected**: Fast exports without timeouts

## 🔍 Compatibility Tests - Priority 2

### Test 5: Backward Compatibility
Ensure all existing functionality still works:

```
# Test 5A: Create and update task
1. Create a task with name="Performance test task", flagged=true
2. Update the task with dueDate="tomorrow at 3pm"
3. Complete the task
4. Delete the task

# Test 5B: Project operations
1. List all projects
2. Create a project named "Test Project v1.13"
3. Create a task in that project
4. Delete the project

# Test 5C: Tag operations
1. List all tags
2. Create a task and then update it with tags=["test", "v1.13"]
```

**Expected**: All operations work exactly as before, just faster

### Test 6: Cache Behavior
Verify caching still works correctly:

```
# Test 6A: Cache hit performance
1. Run list_tasks with completed=false, limit=50
2. Immediately run the same query again
3. Note "from_cache: true" in metadata

# Test 6B: Cache invalidation
1. Create a new task
2. Run list_tasks - should see the new task
3. Verify cache was invalidated properly
```

**Expected**: Second query should be instant with cache hit

## 📊 Performance Metrics Reporting

Please report for each test:
1. **Response time** (from the metadata.query_time_ms field)
2. **Total perceived time** (how long it felt)
3. **Any errors or warnings**
4. **Comparison to previous experience** (if you tested earlier versions)

## 🐛 Regression Testing

### Test 7: Edge Cases
```
# Test 7A: Empty results
Use list_tasks with tags=["nonexistent-tag-xyz"]

# Test 7B: Large limit
Use list_tasks with limit=1000

# Test 7C: Complex date filters
Use list_tasks with dueBefore="next friday", dueAfter="tomorrow"
```

### Test 8: Analytics Tools
These haven't been migrated yet but should still work:

```
# Test 8A: Productivity stats
Use get_productivity_stats with period="week"

# Test 8B: Task velocity
Use get_task_velocity with period="month"
```

**Expected**: These should work but may be slower than the migrated tools

## 📝 Reporting Format

Please provide feedback in this format:

```markdown
## v1.13.0 Performance Test Results

### Environment
- OmniFocus database size: ~X tasks, Y projects
- macOS version: X.X
- Testing date: YYYY-MM-DD

### Performance Improvements
- list_tasks: Xms average (Y% improvement)
- todays_agenda: Xms average (Y% improvement)  
- upcoming_tasks: Xms average (Y% improvement)
- export_tasks: Xms average (Y% improvement)

### Issues Found
- [List any issues]

### Overall Assessment
- [Your summary of the performance improvements]
```

## 🎉 Expected Outcomes

With v1.13.0, you should experience:
- **60-96% faster** query responses
- **Zero timeout errors** even with large databases
- **Sub-second response** for most operations
- **Full backward compatibility** - everything still works
- **Responsive UI** - no more waiting for results

## 🆘 Troubleshooting

If you encounter issues:
1. Ensure you've run `npm run build` after pulling
2. Restart Claude Desktop completely
3. Check that OmniFocus is running and not showing any dialogs
4. Report any errors with full error messages

## Thank You!

Your testing helps ensure this major performance upgrade works flawlessly for all users. The hybrid architecture in v1.13.0 represents a revolutionary improvement that makes the OmniFocus MCP server truly production-ready.

Please test thoroughly and report your results. This is a game-changing release! 🚀