# TODO for Next Session

## Immediate Tasks

### ~~1. Fix query_perspective Integration Issues~~ ✅ COMPLETED
- [x] Debug why query_perspective times out in integration tests
- [x] Ensure proper error handling for non-existent perspectives
- [x] Test with various perspective types (built-in vs custom)
- [x] Add fallback for perspectives without accessible filter rules
- [x] Standardized response format from `data.items` to `data.tasks`

### 2. Implement Project Template Prompts
- [ ] Create `project_template` prompt using research from PROJECT_TEMPLATE_RESEARCH.md
- [ ] Support templates: Client Project, Product Launch, Event Planning, etc.
- [ ] Add parameter system for customizing templates
- [ ] Test template creation with real OmniFocus data

### 3. Enhance Perspective Tools
- [ ] Add perspective statistics (task counts per perspective)
- [ ] Implement better filter rule translation for complex perspectives
- [ ] Add support for perspective grouping/sorting preferences
- [ ] Create prompt that uses perspectives for workflow guidance

## Nice-to-Have Tasks

### 4. Focus Session/Pomodoro Prompt
- [ ] Design focus session prompt for time-boxed work
- [ ] Integrate with task selection from perspectives
- [ ] Add timer/reminder functionality suggestions
- [ ] Create break management recommendations

### 5. Improve Error Messages
- [ ] Review all error messages for clarity
- [ ] Add recovery suggestions for common failures
- [ ] Improve JXA error translation
- [ ] Add user-friendly explanations for API limitations

### 6. Performance Optimizations
- [ ] Profile perspective query performance
- [ ] Consider parallel perspective queries
- [ ] Optimize filter rule translation
- [ ] Add perspective query result caching strategy

### 7. Enhanced MCP Prompts
- [ ] Perspective-based weekly review
- [ ] Project breakdown assistant using perspectives
- [ ] Daily planning with Today perspective integration
- [ ] Context-based task batching prompt

## Testing & Quality

### 8. Comprehensive Testing
- [ ] Fix query_perspective integration test timeout
- [ ] Add more perspective tool unit tests
- [ ] Test with large perspective counts (50+)
- [ ] Verify caching behavior for perspectives

### 9. Documentation Updates
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

### 10. Cleanup Tasks
- [ ] Remove test files from root directory
- [ ] Organize test files into proper test directories
- [ ] Review and remove unnecessary debug logs
- [ ] Consolidate perspective test scripts

### 11. Type Safety
- [ ] Add better typing for perspective filter rules
- [ ] Create interfaces for perspective responses
- [ ] Type the evaluateJavascript bridge responses
- [ ] Improve error type definitions

## Future Features (Lower Priority)

### 12. Advanced Perspective Features
- [ ] Perspective switching via URL schemes
- [ ] Custom perspective creation from MCP
- [ ] Perspective-based reporting
- [ ] Perspective usage analytics

### 13. Workflow Automation
- [ ] Template instantiation with variable substitution
- [ ] Bulk project creation from templates
- [ ] Automated review scheduling based on perspective content
- [ ] Smart task distribution across perspectives

## Research Items

### 14. Investigate Further
- [ ] Can we access perspective window settings?
- [ ] Is perspective sidebar state accessible?
- [ ] Can we determine currently active perspective?
- [ ] Explore Window object in Omni Automation

## Success Metrics for Next Session

✅ query_perspective working in all test scenarios
✅ At least one project template prompt implemented
✅ All test files organized properly
✅ Documentation updated with perspective examples

---

*Created: 2025-08-10*
*For: Next development session*
*Priority: Fix query_perspective, then implement templates*
*Note: We're at 88% context usage, so start fresh next session!*