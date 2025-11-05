# Natural Language Testing Prompt for Claude Desktop

Copy and paste this entire conversation into Claude Desktop to test the four-tool unified API.

---

## Testing Session: Four-Tool Unified OmniFocus API

Hi Claude! I need you to help me test the new experimental OmniFocus MCP API. This version consolidates 17 legacy tools into just **4 unified tools**. Please follow these steps exactly and report what you find at each stage.

### Part 1: Verify Tool Availability

First, tell me which OmniFocus tools you can see. You should see exactly **4 tools**:
1. **omnifocus_read** - Query operations
2. **omnifocus_write** - Mutation operations
3. **omnifocus_analyze** - Analysis operations
4. **system** - Version info and diagnostics

**Important:** If you see any tools named `tasks`, `manage_task`, `projects`, `tags`, etc., that's wrong - those legacy tools should not exist in this experimental branch.

**Expected:** You should see only 4 tools total

---

### Part 2: Test READ Operations

Let's test the unified read tool with several different queries:

#### Test 2.1: Query Inbox Tasks
Using **omnifocus_read**, query my inbox tasks (tasks not assigned to any project). Show me up to 5 results.

**Success criteria:** You successfully use omnifocus_read with `query: {type: "tasks", filters: {project: null}, limit: 5}`

#### Test 2.2: Query All Projects
Using **omnifocus_read**, list all my active projects.

**Success criteria:** You use omnifocus_read with `query: {type: "projects"}`

#### Test 2.3: Query All Tags
Using **omnifocus_read**, list all my tags.

**Success criteria:** You use omnifocus_read with `query: {type: "tags"}`

#### Test 2.4: Query Flagged Tasks
Using **omnifocus_read**, find all my flagged tasks.

**Success criteria:** You use omnifocus_read with `query: {type: "tasks", filters: {flagged: true}}`

#### Test 2.5: Query with Multiple Filters
Using **omnifocus_read**, find tasks that are:
- Flagged
- Due this week
- Not completed

**Success criteria:** You use omnifocus_read with multiple filters in a single query

---

### Part 3: Test WRITE Operations

Now let's test the unified write tool with a complete CRUD cycle:

#### Test 3.1: Create Task
Using **omnifocus_write**, create a new task with:
- Name: "Test Task - Unified API"
- Note: "Created during four-tool API testing"
- Flagged: true
- Due date: tomorrow

**Success criteria:** Task created successfully, you receive a task ID

#### Test 3.2: Update Task
Using **omnifocus_write**, update the task you just created:
- Change the note to: "Updated during testing - flag removed"
- Change flagged to: false
- Change due date to: 3 days from now

**Success criteria:** Task updated successfully

#### Test 3.3: Complete Task
Using **omnifocus_write**, mark the task as completed.

**Success criteria:** Task marked complete

#### Test 3.4: Delete Task
Using **omnifocus_write**, delete the completed task.

**Success criteria:** Task deleted successfully

#### Test 3.5: Batch Create
Using **omnifocus_write**, create a project with multiple tasks in one operation:
- Project name: "Testing Project - Unified API"
- Tasks: "Task 1", "Task 2", "Task 3"

**Success criteria:** Project and all tasks created in a single operation

---

### Part 4: Test ANALYZE Operations

Let's test the unified analyze tool with different analysis types:

#### Test 4.1: Productivity Stats
Using **omnifocus_analyze**, generate my productivity statistics for this week.

**Success criteria:** You use omnifocus_analyze with `analysis: {type: "productivity_stats", params: {groupBy: "week"}}`

#### Test 4.2: Task Velocity
Using **omnifocus_analyze**, analyze my task completion velocity over the last 30 days.

**Success criteria:** You use omnifocus_analyze with `analysis: {type: "task_velocity", params: {period: 30}}`

#### Test 4.3: Pattern Analysis
Using **omnifocus_analyze**, identify patterns in my task management (like review gaps or bottlenecks).

**Success criteria:** You use omnifocus_analyze with `analysis: {type: "analyze_patterns"}`

#### Test 4.4: Parse Meeting Notes
Using **omnifocus_analyze**, extract action items from this meeting note:

"Meeting with Sarah tomorrow at 2pm to discuss Q1 goals. Need to call Bob by Friday about the budget. Follow up with the team next Monday. Send proposal to client by end of week."

**Success criteria:** You use omnifocus_analyze with `analysis: {type: "parse_meeting_notes"}` and extract actionable tasks

---

### Part 5: Test System Tool

#### Test 5.1: Version Information
Using **system** tool, get the current version and build information.

**Success criteria:** You successfully retrieve version info including build ID

#### Test 5.2: Diagnostics
Using **system** tool, run diagnostics to verify OmniFocus connectivity.

**Success criteria:** You successfully run diagnostics check

---

### Part 6: Complex Workflow Test

Now let's test a realistic workflow combining all three unified tools:

1. **Query** (omnifocus_read): Find all tasks due this week
2. **Analyze** (omnifocus_analyze): Get my productivity stats for context
3. **Write** (omnifocus_write): Based on the analysis, create a new task to review overdue items
4. **Query** (omnifocus_read): Verify the new task was created

**Success criteria:** You successfully chain operations across all tools in a natural workflow

---

### Part 7: Edge Cases & Error Handling

#### Test 7.1: Invalid Query
Try using **omnifocus_read** with an invalid query type. What error do you get?

#### Test 7.2: Missing Required Field
Try using **omnifocus_write** to create a task without a name. What happens?

#### Test 7.3: Update Non-Existent Task
Try using **omnifocus_write** to update a task with ID "invalid-id-12345". What error do you get?

---

## Final Report

After completing all tests, please provide a summary:

### ✅ What Worked
List all tests that passed successfully

### ❌ What Failed
List any tests that failed with error details

### 💡 Observations
- Did the unified tools feel natural to use?
- Were there any operations that were harder to accomplish with the unified API compared to the legacy tools?
- Any suggestions for improving the tool interfaces?

### 🐛 Bugs Found
List any bugs discovered during testing, including:
- What you tried to do
- What you expected to happen
- What actually happened
- Error messages (if any)

---

## Important Notes for Tester

1. **Tool Count:** You should see exactly **4 tools**, not 20. If you see more, the test environment is incorrect.

2. **Error Reporting:** Be specific about errors - copy the exact error message and the parameters you used.

3. **Performance:** Note if any operations feel slow or timeout.

4. **Builder Pattern:** The unified tools use a "builder" pattern where you construct queries/mutations/analyses as nested JSON objects. This is different from the flat parameter structure of the legacy tools.

5. **Documentation:** Reference the API-COMPACT-UNIFIED.md file if you need details about available operations and parameters.
