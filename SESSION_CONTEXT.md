# Session Context - 2025-08-09

## Current Status
- **Version**: 1.9.1 (just released)
- **Last Commit**: feat: add relative date support and improve MCP prompts UI (v1.9.1)
- **All Tests Passing**: 249 tests passing, 1 skipped

## Today's Accomplishments

### 1. Fixed Date Handling (v1.9.1)
- ✅ Added relative date support ("tomorrow", "next monday", "in 3 days")
- ✅ Fixed date-only strings to parse as local midnight
- ✅ Unified date schemas between projects and tasks
- ✅ Enhanced timezone detection with multiple fallbacks
- ✅ Added 29 comprehensive date handling tests
- ✅ Corrected DATE_HANDLING.md documentation

### 2. MCP Prompts Discovery & Documentation
- ✅ Discovered prompts appear under "+" button in Claude Desktop v0.12.55+
- ✅ Fixed truncated argument descriptions in UI
- ✅ Added documentation to README explaining how to access prompts
- ✅ Confirmed we have 8 working prompts (3 GTD, 5 reference)

### 3. Bug Fixes
- ✅ Fixed date-range-queries test checking wrong script exports
- ✅ Fixed tasks in completed projects showing as incomplete
- ✅ Updated CHANGELOG with missing versions (1.7.1-1.8.0)

## High Priority Roadmap Items

### 1. Project Review Settings ✅ COMPLETED (2025-08-09)
```javascript
// Now fully implemented in create_project and update_project:
{
  reviewInterval: {
    unit: "week",      // day, week, month, year
    steps: 2,          // e.g., every 2 weeks
    fixed: false       // fixed vs floating
  },
  nextReviewDate: "2025-01-15"
}
```
- Status: Fully implemented and tested
- Location: src/tools/projects/

### 2. Task Recurrence Settings ✅ SOLVED (2025-08-10)
```javascript
// Now fully working via evaluateJavascript() bridge:
{
  repeatRule: {
    unit: "week",           // day, week, month, year
    steps: 1,              // every N units
    weekdays: ["monday", "wednesday", "friday"],
    method: "fixed"         // fixed, start-after-completion, due-after-completion
  }
}
```
- **Initial investigation**: Found RepetitionRule API not accessible via JXA
- **Breakthrough**: Discovered `app.evaluateJavascript()` bridges JXA to Omni Automation
- **Solution**: Hybrid approach - create in JXA, apply recurrence via bridge
- **Status**: Fully implemented and working for both tasks and projects
- **Impact**: This was an 8+ hour investigation that nearly ended in failure
- **Community action needed**: See EVALUATEJAVASCRIPT_BRIDGE_RESEARCH.md for Omni Group request

### 3. Batch Operations 🟡
- `batch_create_tasks` - Create multiple tasks in one call
- Atomic transactions (all succeed or all fail)
- User feedback: Would "make project setup much faster"

### 4. Perspectives Access 🟡
- `list_perspectives` - Get available perspectives
- `query_perspective` - Get tasks from specific perspective
- Use case: Access "Due Soon", "Flagged", custom perspectives

## Known Issues & Limitations

### Technical Debt
1. **JXA RepetitionRule Bug** - Can't create recurring tasks/projects (line 96 in create-project.ts)
2. **Tag Assignment** - Still unreliable during task creation (must update after)
3. **Natural Language Dates** - OmniFocus API doesn't accept them (we handle in our layer)

### Performance Considerations
- Daily-first philosophy implemented (v1.9.0)
- Default limits reduced for faster response
- Performance modes available for power users

## Testing Notes
- Integration test: `npm run test:integration`
- Unit tests: `npm test`
- MCP protocol test: `node tests/integration/test-as-claude-desktop.js`
- Build before testing: `npm run build`

## Environment Details
- Node.js 18+
- OmniFocus 4.6+ on macOS
- TypeScript project (no .js files for new code)
- MCP SDK 1.13.0

## Quick Commands for Resuming

```bash
# Check current state
git status
git log --oneline -5

# Run tests
npm run build && npm test

# Test MCP integration
node tests/integration/test-as-claude-desktop.js

# Test specific functionality
npx tsx test-script.ts  # Create test scripts as needed

# View recent changes
git diff HEAD~1
```

## Notes for Next Session

1. **Project Review Settings** - Most requested feature, should tackle first
2. **RepetitionRule Investigation** - Need to find workaround for JXA limitation
3. **Batch Operations** - Consider implementing with transaction-like behavior
4. **MCP Prompts Enhancement** - Could add more sophisticated GTD workflows

## Files Recently Modified
- `/src/utils/timezone.ts` - Enhanced with relative dates
- `/src/tools/schemas/project-schemas.ts` - Unified date schemas
- `/src/prompts/gtd/*.ts` - Fixed UI truncation
- `/docs/DATE_HANDLING.md` - Corrected documentation
- `/tests/unit/timezone.test.ts` - New comprehensive tests

## Git Remote
- Repository: github.com:kip-d/omnifocus-mcp.git
- Main branch: main
- Latest version: 1.9.1

---

*Session saved at: 2025-08-09 23:20 EST*
*Total commits today: 3*
*Tests passing: 249/250*