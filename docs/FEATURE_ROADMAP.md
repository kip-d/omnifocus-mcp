# Feature Roadmap

This document tracks feature requests from user testing and planned improvements.

## Completed Features ✅

### v1.8.0 (Current Development)
- [x] Sequential/parallel support for projects
- [x] Sequential/parallel support for tasks (action groups)
- [x] Parent/child task relationships (create subtasks via parentTaskId)

## High Priority Features 🔴

### Project Review Settings
- [ ] Add `reviewInterval` parameter to `create_project`
  - Support units: daily, weekly, monthly, quarterly, yearly
  - Support step count (e.g., every 2 weeks)
- [ ] Add `reviewInterval` to `update_project`
- [ ] Add `nextReviewDate` parameter for initial review date
- **Status**: Partially implemented (read-only in list_projects)

### Task Recurrence Settings
- [ ] Add `repetitionRule` parameter to `create_task`
  - Support frequency types: daily, weekly, monthly, yearly
  - Support interval (every N days/weeks/etc)
  - Support specific days (e.g., every Monday, Wednesday, Friday)
- [ ] Add `repetitionMethod` (fixed, start-after-completion, due-after-completion)
- [ ] Update `update_task` to modify recurrence
- **Status**: Analysis exists in list_tasks, but no creation support

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

### Perspectives Access
- [ ] `list_perspectives` - Get available perspectives
- [ ] `query_perspective` - Get tasks from a specific perspective
- **Use case**: Access built-in views like "Due Soon", "Flagged"

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

*Last updated: 2025-08-07*
*Based on user testing feedback and developer analysis*