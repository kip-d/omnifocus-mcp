# OmniFocus MCP v2.0.0 - Comprehensive Final Test Suite

## Test Environment Setup
Please confirm:
- OmniFocus is running and has tasks/projects
- Claude Desktop has the OmniFocus MCP server installed
- You're ready to run a comprehensive test suite

## Part 1: Core CRUD Operations

### 1.1 Task Creation
```
1. Create a simple task: "Test Task 1 - Simple" 

2. Create a task with all fields:
   - Name: "Test Task 2 - Complete"
   - Due date: tomorrow at 4pm
   - Defer date: today at 2pm  
   - Flagged: true
   - Note: "This is a comprehensive test task"
   - Estimated minutes: 30

3. Create a task with repeat rule:
   - Name: "Daily Standup"
   - Due date: tomorrow at 9am
   - Repeat: Every weekday (Monday-Friday)

4. Report: Did all three tasks create successfully? Any errors?
```

### 1.2 Task Updates
```
5. Update the first task:
   - Change name to "Updated Task 1"
   - Add tags: ["test", "v2"]
   - Add due date: next Monday at 5pm

6. Move the second task to a project (list projects first to get an ID)

7. Move the second task back to inbox using projectId: ""

8. Update the third task's repeat rule to weekly on Mondays only

9. Report: Did all updates work? Any "Unexpected end of script" errors?
```

### 1.3 Task Completion and Deletion
```
10. Complete the first task

11. Delete the second task

12. Report: Did completion and deletion work correctly?
```

## Part 2: Query Performance Testing

### 2.1 Mode-Based Queries
Please run each query and note the response time:

```
13. Get today's agenda (mode: "today")
    Time: ___ seconds

14. Get overdue tasks (mode: "overdue")
    Time: ___ seconds

15. Search for tasks containing "test" (mode: "search", search: "test")
    Time: ___ seconds

16. Get upcoming tasks for next 7 days (mode: "upcoming", daysAhead: 7)
    Time: ___ seconds

17. Get available tasks (mode: "available")
    Time: ___ seconds

18. Get flagged tasks (mode: "flagged")
    Time: ___ seconds

Report: Were all queries under 5 seconds? Any timeouts?
```

## Part 3: Project Management

### 3.1 Project Operations
```
19. List all projects (operation: "list")
    - Note: Do you get a summary with counts?

20. Show only active projects (operation: "active")

21. Find projects needing review (operation: "review")

22. Create a new project:
    - Name: "Test Project v2.0.0"
    - Note: "Testing project creation"
    - Due date: end of next month

23. Update the project:
    - Change name to "Updated Test Project"
    - Mark as flagged

24. Complete the project

Report: Did all project operations work correctly?
```

## Part 4: Advanced Features

### 4.1 Batch Operations
```
25. Create 3 tasks quickly:
    - "Batch Task 1"
    - "Batch Task 2"  
    - "Batch Task 3"

26. Batch complete all three tasks (if batch operations are available)
    OR complete them one by one

27. Report: How did batch operations perform?
```

### 4.2 Analytics and Insights
```
28. Get productivity stats for this week

29. Analyze overdue tasks for patterns

30. Get task velocity metrics

Report: Do analytics provide useful insights? Any errors?
```

### 4.3 Export Functionality
```
31. Export your flagged tasks to JSON format

32. Export today's tasks to CSV format

Report: Did exports work correctly? Valid file formats?
```

## Part 5: Edge Cases and Error Handling

### 5.1 Error Recovery
```
33. Try to update a non-existent task ID "fake123"
    - Do you get a helpful error message?

34. Try to create a task with an invalid date "not-a-date"
    - Does it handle gracefully?

35. Try to move a task to a non-existent project "fakeproject"
    - Clear error with suggestions?
```

### 5.2 Complex Scenarios
```
36. Create a task in a project, add tags, set dates, then move to inbox in ONE update

37. Update a task 5 times rapidly in succession

38. Create a task with a 200-character name

39. Add 10 tags to a single task

Report: Any failures or unexpected behavior?
```

## Part 6: Security Testing

### 6.1 Injection Prevention
```
40. Try creating a task with name: "Test'; DROP TABLE tasks; --"

41. Try updating with a note containing: "{{malicious_code}}"

42. Try a project name with: "<script>alert('xss')</script>"

Report: Were all injection attempts safely handled?
```

## Part 7: Stress Testing

### 7.1 Large Queries
```
43. Get all tasks with limit: 100
    Time: ___ seconds

44. Search for a common word that returns many results
    Time: ___ seconds

45. Get all projects with details
    Time: ___ seconds

Report: Performance with large result sets?
```

## Final Comprehensive Report

### Performance Summary
- **Today's agenda**: ___ seconds (target: <2s)
- **Search queries**: ___ seconds (target: <5s)
- **Complex updates**: ___ seconds (target: <3s)
- **Average response**: ___ seconds

### Feature Verification
✅/❌ Task CRUD operations
✅/❌ Project management
✅/❌ Tag management
✅/❌ Repeat rules
✅/❌ Inbox moves (all 3 methods)
✅/❌ Date handling
✅/❌ Export functionality
✅/❌ Analytics and insights
✅/❌ Batch operations
✅/❌ Error messages with suggestions

### Critical Issues
List any:
1. Timeouts
2. "Unexpected end of script" errors
3. Data loss or corruption
4. Security vulnerabilities
5. Crashes or hangs

### Quality Scores (1-10)
- **Performance**: ___/10
- **Reliability**: ___/10
- **Usability**: ___/10
- **Security**: ___/10
- **Overall**: ___/10

### Production Readiness
[ ] No critical bugs
[ ] Performance acceptable
[ ] Security verified
[ ] Error handling robust
[ ] Features working as designed

### Final Verdict
**READY FOR RELEASE** / **NEEDS FIXES**

If NEEDS FIXES, list the blockers:
1. ___
2. ___
3. ___

## Notes
- This is the final gate before v2.0.0 release
- All critical features must pass
- Performance regression is not acceptable
- Security issues are automatic blockers
- Focus on stability over speed (though both are important)