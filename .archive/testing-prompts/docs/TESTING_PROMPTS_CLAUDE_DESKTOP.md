# Claude Desktop Test Guide for OmniFocus MCP v2.2.0

**Copy and paste this entire message into Claude Desktop to begin comprehensive testing:**

---

# 🧪 OmniFocus MCP v2.2.0 Test Session

I need your help systematically testing the OmniFocus MCP server v2.2.0. Please execute this test plan step by step, reporting results and any issues you encounter.

## How to Use This Guide

**Important**: This guide uses natural language throughout. Just say these things to Claude Desktop - you don't need to know any technical syntax! Claude will handle all the technical details automatically, including converting dates like "tomorrow" or "next Friday" into the proper format.

## Example Conversation

Before starting the formal test plan, here's what natural interaction looks like:

**You say:** "What do I need to do today?"
**Claude responds:** Shows your tasks for today with details

**You say:** "Create a task called 'Call dentist' due tomorrow at 2pm with a note saying 'annual checkup'"
**Claude responds:** Task created successfully, shows task details

**You say:** "Show me all my overdue tasks"
**Claude responds:** Lists overdue tasks with how many days overdue

**You say:** "Mark that dentist task as complete"
**Claude responds:** Task marked complete

That's it! No technical syntax needed. Now let's test all the features...

---

## **Phase 1: Server Health Check**

Start by verifying the server is working:

1. **Ask:** "Check the OmniFocus server version and health status"
   - You should see version 2.2.0 and diagnostic information
   - Verify no errors are reported

## **Phase 2: Core Task Management**

Test the consolidated task management features:

### **Creating Tasks (This was broken in v1.x, fixed in v2.0.0!)**

2. **Ask:** "Create a task called 'v2.2.0 Test Task' with tags test and urgent, due tomorrow"
   - Task should be created successfully
   - Tags should be assigned in a single step (this is the big improvement!)
   - Due date should be set correctly

3. **Ask:** "Create a task called 'Quick test' in my inbox with a note saying 'This is a test note'"
   - Task should appear in inbox
   - Note should be attached

### **Querying Tasks**

4. **Ask:** "Show me what I need to do today"
   - Should list today's tasks

5. **Ask:** "Show me everything that's overdue"
   - Should list overdue tasks with days overdue count

6. **Ask:** "Show me what's coming up in the next week"
   - Should show upcoming tasks for next 7 days

7. **Ask:** "Show me all tasks I can work on right now"
   - Shows only available (not blocked) tasks

8. **Ask:** "Find all tasks with the word 'test' in them"
   - Should search and return matching tasks

### **Updating and Completing Tasks**

9. **Ask:** "Update the 'v2.2.0 Test Task' with a note saying 'Updated via v2.2.0 testing'"
   - Task should be updated with new note

10. **Ask:** "Mark the 'v2.2.0 Test Task' as complete"
    - Task should be marked complete
    - Should confirm completion

## **Phase 3: Project Management**

Test project operations:

11. **Ask:** "List my first 10 projects"
    - Should show project names and basic info

12. **Ask:** "Create a new project called 'Test Project v2.2.0'"
    - Project should be created
    - Should return project ID and details

13. **Ask:** "Show me statistics about all my projects"
    - Should show counts, completion rates, etc.

## **Phase 4: Tag Management & Performance**

Test the tag optimization improvements:

14. **Ask:** "Show me all tags that have active tasks"
    - Should list only tags currently in use
    - Should be fast (under 200ms typically)

15. **Ask:** "List all my tags"
    - Should show all tags in your system
    - Compare response time to previous query

## **Phase 5: Analytics & Insights**

Test productivity analytics:

16. **Ask:** "Show me my productivity stats for this week, including project breakdowns"
    - Should show completion counts, rates, etc.
    - Should include per-project statistics

17. **Ask:** "Analyze my task completion velocity over the last 7 days"
    - Should show trends by day
    - Should indicate if productivity is increasing/decreasing

18. **Ask:** "What's blocking me? Show me my overdue tasks grouped by project"
    - Should show overdue items organized by project
    - Helpful for identifying bottlenecks

## **Phase 6: Pattern Analysis (New in v2.1.0!)**

Test the new pattern detection features:

19. **Ask:** "Check my task list for duplicate tasks"
    - Should identify any tasks with similar names
    - Helps clean up your database

20. **Ask:** "Find projects that haven't had activity in the last 30 days"
    - Should identify dormant projects
    - Good for project reviews

## **Phase 7: GTD Workflow Features**

Test Getting Things Done specific tools:

21. **Ask:** "Which projects need to be reviewed in the next 30 days?"
    - Should list projects due for review
    - Helps maintain weekly review habit

22. **Ask:** "Show me all available perspectives"
    - Should list both built-in and custom perspectives

23. **Ask:** "Show me my Inbox perspective with up to 10 tasks"
    - Should query and display inbox items
    - Tests perspective integration

## **Phase 8: Export & Recurring Tasks**

24. **Ask:** "Export my incomplete tasks to JSON format, limited to 20 tasks"
    - Should provide JSON export
    - Useful for backups or analysis

25. **Ask:** "Analyze my recurring tasks and show which ones are active"
    - Should list recurring task patterns
    - Shows repeat rules

## **Phase 9: Performance & Caching**

Test performance optimizations:

26. **First ask:** "Show me what I need to do today"
    - Note the response time

27. **Immediately ask again:** "Show me what I need to do today"
    - Should be faster (cached)
    - Response should indicate it came from cache

28. **Ask:** "Show me today's tasks with minimal details"
    - Should be faster than full details
    - Tests query optimization

## **Phase 10: Error Handling**

Test graceful error handling:

29. **Ask:** "Create a task with an invalid operation"
    - Should return a clear, helpful error message
    - Should not crash

30. **Ask:** "Show me productivity stats for an invalid time period"
    - Should suggest valid options
    - Error should be user-friendly

## **Phase 11: MCP Prompts Testing**

Test the built-in prompt templates:

31. **In Claude Desktop, click the + button** and look for OmniFocus prompts:
    - `gtd_principles` - Should show V2 tool capabilities
    - `gtd_process_inbox` - Pure GTD methodology guidance
    - `eisenhower_matrix_inbox` - Priority-based inbox processing
    - `gtd_weekly_review` - Weekly review workflow
    - `quick_reference` - Should mention tag creation now works!

Try loading one or two and verify they work correctly.

---

## **Success Checklist**

After completing all phases, verify:

- [ ] Can create tasks naturally without knowing technical syntax
- [ ] Tags work during task creation (single step - this is huge!)
- [ ] All query types return appropriate results
- [ ] Tasks can be updated and completed easily
- [ ] Projects can be created and managed
- [ ] Analytics provide useful insights
- [ ] Pattern analysis helps identify issues
- [ ] Performance is good (< 1 second for most queries)
- [ ] Caching provides noticeable speed improvements
- [ ] Error messages are helpful, not cryptic
- [ ] All built-in prompts load and work correctly

## **What Success Looks Like**

You should be able to:
- **Talk naturally** - No need to know tool names or parameters
- **Get helpful responses** - Claude provides context and explanations
- **Work efficiently** - Fast responses, good caching
- **Understand errors** - When something goes wrong, you know why
- **Trust the system** - Tasks are created/updated reliably

## **If You Encounter Issues**

Please report:
1. **What you asked** - Exact phrasing
2. **What happened** - Error message or unexpected behavior
3. **Your database size** - Approximate number of tasks/projects
4. **Which phase** - Which test number from above

---

## **Why This Version is Better**

**v2.0.0 Major Improvements:**
- Tag creation during task creation (finally works!)
- Consolidated task management (one tool instead of many)
- Better error messages

**v2.1.0 New Features:**
- Pattern analysis (duplicates, dormant projects)
- Enhanced analytics
- Improved caching

**v2.2.0 Current Release:**
- Performance optimizations
- Better natural language support
- Enhanced documentation

---

## **After Testing**

Once you've completed this test session:

1. **Review the results** - Did everything work as expected?
2. **Note any issues** - Document anything that felt clunky or confusing
3. **Try real workflows** - Use the server for actual task management
4. **Provide feedback** - What would make this better?

---

**Ready to start? Begin with Phase 1 - checking server health!**
