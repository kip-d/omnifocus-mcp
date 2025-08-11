# TODO for Next Session

## Immediate Tasks

### ~~1. Fix query_perspective Integration Issues~~ ✅ COMPLETED v1.11.1
- [x] Debug why query_perspective times out in integration tests
- [x] Ensure proper error handling for non-existent perspectives
- [x] Test with various perspective types (built-in vs custom)
- [x] Add fallback for perspectives without accessible filter rules
- [x] Standardized response format from `data.items` to `data.tasks`

### ~~2. Code Consistency Refactoring~~ ✅ COMPLETED v1.11.2
- [x] Refactored all analytics tools for standardized responses
- [x] Refactored all export tools for consistent structure
- [x] Created comprehensive unit tests for response format consistency
- [x] Created ESLint configuration and custom rules for pattern enforcement
- [x] Fixed all 260 tests to pass with new standardized format
- [x] Created CODING_STANDARDS.md documentation

### ~~3. OmniFocus Task Creation for Template Research~~ ✅ COMPLETED
- [x] Created 8 tasks with research links for project templates
- [x] Tasks added to user's OmniFocus for personal review

### 4. Implement Project Template Prompts
- [ ] Create `project_template` prompt using research from PROJECT_TEMPLATE_RESEARCH.md
- [ ] Support templates: Client Project, Product Launch, Event Planning, etc.
- [ ] Add parameter system for customizing templates
- [ ] Test template creation with real OmniFocus data

### 5. Enhance Perspective Tools
- [ ] Add perspective statistics (task counts per perspective)
- [ ] Implement better filter rule translation for complex perspectives
- [ ] Add support for perspective grouping/sorting preferences
- [ ] Create prompt that uses perspectives for workflow guidance

## Nice-to-Have Tasks

### 6. Focus Session/Pomodoro Prompt
- [ ] Design focus session prompt for time-boxed work
- [ ] Integrate with task selection from perspectives
- [ ] Add timer/reminder functionality suggestions
- [ ] Create break management recommendations

### 7. Improve Error Messages
- [ ] Review all error messages for clarity
- [ ] Add recovery suggestions for common failures
- [ ] Improve JXA error translation
- [ ] Add user-friendly explanations for API limitations

### 8. Performance Optimizations
- [ ] Profile perspective query performance
- [ ] Consider parallel perspective queries
- [ ] Optimize filter rule translation
- [ ] Add perspective query result caching strategy

### 9. Enhanced MCP Prompts
- [ ] Perspective-based weekly review
- [ ] Project breakdown assistant using perspectives
- [ ] Daily planning with Today perspective integration
- [ ] Context-based task batching prompt

## Testing & Quality

### 10. Comprehensive Testing
- [ ] Fix query_perspective integration test timeout
- [ ] Add more perspective tool unit tests
- [ ] Test with large perspective counts (50+)
- [ ] Verify caching behavior for perspectives

### 11. Documentation Updates
- [ ] Add perspective tools examples to README
- [ ] Create troubleshooting guide for perspective access
- [ ] Document filter rule translation patterns
- [ ] Add perspective-based workflow guides

## Known Issues to Address

### From This Session
1. **query_perspective timeouts** - Integration tests fail but direct scripts work
2. **Some perspective filter rules return "not found"** - Need investigation
3. **Claude Code status line** - Verify context percentage is displaying correctly

### Ongoing Technical Debt
1. **Tag assignment during creation** - Still requires update after create
2. **Complex date queries** - Limited by whose() clause restrictions
3. **Transaction support** - No native atomic operations

## Code Quality Improvements

### ~~12. Cleanup Tasks~~ ✅ VERIFIED NOT NEEDED
- [x] ~~Remove test files from root directory~~ - No test files found in root
- [x] ~~Organize test files into proper test directories~~ - Already properly organized
- [ ] Review and remove unnecessary debug logs
- [ ] Consolidate perspective test scripts

### 13. Type Safety
- [ ] Add better typing for perspective filter rules
- [ ] Create interfaces for perspective responses
- [ ] Type the evaluateJavascript bridge responses
- [ ] Improve error type definitions

## Future Features (Lower Priority)

### 14. Advanced Perspective Features
- [ ] Perspective switching via URL schemes
- [ ] Custom perspective creation from MCP
- [ ] Perspective-based reporting
- [ ] Perspective usage analytics

### 15. Workflow Automation
- [ ] Template instantiation with variable substitution
- [ ] Bulk project creation from templates
- [ ] Automated review scheduling based on perspective content
- [ ] Smart task distribution across perspectives

## Research Items

### 16. Investigate Further
- [ ] Can we access perspective window settings?
- [ ] Is perspective sidebar state accessible?
- [ ] Can we determine currently active perspective?
- [ ] Explore Window object in Omni Automation

## Success Metrics for This Session ✅

✅ query_perspective working in all test scenarios (v1.11.1)
✅ Code consistency refactoring complete (v1.11.2)
✅ All 260 tests passing
✅ ESLint enforcement in place
✅ OmniFocus tasks created for template research

## Success Metrics for Next Session

⬜ At least one project template prompt implemented
⬜ Improve error messages with recovery suggestions
⬜ Documentation updated with perspective examples
⬜ Performance profiling of perspective queries

---

*Updated: 2025-08-11*
*For: Next development session*
*Priority: Implement project templates, improve error messages*
*Note: Fresh session with refactored, consistent codebase!*