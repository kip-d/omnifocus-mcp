# 🧪 OmniFocus MCP Server - Comprehensive LLM Assistant Testing Prompt

**Purpose**: Validate the complete user experience of the OmniFocus MCP server through systematic testing of all 15 consolidated tools and core workflows.

**Target Assistants**: Claude Desktop, ChatGPT with MCP support, or any LLM with OmniFocus MCP integration.

**Architecture**: v2.1.0 Consolidated Architecture - 15 streamlined tools (reduced from 22) for improved performance and consistency.

---

## 🎯 Testing Instructions for LLM Assistants

You are testing the OmniFocus MCP (Model Context Protocol) server integration. This server provides 15 consolidated tools for comprehensive OmniFocus task management and GTD (Getting Things Done) workflows.

**Current Status**: v2.1.0 Consolidated Architecture with 100% tool success rate - all 15 tools working reliably with operation-based routing.

## 🎯 Key Architecture Changes in v2.1.0

**Tool Consolidation Benefits**:
- **Reduced tool count**: From 22 tools to 15 consolidated tools (30% reduction)
- **Operation-based routing**: Tools like `manage_task` handle multiple operations (`create`, `update`, `complete`, `delete`) via `operation` parameter
- **Consistent parameter patterns**: Standardized parameter schemas across all tools
- **Improved performance**: Reduced context switching and more efficient tool loading
- **Better error handling**: Centralized error handling within each consolidated tool

**Key Consolidated Tools**:
- `manage_task`: Handles all task CRUD operations (create, update, complete, delete)
- `projects`: Manages all project operations (list, create, update, complete, delete, review, stats)
- `tags`: Comprehensive tag management (list, manage with actions: create, rename, delete, merge, nest)
- `folders`: Complete folder operations (list, create, update, delete, move, duplicate)
- `export`: Unified export functionality (tasks, projects, complete backups)
- `recurring_tasks`: Recurring task analysis (analyze patterns, statistics)
- Plus 9 specialized analytical tools (unchanged from v2.0)

### Pre-Test Setup Verification
First, verify the MCP connection is working:
1. Check that you have access to OmniFocus MCP tools
2. Run a simple system check to confirm connectivity
3. Verify OmniFocus is running and accessible on the system

---

## 🔧 Core Functionality Tests

### Test Group 1: Basic Task Operations (Consolidated Architecture)
**Objective**: Verify core task CRUD operations work correctly using the consolidated `manage_task` tool

1. **Create a test project**: Use `projects` tool with `operation: 'create'` to create "MCP Testing Project" 
2. **Add tasks with various properties using `manage_task` tool**:
   - Simple task: `manage_task(operation: 'create', name: 'Test basic task creation')`
   - Task with due date: `manage_task(operation: 'create', name: 'Task due tomorrow', dueDate: 'tomorrow at 5 PM')`
   - Task with defer date: `manage_task(operation: 'create', name: 'Deferred task', deferDate: 'next week')`
   - Flagged task: `manage_task(operation: 'create', name: 'Important flagged task', flagged: true)`
   - Task with time estimate: `manage_task(operation: 'create', name: '30-minute task', estimatedMinutes: 30)`
   - Task with tags: `manage_task(operation: 'create', name: 'Tagged task', tags: ['work', 'urgent'])`

3. **Query and verify using `tasks` tool**: 
   - Search for tasks containing "MCP": `tasks(mode: 'search', search: 'MCP')`
   - List today's tasks: `tasks(mode: 'today')`
   - Show flagged tasks: `tasks(mode: 'flagged')`
   - Query tasks by tags: `tasks(mode: 'all', tags: ['work', 'urgent'])`

4. **Update operations using `manage_task` tool**:
   - Mark one task as completed: `manage_task(operation: 'complete', taskId: 'task-id')`
   - Change due date: `manage_task(operation: 'update', taskId: 'task-id', dueDate: 'new-date')`
   - Update task name and notes: `manage_task(operation: 'update', taskId: 'task-id', name: 'new-name', note: 'new-note')`
   - Update tags: `manage_task(operation: 'update', taskId: 'task-id', tags: ['new-tags'])`

5. **Cleanup**: 
   - Delete test tasks: `manage_task(operation: 'delete', taskId: 'task-id')`
   - Delete test project: `projects(operation: 'delete', projectId: 'project-id')`

**Success Criteria**: All operations complete without errors, consolidated tools handle all CRUD operations properly, data persists correctly in OmniFocus

---

### Test Group 2: Advanced Task Management (Consolidated Architecture)
**Objective**: Test complex task relationships and filtering using consolidated tools

1. **Create hierarchical structure using `manage_task` tool**:
   - Parent task: `manage_task(operation: 'create', name: 'Website Redesign Project')`
   - Subtasks with parent relationship:
     - `manage_task(operation: 'create', name: 'Research competitors', parentTaskId: 'parent-id')`
     - `manage_task(operation: 'create', name: 'Create wireframes', parentTaskId: 'parent-id')`
     - `manage_task(operation: 'create', name: 'Implement design', parentTaskId: 'parent-id')`
   - Make subtasks sequential: `manage_task(operation: 'update', taskId: 'parent-id', sequential: true)`

2. **Test recurring tasks using `manage_task` tool**:
   - Create daily recurring task: `manage_task(operation: 'create', name: 'Daily standup', repeatRule: {unit: 'day', steps: 1, method: 'due-date'})`
   - Create weekly recurring task: `manage_task(operation: 'create', name: 'Weekly review', repeatRule: {unit: 'week', steps: 1, method: 'due-date', weekday: 'friday'})`
   - Analyze recurring patterns: `recurring_tasks(operation: 'analyze')` and `recurring_tasks(operation: 'patterns')`

3. **Test task relationships using `tasks` tool**:
   - Query available tasks: `tasks(mode: 'available')`
   - Query blocked tasks: `tasks(mode: 'blocked')`
   - Query upcoming tasks: `tasks(mode: 'upcoming', daysAhead: 7)`

4. **Advanced filtering using `tasks` tool**:
   - Tasks due in next 7 days: `tasks(mode: 'upcoming', daysAhead: 7)`
   - Overdue tasks analysis: `analyze_overdue(limit: 50, groupBy: 'project')`
   - Tasks by specific project: `tasks(mode: 'all', project: 'project-name')`

**Success Criteria**: Hierarchical relationships work with consolidated tools, recurring tasks created properly, advanced filtering and analytics provide expected results

---

### Test Group 3: Project & Folder Management (Consolidated Architecture)
**Objective**: Verify project organization and folder structure using consolidated tools

1. **Create folder structure using `folders` tool**:
   - Top-level folder: `folders(operation: 'create', name: 'MCP Test Area')`
   - Subfolder: `folders(operation: 'create', name: 'Active Projects', parentFolderId: 'parent-folder-id')`
   - Subfolder: `folders(operation: 'create', name: 'Someday/Maybe', parentFolderId: 'parent-folder-id')`

2. **Project operations using `projects` tool**:
   - Create projects in different folders: `projects(operation: 'create', name: 'Test Project', folderId: 'folder-id')`
   - Move projects between folders: `folders(operation: 'move', folderId: 'project-folder-id', parentFolderId: 'new-parent-id')`
   - Set project status: `projects(operation: 'update', projectId: 'id', status: 'on-hold')`
   - Add project notes and due dates: `projects(operation: 'update', projectId: 'id', note: 'notes', dueDate: '2024-12-31')`

3. **Project analysis using `projects` tool**:
   - List projects needing review: `projects(operation: 'review')`
   - Show project statistics: `projects(operation: 'stats')`
   - Query projects by status: `projects(operation: 'list', status: 'active')`
   - Query projects by folder: `projects(operation: 'list', folder: 'folder-name')`

**Success Criteria**: Folder hierarchy maintained through consolidated tools, project operations work correctly, status changes persist properly

---

### Test Group 4: Tag Management & Organization (Consolidated Architecture)
**Objective**: Test tag system and hierarchical tag relationships using consolidated `tags` tool

1. **Create tag hierarchy using `tags` tool**:
   - Parent tag: `tags(operation: 'manage', action: 'create', tagName: 'Contexts')`
   - Child tags nested under parent:
     - `tags(operation: 'manage', action: 'create', tagName: '@home', parentTagName: 'Contexts')`
     - `tags(operation: 'manage', action: 'create', tagName: '@office', parentTagName: 'Contexts')`
     - `tags(operation: 'manage', action: 'create', tagName: '@errands', parentTagName: 'Contexts')`
   - Another parent tag: `tags(operation: 'manage', action: 'create', tagName: 'Energy')`
   - Energy child tags:
     - `tags(operation: 'manage', action: 'create', tagName: '@high-energy', parentTagName: 'Energy')`
     - `tags(operation: 'manage', action: 'create', tagName: '@low-energy', parentTagName: 'Energy')`

2. **Tag operations using `tags` tool**:
   - Apply multiple tags to tasks: Use `manage_task(operation: 'update', taskId: 'id', tags: ['@home', '@high-energy'])`
   - Create nested relationships: `tags(operation: 'manage', action: 'nest', tagName: 'child-tag', parentTagName: 'parent-tag')`
   - Rename tags: `tags(operation: 'manage', action: 'rename', tagName: 'old-name', newName: 'new-name')`
   - Merge similar tags: `tags(operation: 'manage', action: 'merge', tagName: 'source-tag', targetTag: 'destination-tag')`

3. **Tag analysis using `tags` tool**:
   - List all tags with task counts: `tags(operation: 'list', includeTaskCounts: 'true', includeUsageStats: 'true')`
   - Show tag usage statistics: `tags(operation: 'list', includeUsageStats: 'true')`
   - Find unused tags: `tags(operation: 'list', includeEmpty: 'true')`
   - Get only active tags: `tags(operation: 'active')`

**Success Criteria**: Tag hierarchy works through consolidated tool, bulk operations succeed, statistics are accurate and comprehensive

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

### Test Group 7: Data Import/Export (Consolidated Architecture)
**Objective**: Verify data portability and backup capabilities using consolidated `export` tool

1. **Export operations using `export` tool**:
   - Export all tasks to JSON: `export(type: 'tasks', format: 'json')`
   - Export specific project tasks to CSV: `export(type: 'tasks', format: 'csv', filter: {project: 'project-name'})`
   - Export project list with statistics: `export(type: 'projects', format: 'json', includeStats: true)`
   - Create complete database backup: `export(type: 'all', format: 'json', outputDirectory: '/path/to/backup')`

2. **Export filtering using `export` tool**:
   - Export only active tasks: `export(type: 'tasks', format: 'json', filter: {completed: false})`
   - Export tasks with specific tags: `export(type: 'tasks', format: 'csv', filter: {tags: ['work', 'urgent']})`
   - Export completed tasks: `export(type: 'tasks', format: 'json', includeCompleted: true, filter: {completed: true})`
   - Export with custom field selection: `export(type: 'tasks', format: 'csv', fields: ['name', 'project', 'dueDate', 'tags'])`

3. **Verify export data**:
   - Check file formats are valid JSON/CSV
   - Verify data completeness matches filters
   - Confirm field accuracy against source data

**Success Criteria**: Consolidated export tool handles all formats and filtering correctly, data integrity maintained, formats are valid

---

### Test Group 8: Perspectives & Custom Views (Consolidated Architecture)
**Objective**: Test perspective management and custom filtering using consolidated `perspectives` tool

1. **Perspective operations using `perspectives` tool**:
   - List all available perspectives: `perspectives(operation: 'list', includeFilterRules: 'true')`
   - Query tasks from built-in perspectives: 
     - Today perspective: `perspectives(operation: 'query', perspectiveName: 'Today')`
     - Flagged perspective: `perspectives(operation: 'query', perspectiveName: 'Flagged')`
     - Available perspective: `perspectives(operation: 'query', perspectiveName: 'Available')`
   - Query custom perspectives: `perspectives(operation: 'query', perspectiveName: 'custom-perspective-name')`

2. **Perspective analysis using `perspectives` tool**:
   - Compare results between perspectives: Query multiple perspectives and compare task lists
   - Verify perspective filters work correctly: Check that perspective results match expected criteria
   - Test detailed perspective queries: `perspectives(operation: 'query', perspectiveName: 'Today', includeDetails: 'true', limit: '25')`

**Success Criteria**: Consolidated perspectives tool provides access to all perspectives, filtering works correctly, results match expectations and perspective definitions

---

## 🎯 Workflow Integration Tests

### GTD Weekly Review Simulation (Consolidated Architecture)
**Objective**: Test complete GTD weekly review workflow using consolidated tools

1. **Review preparation using consolidated tools**:
   - Get projects needing review: `projects(operation: 'review')`
   - Mark projects as reviewed: `manage_reviews()` (consolidated review management)
   - Update project status and notes: `projects(operation: 'update', projectId: 'id', status: 'active', note: 'updated-notes')`

2. **System maintenance using consolidated tools**:
   - Process inbox items: `tasks(mode: 'all', project: 'Inbox')`
   - Update project due dates: `projects(operation: 'update', projectId: 'id', dueDate: 'new-date')`
   - Clean up completed items: `manage_task(operation: 'complete', taskId: 'id')` and `projects(operation: 'complete', projectId: 'id')`
   - Review and update context tags: `tags(operation: 'list', includeUsageStats: 'true')` and `tags(operation: 'manage', action: 'rename', ...)`

3. **Planning activities using consolidated tools**:
   - Identify next actions for each project: `tasks(mode: 'available')` and `analyze_patterns(patterns: ['next_actions'])`
   - Set priorities using flags: `manage_task(operation: 'update', taskId: 'id', flagged: true)`
   - Schedule upcoming tasks: `manage_task(operation: 'update', taskId: 'id', dueDate: 'scheduled-date')`

**Success Criteria**: Complete review workflow possible using consolidated tools, all operations integrate smoothly, workflow feels natural

### Real-world Task Processing (Consolidated Architecture)
**Objective**: Simulate realistic daily task management using consolidated tools

1. **Morning planning using consolidated tools**:
   - Review today's tasks: `tasks(mode: 'today')` and `perspectives(operation: 'query', perspectiveName: 'Today')`
   - Check flagged items: `tasks(mode: 'flagged')`
   - Identify available actions: `tasks(mode: 'available')` filtered by context tags

2. **Task execution using consolidated tools**:
   - Mark tasks complete: `manage_task(operation: 'complete', taskId: 'id')`
   - Add notes: `manage_task(operation: 'update', taskId: 'id', note: 'progress-notes')`
   - Create follow-up tasks: `manage_task(operation: 'create', name: 'follow-up-task', parentTaskId: 'completed-task-id')`

3. **End-of-day review using consolidated tools**:
   - Process completed items: Review completed tasks from `tasks(mode: 'all', completed: true, limit: 25)`
   - Defer incomplete tasks: `manage_task(operation: 'update', taskId: 'id', deferDate: 'tomorrow')`
   - Plan tomorrow's priorities: `manage_task(operation: 'update', taskId: 'id', flagged: true, dueDate: 'tomorrow')`

**Success Criteria**: Natural workflow feels intuitive using consolidated tools, operations are efficient, tool consolidation improves rather than hinders user experience

---

## 🚨 Error Handling & Edge Cases

### Test Group 9: Error Conditions (Consolidated Architecture)
**Objective**: Verify graceful handling of error conditions in consolidated tools

1. **Invalid data tests using consolidated tools**:
   - Try invalid date formats: `manage_task(operation: 'create', name: 'test', dueDate: 'invalid-date')`
   - Attempt operations on non-existent items:
     - `manage_task(operation: 'update', taskId: 'non-existent-id', name: 'test')`
     - `projects(operation: 'delete', projectId: 'non-existent-id')`
   - Test with empty or malformed parameters:
     - `manage_task(operation: 'create')` (missing required name)
     - `tasks(mode: 'invalid-mode')`

2. **Boundary conditions with consolidated tools**:
   - Very long task names: `manage_task(operation: 'create', name: 'very-long-name-string...')`
   - Large query limits: `tasks(mode: 'all', limit: 10000)`
   - Complex tag hierarchies: Create deep nested tag structures with `tags` tool

3. **Recovery scenarios for consolidated tools**:
   - Verify error messages are helpful and specify which operation failed
   - Confirm system remains stable after errors (tool still responds to subsequent requests)
   - Test data consistency after failed operations (partial updates don't corrupt data)
   - Verify consolidated tools maintain state properly after errors

**Success Criteria**: Consolidated tools handle errors gracefully, helpful error messages specify operation context, no data corruption, system stability maintained

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

- [ ] **All 15 consolidated tools accessible and functional**
- [ ] **Operation-based routing works correctly for consolidated tools**
- [ ] **No hanging processes or timeouts**
- [ ] **Data persists correctly in OmniFocus**
- [ ] **Error handling is robust across all operations**
- [ ] **Performance is acceptable (improved with consolidation)**
- [ ] **Analytics provide meaningful insights**
- [ ] **Export functionality works correctly with unified tool**
- [ ] **Complex workflows are supported through consolidated tools**
- [ ] **Integration feels natural for GTD users despite consolidation**
- [ ] **Documentation matches actual consolidated behavior**
- [ ] **Tool consolidation provides performance benefits without usability loss**

---

## 📝 Test Reporting

When reporting results, please include:

1. **Overall Assessment**: Does the v2.1.0 consolidated MCP server provide a complete OmniFocus experience?
2. **Tool Coverage**: Which of the 15 consolidated tools worked correctly? How well does operation-based routing function?
3. **Workflow Support**: How well do consolidated tools support GTD and productivity workflows?
4. **Performance Notes**: Any performance improvements or concerns with the consolidated architecture?
5. **User Experience**: Is the consolidated tool integration intuitive? Does operation-based routing feel natural?
6. **Consolidation Impact**: Does tool consolidation improve or hinder the user experience?
7. **Issues Found**: Any bugs, errors, or unexpected behaviors in consolidated tools?
8. **Architecture Assessment**: How well does the v2.1.0 consolidation achieve its goals?
9. **Recommendations**: Suggested improvements or optimizations for consolidated tools

---

## 🎯 Success Criteria Summary

**Minimum Acceptable Result**: 
- All basic CRUD operations work through consolidated tools (manage_task, projects, etc.)
- Operation-based routing functions correctly
- No system crashes or hanging processes
- Data integrity maintained throughout testing

**Excellent Result**:
- All 15 consolidated tools work flawlessly with operation-based routing
- Tool consolidation provides performance benefits without usability loss
- Analytics provide valuable insights through specialized tools
- Complex workflows feel natural despite architectural changes
- Performance is consistently good (improved with consolidation)
- Error handling is robust and helpful across all operations
- Operation parameters are intuitive and well-documented

**v2.1.0 Architecture Success**:
- 30% tool reduction (22→15) achieved without functionality loss
- Operation-based routing provides cleaner, more consistent interface
- Consolidated tools maintain feature completeness
- Performance improvements are measurable
- User experience is maintained or improved despite consolidation

**Testing Complete**: You've successfully validated the v2.1.0 consolidated OmniFocus MCP server provides a comprehensive, reliable, and user-friendly experience for GTD and task management workflows while achieving significant architectural improvements.