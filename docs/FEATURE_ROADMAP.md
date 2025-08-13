# Feature Roadmap

This document tracks feature requests from user testing and planned improvements.

## Completed Features ✅

### v1.10.0 (2025-08-10)
- [x] **Task Recurrence** - Full implementation via evaluateJavascript() bridge
  - All recurrence patterns supported (daily, weekly, monthly, yearly)
  - Complex patterns like "2nd Tuesday of month" working
  - Both fixed and after-completion methods
  - Defer-another functionality for quarterly reviews
- [x] **Project Recurrence** - Same implementation as tasks
  - Recurring projects now fully functional
  - Review intervals maintained on recurrence

### v1.9.1 (2025-08-09)
- [x] **Relative Date Support** - "tomorrow", "next Monday", "in 3 days"
- [x] **Enhanced Timezone Handling** - Multiple fallback strategies
- [x] **MCP Prompts UI Fix** - Descriptions no longer truncated in Claude Desktop

### v1.9.0 (2025-08-09)
- [x] **Project Review Settings** - Full implementation
  - reviewInterval with unit/steps/fixed parameters
  - nextReviewDate and lastReviewDate support
  - Review management tools consolidated
- [x] **Daily-First Optimizations** - Reduced default limits for faster response

### v1.8.0
- [x] Sequential/parallel support for projects
- [x] Sequential/parallel support for tasks (action groups)
- [x] Parent/child task relationships (create subtasks via parentTaskId)

### Perspectives Access
- [x] `list_perspectives` - Enumerate available perspectives ([TypeScript](../src/tools/perspectives/ListPerspectivesTool.ts))
- [x] `query_perspective` - Get tasks visible in a specific perspective ([TypeScript](../src/tools/perspectives/QueryPerspectiveTool.ts))

## Nice-to-Have Features 🟡

### Batch Operations
- [ ] `batch_create_tasks` - Create multiple tasks in one call
- [ ] `batch_update_tasks` - Update multiple tasks
- [ ] Atomic transactions (all succeed or all fail)
- **Use case**: Project templates, bulk imports

### Parent/Child Task Relationships
- [x] Support creating tasks as subtasks via parentTaskId
- [x] Maintain sequential/parallel settings on parent tasks
- [ ] Support moving existing tasks to become subtasks (update_task)
- [ ] Batch create tasks with subtasks in one call
- **Status**: Basic functionality implemented!

### Tag Management Improvements
- [ ] `create_tag` - Already exists as `manage_tags`
- [ ] Hierarchical tag creation
- [ ] Batch tag operations
- **Status**: Tag listing works well, assignment has limitations

## Workflow-Specific Features 🟢

### Elo Ranking Integration
- [ ] Custom metadata storage (for Elo scores)
- [ ] Bulk update optimization
- [ ] Sorting/filtering by custom fields
- **Challenge**: OmniFocus doesn't natively support custom fields

### GTD Workflow Enhancements
- [ ] Project template system
- [ ] Automated weekly review setup
- [ ] Inbox processing helpers
- [ ] Natural language date parsing

## Technical Improvements 🔧

### Performance
- [ ] Streaming responses for large datasets
- [ ] Incremental sync capabilities
- [ ] WebSocket support for real-time updates

### Developer Experience
- [ ] TypeScript types for all responses
- [ ] Better error messages with recovery suggestions
- [ ] Comprehensive integration test suite

## Known Limitations 📋

### JXA API Constraints
- Tag assignment during task creation
- Direct database access not possible
- Some property updates require workarounds
- No custom metadata fields

### MCP Protocol Limitations
- No progress indicators
- Request/response only (no streaming)
- No real-time notifications

## User Feedback Notes

- "MCP bridge has been really stable and fast"
- "Caching strategy seems well-implemented"
- Sequential/parallel is "most immediately useful"
- Batch operations would "make project setup much faster"

---

*Last updated: 2025-08-10*
*Based on user testing feedback and developer analysis*
