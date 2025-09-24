# 🧪 OmniFocus MCP Server - Comprehensive LLM Testing Prompt v3.0

**Purpose**: Comprehensive testing of the OmniFocus MCP server with automatic cleanup mechanisms to prevent test data pollution.

**Target Assistants**: Claude Desktop, ChatGPT with MCP support, or any LLM with OmniFocus MCP integration.

**Version**: 3.0 - Includes automated cleanup strategies and unique tagging system for test data management.

---

## 🧹 **CRITICAL: Test Data Cleanup Strategy**

### Unique Test Identifier System
**ALL test data created during this session MUST be tagged with the unique identifier:**

```
@mcp-test-{timestamp}
```

Where `{timestamp}` is the current date and time when testing begins (format: `YYYY-MM-DD-HHMM`)

**Example**: `@mcp-test-2024-09-24-1430`

### Automatic Cleanup Protocol

1. **Before Starting Tests**: Create the unique test tag using the `tags` tool:
   ```
   tags with operation="manage", action="create", tagName="@mcp-test-2024-09-24-1430"
   ```

2. **During Testing**: Apply this tag to EVERY test item you create:
   - All test tasks
   - All test projects
   - All test folders
   - Any other OmniFocus items

3. **After Testing**: Run the cleanup sequence:
   ```
   # Step 1: Find all test items
   tasks with mode="all", tags=["@mcp-test-2024-09-24-1430"], limit=200

   # Step 2: Delete all test tasks
   For each task found, use: manage_task with operation="delete", taskId="[task-id]"

   # Step 3: Find and delete test projects
   projects with operation="list", limit=100
   # Filter for projects with test tag, then delete each one

   # Step 4: Clean up test folders
   folders with operation="list"
   # Find folders starting with "MCP Test" or tagged appropriately, delete them

   # Step 5: Delete the test tag itself
   tags with operation="manage", action="delete", tagName="@mcp-test-2024-09-24-1430"
   ```

### Manual Cleanup Fallback
If automated cleanup fails, the user can manually clean up by:
1. Open OmniFocus
2. Search for the test tag (e.g., `@mcp-test-2024-09-24-1430`)
3. Select all results and delete
4. Search for projects/folders starting with "MCP Test" and delete
5. Remove the test tag from the tag list

---

## 🎯 Pre-Test Setup & Initialization

### Step 1: System Verification
1. **Verify MCP Connection**:
   ```
   system with operation="version"
   system with operation="diagnostics"
   ```

2. **Confirm OmniFocus Access**:
   - Verify OmniFocus is running
   - Check that you can see existing tasks/projects
   - Ensure proper permissions are granted

### Step 2: Initialize Test Environment
1. **Create Unique Test Tag**:
   ```
   tags with operation="manage", action="create", tagName="@mcp-test-{your-timestamp}"
   ```

2. **Create Test Folder Structure**:
   ```
   folders with operation="create", name="MCP Test Area {timestamp}"
   folders with operation="create", name="MCP Active Tests", parentFolderId="{parent-folder-id}"
   folders with operation="create", name="MCP Cleanup Tests", parentFolderId="{parent-folder-id}"
   ```

3. **Create Master Test Project**:
   ```
   projects with operation="create", name="MCP Testing Session {timestamp}",
   folder="MCP Test Area {timestamp}", tags=["@mcp-test-{timestamp}"]
   ```

**Remember**: Apply your unique test tag to EVERYTHING you create!

---

## 🔧 Core Functionality Tests

### Test Group 1: Basic Task Operations with Cleanup Tracking

**Objective**: Verify core task CRUD operations while maintaining cleanup tracking.

1. **Create Test Tasks** (all with your unique test tag):
   ```
   manage_task with operation="create", name="Test Basic Creation {timestamp}",
   projectId="{test-project-id}", tags=["@mcp-test-{timestamp}", "@basic-test"]

   manage_task with operation="create", name="Due Date Test {timestamp}",
   projectId="{test-project-id}", dueDate="2024-09-25 17:00",
   tags=["@mcp-test-{timestamp}", "@due-test"]

   manage_task with operation="create", name="Defer Test {timestamp}",
   projectId="{test-project-id}", deferDate="2024-09-26 08:00",
   tags=["@mcp-test-{timestamp}", "@defer-test"]

   manage_task with operation="create", name="Flagged Test {timestamp}",
   projectId="{test-project-id}", flagged=true,
   tags=["@mcp-test-{timestamp}", "@flag-test"]

   manage_task with operation="create", name="Estimated Task {timestamp}",
   projectId="{test-project-id}", estimatedMinutes=30,
   tags=["@mcp-test-{timestamp}", "@time-test"]

   manage_task with operation="create", name="Complex Task {timestamp}",
   projectId="{test-project-id}", dueDate="2024-09-25 14:00", flagged=true,
   estimatedMinutes=45, tags=["@mcp-test-{timestamp}", "@work", "@urgent", "@complex-test"]
   ```

2. **Query Verification**:
   ```
   tasks with mode="search", search="Test {timestamp}"
   tasks with mode="all", tags=["@mcp-test-{timestamp}"]
   tasks with mode="flagged", tags=["@mcp-test-{timestamp}"]
   tasks with mode="today", tags=["@mcp-test-{timestamp}"]
   ```

3. **Update Operations**:
   ```
   # Complete one task
   manage_task with operation="complete", taskId="{task-id}"

   # Update another task
   manage_task with operation="update", taskId="{task-id}",
   name="Updated Task Name {timestamp}", note="Added test note during MCP testing"

   # Change due date
   manage_task with operation="update", taskId="{task-id}",
   dueDate="2024-09-26 16:00"

   # Update tags (ensure test tag remains!)
   manage_task with operation="update", taskId="{task-id}",
   tags=["@mcp-test-{timestamp}", "@work", "@updated"]
   ```

4. **Verification Queries**:
   ```
   # Verify updates persisted
   tasks with mode="all", project="{test-project-id}", details=true

   # Check today's tasks include updates
   tasks with mode="today", limit=25, details=false

   # Verify hierarchical relationships
   tasks with mode="all", project="{test-project-id}", limit=10, details=true
   ```

**Success Criteria**: All operations complete, data persists, test tag remains on all items.

---

### Test Group 2: Advanced Task Management & Relationships

**Objective**: Test complex task structures while maintaining cleanup tracking.

1. **Create Hierarchical Structure**:
   ```
   # Parent task
   manage_task with operation="create", name="Website Redesign Project {timestamp}",
   projectId="{test-project-id}", tags=["@mcp-test-{timestamp}", "@project-parent"]

   # Child tasks (sequential)
   manage_task with operation="create", name="Research Competitors {timestamp}",
   projectId="{test-project-id}", parentTaskId="{parent-task-id}",
   tags=["@mcp-test-{timestamp}", "@research"]

   manage_task with operation="create", name="Create Wireframes {timestamp}",
   projectId="{test-project-id}", parentTaskId="{parent-task-id}",
   tags=["@mcp-test-{timestamp}", "@design"]

   manage_task with operation="create", name="Implement Design {timestamp}",
   projectId="{test-project-id}", parentTaskId="{parent-task-id}",
   tags=["@mcp-test-{timestamp}", "@development"]

   # Make parent sequential
   manage_task with operation="update", taskId="{parent-task-id}", sequential=true
   ```

2. **Create Recurring Tasks**:
   ```
   manage_task with operation="create", name="Daily Standup Test {timestamp}",
   projectId="{test-project-id}",
   repeatRule={"unit": "day", "steps": 1, "method": "fixed"},
   tags=["@mcp-test-{timestamp}", "@recurring", "@daily"]

   manage_task with operation="create", name="Weekly Review Test {timestamp}",
   projectId="{test-project-id}",
   repeatRule={"unit": "week", "steps": 1, "method": "fixed", "weekday": "friday"},
   tags=["@mcp-test-{timestamp}", "@recurring", "@weekly"]
   ```

3. **Test Dependency Relationships**:
   ```
   # Query available vs blocked tasks
   tasks with mode="available", tags=["@mcp-test-{timestamp}"]
   tasks with mode="blocked", tags=["@mcp-test-{timestamp}"]

   # Analyze recurring tasks
   recurring_tasks with operation="analyze", activeOnly=true
   ```

**Success Criteria**: Hierarchies work, recurring tasks created, dependencies function properly.

---

### Test Group 3: Project & Organization Management

**Objective**: Test project organization with systematic cleanup tracking.

1. **Create Additional Projects**:
   ```
   projects with operation="create", name="Active Project Test {timestamp}",
   folder="MCP Active Tests", status="active",
   tags=["@mcp-test-{timestamp}"], dueDate="2024-10-15"

   projects with operation="create", name="On Hold Project Test {timestamp}",
   folder="MCP Active Tests", status="on-hold",
   tags=["@mcp-test-{timestamp}"], note="Test project for MCP validation"

   projects with operation="create", name="Someday Project Test {timestamp}",
   folder="MCP Cleanup Tests", status="active",
   tags=["@mcp-test-{timestamp}"]
   ```

2. **Project Management Operations**:
   ```
   # Move project between folders
   # (First get folder IDs)
   folders with operation="list"
   projects with operation="update", projectId="{project-id}", folder="{new-folder-name}"

   # Update project status
   projects with operation="update", projectId="{project-id}", status="on-hold"

   # Add project review schedule
   manage_reviews with operation="set_schedule", projectId="{project-id}", reviewInterval=7
   ```

3. **Project Analysis**:
   ```
   # List all test projects
   projects with operation="list", status=["active", "on-hold"], details=true

   # Check projects needing review
   manage_reviews with operation="list"

   # Get project statistics
   projects with operation="stats"
   ```

**Success Criteria**: Projects created in correct folders, status changes work, reviews scheduled.

---

### Test Group 4: Tag Management & Hierarchy

**Objective**: Test tag system while ensuring cleanup compatibility.

1. **Create Tag Hierarchy**:
   ```
   # Context tags
   tags with operation="manage", action="create", tagName="@contexts-test-{timestamp}"
   tags with operation="manage", action="create", tagName="@home-test",
   parentTagName="@contexts-test-{timestamp}"
   tags with operation="manage", action="create", tagName="@office-test",
   parentTagName="@contexts-test-{timestamp}"
   tags with operation="manage", action="create", tagName="@errands-test",
   parentTagName="@contexts-test-{timestamp}"

   # Energy tags
   tags with operation="manage", action="create", tagName="@energy-test-{timestamp}"
   tags with operation="manage", action="create", tagName="@high-energy-test",
   parentTagName="@energy-test-{timestamp}"
   tags with operation="manage", action="create", tagName="@low-energy-test",
   parentTagName="@energy-test-{timestamp}"
   ```

2. **Apply Tags to Tasks**:
   ```
   manage_task with operation="create", name="Context Test Task {timestamp}",
   projectId="{test-project-id}",
   tags=["@mcp-test-{timestamp}", "@home-test", "@low-energy-test"]

   manage_task with operation="create", name="Energy Test Task {timestamp}",
   projectId="{test-project-id}",
   tags=["@mcp-test-{timestamp}", "@office-test", "@high-energy-test"]
   ```

3. **Tag Operations & Analysis**:
   ```
   # List all tags with hierarchy
   tags with operation="list", includeUsageStats=true, fastMode=false

   # Find active tags only
   tags with operation="active"

   # Fast query for UI
   tags with operation="list", namesOnly=true

   # Rename a test tag
   tags with operation="manage", action="rename", tagName="@home-test", newName="@home-context-test"
   ```

**Success Criteria**: Tag hierarchy works, tasks properly tagged, operations succeed.

---

### Test Group 5: Analytics & Performance Insights

**Objective**: Validate analytical capabilities with test data.

1. **Task Velocity Analysis**:
   ```
   task_velocity with days=30, groupBy="day", includeWeekends=true
   task_velocity with days=14, groupBy="week", includeWeekends=false
   task_velocity with days=7, groupBy="project", includeWeekends=true
   ```

2. **Overdue Analysis**:
   ```
   analyze_overdue with includeRecentlyCompleted=true, groupBy="project", limit=50
   analyze_overdue with includeRecentlyCompleted=false, groupBy="age", limit=25
   ```

3. **Productivity Statistics**:
   ```
   productivity_stats with period="week", includeProjectStats=true, includeTagStats=true
   productivity_stats with period="month", includeProjectStats=false, includeTagStats=true
   ```

4. **Workflow Analysis**:
   ```
   workflow_analysis with analysisDepth="standard", focusAreas="productivity",
   includeRawData=false, maxInsights=10

   workflow_analysis with analysisDepth="deep", focusAreas="bottlenecks",
   includeRawData=true, maxInsights=5
   ```

**Success Criteria**: Analytics generate meaningful insights, performance is acceptable.

---

### Test Group 6: Advanced Pattern Analysis

**Objective**: Test system health and pattern detection.

1. **Comprehensive Pattern Analysis**:
   ```
   analyze_patterns with patterns=["duplicates", "dormant_projects", "tag_audit"],
   options="{\"thresholds\": {\"dormant_days\": 30}}"

   analyze_patterns with patterns=["deadline_health", "waiting_for", "next_actions"],
   options="{\"thresholds\": {\"overdue_days\": 7}}"

   analyze_patterns with patterns=["estimation_bias", "review_gaps"],
   options="{\"thresholds\": {\"review_overdue_days\": 14}}"

   # Run complete analysis
   analyze_patterns with patterns=["all"],
   options="{\"comprehensive\": true}"
   ```

2. **System Health Validation**:
   ```
   # Check for our test data in patterns (should find some)
   # Patterns should detect our test projects and tasks
   # Verify no false positives in real data
   ```

**Success Criteria**: Patterns detected accurately, test data identified appropriately.

---

### Test Group 7: Data Export & Portability

**Objective**: Test export capabilities and data integrity.

1. **Various Export Operations**:
   ```
   # Export test tasks only
   export with type="tasks", format="json",
   filter={"tags": ["@mcp-test-{timestamp}"], "completed": false}

   # Export with specific fields
   export with type="tasks", format="csv",
   filter={"tags": ["@mcp-test-{timestamp}"]},
   fields=["name", "project", "tags", "dueDate", "completed"]

   # Export test projects
   export with type="projects", format="json", includeStats=true

   # Export in markdown format
   export with type="tasks", format="markdown",
   filter={"project": "{test-project-id}"}
   ```

2. **Verify Export Integrity**:
   ```
   # Check that exported files contain test data
   # Verify all test items have unique tag
   # Confirm field accuracy and completeness
   ```

**Success Criteria**: Exports complete successfully, test data properly included, formats valid.

---

### Test Group 8: Perspectives & Custom Views

**Objective**: Test perspective integration with test data.

1. **Perspective Operations**:
   ```
   # List available perspectives
   perspectives with operation="list", includeFilterRules=true, sortBy="name"

   # Query built-in perspectives with our test data
   perspectives with operation="query", perspectiveName="Today",
   limit=50, includeDetails=true

   perspectives with operation="query", perspectiveName="Flagged",
   limit=25, includeDetails=false

   # Test custom perspectives if available
   # (Try common custom perspective names)
   perspectives with operation="query", perspectiveName="Next Actions",
   limit=30, includeDetails=true
   ```

2. **Verify Test Data in Perspectives**:
   ```
   # Confirm test tasks appear in appropriate perspectives
   # Verify filtering works correctly
   # Check that completed test tasks don't appear inappropriately
   ```

**Success Criteria**: Perspectives accessible, test data appears correctly, filtering works.

---

## 🧪 Error Handling & Edge Cases

### Test Group 9: Error Resilience

**Objective**: Verify graceful error handling without data corruption.

1. **Invalid Data Tests**:
   ```
   # Invalid date formats
   manage_task with operation="create", name="Bad Date Test {timestamp}",
   projectId="{test-project-id}", dueDate="invalid-date-format",
   tags=["@mcp-test-{timestamp}"]

   # Non-existent project
   manage_task with operation="create", name="Bad Project Test {timestamp}",
   projectId="non-existent-id", tags=["@mcp-test-{timestamp}"]

   # Invalid tag operations
   tags with operation="manage", action="delete", tagName="@non-existent-tag"

   # Invalid task operations
   manage_task with operation="update", taskId="non-existent-task-id"
   ```

2. **Boundary Conditions**:
   ```
   # Very long task name
   manage_task with operation="create",
   name="Very Long Task Name {timestamp} " + ("x" * 200),
   projectId="{test-project-id}", tags=["@mcp-test-{timestamp}"]

   # Complex tag combinations
   manage_task with operation="create", name="Many Tags Test {timestamp}",
   projectId="{test-project-id}",
   tags=["@mcp-test-{timestamp}", "@tag1", "@tag2", "@tag3", "@tag4", "@tag5"]
   ```

3. **Recovery Verification**:
   ```
   # Verify system still works after errors
   tasks with mode="all", tags=["@mcp-test-{timestamp}"], limit=10
   system with operation="diagnostics"
   ```

**Success Criteria**: Errors handled gracefully, helpful messages, no corruption.

---

## 🎯 GTD Workflow Integration Test

### Complete Weekly Review Simulation

**Objective**: Test comprehensive GTD workflow with test data.

1. **Review Preparation**:
   ```
   # Check projects needing review (including test projects)
   manage_reviews with operation="list"

   # Mark test projects as reviewed
   manage_reviews with operation="mark_reviewed", projectId="{test-project-id}"

   # Update project status
   projects with operation="update", projectId="{test-project-id}",
   status="active", note="Updated during MCP testing weekly review simulation"
   ```

2. **System Maintenance**:
   ```
   # Process test "inbox" items
   tasks with mode="all", project=null, tags=["@mcp-test-{timestamp}"]

   # Update project due dates
   projects with operation="update", projectId="{test-project-id}",
   dueDate="2024-10-01"

   # Review and organize test tags
   tags with operation="list", includeUsageStats=true
   ```

3. **Planning Activities**:
   ```
   # Identify next actions for test projects
   tasks with mode="available", project="{test-project-id}"

   # Set priorities using flags
   manage_task with operation="update", taskId="{available-task-id}", flagged=true

   # Schedule upcoming test tasks
   manage_task with operation="update", taskId="{another-task-id}",
   dueDate="2024-09-25 10:00"
   ```

**Success Criteria**: Complete workflow functions smoothly, all operations integrate naturally.

---

## 🧹 **MANDATORY: Post-Test Cleanup Sequence**

### Step 1: Inventory Test Data
```
# Find all test items before deletion
tasks with mode="all", tags=["@mcp-test-{timestamp}"], limit=200

# Get list of test projects
projects with operation="list", limit=100
# (Manual filter for projects with test tag)

# Find test folders
folders with operation="list"
# (Look for folders starting with "MCP Test Area")
```

### Step 2: Delete Test Tasks
```
# For each test task found in Step 1:
manage_task with operation="delete", taskId="{task-id-1}"
manage_task with operation="delete", taskId="{task-id-2}"
# ... continue for all test tasks
```

### Step 3: Delete Test Projects
```
# For each test project:
projects with operation="delete", projectId="{test-project-id-1}"
projects with operation="delete", projectId="{test-project-id-2}"
# ... continue for all test projects
```

### Step 4: Clean Up Test Folders
```
# Delete test folders (children first, then parents)
folders with operation="delete", folderId="{child-folder-id}"
folders with operation="delete", folderId="{parent-folder-id}"
```

### Step 5: Remove Test Tags
```
# Delete child tags first
tags with operation="manage", action="delete", tagName="@home-test"
tags with operation="manage", action="delete", tagName="@office-test"
tags with operation="manage", action="delete", tagName="@errands-test"
tags with operation="manage", action="delete", tagName="@high-energy-test"
tags with operation="manage", action="delete", tagName="@low-energy-test"

# Delete parent tags
tags with operation="manage", action="delete", tagName="@contexts-test-{timestamp}"
tags with operation="manage", action="delete", tagName="@energy-test-{timestamp}"

# Finally, delete the main test tag
tags with operation="manage", action="delete", tagName="@mcp-test-{timestamp}"
```

### Step 6: Verification
```
# Confirm cleanup was successful
tasks with mode="search", search="Test {timestamp}"
projects with operation="list", limit=50
folders with operation="list"
tags with operation="list", namesOnly=true

# Should return no items with test identifiers
```

### Manual Cleanup Instructions
If automated cleanup fails:
1. Open OmniFocus application
2. Use Quick Open (⌘-O) and search for your test tag (e.g., `@mcp-test-2024-09-24-1430`)
3. Select all found items and delete them
4. Use Quick Open to search for "MCP Test" and delete any remaining test folders/projects
5. Go to Tags view and manually delete any remaining test tags
6. Empty the Trash in OmniFocus to permanently remove test data

---

## ✅ Comprehensive Success Criteria

### Minimum Acceptable Results
- [ ] All 15 MCP tools accessible and responsive
- [ ] Basic CRUD operations work for tasks and projects
- [ ] Test data successfully created with unique identifiers
- [ ] No system crashes or hanging processes
- [ ] **CRITICAL**: All test data successfully cleaned up
- [ ] OmniFocus database returned to pre-test state

### Excellent Results
- [ ] All test groups complete without errors
- [ ] Analytics provide valuable and accurate insights
- [ ] Complex workflows feel natural and intuitive
- [ ] Performance consistently good (< 5 seconds for complex operations)
- [ ] Error handling robust with helpful error messages
- [ ] Test data cleanup automated and complete
- [ ] Integration seamless for GTD users

### Post-Test Verification
- [ ] OmniFocus contains no test artifacts
- [ ] All test tags removed from system
- [ ] No test projects or folders remaining
- [ ] Tag hierarchy not polluted with test tags
- [ ] System performance unaffected by testing

---

## 📊 Test Reporting Template

When reporting results, please include:

### Overall Assessment
- **MCP Server Version**: {from system tool}
- **Test Session ID**: `@mcp-test-{your-timestamp}`
- **Total Test Duration**: {time taken}
- **Cleanup Status**: ✅ Complete / ❌ Manual Required / ⚠️ Partial

### Tool Functionality Report
- **Working Tools**: {list of successful tools}
- **Failed Tools**: {list of any failures}
- **Performance Notes**: {any slow or fast operations}

### Workflow Integration
- **GTD Workflow Support**: Excellent / Good / Fair / Poor
- **Task Management**: Natural / Adequate / Cumbersome
- **Data Organization**: Intuitive / Functional / Confusing

### Issues & Recommendations
- **Critical Issues**: {any blocking problems}
- **Minor Issues**: {small problems or quirks}
- **Performance Issues**: {slow operations or timeouts}
- **UX Improvements**: {suggested enhancements}

### Cleanup Report
- **Test Items Created**: {approximate count}
- **Items Successfully Deleted**: {count or percentage}
- **Manual Cleanup Required**: Yes/No
- **Remaining Artifacts**: {describe any remaining test data}

---

## 🎯 Testing Complete!

You have successfully executed a comprehensive test of the OmniFocus MCP server while maintaining data hygiene through systematic cleanup procedures.

**Key Achievement**: Demonstrated the server can handle complex workflows while providing robust data management and cleanup capabilities essential for production use.

The unique tagging system ensures that testing doesn't pollute user data and provides a clear path for cleanup whether automated or manual. This approach makes the MCP server safe for repeated testing and validation cycles.