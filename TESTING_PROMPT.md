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

## Pre-Test Setup

### Version Check (Required)

**Before starting any tests, capture the version information:**

**You say:** "What version of the OmniFocus MCP server are you using?"

**Expected response:** Server version and build number (e.g., "OmniFocus MCP v3.0.0")

**📝 Record this information at the top of your test report.** This ensures we know exactly which build was tested and prevents confusion if development and testing are out of sync.

### Diagnostic Check (Conditional)

**If you encounter connection issues, unexpected failures, or things just seem broken:**

**You say:** "Check the MCP server diagnostics"

**Expected response:** Diagnostic report showing:
- OmniFocus application status (running/not running)
- Database connection (working/failed)
- Basic functionality check (operational/errors)

**⚠️ If diagnostics show failures:**
1. Stop testing immediately
2. Report the diagnostic output
3. Note any error messages or warnings
4. Don't continue with other tests until environment issues are resolved

**When diagnostics are NOT needed:**
- Everything is working normally
- Tests are passing as expected
- Just a few specific tests failing (not everything)

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

## Testing Scenarios

All tests below should be conducted using **natural language** - just say these things to Claude. The LLM assistant should figure out which tools to use automatically. You don't need to know any technical details about the API.

### Core Functionality Tests

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
- "Create a task called 'Test Error' due next Flurday" (typo in day name)
- "Show my productivity stats for last dinosaur" (nonsense time period)
- "Complete the task about calling the dentist" (when no such task exists)

**Expected:** Clear, helpful error messages that guide you to fix the issue (not crashes or confusing technical errors)

---

### Error Handling & Edge Cases

Try these natural scenarios to verify the system handles errors gracefully:

- **Date typos:** "Create a task called 'Meeting prep' due Thursdai at 3pm"
  - Should get a helpful message like "I didn't recognize 'Thursdai' as a day - did you mean Thursday?"

- **Nonsense dates:** "Add task 'Review notes' due next banana"
  - Should explain it doesn't understand "banana" as a date and suggest valid options

- **Missing task name:** "Create a task due tomorrow"
  - Should ask "What would you like to call this task?"

- **Nonexistent tasks:** "Mark the task about fixing the garage door as complete"
  - Should say "I couldn't find a task about fixing the garage door" (if no such task exists)

- **Unclear time periods:** "Show me my productivity for the blue period"
  - Should explain valid time periods (this week, last month, etc.)

- **Vague references:** "Update that one task I created yesterday"
  - Should ask for clarification about which specific task

**What to watch for:** Clear, conversational error messages that help you understand what went wrong and how to fix it - not crashes or technical jargon.

---

## Performance Verification

Test these to verify the system performs well:

### Caching
- **First query:** "Show me what I need to do today"
  - Note the response time (should be < 2 seconds)

- **Repeat query:** "Show me what I need to do today" (ask again immediately)
  - Should be noticeably faster (50-90% improvement)

- **Cache freshness:**
  1. "Show tasks for today"
  2. "Create task 'Cache Test' due today with tag @mcp-test-TIMESTAMP"
  3. "Show tasks for today" (new task should appear)

### Query Speed
- **Large queries:** "Show all tasks, limit to 200"
  - Should complete in < 5 seconds

- **Simple queries:** "What's in my inbox?"
  - Should complete in < 1 second

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
- [ ] Tags work during task creation (single step)
- [ ] All query types return appropriate results
- [ ] Tasks can be updated and completed easily
- [ ] Projects can be created and managed
- [ ] Analytics provide useful insights
- [ ] Performance is good (< 2 seconds for most queries)
- [ ] Caching provides noticeable speed improvements
- [ ] Error messages are helpful, not cryptic
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
