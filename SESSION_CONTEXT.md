# Session Context - 2025-08-11

## Current Status
- **Version**: 1.13.0 (released and pushed) 
- **Last Commit**: "feat: revolutionary performance improvements with hybrid architecture (v1.13.0)"
- **All Tests Passing**: 260 tests passing, 1 skipped
- **Repository**: Fully up to date with all changes pushed

## Session Accomplishments

### 1. Major Performance Overhaul with Hybrid Architecture (v1.13.0) ✅
- **Problem**: End user testing showed severe performance issues (23.7s for upcoming tasks)
- **Solution**: Revolutionary hybrid approach using `evaluateJavascript()` bridge
- **Breakthrough**: User suggested evaluateJavascript() which proved to be the key
- **Tools Migrated**:
  - `list_tasks`: 60-83% faster (2-3s → 0.8-1.2s)
  - `todays_agenda`: 70-90% faster (3-5s → 0.5-1s)
  - `export_tasks`: 50-80% faster (5-10s → 1-2s)
  - `query_tasks` (upcoming/overdue): 96% faster (23.7s → 0.75s!)
- **Files Created/Modified**: 
  - `list-tasks-hybrid.ts` - Hybrid list tasks with complex filtering
  - `todays-agenda-hybrid.ts` - Hybrid agenda implementation
  - `export-tasks-hybrid.ts` - Hybrid export implementation
  - `date-range-queries-hybrid.ts` - Hybrid date range queries
  - `HYBRID_MIGRATION_PLAN.md` - Comprehensive migration strategy
  - `PERFORMANCE_TEST_PROMPT_v1.13.0.md` - Testing guide for Claude Desktop
- **Impact**: Zero timeouts, sub-second queries, production-ready performance

### 2. Type Safety and Code Quality Improvements (v1.12.0) ✅
- **BREAKING CHANGE**: Metadata fields now use snake_case instead of camelCase
  - taskCount → task_count
  - projectCount → project_count  
  - tagCount → tag_count
  - exportDate → export_date
- **Configurable Script Limits**: 
  - Script size via OMNIFOCUS_MAX_SCRIPT_SIZE env var
  - Script timeout via OMNIFOCUS_SCRIPT_TIMEOUT env var
- **Type Safety**: Replaced all `any` types with proper TypeScript types
- **Enhanced Error Handling**: Added detailed recovery information
- **Dynamic Version Loading**: Version loaded from package.json
- **Added Code Standards Reviewer Agent**: New Claude agent for code review

### 2. Code Consistency Refactoring (v1.11.2) ✅
- **Refactored Analytics Tools**: ProductivityStatsTool, TaskVelocityTool, OverdueAnalysisTool now use standardized response format
- **Refactored Export Tools**: ExportTasksTool, ExportProjectsTool, BulkExportTool with simplified response structure
- **Created CODING_STANDARDS.md**: Comprehensive documentation of all coding patterns
- **Added Consistency Tests**: New response-format-consistency.test.ts ensures all tools follow standards
- **ESLint Enforcement**: Created .eslintrc.mcp.json and custom rules to prevent future inconsistencies
- **Fixed the philosophy**: "don't fix the tests, fix the code that is failing the tests"

### 3. Created OmniFocus Tasks for Project Template Research ✅
- Added 8 tasks with links to research resources:
  - OmniGroup Forum examples
  - Reddit GTD discussions
  - Productivityist templates
  - Doist template guide
  - Todoist project templates
  - Process Street templates
  - ProjectManager.com templates
  - Zenkit project management templates

### 4. Fixed Query Perspective Integration Issues (v1.11.1) ✅
- **Response Format Standardization**: Changed from `data.items` to `data.tasks` for consistency
- **Added Structured Perspective Data**: Response now includes `data.perspective` object
- **Improved Error Handling**: Properly handles non-existent perspectives
- **Fixed Integration Test Timeouts**: Reduced from 30s to ~7s typical response time
- **Type Safety**: Added proper TypeScript interfaces for perspective responses

### 5. Previous: Perspective Tools Implementation (v1.11.0) ✅
- **list_perspectives**: Enumerate all perspectives (built-in and custom) with filter rules
- **query_perspective**: Get tasks matching perspective filters  
- Successfully discovered perspective access via `evaluateJavascript()` bridge
- Found 30 perspectives in testing (8 built-in, 22 custom)
- Enables LLM to see what users see in their perspectives
- Full collaborative task processing now possible

### 6. Eisenhower Matrix Prompt ✅
- Added new GTD prompt for inbox processing
- Uses urgent/important quadrants for task categorization
- Integrated with MCP prompts system

### 7. Project Template Research ✅
- Documented 6 comprehensive GTD project templates
- Client projects, product launches, event planning, home improvement, learning, travel
- Ready for future prompt implementation

### 8. Documentation Improvements ✅
- Added recurrence examples to README
- Updated FEATURE_ROADMAP with v1.10.0 accomplishments
- Created PERSPECTIVE-ACCESS-DISCOVERY.md documenting the breakthrough
- Created JXA-CAPABILITIES-RESEARCH.md for future reference
- Created SWIFT-VS-JXA-ANALYSIS.md explaining why to stay with JXA

### 9. Claude Code Status Line Enhancement
- Fixed status line to show context percentage before auto-compact
- Script now properly calls `bun x ccusage statusline`
- Shows both external token tracking and internal context usage

## Key Technical Discoveries

### Perspective Access via evaluateJavascript()
```javascript
// We can enumerate all perspectives
Perspective.all // All perspectives
Perspective.Custom.all // Custom perspectives with filter rules
perspective.archivedFilterRules // The actual filter logic!
```

### Filter Rule Translation
- Successfully decoded perspective filter rules
- Can translate rules to query parameters
- Enables simulation of perspective views without UI access

## Known Issues & Limitations

### Technical Debt
1. **query_perspective integration tests** - Some timeout issues but core functionality works
2. **Complex perspective filters** - Some custom perspectives have rules we can't fully translate
3. **Perspective grouping/sorting** - Can't replicate exact display order

### Performance Considerations
- Perspective tools use 5-minute cache for list, 30-second for queries
- Filter translation adds minimal overhead
- Successfully handles 30+ perspectives

## Testing Results
- Unit tests: 260 passing ✅
- Perspective enumeration: 30 perspectives found ✅
- Tools registered and available ✅
- Direct JXA scripts working ✅
- Code consistency tests: All tools follow standardized patterns ✅

## Environment Details
- Node.js 18+
- OmniFocus 4.6+ on macOS
- TypeScript project
- MCP SDK 1.13.0
- Using evaluateJavascript() bridge extensively

## Quick Commands for Next Session

```bash
# Check current state
git status
git log --oneline -5

# Run tests
npm run build && npm test

# Test perspective tools
osascript -l JavaScript test-perspectives-simple.js

# Test MCP integration
node tests/integration/test-as-claude-desktop.js

# Check perspective access
npx tsx test-perspective-comprehensive.ts
```

## Files Modified This Session (v1.13.0)
- **Hybrid Architecture Implementation**:
  - `/src/omnifocus/scripts/tasks/list-tasks-hybrid.ts` - NEW: Hybrid list tasks
  - `/src/omnifocus/scripts/tasks/todays-agenda-hybrid.ts` - NEW: Hybrid agenda
  - `/src/omnifocus/scripts/export/export-tasks-hybrid.ts` - NEW: Hybrid export
  - `/src/omnifocus/scripts/date-range-queries-hybrid.ts` - NEW: Hybrid date queries
  - `/src/tools/tasks/ListTasksTool.ts` - Updated to use hybrid script
  - `/src/tools/tasks/TodaysAgendaTool.ts` - Updated to use hybrid script
  - `/src/tools/export/ExportTasksTool.ts` - Updated to use hybrid script
  - `/src/tools/tasks/DateRangeQueryTool.ts` - Updated to use hybrid script
  - `/src/omnifocus/scripts/shared/helpers.ts` - Optimized isTaskBlocked()
- **Documentation**:
  - `/HYBRID_MIGRATION_PLAN.md` - NEW: Migration strategy document
  - `/PERFORMANCE_TEST_PROMPT_v1.13.0.md` - NEW: Testing guide
  - `/CHANGELOG.md` - Added v1.13.0 release notes
  - `/README.md` - Updated performance notes

## Files Modified Previous Session (v1.11.2)
- `/src/tools/analytics/` - Refactored all analytics tools for standardized responses
- `/src/tools/export/` - Refactored all export tools for consistent structure
- `/src/tools/response-types.ts` - Added comprehensive type definitions
- `/tests/unit/response-format-consistency.test.ts` - New consistency tests
- `/CODING_STANDARDS.md` - New comprehensive coding standards documentation
- `/.eslintrc.mcp.json` - New ESLint configuration for pattern enforcement
- `/eslint-rules/index.js` - Custom ESLint rules for MCP patterns

## Important Context

### Vision Achieved
Your vision of an LLM assistant that can:
- See what users see in perspectives ✅
- Work alongside them collaboratively ✅  
- Help break down projects into actionable steps ✅
- Not interfere with user's OmniFocus view ✅

This is now fully realized with the perspective tools!

### Why We Stayed with JXA
After thorough analysis, we determined:
- Swift would use the SAME OmniFocus API (no additional access)
- 20,000+ lines of working code would need rewriting
- evaluateJavascript() bridge is MORE powerful than pure Swift
- 2-3 months effort for no real gain

## Key Technical Innovation

### The evaluateJavascript() Bridge
The breakthrough that enabled v1.13.0's performance gains:
```javascript
// Hybrid approach - best of both worlds
const omniScript = `
  (() => {
    // Runs inside OmniFocus at native speed
    const tasks = flattenedTasks.filter(/* fast filtering */);
    return JSON.stringify(tasks);
  })()
`;
const result = app.evaluateJavascript(omniScript);
```

This allows us to:
- Use Omni Automation's fast native API for filtering
- Keep JXA's compatibility for complex logic
- Achieve 60-96% performance improvements

## Git Remote
- Repository: github.com:kip-d/omnifocus-mcp.git
- Main branch: main
- Latest version: 1.13.0 (pushed)

## Dev Environment Notes (Not Part of MCP Server)

### Claude Code Status Line Configuration
- Fixed status line to show both ccusage output AND context percentage
- Used full path to bun executable (`/Users/kip/.bun/bin/bun`) to resolve PATH issues
- Status line now shows: `🤖 Opus 4.1 | 💰 $X session / $Y today | Context: ~XX%`
- Configuration in `~/.claude/statusline-enhanced.sh`

---

*Session saved at: 2025-08-11*
*Version released: 1.13.0*
*Tests passing: 260/261*
*Key accomplishment: Revolutionary performance improvements with hybrid architecture*
*Performance gains: 60-96% faster across all major tools*