# OmniFocus MCP v2.2.0 - Test Suite Session 2 of 2

**Session 1: Core Functionality (Tests 1-15)** - Should be completed already
**Session 2: Analytics & Advanced Features (Tests 16-31)** - This session

**Copy and paste this entire message into Claude Desktop (in a NEW conversation):**

---

# 🧪 Session 2: Analytics & Advanced Features

**CRITICAL OUTPUT INSTRUCTIONS:**

1. **Output ONLY the test result line for each test**
2. **NO commentary between tests**
3. **NO status updates**
4. **NO thinking out loud**
5. **Just execute → report → next test**

**Format:**
```
✅ Test N: tool_name(params) - brief_result
❌ Test N: tool_name - FAIL: one_line_error
⚠️ Test N: tool_name - WARNING: issue
```

---

## Tests 16-31: Analytics & Advanced Features

### Analytics & Insights (3 tests)

**Test 16:** Show me my productivity stats for this week, including project breakdowns

**Test 17:** Analyze my task completion velocity over the last 7 days

**Test 18:** What's blocking me? Show me my overdue tasks grouped by project

### Pattern Analysis (2 tests)

**Test 19:** Check my task list for duplicate tasks

**Test 20:** Find projects that haven't had activity in the last 30 days

### GTD Workflow (3 tests)

**Test 21:** Which projects need to be reviewed in the next 30 days?

**Test 22:** Show me all available perspectives

**Test 23:** Show me my Inbox perspective with up to 10 tasks

### Export & Recurring (2 tests)

**Test 24:** Export my incomplete tasks to JSON format, limited to 20 tasks

**Test 25:** Analyze my recurring tasks and show which ones are active

### Performance & Caching (3 tests)

**Test 26:** Show me what I need to do today (first call)

**Test 27:** Show me what I need to do today (immediate repeat - should be faster/cached)

**Test 28:** Show me today's tasks with minimal details

### Error Handling (2 tests)

**Test 29:** Create a task with an invalid operation

**Test 30:** Show me productivity stats for an invalid time period

### MCP Prompts (1 test)

**Test 31:** In Claude Desktop, click + button and verify OmniFocus prompts exist:
- gtd_principles
- gtd_process_inbox
- eisenhower_matrix_inbox
- gtd_weekly_review
- quick_reference

---

## After Completing Tests 16-31

**Report format:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 2 COMPLETE (16/16 tests, 31/31 total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary: X/16 passed, Y failed, Z warnings

Failures: [list any failed tests]
Warnings: [list any warnings]

OVERALL (Sessions 1+2): XX/31 tests passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 2: Detailed Investigation (If Needed)

**If any tests failed in Session 2, expand details now:**

For each failure, provide:
- Full tool call JSON
- Response excerpt
- Root cause analysis
- File locations
- Recommendations

---

## Combined Results

After completing both sessions, combine the results:

**Session 1:** X/15 passed
**Session 2:** Y/16 passed
**Total:** (X+Y)/31 tests passed

Report any failures from both sessions for investigation.
