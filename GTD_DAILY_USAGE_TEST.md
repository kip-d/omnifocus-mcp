# 📋 OmniFocus MCP - GTD Daily Usage Testing

**Purpose**: Validate core daily GTD workflows using the OmniFocus MCP server through realistic task management scenarios.

**Target**: LLM assistants (Claude Desktop, ChatGPT with MCP) using the OmniFocus MCP integration for regular productivity workflows.

---

## 🎯 Test Setup & Database Safety

### Pre-Test Setup
1. **Connection check**: Run `system` tool with operation "diagnostics" - should confirm OmniFocus connectivity
2. **Tool availability**: Verify you can access the core tools: `tasks`, `manage_task`, `projects`, and `tags`

### 🔒 Critical: Database Safety Protocol
**All test data MUST be tagged for easy cleanup!**

1. **Create test project**: Use `projects` tool with operation "create" to make "MCP Daily Test [current-timestamp]"
2. **Create cleanup tag**: Use `tags` tool with operation "manage", action "create" to make "@mcp-test-[YYYY-MM-DD]" (e.g., "@mcp-test-2025-09-18")
3. **Record your test identifiers** for cleanup:
   - Test project name: ________________
   - Test tag: ________________

⚠️ **IMPORTANT**: Every task created during this test MUST include the test tag for cleanup purposes.

---

## 🌅 Daily GTD Workflow Tests

### Morning Planning (5 minutes)
**Simulate starting your day with OmniFocus**

1. **Today's dashboard**: Use `tasks` tool with `mode="today"` to see what's on your plate
2. **Flag review**: Check `mode="flagged"` for your most important items
3. **Available actions**: Query `mode="available"` to see what you can actually work on (not blocked/deferred)

**Success criteria**: Get a clear picture of today's work in under 3 tool calls

### Task Capture & Processing (10 minutes)
**Test the core "capture everything" GTD principle**

1. **Quick capture**: Create 3-4 tasks using `manage_task` with operation "create" (⚠️ **ALL must include your test tag**):
   - "Call dentist about appointment" (assign to test project, tags: [@mcp-test-YYYY-MM-DD])
   - "Review Q4 budget proposals" (assign to test project, tags: [@mcp-test-YYYY-MM-DD])
   - "Buy birthday gift for Sarah" (assign to test project, due this weekend, tags: [@errands, @mcp-test-YYYY-MM-DD])
   - "Research vacation destinations" (assign to test project, defer until next week, tags: [@mcp-test-YYYY-MM-DD])

2. **Smart defaults**: Verify the MCP handles common GTD patterns:
   - Tasks without projects go to Inbox
   - Due dates default to sensible times (5 PM for deadlines)
   - Defer dates default to morning times (8 AM for start dates)

3. **Context tagging**: Apply relevant tags (@calls, @computer, @errands) and verify they stick

**Success criteria**: Natural task creation that follows GTD best practices

### Task Execution & Updates (10 minutes)
**Simulate working through your task list**

1. **Progress tracking**: Pick a task and update it with operation "update":
   - Add notes about progress made
   - Adjust due date if needed
   - Mark as completed when done

2. **Dynamic planning**: Create a follow-up task based on completed work (⚠️ **must include test tag**)

3. **Context switching**: Use tags to find all @calls tasks, then all @errands tasks

**Success criteria**: Fluid task management that adapts to changing priorities

### Project Maintenance (5 minutes)
**Keep projects moving forward**

1. **Project pulse**: Use `projects` tool to check project status
2. **Next actions**: Verify each active project has clear next steps
3. **Weekly review prep**: Look for projects that might need review

**Success criteria**: Easy project oversight without deep diving

---

## 🔍 Core GTD Principles Validation

### Capture Everything
- [ ] Can quickly create tasks without friction
- [ ] Inbox is properly used for unprocessed items
- [ ] Natural language dates work intuitively

### Clarify & Organize
- [ ] Context tags are easy to apply and query
- [ ] Projects vs. single tasks are clear
- [ ] Due vs. defer dates work as expected

### Reflect & Review
- [ ] Today's view shows relevant, actionable items
- [ ] Flagged items highlight true priorities
- [ ] Available actions filter out blocked work

### Engage with Confidence
- [ ] Context-based task lists (@calls, @computer, @errands)
- [ ] Quick task completion and updates
- [ ] Natural workflow without system friction

---

## 📊 Essential Analytics (5 minutes)

1. **Productivity pulse**: Run `productivity_stats` with period "7" (last week)
2. **Bottleneck check**: Use `analyze_overdue` to catch workflow issues
3. **Velocity insight**: Quick `task_velocity` check with days "14"

**Success criteria**: Useful insights without analysis paralysis

---

## ⚡ Common Daily Scenarios

### Scenario 1: Meeting Follow-ups
1. Create tasks from meeting: "Send proposal to client", "Schedule follow-up call" (⚠️ **include test tag**)
2. Add relevant project assignments and due dates
3. Tag with appropriate contexts + test tag

### Scenario 2: Email Processing
1. Create task: "Respond to Sarah's project update" (⚠️ **include test tag**)
2. Defer until tomorrow morning
3. Tag @computer and assign to test project

### Scenario 3: Urgent Request
1. Create high-priority task with flag (⚠️ **include test tag**)
2. Set realistic due date
3. Verify it appears in today's view and flagged view

### Scenario 4: Week-end Planning
1. Check what's due "next week" using `tasks` with `dueBy` parameter
2. Review flagged items for priority setting
3. Defer weekend tasks to Monday (⚠️ **only test tasks with your test tag**)

---

## ✅ Daily Success Checklist

After 30 minutes of testing, you should be able to:

- [ ] **Capture** new tasks effortlessly
- [ ] **Organize** with appropriate projects, contexts, and dates
- [ ] **Review** today's work and priorities clearly
- [ ] **Update** tasks as you work through them
- [ ] **Find** the right tasks for your current context
- [ ] **Trust** the system to show you what matters now

---

## 🎯 Expected Experience

**Great GTD integration should feel like:**
- Natural conversation about your tasks and projects
- No need to remember syntax or parameters
- Smart defaults that align with GTD principles
- Quick access to the information you need right now
- Confidence that nothing important is hidden

**Red flags:**
- Multiple steps needed for simple task creation
- Confusing date/time handling
- Tasks disappearing or appearing in wrong views
- Slow responses that break your flow
- Error messages during basic operations

---

## 📝 Quick Report Template

**Overall GTD Readiness**: [Excellent/Good/Fair/Poor]

**Strongest features**:
- What felt most natural and helpful?

**Friction points**:
- Where did the workflow feel clunky?

**Deal breakers**:
- Any issues that would prevent daily use?

**Recommendation**:
- Ready for daily GTD use? Any caveats?

---

---

## 🧹 MANDATORY: Test Data Cleanup

**⚠️ DO NOT SKIP THIS SECTION ⚠️**

After completing the test, you MUST clean up all test data to restore the database to its original state:

### Step 1: Remove All Test Tasks
1. Use `tasks` tool with `mode="all"`, `tags=["@mcp-test-YYYY-MM-DD"]` to find all test tasks
2. For each task found, use `manage_task` with `operation="delete"` and the task ID
3. Verify cleanup: Re-run the tag query to confirm no tasks remain

### Step 2: Remove Test Project
1. Use `projects` tool with `operation="delete"` and your test project ID
2. Verify: Use `projects` with `operation="list"` to confirm project is gone

### Step 3: Remove Test Tag
1. Use `tags` tool with `operation="manage"`, `action="delete"`, `tagName="@mcp-test-YYYY-MM-DD"`
2. Verify: Use `tags` with `operation="list"` to confirm tag is removed

### Step 4: Final Verification
1. Run `tasks` with `mode="all"` and search for any remaining test artifacts
2. Check that your OmniFocus database looks exactly as it did before testing

**Test is NOT complete until cleanup is verified successful.**

---

*Testing time: ~30 minutes test + 5 minutes cleanup*
*Focus: Real-world usability with zero database impact*