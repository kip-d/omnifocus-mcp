# 🧪 OmniFocus MCP Server - Comprehensive LLM Assistant Testing Prompt

**Purpose**: Validate the complete user experience of the OmniFocus MCP server through systematic testing of all 15 tools and core workflows.

**Target Assistants**: Claude Desktop (primary), ChatGPT with MCP support, or any LLM with OmniFocus MCP integration.

---

## 🎯 Testing Instructions for LLM Assistants

You are testing the OmniFocus MCP (Model Context Protocol) server integration. This server provides 15 specialized tools for comprehensive OmniFocus task management and GTD (Getting Things Done) workflows.

**Current Status**: v2.1.0 with 100% tool success rate - all 15 tools working reliably.

### Pre-Test Setup Verification
First, verify the MCP connection is working:
1. Check that you have access to OmniFocus MCP tools (should see 15 tools available)
2. Run `system` tool with operation "version" to confirm connectivity
3. Run `system` tool with operation "diagnostics" to verify OmniFocus is accessible
4. Confirm OmniFocus application is running on the system

---

## 🔧 Core Functionality Tests

### Test Group 1: Basic Task Operations
**Objective**: Verify core task CRUD operations work correctly

1. **Create a test project**: Use `projects` tool with operation "create" to create a project called "MCP Testing Project 2025-09-15"
2. **Add tasks with various properties** using `manage_task` tool with operation "create":
   - Simple task: "Test basic task creation"
   - Task with due date: "Task due tomorrow" (due tomorrow at 5 PM)
   - Task with defer date: "Deferred task" (defer until next week)
   - Flagged task: "Important flagged task" (flagged as important)
   - Task with time estimate: "30-minute task" (estimated 30 minutes)
   - Task with tags: "Tagged task" (add tags: @work, @urgent)

3. **Query and verify** using `tasks` tool:
   - Search for tasks containing "MCP" (mode="search", search="MCP")
   - List today's tasks (mode="today")
   - Show flagged tasks (mode="flagged")
   - Query tasks by tags (mode="all", tags=["@work", "@urgent"])

4. **Update operations** using `manage_task` tool:
   - Mark one task as completed (operation="complete")
   - Change due date on another task (operation="update")
   - Update task name and add notes (operation="update")
   - Remove and add tags (operation="update")
   - After applying flag/tag updates to a child task, run the `tasks` tool with `mode="today"`, `limit=25`, `details=false` and confirm the task still appears with its new tags (this validates the ultra-fast today script now returns tag metadata by default).
   - Also run `tasks` with `mode="all"`, `project="<your test project name>"`, `limit=10`, `details=true` and verify: (a) the parent task reports a `childCounts.total` ≥ 1, and (b) the child task entry shows the expected `parentTaskId`, `flagged` status, and updated tags. This catches regressions in parent/child propagation and project-scoped filtering.

5. **Cleanup**: Delete the test tasks and project using `manage_task` and `projects` tools with operation="delete"

**Success Criteria**: All operations complete without errors, data persists correctly in OmniFocus

---

### Test Group 2: Advanced Task Management
**Objective**: Test complex task relationships and filtering

1. **Create hierarchical structure**:
   - Parent task: "Website Redesign Project"
   - Subtasks: "Research competitors", "Create wireframes", "Implement design"
   - Make subtasks sequential (must complete in order)

2. **Test recurring tasks**:
   - Create daily recurring task: "Daily standup"
   - Create weekly recurring task: "Weekly review" (every Friday)
   - Analyze recurring task patterns

3. **Test task relationships**:
   - Create tasks with dependencies
   - Query available tasks (not blocked/deferred)
   - Query blocked tasks

4. **Advanced filtering**:
   - Tasks due in next 7 days
   - Overdue tasks analysis
   - Tasks by specific project

**Success Criteria**: Hierarchical relationships work, recurring tasks created properly, filtering returns expected results

---

### Test Group 3: Project & Folder Management
**Objective**: Verify project organization and folder structure

1. **Create folder structure**:
   - Top-level folder: "MCP Test Area"
   - Subfolder: "Active Projects"
   - Subfolder: "Someday/Maybe"

2. **Project operations**:
   - Create projects in different folders
   - Move projects between folders
   - Set project status (active, on-hold, completed)
   - Add project notes and due dates

3. **Project analysis**:
   - List projects needing review
   - Show project statistics
   - Query projects by status and folder

**Success Criteria**: Folder hierarchy maintained, project operations work correctly, status changes persist

---

### Test Group 4: Tag Management & Organization
**Objective**: Test tag system and hierarchical tag relationships

1. **Create tag hierarchy**:
   - Parent tag: "Contexts"
   - Child tags: "@home", "@office", "@errands"
   - Parent tag: "Energy"
   - Child tags: "@high-energy", "@low-energy"

2. **Tag operations**:
   - Apply multiple tags to tasks
   - Create nested tag relationships
   - Rename tags (verify tasks update automatically)
   - Merge similar tags

3. **Tag analysis**:
   - List all tags with task counts
   - Show tag usage statistics
   - Find unused tags
   - Analyze tag patterns

**Success Criteria**: Tag hierarchy works, bulk operations succeed, statistics are accurate

---

### Test Group 5: Analytics & Insights
**Objective**: Validate analytical tools and productivity insights

1. **Task velocity analysis**:
   - Analyze completion patterns over last 30 days
   - Group by day/week to see trends
   - Include/exclude weekends in analysis

2. **Overdue analysis**:
   - Identify overdue task patterns
   - Group by project, tags, or time ranges
   - Analyze recurring bottlenecks

3. **Productivity statistics**:
   - Generate comprehensive stats for last month
   - Include project-level breakdowns
   - Include tag-level statistics

4. **Workflow analysis** (using `workflow_analysis` tool):
   - Deep workflow health check with different analysis depths (quick/standard/deep)
   - Focus on specific areas (productivity, workload, bottlenecks, opportunities)
   - Identify system bottlenecks and workflow patterns
   - Get actionable improvement insights

**Success Criteria**: Analytics generate meaningful insights, data is accurate, recommendations are actionable

---

### Test Group 6: Pattern Analysis & System Health
**Objective**: Test advanced pattern detection and system optimization

1. **Pattern analysis** (using `analyze_patterns` tool):
   - Run duplicate task detection
   - Identify dormant projects (no activity)
   - Audit tag usage patterns
   - Check deadline health (realistic due dates)
   - Find "waiting for" patterns
   - Run comprehensive pattern analysis with "all" option

2. **System health checks**:
   - Next actions audit (every project has next action)
   - Review gaps analysis (projects missing reviews)
   - Estimation bias detection

3. **Pattern insights**:
   - Get actionable recommendations
   - Identify workflow improvements
   - Find organizational optimizations

**Success Criteria**: Patterns detected accurately, insights are actionable, no false positives

---

### Test Group 7: Data Import/Export
**Objective**: Verify data portability and backup capabilities

1. **Export operations**:
   - Export all tasks to JSON format
   - Export specific project tasks to CSV
   - Export project list with statistics
   - Create complete database backup

2. **Export filtering**:
   - Export only active tasks
   - Export tasks with specific tags
   - Export completed tasks from last month
   - Export with custom field selection

3. **Verify export data**:
   - Check file formats are valid
   - Verify data completeness
   - Confirm field accuracy

**Success Criteria**: Exports complete successfully, data integrity maintained, formats are valid

---

### Test Group 8: Perspectives & Custom Views
**Objective**: Test perspective management and custom filtering

1. **Perspective operations**:
   - List all available perspectives
   - Query tasks from built-in perspectives (Today, Flagged, etc.)
   - Query custom perspectives if available

2. **Perspective analysis**:
   - Compare results between different perspectives
   - Verify perspective filters work correctly
   - Test perspective sorting options

**Success Criteria**: Perspectives accessible, filtering works correctly, results match expectations

---

## 🎯 Workflow Integration Tests

### GTD Weekly Review Simulation
**Objective**: Test complete GTD weekly review workflow

1. **Review preparation**:
   - Get projects needing review
   - Mark projects as reviewed
   - Update project status and notes

2. **System maintenance**:
   - Process inbox items
   - Update project due dates
   - Clean up completed items
   - Review and update context tags

3. **Planning activities**:
   - Identify next actions for each project
   - Set priorities using flags
   - Schedule upcoming tasks

**Success Criteria**: Complete review workflow possible, all operations integrate smoothly

### Real-world Task Processing
**Objective**: Simulate realistic daily task management

1. **Morning planning**:
   - Review today's tasks
   - Check flagged items
   - Identify available actions based on context

2. **Task execution**:
   - Mark tasks complete as working
   - Add notes and time tracking
   - Create follow-up tasks as needed

3. **End-of-day review**:
   - Process completed items
   - Defer incomplete tasks
   - Plan tomorrow's priorities

**Success Criteria**: Natural workflow feels intuitive, operations are efficient

---

## 🚨 Error Handling & Edge Cases

### Test Group 9: Error Conditions
**Objective**: Verify graceful handling of error conditions

1. **Invalid data tests**:
   - Try to create task with invalid date formats
   - Attempt operations on non-existent projects/tasks
   - Test with empty or malformed parameters

2. **Boundary conditions**:
   - Very long task names and notes
   - Large numbers of tasks/projects
   - Complex tag hierarchies

3. **Recovery scenarios**:
   - Verify error messages are helpful
   - Confirm system remains stable after errors
   - Test data consistency after failed operations

**Success Criteria**: Errors handled gracefully, helpful error messages, no data corruption

---

## 📊 Performance & Reliability Tests

### Test Group 10: Performance Validation
**Objective**: Verify system performs well under realistic loads

1. **Query performance**:
   - Large task queries (if you have 500+ tasks)
   - Complex filtering operations
   - Multiple simultaneous operations

2. **Response times**:
   - Simple operations complete quickly (< 2 seconds)
   - Complex analytics complete reasonably (< 10 seconds)
   - No timeouts or hanging operations

3. **Memory usage**:
   - Operations don't cause excessive memory usage
   - System remains responsive during operations

**Success Criteria**: Acceptable performance, no timeouts, system remains stable

---

## ✅ Final Validation Checklist

After completing all test groups, verify:

- [ ] **All 15 tools accessible and functional**
- [ ] **No hanging processes or timeouts**
- [ ] **Data persists correctly in OmniFocus**
- [ ] **Error handling is robust**
- [ ] **Performance is acceptable**
- [ ] **Analytics provide meaningful insights**
- [ ] **Export/import works correctly**
- [ ] **Complex workflows are supported**
- [ ] **Integration feels natural for GTD users**
- [ ] **Documentation matches actual behavior**

---

## 📝 Test Reporting

When reporting results, please include:

1. **Overall Assessment**: Does the MCP server provide a complete OmniFocus experience?
2. **Tool Coverage**: Which of the 15 tools worked correctly?
3. **Workflow Support**: How well does it support GTD and productivity workflows?
4. **Performance Notes**: Any performance issues or concerns?
5. **User Experience**: Is the integration intuitive and helpful?
6. **Issues Found**: Any bugs, errors, or unexpected behaviors?
7. **Recommendations**: Suggested improvements or optimizations

---

## 🎯 Success Criteria Summary

**Minimum Acceptable Result**: 
- All basic CRUD operations work (create, read, update, delete tasks/projects)
- No system crashes or hanging processes
- Data integrity maintained throughout testing

**Excellent Result**:
- All 15 tools work flawlessly
- Analytics provide valuable insights
- Complex workflows feel natural
- Performance is consistently good
- Error handling is robust and helpful

**Testing Complete**: You've successfully validated the OmniFocus MCP server provides a comprehensive, reliable, and user-friendly experience for GTD and task management workflows.
