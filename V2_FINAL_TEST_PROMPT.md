# v2.0.0 Final Testing Protocol for Claude Desktop

## Instructions for Tester

Please run through this comprehensive test suite with the OmniFocus MCP v2.0.0 server. Focus on the critical fixes and improvements made in this release.

## Test 1: Security - Injection Prevention
**Goal**: Verify the security fixes prevent injection attacks

Try these potentially malicious inputs:
1. Create a task named: `Test"); app.quit(); //`
2. Update a task with note: `'; DELETE FROM tasks; --`
3. Create a task with tag: `tag"); maliciousCode(); //`
4. Set a repeat rule with malicious code in the unit field

For each test:
- Did the task get created/updated safely?
- Was the malicious code properly escaped?
- Any unexpected behavior?

## Test 2: Performance - Large Dataset Handling
**Goal**: Verify performance improvements with 2000+ tasks

Run these queries and measure response time:
1. Show me today's agenda (should be <1 second)
2. Get all overdue tasks (should be <2 seconds)
3. Search for tasks with "meeting" in the name
4. Show upcoming tasks for next 7 days

Success criteria:
- Response time under 2 seconds for most queries
- No timeouts (60-second limit)
- Summary appears quickly even with large results

## Test 3: Reliability - Task Project Moves
**Goal**: Verify task IDs are preserved when moving between projects

1. Create a new task in the inbox
2. Note the task ID returned
3. Move that task to a project using update_task with projectId
4. Verify the task ID remains the same (no "recreated" warning)
5. Move the task back to inbox (projectId: null or "")
6. Confirm ID still unchanged

Check:
- Task ID preserved throughout moves?
- No warnings about task recreation?
- All task properties maintained?

## Test 4: Core CRUD Operations
**Goal**: Test all basic task operations work correctly

1. **Create**: Create a task with all properties:
   - Name, note, due date, defer date
   - Flag it
   - Assign to a project
   - Set estimated minutes
   - Add a repeat rule (daily)

2. **Read**: Query the task you created:
   - Find it by search
   - Verify all properties are correct
   - Check repeat rule is present

3. **Update**: Modify the task:
   - Change the name
   - Update the due date
   - Add tags
   - Clear the defer date
   - Change repeat to weekly

4. **Complete**: Mark the task complete
   - Verify it's marked complete
   - Check if repeat rule created next occurrence

5. **Delete**: Delete the task
   - Confirm it's removed

## Test 5: Tag Management
**Goal**: Test tag operations work correctly

1. List all tags - note the count
2. Create a new tag called "test-v2-tag"
3. Create a task and assign the new tag in update
4. Verify task has the tag
5. Delete the test tag
6. Confirm tag is removed from task

## Test 6: Date Handling
**Goal**: Verify local time format works correctly

Test these date formats:
1. Create task due "2025-03-31 17:00" (local time)
2. Create task due "tomorrow at 5pm" (natural language)
3. Update task to defer "next Monday at 9am"
4. Clear a due date using clearDueDate: true

Verify:
- Dates are set correctly in OmniFocus
- No timezone confusion
- Natural language dates work

## Test 7: Special Cases
**Goal**: Test edge cases and special scenarios

1. **Empty project**: Move task to inbox using:
   - projectId: null
   - projectId: ""
   - projectId: "null" (string)

2. **Repeat rules**: Create tasks with:
   - Weekly on Mon, Wed, Fri
   - Monthly on 1st Tuesday
   - Due after completion (not fixed)

3. **Batch operations**: Try to:
   - Update multiple tasks at once (should fail gracefully)
   - Complete several tasks quickly in sequence

## Test 8: Error Recovery
**Goal**: Verify errors are helpful and recoverable

Trigger these errors intentionally:
1. Update non-existent task ID
2. Create task with invalid date format
3. Search with limit > 1000
4. Export with unsupported format

For each error:
- Clear error message?
- Helpful suggestion provided?
- Can you fix without retry?

## Test 9: Export Functionality
**Goal**: Test data export features

1. Export 50 tasks to JSON format
2. Export the same tasks to CSV
3. Export projects with statistics
4. Try bulk export to a directory

Check:
- Files created successfully?
- Data formatted correctly?
- Statistics accurate?

## Test 10: Analytics & Insights
**Goal**: Verify productivity analytics work

1. Get productivity stats for the week
2. Analyze task velocity over 7 days
3. Get overdue task analysis
4. Check for any performance issues

Verify:
- Summary with insights appears first?
- Statistics are accurate?
- Response time acceptable?

---

## Critical Regression Tests

These MUST work (they were broken and fixed):

### 1. Today's Agenda Query
- Run "What do I need to do today?"
- Should NOT timeout
- Should return tasks with due dates
- Should work even with 2000+ total tasks

### 2. Task Moving Between Projects
- Move a task from one project to another
- Task ID must remain the same
- No "task was recreated" messages

### 3. Tag Assignment During Update
- Update a task and add tags
- Tags should be applied correctly
- No need for separate tag update call

### 4. Repeat Rules
- Create task with repeat rule
- Should work without errors
- Rule should be visible in task details

---

## Final Report Template

### Performance Metrics
- **Average query time**: ___ seconds (target: <2s)
- **Largest dataset handled**: ___ tasks
- **Timeout occurrences**: ___ (target: 0)

### Security Testing
- [ ] Injection attacks prevented
- [ ] All inputs properly escaped
- [ ] No code execution vulnerabilities

### Reliability Testing
- [ ] Task IDs preserved during moves
- [ ] No data loss during operations
- [ ] All CRUD operations work correctly

### Feature Verification
- [ ] Tags work during task creation/update
- [ ] Repeat rules function correctly
- [ ] Natural language dates supported
- [ ] Export formats work properly
- [ ] Analytics provide useful insights

### Issues Found
1. [Describe any errors]
2. [Note any performance problems]
3. [List any confusing behavior]

### Production Readiness Assessment

Rate each area (1-10):
- **Security**: ___/10
- **Performance**: ___/10
- **Reliability**: ___/10
- **Usability**: ___/10
- **Overall**: ___/10

### Go/No-Go Recommendation
[ ] Ready for v2.0.0 release
[ ] Needs fixes before release

### Additional Notes
[Any other observations or concerns]

---

## Test Environment Details
- OmniFocus version: ___
- Number of tasks in database: ___
- Number of projects: ___
- macOS version: ___
- Test date: ___

Thank you for thoroughly testing v2.0.0!