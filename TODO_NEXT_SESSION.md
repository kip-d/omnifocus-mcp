# TODO for Next Session

## Immediate Tasks

### 1. Project Review Settings (HIGH PRIORITY)
- [ ] Add `reviewInterval` parameter to `create_project` tool
- [ ] Add `reviewIntervalStep` for intervals like "every 2 weeks"
- [ ] Add `nextReviewDate` parameter for initial review date
- [ ] Update `update_project` to modify review settings
- [ ] Test with actual OmniFocus to ensure JXA compatibility

### 2. Fix RepetitionRule JXA Issue
- [ ] Investigate workaround for RepetitionRule creation bug (create-project.ts:96)
- [ ] Try alternative approaches:
  - Create task/project first, then add recurrence
  - Use AppleScript bridge instead of JXA
  - Find different property access method
- [ ] Document solution or limitations

### 3. Task Recurrence Implementation
- [ ] Add `repetitionRule` to `create_task` schema
- [ ] Support frequency types: daily, weekly, monthly, yearly
- [ ] Support repetition methods: fixed, start-after-completion, due-after-completion
- [ ] Add to `update_task` for modifying recurrence
- [ ] Create comprehensive tests

## Nice-to-Have Tasks

### 4. Batch Operations
- [ ] Design `batch_create_tasks` schema
- [ ] Implement atomic transaction behavior
- [ ] Add progress reporting if possible
- [ ] Create project template system

### 5. Perspectives Access
- [ ] Research OmniFocus perspective API access
- [ ] Implement `list_perspectives` tool
- [ ] Implement `query_perspective` tool
- [ ] Add caching for perspective queries

### 6. Enhance MCP Prompts
- [ ] Add project template prompt
- [ ] Add Eisenhower matrix prompt
- [ ] Add focus session prompt (Pomodoro-style)
- [ ] Consider prompt chaining for complex workflows

## Testing Checklist
- [ ] All new features have unit tests
- [ ] Integration tests pass with real OmniFocus
- [ ] MCP protocol tests validate new tools
- [ ] Claude Desktop UI tested for new prompts
- [ ] Performance benchmarked for new features

## Documentation Updates Needed
- [ ] Update FEATURE_ROADMAP.md with completed items
- [ ] Add recurrence examples to README
- [ ] Document review settings in detail
- [ ] Create troubleshooting guide for RepetitionRule

## Code Quality
- [ ] Remove or fix TODO comments in codebase
- [ ] Consider refactoring large script files further
- [ ] Add more type safety to JXA script generation
- [ ] Improve error messages for common failures

---

*Created: 2025-08-09*
*For: Next development session*
*Priority: Focus on Project Review Settings first*