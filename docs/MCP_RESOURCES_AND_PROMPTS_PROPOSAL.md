# MCP Resources and Prompts Proposal for OmniFocus

## MCP Resources (#06) - Direct Data Access

### Current Limitation (Tools Only)
```
User: "Show me my inbox tasks"
Claude: *calls list_tasks tool with inInbox: true*
Result: Tool execution overhead, JSON parsing, response formatting
```

### With Resources
```
User: "Show me my inbox tasks"
Claude: *directly reads omnifocus://tasks/inbox resource*
Result: Pre-cached, pre-formatted data, instant access
```

### Benefits:

1. **Performance**
   - Resources can be pre-computed and cached
   - No script execution overhead
   - Ideal for frequently accessed data (inbox, today's tasks, active projects)

2. **Natural URLs**
   - `omnifocus://projects/work/tasks` is more intuitive than tool parameters
   - Resources can be bookmarked or referenced
   - Better for exploratory browsing

3. **Real-time Updates**
   - Resources could support subscriptions/webhooks
   - Claude could monitor `omnifocus://tasks/overdue` and proactively alert

4. **Bulk Data Access**
   - Tools are action-oriented (create, update)
   - Resources are data-oriented (read, browse)
   - Better for reports and dashboards

## MCP Prompts (#07) - Guided GTD Workflows

### Current Limitation (Manual Steps)
```
User: "Help me do my weekly review"
Claude: "Let me help you with that. First, let's check your inbox..."
*Multiple manual tool calls and back-and-forth*
```

### With Prompts
```
User: "Run my weekly review"
Claude: *executes weekly_review prompt*
Result: Structured, consistent GTD workflow with all steps automated
```

### Benefits:

1. **GTD Best Practices Built-in**
   - Weekly Review: Inbox → Projects → Someday/Maybe → Calendar → Next Actions
   - Daily Planning: Time estimates, priority sorting, calendar blocking
   - Ensures nothing is missed

2. **Consistency**
   - Same review process every time
   - No forgotten steps
   - Builds good GTD habits

3. **Learning Tool**
   - New users learn GTD methodology through guided workflows
   - Prompts teach the "why" behind each step
   - Gradual expertise building

4. **Time Savings**
   - Weekly review in 5 minutes vs 30 minutes
   - Batch processing with smart defaults
   - Automated decision trees

## Real-World Use Cases

### Resources Enable:
- **Dashboard View**: "Show me my GTD dashboard" → Multiple resources loaded at once
- **Quick Checks**: "What's in my inbox?" → Instant resource read
- **Monitoring**: Claude watches overdue tasks resource and alerts when count > 10
- **Integration**: Other tools can consume resources via URLs

### Prompts Enable:
- **Morning Routine**: "Run my morning planning" → Reviews calendar, picks MITs, time blocks
- **Inbox Zero**: "Process my inbox" → Guides through 2-minute rule, delegate/defer decisions
- **Project Templates**: "Start a new project" → Natural planning model walkthrough
- **Emergency Triage**: "I'm overwhelmed" → Helps identify and reschedule commitments

## Implementation Priority

**Resources** might be higher priority because:
- Improves performance for all users immediately
- Reduces OmniFocus API calls (better for system resources)
- Enables new integration possibilities

**Prompts** might be higher priority because:
- Directly improves user productivity
- Teaches GTD methodology
- Creates "killer features" that differentiate this MCP server

## The Synergy

Resources + Prompts together enable:
```
Prompt: "weekly_review"
- Reads omnifocus://tasks/inbox resource
- Reads omnifocus://projects/active resource  
- Guides through processing
- Updates via tools
- Refreshes resources for next time
```

This combination would make the OmniFocus MCP server not just a task API, but a **GTD workflow engine** that actively helps users maintain their system.