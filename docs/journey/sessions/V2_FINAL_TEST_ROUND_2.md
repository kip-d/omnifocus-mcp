# OmniFocus MCP v2.0.0 - Final Test Round 2

## Purpose
Verify that all critical fixes are working, especially:
1. Script size fix (no more "Unexpected end of script" errors)
2. Inbox move functionality 
3. Performance remains acceptable

## Test Sequence

### Part 1: Update Task Script Size Fix
Test that the script size reduction fixed the "Unexpected end of script" error.

```
1. Create a test task named "Script Size Test Round 2" with due date tomorrow at 2pm, flagged

2. List your first 3 projects to get valid project IDs

3. Update the task to move it to one of those projects (use the task ID from step 1 and a project ID from step 2)

4. Update the same task with a complex set of changes:
   - Change name to "Complex Update Test"
   - Add tags: ["test", "v2-final"]
   - Set due date to "2025-09-15 16:00"
   - Add note: "Testing complex updates with minimal script"
   - Set estimated minutes to 45

5. Report if any "Unexpected end of script" errors occurred
```

### Part 2: Inbox Move Functionality
Test all three ways to move a task back to inbox.

```
6. Create a task named "Inbox Move Test" in a specific project (use a project ID from step 2)

7. Move this task to inbox using empty string:
   Update task [TASK_ID] with projectId: ""

8. Create another task "Inbox Move Test 2" in a project

9. Move this task to inbox using null:
   Update task [TASK_ID] with projectId: null

10. Create a third task "Inbox Move Test 3" in a project

11. Move this task to inbox using string "null":
    Update task [TASK_ID] with projectId: "null"

12. List tasks in inbox to confirm all three tasks are there
```

### Part 3: Performance Check
Verify performance is still acceptable.

```
13. Run a search for tasks containing "test" and report the query time

14. Get today's agenda and report the query time

15. Get overdue tasks and report the query time

16. Get upcoming tasks for the next 7 days and report the query time
```

### Part 4: Edge Cases
Test some edge cases that might reveal issues.

```
17. Create a task with a very long name (100+ characters):
    "This is a very long task name that exceeds one hundred characters to test if the minimal script handles long strings properly without truncation or errors in the update process"

18. Update that task to add 5+ tags at once

19. Rapidly update the same task 3 times in succession:
    - First: Change name
    - Second: Add due date
    - Third: Move to different project

20. Create a task in a project, then update it to:
    - Move to inbox (projectId: null)
    - In the same update, add tags and a due date
    (This tests if inbox move works alongside other updates)
```

## Expected Results

### ✅ PASS Criteria:
- No "Unexpected end of script" errors at any point
- All three inbox move methods work (empty string, null, "null")
- Today's agenda returns in <2 seconds
- Other queries complete without timeout (even if slow)
- All edge cases complete successfully

### ❌ FAIL Criteria:
- Any "Unexpected end of script" error
- Inbox moves don't work with any of the three methods
- Any timeout errors
- Tasks lose data during updates
- Script syntax errors

## Quick Copy-Paste Test
For rapid testing, here's a condensed version:

```
1. Create task "Test v2.0.0-final" due tomorrow 2pm flagged
2. List first 3 projects
3. Update task to project [PROJECT_ID] with tags ["test","final"] and note "Complex update test"
4. Update task to inbox with projectId: ""
5. Check task is in inbox
6. Search for "test" - note the time
7. Get today's agenda - note the time
```

## Reporting Template

Please report results in this format:

```
SCRIPT SIZE FIX:
- Complex updates: [PASS/FAIL]
- Error messages: [None / List any errors]

INBOX MOVE:
- Empty string: [PASS/FAIL]
- Null value: [PASS/FAIL]
- "null" string: [PASS/FAIL]

PERFORMANCE:
- Search query: [X seconds]
- Today's agenda: [X seconds]
- Overdue: [X seconds]
- Upcoming: [X seconds]

EDGE CASES:
- Long task names: [PASS/FAIL]
- Multiple tags: [PASS/FAIL]
- Rapid updates: [PASS/FAIL]
- Complex inbox move: [PASS/FAIL]

OVERALL: [READY FOR RELEASE / NEEDS FIXES]
```

## Notes
- This test specifically targets the fixes made after the first round
- Focus on the "Unexpected end of script" error - it should be completely gone
- Inbox moves should work with all three methods now
- Performance may be slow for search (8-11s) but should not timeout