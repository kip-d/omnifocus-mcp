# OmniFocus MCP - 4-Tool Unified API Testing

**Copy this entire message into Claude Desktop to run the test.**

---

## Hi Claude! Test the new 4-tool unified OmniFocus API

This is a natural language test of the experimental OmniFocus MCP API that consolidates 17 tools into 4. Work through each phase and report your findings.

### Phase 1: Verify Tool Setup

First, which OmniFocus tools can you see?

**Expected:** Exactly **4 tools**:
1. `omnifocus_read` - Query operations
2. `omnifocus_write` - Mutation operations
3. `omnifocus_analyze` - Analysis operations
4. `system` - Version/diagnostics

**🚨 STOP if you see old tools** like `tasks`, `manage_task`, `projects`, `tags` - that means wrong branch!

---

### Phase 2: Test Read Operations (Queries)

Use `omnifocus_read` for these 5 queries:

1. **Inbox tasks** - Query tasks not in any project, limit 5
2. **All projects** - List my active projects
3. **All tags** - List all tags
4. **Flagged tasks** - Find flagged tasks
5. **Complex filter** - Find tasks that are flagged AND due this week AND not completed

**What to verify:** You can construct all these queries using omnifocus_read with different filters

---

### Phase 3: Test Write Operations (Full CRUD Cycle)

Use `omnifocus_write` to test create, update, complete, delete:

1. **Create** a task named "Test Task - Unified API" with note, flagged=true, due tomorrow
2. **Update** that task: change note, set flagged=false, change due date to 3 days from now
3. **Complete** the task
4. **Delete** the completed task
5. **Batch create** a project named "Testing Project - Unified API" with 3 tasks in one operation

**What to verify:** Full CRUD cycle works using omnifocus_write

---

### Phase 4: Test Analyze Operations (Analytics & Insights)

Use `omnifocus_analyze` for these analyses:

1. **Productivity stats** for this week
2. **Task velocity** over last 30 days
3. **Pattern analysis** - analyze patterns: `review_gaps` and `wip_limits`
4. **Parse meeting notes** - extract action items from: "Meeting with Sarah tomorrow at 2pm to discuss Q1 goals. Need to call Bob by Friday about the budget. Follow up with the team next Monday. Send proposal to client by end of week."

**What to verify:** Analytics and AI-powered analysis work using omnifocus_analyze

---

### Phase 5: Test Combined Workflow

Chain all 4 tools together in a realistic workflow:

1. Use `omnifocus_read` to find all tasks due this week
2. Use `omnifocus_analyze` to get productivity stats for context
3. Use `omnifocus_write` to create a task "Review overdue items" based on the analysis
4. Use `omnifocus_read` to verify the new task exists
5. Use `system` to check version and diagnostics

**What to verify:** All 4 tools work together in a natural conversation flow

---

## Final Report

After completing all 5 phases, provide a summary:

### Test Results Summary

**Phase 1 (Tool Setup):** ✅ / ❌
- Tool count: ___
- Correct tools visible: YES / NO

**Phase 2 (Read):** ✅ / ❌
- Queries working: ___/5

**Phase 3 (Write):** ✅ / ❌
- CRUD operations: ___/5

**Phase 4 (Analyze):** ✅ / ❌
- Analytics working: ___/4

**Phase 5 (Workflow):** ✅ / ❌
- Combined workflow: YES / NO

### Overall Assessment

- [ ] **PASS** - All phases work, 4 tools can replace 17 tools
- [ ] **FAIL** - Issues found (list below)

### Issues / Bugs Found
(List any errors with details)

### Observations
- Did the 4 unified tools feel natural to use?
- Any operations harder with unified API vs old tools?
- Performance issues or timeouts?

---

**End of test. Thank you!**
