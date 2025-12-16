# OmniFocus MCP Server - User Testing Validation

## 🎯 Purpose
Validate that recent improvements to the OmniFocus MCP server are working correctly and providing value to end users.

## 🚀 Quick Start - Immediate Testing

**Start testing right away with these critical scenarios:**

### 1. Project Assignment Fix Validation (CRITICAL)
**Goal**: Verify project assignment works correctly in task creation and updates

**Test Scenarios**:
1. **Task Creation with Project**
   ```json
   {
     "tool": "manage_task",
     "operation": "create",
     "name": "Test Task with Project",
     "projectId": "YOUR_PROJECT_ID_HERE"
   }
   ```
   - ✅ Task should be created in specified project (not inbox)
   - ✅ Response should show `"has_project": true`
   - ✅ Task should appear in project in OmniFocus

2. **Task Update with Project Change**
   ```json
   {
     "tool": "manage_task",
     "operation": "update",
     "taskId": "YOUR_TASK_ID_HERE",
     "projectId": "NEW_PROJECT_ID_HERE"
   }
   ```
   - ✅ Task should move to new project
   - ✅ Response should show `"has_project_change": true`
   - ✅ Task should appear in new project in OmniFocus

3. **Task Creation in Inbox (No Project)**
   ```json
   {
     "tool": "manage_task",
     "operation": "create",
     "name": "Inbox Task"
   }
   ```
   - ✅ Task should be created in inbox
   - ✅ Response should show `"has_project": false`
   - ✅ Task should appear in inbox in OmniFocus

4. **Move Task to Inbox**
   ```json
   {
     "tool": "manage_task",
     "operation": "update",
     "taskId": "YOUR_TASK_ID_HERE",
     "projectId": null
   }
   ```
   - ✅ Task should move to inbox
   - ✅ Response should show `"has_project_change": true`
   - ✅ Task should appear in inbox in OmniFocus

**Expected Results**:
- ✅ All project assignments work correctly
- ✅ Response metadata accurately reflects project operations
- ✅ Tasks appear in correct locations in OmniFocus
- ✅ No tasks silently dropped to inbox

### 2. Branded Types Integration
**Goal**: Verify type safety prevents runtime errors while maintaining backward compatibility

**Test Scenarios**:
1. **Task Operations**
   - Create task with string ID → should work (backward compatibility)
   - Create task with branded TaskId → should work (new feature)
   - Mix taskId and projectId → should fail at compile time (type safety)

2. **Project Operations**
   - Create project with string ID → should work
   - Create project with branded ProjectId → should work
   - Mix projectId and taskId → should fail at compile time

3. **Tag Operations**
   - Create tag with string ID → should work
   - Create tag with branded TagId → should work
   - Mix tagId and projectId → should fail at compile time

4. **Unified API**
   - Create task via unified API → should work
   - Create project via unified API → should work
   - Verify branded types in unified responses → should match input types

**Expected Results**:
- ✅ String IDs work (backward compatibility)
- ✅ Branded IDs work (new feature)
- ✅ Type mixing fails at compile time (type safety)
- ✅ No runtime errors or unexpected behavior

### 2. Circuit Breaker & Error Recovery
**Goal**: Verify resilience improvements handle OmniFocus issues gracefully

**Test Scenarios**:
1. **OmniFocus Not Running**
   - Start server, try operation → should fail gracefully
   - Check error message → should include recovery suggestions
   - Restart OmniFocus, retry → should succeed

2. **Transient Errors**
   - Simulate timeout error → should retry automatically
   - Check retry count → should be 1-2 retries
   - Verify exponential backoff → should have increasing delays

3. **Circuit Breaker Open**
   - Cause 3 consecutive failures → circuit should open
   - Try operation → should fail immediately with clear message
   - Wait for reset → should allow operations again

4. **Error Messages**
   - Permission error → should suggest granting permissions
   - Timeout error → should suggest reducing query scope
   - Connection error → should suggest checking OmniFocus status

**Expected Results**:
- ✅ Graceful error handling with clear messages
- ✅ Automatic retry for transient errors
- ✅ Circuit breaker prevents cascading failures
- ✅ Recovery suggestions help users resolve issues

### 3. Enhanced Error Responses
**Goal**: Verify error messages provide actionable guidance

**Test Scenarios**:
1. **Permission Errors**
   - Trigger permission error → should include recovery steps
   - Verify documentation links → should be relevant

2. **Timeout Errors**
   - Trigger timeout → should suggest query optimization
   - Verify technical details → should help debugging

3. **Connection Errors**
   - Trigger connection error → should suggest checking status
   - Verify support contact → should be included

4. **Circuit Breaker Errors**
   - Trigger circuit open → should explain what happened
   - Verify recovery suggestions → should help resolve

**Expected Results**:
- ✅ Clear, actionable error messages
- ✅ Relevant documentation links
- ✅ Technical details for debugging
- ✅ Support contact information

### 4. Real-World Usage
**Goal**: Validate improvements work in actual user workflows

**Test Scenarios**:
1. **Daily Workflow**
   - Create tasks with due dates → should work smoothly
   - Update task status → should be responsive
   - Review overdue tasks → should show correctly

2. **Project Management**
   - Create project with tasks → should work
   - Update project status → should work
   - Delete completed project → should work

3. **Tag Organization**
   - Create nested tags → should work
   - Assign tags to tasks → should work
   - Filter by tags → should work

4. **Error Recovery**
   - Simulate network issue → should recover gracefully
   - Check user experience → should be clear what happened

**Expected Results**:
- ✅ Smooth user experience
- ✅ Responsive operations
- ✅ Clear error recovery
- ✅ No data corruption

## ⚠️ IMPORTANT: Start Testing Immediately

**Do NOT wait for health checks or full test suite approval.**

The project assignment fix is CRITICAL for core GTD workflows. Please test these scenarios FIRST:

1. **Test Project Assignment** (see section 1 above)
2. **Verify Response Metadata** (check `has_project` values)
3. **Confirm OmniFocus Integration** (tasks appear in correct projects)

**If any project assignment tests fail, STOP and report immediately.**

## 📊 Validation Criteria

### Success Metrics
- ✅ **CRITICAL**: Project assignment works in task creation and updates
- ✅ Response metadata accurately reflects project operations
- ✅ All branded type operations work correctly
- ✅ Circuit breaker handles failures gracefully
- ✅ Error recovery provides actionable guidance
- ✅ Real-world workflows complete successfully
- ✅ No regression in existing functionality

### Failure Metrics
- ❌ **CRITICAL**: Tasks silently dropped to inbox instead of assigned projects
- ❌ Project assignment fails without clear error
- ❌ Runtime errors from type mixing
- ❌ Unclear error messages
- ❌ Poor error recovery
- ❌ Broken real-world workflows
- ❌ Data corruption or loss

## 🎯 Expected Outcomes

1. **Confidence**: Users feel confident in the system's reliability
2. **Productivity**: Users complete tasks efficiently without interruptions
3. **Satisfaction**: Users appreciate clear error messages and recovery
4. **Stability**: System handles edge cases and errors gracefully
5. **Quality**: Codebase maintains high standards and best practices
6. **Core GTD Workflow**: Project assignment works reliably for task organization

## 📄 Reporting Template

# OmniFocus MCP Server - User Testing Report

## Test Summary
- **Date**: [YYYY-MM-DD]
- **Version**: [x.y.z]
- **Tester**: [Name/Role]
- **Environment**: [macOS/Windows, OmniFocus version]

## Results

### 🔥 CRITICAL: Project Assignment Fix (Test First!)
- [ ] Task creation with projectId works
- [ ] Task update with projectId works  
- [ ] Response metadata shows correct has_project values
- [ ] Tasks appear in correct projects in OmniFocus
- [ ] No silent failures to inbox

### Branded Types
- [ ] String IDs work (backward compatibility)
- [ ] Branded IDs work (new feature)
- [ ] Type mixing fails at compile time
- [ ] No runtime errors

### Circuit Breaker
- [ ] Handles OmniFocus not running
- [ ] Retries transient errors
- [ ] Opens/closes circuit correctly
- [ ] Provides clear error messages

### Error Recovery
- [ ] Permission errors have recovery steps
- [ ] Timeout errors have suggestions
- [ ] Connection errors have guidance
- [ ] Circuit breaker errors explain clearly

### Real-World Usage
- [ ] Daily workflows complete
- [ ] Project management works
- [ ] Tag organization works
- [ ] Error recovery is smooth

## Issues Found

[Describe any issues, unexpected behavior, or suggestions]

## Recommendations

[Suggestions for improvements or future work]

## Overall Assessment

[Summary of testing experience and confidence level]
