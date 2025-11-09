# OmniFocus MCP Testing Guide

**Version:** 3.0.0 (Unified API)
**Last Updated:** November 2025
**Purpose:** Comprehensive testing guide for the 4-tool unified OmniFocus MCP API

---

## Quick Start

### How to Use This Guide

This guide uses **natural language** throughout. Just say these things to Claude Desktop - you don't need to know any technical syntax! Claude will handle all the technical details automatically, including converting dates like "tomorrow" or "next Friday" into the proper format.

### Example Conversation

**You say:** "What do I need to do today?"
**Claude responds:** Shows your tasks for today with details

**You say:** "Create a task called 'Call dentist' due tomorrow at 2pm with a note saying 'annual checkup'"
**Claude responds:** Task created successfully, shows task details

**You say:** "Show me all my overdue tasks"
**Claude responds:** Lists overdue tasks with how many days overdue

**You say:** "Mark that dentist task as complete"
**Claude responds:** Task marked complete

That's it! No technical syntax needed.

---

## Test Identifier & Cleanup System

### Unique Test Identifier

**ALL test data created during this session MUST be tagged with a unique identifier:**

```
@mcp-test-YYYYMMDD-HHMM
```

Example: `@mcp-test-20251109-1430`

**Why:** This allows easy cleanup of ALL test data in one operation after testing.

### How to Use the Identifier

When creating test tasks or projects, add the unique tag:

```
"Create a task called 'Test Task 1' with tags @mcp-test-20251109-1430 and urgent"
"Create a project called 'Test Project' with tag @mcp-test-20251109-1430"
```

### Cleanup Protocol

**After testing is complete:**

1. **Find all test data:**
   ```
   "Show me all tasks with tag @mcp-test-20251109-1430"
   ```

2. **Delete test tasks:**
   ```
   "Delete all tasks with tag @mcp-test-20251109-1430"
   ```

3. **Delete test projects:**
   ```
   "Delete the project 'Test Project' (or use project ID)"
   ```

4. **Verify cleanup:**
   ```
   "Search for tasks with @mcp-test-20251109-1430"
   ```
   Should return no results.

---

## Expected Tools

Before starting tests, verify you have access to exactly **4 tools**:

1. **`omnifocus_read`** - Query operations (tasks, projects, tags, perspectives, folders)
2. **`omnifocus_write`** - Mutation operations (create, update, complete, delete)
3. **`omnifocus_analyze`** - Analysis operations (productivity stats, velocity, patterns, workflow)
4. **`system`** - Version information and diagnostics

If you see different tools (like `tasks`, `manage_task`, `projects`, etc.), you're using an older API version.

---

## Testing Scenarios

### Phase 1: Natural Language Tests (User-Friendly)

These tests verify natural conversation works smoothly:

#### **Scenario 1: Getting Started**
- "What tasks do I have for today?"
- "Show me what's overdue"
- "How many projects do I have active right now?"

**Expected:** Clear, helpful responses with task/project details

#### **Scenario 2: Creating Tasks**
- "Create a task called 'Buy groceries' with tags @mcp-test-TIMESTAMP and shopping, due tomorrow"
- "Add a task 'Call mom' in my inbox with note 'discuss holiday plans'"
- "Create 'Finish report' due Friday at 5pm with tag @mcp-test-TIMESTAMP"

**Expected:** Tasks created successfully with all attributes

#### **Scenario 3: Finding Tasks**
- "What can I work on right now?" (available tasks)
- "Show me everything tagged 'urgent'"
- "Find all tasks with 'meeting' in the name"
- "What's coming up in the next week?"

**Expected:** Accurate filtered results

#### **Scenario 4: Updating Tasks**
- "Update 'Buy groceries' with note 'at Whole Foods'"
- "Move 'Finish report' to tomorrow"
- "Add tag 'priority' to the grocery task"

**Expected:** Tasks updated correctly

#### **Scenario 5: Completing Tasks**
- "Mark 'Buy groceries' as complete"
- "Complete all tasks tagged @mcp-test-TIMESTAMP"

**Expected:** Tasks marked complete, removed from active lists

#### **Scenario 6: Project Management**
- "List my first 10 projects"
- "Create project 'Home Renovation' with tag @mcp-test-TIMESTAMP"
- "Show me stats about all my projects"

**Expected:** Projects managed successfully

#### **Scenario 7: Analytics**
- "Show my productivity stats for this week"
- "What's my task completion velocity?"
- "Analyze my overdue tasks and find patterns"

**Expected:** Useful insights and statistics

#### **Scenario 8: Error Handling**
- "Create a task with due date 'notadate'"
- "Show productivity for period 'invalid'"

**Expected:** Clear, helpful error messages (not crashes)

---

### Phase 2: Technical Validation (4-Tool API)

These tests verify the unified API works correctly:

#### **Tool 1: omnifocus_read**

**Test 1.1: Query Today's Tasks**
```
Ask: "Show me tasks for today, limit to 5"
Expected Tool: omnifocus_read
Expected Response: Up to 5 tasks due today or flagged
```

**Test 1.2: Query Overdue Tasks**
```
Ask: "What's overdue?"
Expected Tool: omnifocus_read
Expected Response: Tasks past due date with days overdue count
```

**Test 1.3: Query Available Tasks**
```
Ask: "What can I work on right now?"
Expected Tool: omnifocus_read
Expected Response: Only tasks that are available (not blocked, not deferred)
```

**Test 1.4: Search Tasks**
```
Ask: "Find tasks with 'test' in them"
Expected Tool: omnifocus_read
Expected Response: Tasks matching search term
```

**Test 1.5: Query Projects**
```
Ask: "List my first 10 projects"
Expected Tool: omnifocus_read
Expected Response: 10 projects with basic info
```

**Test 1.6: Query Tags**
```
Ask: "Show me all tags that have active tasks"
Expected Tool: omnifocus_read
Expected Response: Tags currently in use, fast response (< 200ms)
```

**Test 1.7: Query Perspectives**
```
Ask: "Show me all available perspectives"
Expected Tool: omnifocus_read
Expected Response: Built-in and custom perspectives
```

**Test 1.8: Query Inbox**
```
Ask: "What's in my inbox?"
Expected Tool: omnifocus_read
Expected Response: Tasks without project assignment
```

#### **Tool 2: omnifocus_write**

**Test 2.1: Create Task with Tags**
```
Ask: "Create task 'Test Write API' with tags @mcp-test-TIMESTAMP and urgent, due tomorrow"
Expected Tool: omnifocus_write
Expected Response: Task created with tags assigned (single operation!)
Verify: Tags should be set immediately, not require second operation
```

**Test 2.2: Create Task in Inbox**
```
Ask: "Create task 'Inbox Test' in inbox with note 'testing inbox creation'"
Expected Tool: omnifocus_write
Expected Response: Task created in inbox with note
```

**Test 2.3: Update Task**
```
Ask: "Update task 'Test Write API' with note 'updated via unified API'"
Expected Tool: omnifocus_write
Expected Response: Task updated successfully
```

**Test 2.4: Complete Task**
```
Ask: "Mark 'Test Write API' as complete"
Expected Tool: omnifocus_write
Expected Response: Task marked complete with completion timestamp
```

**Test 2.5: Delete Task**
```
Ask: "Delete task 'Inbox Test'"
Expected Tool: omnifocus_write
Expected Response: Task deleted successfully
```

**Test 2.6: Create Project**
```
Ask: "Create project 'Test Project Write' with tag @mcp-test-TIMESTAMP"
Expected Tool: omnifocus_write
Expected Response: Project created with ID
```

**Test 2.7: Bulk Complete**
```
Ask: "Complete all tasks tagged @mcp-test-TIMESTAMP"
Expected Tool: omnifocus_write
Expected Response: Multiple tasks completed in single operation
```

#### **Tool 3: omnifocus_analyze**

**Test 3.1: Productivity Stats**
```
Ask: "Show my productivity stats for this week, including project breakdowns"
Expected Tool: omnifocus_analyze
Expected Response: Completion counts, rates, per-project statistics
```

**Test 3.2: Task Velocity**
```
Ask: "Analyze my task completion velocity over the last 7 days"
Expected Tool: omnifocus_analyze
Expected Response: Velocity trends by day, increasing/decreasing indicators
```

**Test 3.3: Overdue Analysis**
```
Ask: "What's blocking me? Show overdue tasks grouped by project"
Expected Tool: omnifocus_analyze
Expected Response: Overdue items organized by project, bottleneck identification
```

**Test 3.4: Pattern Detection - Duplicates**
```
Ask: "Check my task list for duplicate tasks"
Expected Tool: omnifocus_analyze
Expected Response: Tasks with similar names identified
```

**Test 3.5: Pattern Detection - Dormant Projects**
```
Ask: "Find projects that haven't had activity in the last 30 days"
Expected Tool: omnifocus_analyze
Expected Response: Dormant projects list
```

**Test 3.6: Workflow Analysis**
```
Ask: "Analyze my workflow health and system efficiency"
Expected Tool: omnifocus_analyze
Expected Response: Workflow patterns, momentum indicators, bottlenecks
```

**Test 3.7: Recurring Task Analysis**
```
Ask: "Analyze my recurring tasks and show which ones are active"
Expected Tool: omnifocus_analyze
Expected Response: Recurring task patterns with repeat rules
```

#### **Tool 4: system**

**Test 4.1: Version Check**
```
Ask: "Check OmniFocus MCP server version"
Expected Tool: system
Expected Response: Version 3.0.0 or higher
```

**Test 4.2: Health Diagnostics**
```
Ask: "Run diagnostics on the OmniFocus server"
Expected Tool: system
Expected Response: Health status, no errors
```

---

### Phase 3: Error Handling & Edge Cases

**Test 5.1: Invalid Date Format**
```
Ask: "Create task 'Bad Date' due 'notadate'"
Expected: Clear error message explaining date format requirements
Should NOT: Crash or create task with invalid date
```

**Test 5.2: Invalid Operation**
```
Ask: "Perform invalid operation on task"
Expected: Clear error message, operation not recognized
Should NOT: Silent failure or confusing error
```

**Test 5.3: Missing Required Field**
```
Ask: "Create a task" (no name provided)
Expected: Error requesting task name
Should NOT: Create task with empty/null name
```

**Test 5.4: Invalid Time Period**
```
Ask: "Show productivity stats for invalid period"
Expected: User-friendly error with valid period suggestions
Should NOT: Return empty/zero stats
```

**Test 5.5: Nonexistent Task**
```
Ask: "Update task with ID 'nonexistent-id'"
Expected: Clear error that task not found
Should NOT: Silent failure
```

---

## Performance Tests

### Caching Verification

**Test 6.1: First Query (Cold)**
```
Ask: "Show me what I need to do today"
Note: Response time (should be < 2 seconds for typical database)
```

**Test 6.2: Repeat Query (Cached)**
```
Ask: "Show me what I need to do today" (immediate repeat)
Expected: Faster response, metadata indicates cache hit
Should be: 50-90% faster than cold query
```

**Test 6.3: Cache Invalidation**
```
1. Ask: "Show tasks for today" (cached)
2. Ask: "Create task 'Cache Test' due today with tag @mcp-test-TIMESTAMP"
3. Ask: "Show tasks for today" (should be fresh, not cached)
Expected: New task appears in results
```

### Query Optimization

**Test 6.4: Minimal vs Full Details**
```
Ask 1: "Show today's tasks with minimal details" (no notes, no subtasks)
Ask 2: "Show today's tasks with full details" (all fields)
Expected: Minimal query faster than full details
```

**Test 6.5: Large Result Sets**
```
Ask: "Show all tasks, limit to 200"
Expected: Response in < 5 seconds
If slower: May indicate performance issue
```

---

## Known Issues & Workarounds

### Issue 1: Tag Assignment Timing
**Symptom:** Tags assigned during task creation may not appear immediately in UI
**Workaround:** Refresh OmniFocus or wait 1-2 seconds
**Status:** Known OmniFocus API limitation

### Issue 2: Bulk Operations and Perspectives
**Symptom:** Perspective queries may not reflect just-completed bulk changes
**Workaround:** Wait 1-2 seconds after bulk operation before querying perspectives
**Status:** Cache invalidation timing

### Issue 3: Export Parameter Validation
**Symptom:** Export tool may be strict about parameter combinations
**Workaround:** Use exact parameter names from documentation
**Status:** Expected behavior (strict validation)

### Issue 4: Review Projects List
**Symptom:** manage_reviews may return projects without review dates
**Workaround:** Filter results, only act on projects with valid review dates
**Status:** OmniFocus allows projects without review schedules

### Issue 5: Date Format Confusion
**Symptom:** Natural dates like "tomorrow" work in conversation but not in direct tool calls
**Workaround:** Claude converts natural dates - you don't need to!
**Status:** Working as designed (Claude handles conversion)

---

## Success Checklist

After completing all tests, verify:

- [ ] Can create tasks naturally without knowing technical syntax
- [ ] Tags work during task creation (single step - this is huge!)
- [ ] All query types return appropriate results
- [ ] Tasks can be updated and completed easily
- [ ] Projects can be created and managed
- [ ] Analytics provide useful insights
- [ ] Pattern analysis helps identify issues
- [ ] Performance is good (< 2 seconds for most queries)
- [ ] Caching provides noticeable speed improvements
- [ ] Error messages are helpful, not cryptic
- [ ] All 4 unified tools work correctly
- [ ] Test cleanup completed successfully

---

## What Success Looks Like

You should be able to:

- **Talk naturally** - No need to know tool names or parameters
- **Get helpful responses** - Claude provides context and explanations
- **Work efficiently** - Fast responses, good caching
- **Understand errors** - When something goes wrong, you know why
- **Trust the system** - Tasks are created/updated reliably
- **Clean up easily** - All test data removed with single tag query

---

## After Testing

### Cleanup Steps

1. **Find all test data:**
   ```
   "Show me all tasks with tag @mcp-test-TIMESTAMP"
   ```

2. **Bulk delete test tasks:**
   ```
   "Delete all tasks with tag @mcp-test-TIMESTAMP"
   ```

3. **Delete test projects:**
   ```
   "Delete project 'Test Project Write'" (use specific names or IDs)
   ```

4. **Verify cleanup:**
   ```
   "Search for @mcp-test-TIMESTAMP"
   ```
   Should return: No results

### Report Results

Please provide:

1. **Summary stats** - How many tests passed/failed
2. **Any failures** - Exact error messages and reproduction steps
3. **Performance notes** - Any queries that felt slow
4. **UX observations** - Anything confusing or surprising
5. **Overall experience** - Natural language feel, ease of use

---

## If You Encounter Issues

Please report:

1. **What you asked** - Exact phrasing
2. **What happened** - Error message or unexpected behavior
3. **Your database size** - Approximate number of tasks/projects
4. **Which test** - Phase and test number from above
5. **Expected vs Actual** - What you expected vs what you got

---

## Why This Version is Better

**v3.0.0 Unified API:**
- **4 tools instead of 17** - Simpler, more intuitive
- **Consistent patterns** - All queries use same structure
- **Better error messages** - Clear, actionable feedback
- **Performance optimized** - Smart caching, efficient queries
- **Natural language first** - Designed for conversation
- **Comprehensive cleanup** - Tag-based test data management

**Previous versions:**
- v2.x: 17 separate tools (manage_task, tasks, projects, etc.)
- v1.x: Tag creation broken, required two-step process
- v0.x: Basic functionality only

---

## Token Budget Estimate

- **Phase 1 (Natural Language):** ~10-15k tokens
- **Phase 2 (Technical):** ~15-20k tokens
- **Phase 3 (Error Handling):** ~5-10k tokens
- **Performance Tests:** ~5k tokens
- **Total:** 35-50k tokens (comfortable within limits)

---

**Ready to begin? Start with Phase 1, Scenario 1!**
