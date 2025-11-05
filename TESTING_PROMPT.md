# Natural Language Testing Prompt for Claude Desktop

Copy and paste this entire conversation into Claude Desktop to test the three-tool builder API.

---

## Testing Session: Three-Tool Builder API

Hi Claude! I need you to help me test the new experimental three-tool OmniFocus MCP API. Please follow these steps exactly and report what you find at each stage.

### Part 1: Verify Tool Availability

First, tell me which OmniFocus tools you can see. Specifically, can you see these three new tools:
- omnifocus_read
- omnifocus_write
- omnifocus_analyze

And do you also see the 17 legacy tools (tasks, manage_task, projects, etc.)?

**Expected:** You should see all 20 tools (3 new + 17 legacy)

---

### Part 2: Test READ Operations

Let's test the unified read tool with several different queries:

#### Test 2.1: Query Inbox Tasks
Using **omnifocus_read**, query my inbox tasks (tasks not assigned to any project). Show me up to 5 results.

**Success criteria:** You successfully use omnifocus_read with query.type="tasks" and query.filters.project=null

#### Test 2.2: Query All Projects
Using **omnifocus_read**, list all my active projects.

**Success criteria:** You use omnifocus_read with query.type="projects"

#### Test 2.3: Query All Tags
Using **omnifocus_read**, list all my tags.

**Success criteria:** You use omnifocus_read with query.type="tags"

#### Test 2.4: Query Flagged Tasks
Using **omnifocus_read**, find all my flagged tasks.

**Success criteria:** You use omnifocus_read with query.type="tasks" and query.filters.flagged=true

---

### Part 3: Test WRITE Operations

Now let's test the unified write tool with a complete CRUD cycle:

#### Test 3.1: Create Task
Using **omnifocus_write**, create a new task with:
- Name: "Test Task - Builder API"
- Note: "Created during three-tool API testing"
- Flagged: true

**Success criteria:** Task created successfully, you receive a task ID

#### Test 3.2: Update Task
Using **omnifocus_write**, update the task you just created:
- Change the note to: "Updated during testing"
- Change flagged to: false

**Success criteria:** Task updated successfully

#### Test 3.3: Complete Task
Using **omnifocus_write**, mark the task as completed.

**Success criteria:** Task marked complete

#### Test 3.4: Delete Task
Using **omnifocus_write**, delete the completed task.

**Success criteria:** Task deleted successfully

---

### Part 4: Test ANALYZE Operations

Let's test the unified analyze tool with different analysis types:

#### Test 4.1: Productivity Stats
Using **omnifocus_analyze**, generate my productivity statistics for this week.

**Success criteria:** You use omnifocus_analyze with analysis.type="productivity_stats" and params.groupBy="week"

#### Test 4.2: Parse Meeting Notes
Using **omnifocus_analyze**, extract action items from this meeting note:

"Meeting with Sarah tomorrow at 2pm to discuss Q1 goals. Need to call Bob by Friday about the budget. Follow up with the team next Monday."

**Success criteria:** You use omnifocus_analyze with analysis.type="parse_meeting_notes" and the text

---

### Part 5: Verify Legacy Tools Still Work

Now let's confirm the old tools still work alongside the new ones:

#### Test 5.1: Use Legacy 'tasks' Tool
Using the **tasks** tool (NOT omnifocus_read), query my inbox.

**Success criteria:** Legacy tool works correctly

#### Test 5.2: Use Legacy 'manage_task' Tool
Using the **manage_task** tool (NOT omnifocus_write), create a simple task named "Legacy Tool Test".

**Success criteria:** Legacy tool works correctly

---

### Part 6: Final Report

After completing all tests, please provide a summary report with this format:

```
## Test Results Summary

### READ Tests (omnifocus_read)
- Inbox query: ✅/❌
- Projects query: ✅/❌
- Tags query: ✅/❌
- Flagged tasks query: ✅/❌

### WRITE Tests (omnifocus_write)
- Create task: ✅/❌
- Update task: ✅/❌
- Complete task: ✅/❌
- Delete task: ✅/❌

### ANALYZE Tests (omnifocus_analyze)
- Productivity stats: ✅/❌
- Parse meeting notes: ✅/❌

### Legacy Tools Compatibility
- 'tasks' tool: ✅/❌
- 'manage_task' tool: ✅/❌

### Overall Assessment
[Your assessment of whether the new tools work correctly]

### Issues Found
[List any errors, unexpected behavior, or problems]

### Observations
[Any additional notes or feedback]
```

---

## For Testers: After This Test

After Claude completes this test with ALL tools, we need to test with ONLY the 3 new tools:

1. Follow instructions in TESTING_INSTRUCTIONS.md to disable the 17 legacy tools
2. Run this SAME prompt again
3. Verify that ALL tests still pass with only the 3 unified tools
4. This proves the 3 tools can fully replace the 17 legacy tools

**Critical Question:** Can the 3 new tools do everything the 17 old tools could do?

---

## Success Criteria for Complete Testing

✅ All READ operations work
✅ All WRITE operations work (full CRUD cycle)
✅ All ANALYZE operations work
✅ Legacy tools still work (parallel operation confirmed)
✅ **MOST IMPORTANT:** All tests pass with ONLY 3 tools (no legacy tools needed)

If the last criterion passes, we can confidently remove the 17 legacy tools in a future release.
