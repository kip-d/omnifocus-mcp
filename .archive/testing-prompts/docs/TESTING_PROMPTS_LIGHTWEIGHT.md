# OmniFocus MCP v2.2.0 - Lightweight Test Suite

**Purpose:** Test all 31 tools with concise output, auto-detailed investigation for failures.

**Copy and paste this entire message into Claude Desktop:**

---

# 🧪 OmniFocus MCP Test Session - Lightweight Mode

**CRITICAL OUTPUT INSTRUCTIONS:**

1. **Output ONLY the test result line for each test**
2. **NO commentary between tests** (no "validating...", "progressing...", "preparing...")
3. **NO status updates** (no "Now moving to...", "Test passed...")
4. **NO thinking out loud** (no explanations unless test fails)
5. **Just execute → report → next test**

**Format - EXACTLY THIS:**
```
✅ Test N: tool_name(params) - brief_result
❌ Test N: tool_name - FAIL: one_line_error
⚠️ Test N: tool_name - WARNING: issue
```

**Example correct output:**
```
✅ Test 1: system(version) - v2.2.0, healthy
✅ Test 2: manage_task(create) - Created with tags
✅ Test 3: manage_task(create) - Created in inbox
❌ Test 4: tasks(available) - FAIL: returned unavailable tasks
✅ Test 5: tasks(overdue) - 25 tasks
```

**Rules:**
- ONE line per test
- Brief results only (counts, confirmations)
- Only expand details for failures/warnings
- Report timing only if > 10 seconds
- **No conversation, just results**

**After Phase 1 Completion:**
IF any tests failed → Automatically proceed to Phase 2 detailed investigation
IF all passed → Done!

---

## Phase 1: Quick Pass - All 31 Tests

### Server Health (1 test)

1. Check OmniFocus server version and health status
   - Expected: v2.2.0, no errors

### Core Task Management (9 tests)

2. Create a task called 'v2.2.0 Test Task' with tags test and urgent, due tomorrow
   - Expected: Task created with tags in single step

3. Create a task called 'Quick test' in inbox with note 'This is a test note'
   - Expected: Task in inbox with note

4. Show me what I need to do today
   - Expected: Today's tasks list

5. Show me everything that's overdue
   - Expected: Overdue tasks with days count

6. Show me what's coming up in the next week
   - Expected: Upcoming tasks for 7 days

7. Show me all tasks I can work on right now
   - Expected: Available (not blocked) tasks only

8. Find all tasks with the word 'test' in them
   - Expected: Search results

9. Update the 'v2.2.0 Test Task' with note 'Updated via v2.2.0 testing'
   - Expected: Task updated

10. Mark the 'v2.2.0 Test Task' as complete
    - Expected: Task marked complete

### Project Management (3 tests)

11. List my first 10 projects
    - Expected: 10 projects with basic info

12. Create a new project called 'Test Project v2.2.0'
    - Expected: Project created with ID

13. Show me statistics about all my projects
    - Expected: Project stats (counts, rates, etc.)

### Tag Management (2 tests)

14. Show me all tags that have active tasks
    - Expected: Active tags list, fast response

15. List all my tags
    - Expected: All tags, compare timing to test 14

### Analytics & Insights (3 tests)

16. Show me my productivity stats for this week, including project breakdowns
    - Expected: Completion stats with project breakdown

17. Analyze my task completion velocity over the last 7 days
    - Expected: Velocity trends by day

18. What's blocking me? Show me my overdue tasks grouped by project
    - Expected: Overdue tasks by project

### Pattern Analysis (2 tests)

19. Check my task list for duplicate tasks
    - Expected: Duplicate detection results

20. Find projects that haven't had activity in the last 30 days
    - Expected: Dormant projects list

### GTD Workflow (3 tests)

21. Which projects need to be reviewed in the next 30 days?
    - Expected: Projects due for review

22. Show me all available perspectives
    - Expected: Built-in and custom perspectives

23. Show me my Inbox perspective with up to 10 tasks
    - Expected: Inbox items via perspective

### Export & Recurring (2 tests)

24. Export my incomplete tasks to JSON format, limited to 20 tasks
    - Expected: JSON export of 20 tasks

25. Analyze my recurring tasks and show which ones are active
    - Expected: Recurring task patterns

### Performance & Caching (3 tests)

26. Show me what I need to do today (first call)
    - Expected: Results, note response time

27. Show me what I need to do today (immediate repeat)
    - Expected: Faster (cached), indicates cache hit

28. Show me today's tasks with minimal details
    - Expected: Faster than full details

### Error Handling (2 tests)

29. Create a task with an invalid operation
    - Expected: Clear error message, no crash

30. Show me productivity stats for an invalid time period
    - Expected: User-friendly error with suggestions

### MCP Prompts (1 test)

31. In Claude Desktop, click + button and check OmniFocus prompts exist:
    - gtd_principles, gtd_process_inbox, eisenhower_matrix_inbox, gtd_weekly_review, quick_reference
    - Expected: All 5 prompts load correctly

---

## Phase 2: Detailed Investigation (Auto-Triggered)

**This phase runs ONLY if Phase 1 found failures or warnings.**

For each failed/warning test, provide:

### Investigation Template

```
🔍 Test N: [test_name] - DETAILED ANALYSIS

Request: "[exact question asked]"

Tool Call:
{
  "name": "tool_name",
  "arguments": {
    // full JSON
  }
}

Response:
{
  // relevant excerpt or first few results
}

Issue Analysis:
- What went wrong
- Expected vs actual behavior
- Likely root cause

File Locations:
- Relevant source files

Recommendations:
- Specific fix suggestions
- Related issues to check
```

---

## Success Criteria

**Phase 1 Complete:**
- All 31 tests executed
- Pass/fail/warning for each
- Total time and summary stats

**Phase 2 (if triggered):**
- Detailed analysis for each failure
- Clear root causes identified
- Actionable fix recommendations

**Example Output:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Testing 31 Tools
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Server Health:
✅ 1. system(version) - v2.2.0, diagnostics pass

Core Task Management:
✅ 2. manage_task(create) - Created with tags
✅ 3. manage_task(create) - Created in inbox
✅ 4. tasks(today) - 18 tasks
✅ 5. tasks(overdue) - 25 tasks (3-7 days overdue)
✅ 6. tasks(upcoming) - 42 tasks next 7 days
❌ 7. tasks(available) - FAIL: returned 3 tasks with available: false
✅ 8. tasks(search) - 12 results for 'test'
✅ 9. manage_task(update) - Updated note
✅ 10. manage_task(complete) - Marked complete

[... continues for all 31 tests ...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary: 29/31 passed, 2 failed, 0 warnings
Time: ~3-5 minutes
Failures: Test 7 (available mode), Test 13 (stats)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 2: Detailed Investigation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Detailed analysis for Test 7...]
[Detailed analysis for Test 13...]
```

---

## Token Budget Estimate

- **Phase 1:** ~15-20k tokens (all 31 tests concise)
- **Phase 2:** ~500-1k tokens per failure (2-3 typical)
- **Total:** 35-60k tokens (comfortable within limits)

---

## After Testing

Report results with:
1. Summary stats (pass/fail counts)
2. Any failures with Phase 2 analysis
3. Overall observations
4. Any UX issues or confusing prompts

---

**Ready to begin? Start with Test 1!**
