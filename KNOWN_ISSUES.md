# Known Issues

## OmniFocus Script Errors

### Flagged Task Counting Timeout

**Status:** Open - Needs Investigation

**Issue:** Count-only queries for flagged tasks intermittently timeout or fail with "Failed to count tasks" error.

**Affected Tests:**
- [`tests/integration/tools/unified/end-to-end.test.ts`](file:///Users/kip/src/omnifocus-mcp/tests/integration/tools/unified/end-to-end.test.ts#L239) - "should return count-only for flagged tasks"  
- [`tests/integration/tools/unified/end-to-end.test.ts`](file:///Users/kip/src/omnifocus-mcp/tests/integration/tools/unified/end-to-end.test.ts#L278) - "should create a new task"

**Root Cause:** OmniFocus JXA script performance issue when filtering large task collections by flagged status. The count-only optimization script uses `baseCollection.filter(matchesFilters)` which is slow for flagged filter.

**Error Message:**
```
Failed to count tasks
Script: get_task_count with flagged: true filter
```

**Workaround:** 
- Skip these tests temporarily
- OR increase timeout to 180s+
- OR use `{ filters: { flagged: true }, limit: 100 }` instead of `countOnly: true`

**Investigation Needed:**
1. Profile the JXA script to identify bottleneck
2. Consider using OmniFocus's native `whose()` clause for flagged filter instead of JS filter
3. Test with different OmniFocus database sizes

**To Fix:**
Update [`src/omnifocus/scripts/tasks/query-tasks.ts`](file:///Users/kip/src/omnifocus-mcp/src/omnifocus/scripts/tasks/query-tasks.ts) count-only logic for flagged filter optimization.

**Priority:** Medium - Tests still pass when skipped, but affects count-only optimization reliability.
