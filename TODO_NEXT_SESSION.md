# TODO for Next Session

## Immediate Tasks

### 1. Project Review Settings (HIGH PRIORITY) ✅ COMPLETED
- [x] Add `reviewInterval` parameter to `create_project` tool
- [x] Add `reviewIntervalStep` for intervals like "every 2 weeks" (implemented as `steps`)
- [x] Add `nextReviewDate` parameter for initial review date
- [x] Update `update_project` to modify review settings
- [x] Test with actual OmniFocus to ensure JXA compatibility

### 2. ~~Fix RepetitionRule JXA Issue~~ ✅ SOLVED (2025-08-10)
- [x] Investigated workaround for RepetitionRule creation bug
- [x] Tried alternative approaches:
  - [x] Direct API access - Not available in JXA
  - [x] AppleScript bridge - Complex escaping issues
  - [x] Different property access methods - All failed
  - [x] **evaluateJavascript() bridge - SUCCESS!**
- [x] Documented solution in `/docs/JXA-LIMITATIONS.md`
- **RESULT**: Fully working via `app.evaluateJavascript()` bridge

### 3. ~~Task Recurrence Implementation~~ ✅ COMPLETED (2025-08-10)
- [x] Added `repeatRule` to schemas
- [x] Implemented via evaluateJavascript bridge
- [x] Full support for all recurrence patterns
- [x] Works for both tasks and projects
- [x] Documented solution and community action needed

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