# OmniFocus MCP v2.2.0 - Test Suite Session 1 of 2

**Session 1: Core Functionality (Tests 1-15)**
**Session 2: Analytics & Advanced Features (Tests 16-31)** - Run separately after this session

**Copy and paste this entire message into Claude Desktop:**

---

# 🧪 Session 1: Core Functionality Testing

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

## Tests 1-15: Core Functionality

### Server Health (1 test)

**Test 1:** Check OmniFocus server version and health status

### Core Task Management (9 tests)

**Test 2:** Create a task called 'v2.2.0 Test Task' with tags test and urgent, due tomorrow

**Test 3:** Create a task called 'Quick test' in inbox with note 'This is a test note'

**Test 4:** Show me what I need to do today

**Test 5:** Show me everything that's overdue

**Test 6:** Show me what's coming up in the next week

**Test 7:** Show me all tasks I can work on right now

**Test 8:** Find all tasks with the word 'test' in them

**Test 9:** Update the 'v2.2.0 Test Task' with note 'Updated via v2.2.0 testing'

**Test 10:** Mark the 'v2.2.0 Test Task' as complete

### Project Management (3 tests)

**Test 11:** List my first 10 projects

**Test 12:** Create a new project called 'Test Project v2.2.0 Session 1'

**Test 13:** Show me statistics about all my projects

### Tag Management (2 tests)

**Test 14:** Show me all tags that have active tasks

**Test 15:** List all my tags

---

## After Completing Tests 1-15

**Report format:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 1 COMPLETE (15/31 tests)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary: X/15 passed, Y failed, Z warnings

Failures: [list any failed tests]
Warnings: [list any warnings]

NEXT: Run Session 2 (Tests 16-31)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Phase 2: Detailed Investigation (If Needed)

**If any tests failed in Session 1, expand details now:**

For each failure, provide:
- Full tool call JSON
- Response excerpt
- Root cause analysis
- File locations
- Recommendations

---

**After Session 1:** Start a new conversation and run `TESTING_PROMPTS_SESSION_2.md`
