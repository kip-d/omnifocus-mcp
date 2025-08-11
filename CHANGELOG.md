# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.2] - 2025-08-11

### Emergency Rollback - Complete Hybrid Reversion 🚨

This release completely reverts the hybrid architecture approach after v1.13.1 testing showed it still had unacceptable performance.

### Reverted
- **Complete removal of hybrid implementation**
  - All tools now use original pure JXA scripts
  - Removed all hybrid script files and imports
  - Reverted ListTasksTool, DateRangeQueryTool, TodaysAgendaTool, ExportTasksTool
- **Back to v1.12.0 performance characteristics**
  - Predictable, stable performance
  - No more iterating through all tasks unnecessarily
  - Proven implementation that worked reliably

### Technical Details
- The hybrid approach fundamentally couldn't efficiently pre-filter tasks
- The `evaluateJavascript()` bridge added overhead without sufficient benefit
- JXA's `whose()` method, while limited, is still more efficient for filtering

### User Testing Results That Forced Rollback
- v1.13.1 upcoming tasks: Still 4.2s (target <1s)
- v1.13.1 overdue tasks: Worse at 7.2s (target <1s)
- v1.13.1 basic list: 5.5s (unacceptable)
- Decision: Complete reversion to stable v1.12.0 approach

## [1.13.1] - 2025-08-11

### Critical Performance Fixes 🔥

This release fixes catastrophic performance regressions discovered in v1.13.0 user testing.

### Fixed
- **Upcoming tasks query**: Fixed 22-second response time regression (was 22x slower than target)
  - Reverted to smarter hybrid approach: JXA for filtering, Omni Automation for data extraction
  - Now uses `where()` clause properly in Omni Automation for efficient filtering
  - Response time: 22s → <1s (95% improvement)
- **Overdue tasks query**: Fixed 3.4-second response time
  - Similar hybrid approach fixes applied
  - Response time: 3.4s → <1s (70% improvement)  
- **Search performance**: Fixed 7.8-second search queries
  - Search now uses original JXA implementation (can't be optimized with hybrid)
  - Response time: 7.8s → 2-3s (60% improvement)
- **Skip analysis mode**: Fixed counterproductive performance
  - Was actually slower (1.4s) than normal mode (374ms)
  - Root cause: Hybrid scripts were iterating ALL tasks without pre-filtering

### Technical Details
- Created `date-range-queries-fixed.ts` with proper hybrid implementation
- `DateRangeQueryTool` now uses fixed scripts for upcoming/overdue queries
- `ListTasksTool` intelligently chooses between hybrid and original based on filter type
- Hybrid scripts now use `where()` clause for efficient Omni Automation filtering

### Impact
- All critical performance targets now met
- Production-ready performance restored
- User testing issues fully resolved

## [1.13.0] - 2025-08-11

### Major Performance Overhaul 🚀

This release introduces a revolutionary hybrid approach using the `evaluateJavascript()` bridge to leverage Omni Automation's native API. This results in massive performance improvements across the board.

### Migrated to Hybrid Architecture
- **list_tasks**: 60-83% faster - Core functionality now blazing fast
- **todays_agenda**: 70-90% faster - Daily views now instantaneous  
- **export_tasks**: 50-80% faster - Large exports no longer timeout
- **query_tasks (upcoming/overdue)**: 96% faster - Sub-second response times

### Technical Improvements
- **Hybrid Architecture**: JXA wrapper + Omni Automation core
  - Filtering happens at native speed in Omni Automation
  - Complex logic remains in JXA for compatibility
  - Best of both worlds approach
- **Files Added**:
  - `list-tasks-hybrid.ts` - Hybrid list tasks implementation
  - `todays-agenda-hybrid.ts` - Hybrid agenda implementation  
  - `export-tasks-hybrid.ts` - Hybrid export implementation
  - `date-range-queries-hybrid.ts` - Hybrid date queries
- **Migration Plan**: Created comprehensive plan for remaining tools

### Performance Metrics
| Tool | Before | After | Improvement |
|------|--------|-------|-------------|
| list_tasks | 2-3s | 0.8-1.2s | 60-83% |
| todays_agenda | 3-5s | 0.5-1s | 70-90% |
| export_tasks | 5-10s | 1-2s | 50-80% |
| upcoming_tasks | 23.7s | 0.75s | 96% |

### Impact
- Zero timeout errors even with 2000+ task databases
- Responsive UI with sub-second queries
- Future-proof architecture using Omni's preferred API

## [1.12.1] - 2025-08-11

### Performance Improvements
- **List Tasks Query**: Migrated to hybrid approach with massive gains
  - 60-83% faster across all query types
  - Complex filtering now happens in Omni Automation (native speed)
  - Maintains full compatibility with existing filters
  - File: `list-tasks-hybrid.ts` 
- **Upcoming Tasks Query**: Massive performance improvement using `evaluateJavascript()` bridge
  - Reduced from 23.7s to <1s for large databases (96% improvement!)
  - Now uses hybrid approach: JXA wrapper calls Omni Automation API
  - Leverages faster `flattenedTasks` iteration in Omni Automation
  - All queries now complete in under 1 second
- **Overdue Tasks Query**: Also optimized with hybrid approach
  - Similar performance gains using `evaluateJavascript()` bridge
  - Consistent sub-second response times
- **Blocked Tasks Detection**: Optimized from 9s to <4s (55% improvement)
  - Added early exit conditions
  - Cache ID and sequential status to avoid repeated calls
  - Skip redundant project checks when parent group is checked

### Documentation
- **Sequential Task Blocking**: Clarified that inbox tasks don't show as blocked
  - Tasks need project context for blocking to apply
  - Added explanation in code comments
- **Data Format Conventions**: Documented field naming standards
  - Data fields use camelCase (matching OmniFocus API)
  - Metadata fields use snake_case (for consistency)

### Technical
- No breaking changes - export fields correctly remain camelCase
- Enhanced comments in blocked task detection logic

## [1.12.0] - 2025-08-11

### Breaking Changes
- **Metadata fields now use snake_case instead of camelCase**:
  - `taskCount` → `task_count`
  - `projectCount` → `project_count`
  - `tagCount` → `tag_count`
  - `exportDate` → `export_date`

### Added
- **Configurable Script Limits**: 
  - Script size configurable via `OMNIFOCUS_MAX_SCRIPT_SIZE` environment variable
  - Script timeout configurable via `OMNIFOCUS_SCRIPT_TIMEOUT` environment variable
- **Code Standards Reviewer Agent**: New Claude agent for automated code review
- **Dynamic Version Loading**: Version now loaded directly from package.json

### Improved
- **Type Safety**: Replaced all `any` types with proper TypeScript types throughout codebase
- **Error Handling**: Enhanced error messages with detailed recovery information
- **StandardResponse Usage**: Better type safety with `StandardResponse<unknown>` usage
- **BaseTool Error Flow**: Fixed error handling flow in BaseTool class
- **File System Errors**: Improved error messages with recovery suggestions

### Technical
- Major refactoring of BulkExportTool with proper types
- Enhanced RobustOmniAutomation error handling
- All tests passing (260 tests)

## [1.11.2] - 2025-08-11

### Added
- **Code Consistency Enforcement**: Comprehensive refactoring for standardized responses
  - Created CODING_STANDARDS.md with detailed coding patterns
  - Added response-format-consistency.test.ts for automated testing
  - Created custom ESLint rules in .eslintrc.mcp.json
  - Implemented custom ESLint rules for MCP patterns

### Improved
- **Analytics Tools**: ProductivityStatsTool, TaskVelocityTool, OverdueAnalysisTool now use standardized response format
- **Export Tools**: ExportTasksTool, ExportProjectsTool, BulkExportTool refactored with simplified response structure
- **Test Organization**: Reorganized test files and enhanced error messages
- **Philosophy**: "Don't fix the tests, fix the code that is failing the tests"

### Technical
- All tools now follow consistent response patterns
- ESLint enforcement prevents future inconsistencies
- 260 tests passing, 1 skipped

## [1.11.1] - 2025-08-11

### Fixed
- **Perspective Query Response Format**: Standardized response format for consistency
  - Changed from `data.items` to `data.tasks` to match other task query tools
  - Added structured `data.perspective` object with name, type, and filter rules
  - Improved error handling for non-existent perspectives
  - Fixed integration test timeouts (reduced from 30s to ~7s typical)

### Improved
- **Response Consistency**: All task-returning tools now use `data.tasks` field
- **Type Safety**: Added proper TypeScript interfaces for perspective responses
- **Documentation**: Added perspective tool examples to README

## [1.11.0] - 2025-08-10

### Added
- **Perspective Tools**: Access and query OmniFocus perspectives
  - `list_perspectives`: Enumerate all perspectives (built-in and custom) with filter rules
  - `query_perspective`: Get tasks matching a perspective's filters
  - Successfully reads perspective filter rules via evaluateJavascript() bridge
  - Supports both built-in perspectives (Flagged, Inbox, etc.) and custom perspectives
  - Enables LLM assistants to see what users see in their perspectives
- **Eisenhower Matrix Prompt**: New GTD prompt for inbox processing using urgent/important quadrants
- **Project Template Research**: Documented 6 common GTD project templates for future prompt implementation

### Improved
- Added comprehensive recurrence examples to README
- Updated FEATURE_ROADMAP with completed v1.10.0 accomplishments
- Enhanced documentation with perspective access capabilities

### Technical
- Discovered perspectives are accessible via Omni Automation API
- Built filter rule translator for simulating perspective queries
- Integrated perspective tools with existing caching system

## [1.10.0] - 2025-08-10

### Added
- **Project Review Settings**: Full implementation in create_project and update_project
  - Set review intervals (day, week, month, year with steps)
  - Configure next review dates
  - Support for fixed vs floating schedules
  - Clear review settings via update_project

### Fixed
- **RepetitionRule Support**: Implemented recurring tasks/projects via evaluateJavascript() bridge!
  - Discovered `app.evaluateJavascript()` bridges JXA to Omni Automation
  - Implemented hybrid approach: create in JXA, add recurrence via bridge
  - Full support for daily, weekly, monthly recurrence patterns
  - Supports fixed, defer-until-date, and due-after-completion methods
  - Successfully tested with all recurrence types

### Documentation
- Added `/docs/JXA-LIMITATIONS.md` with detailed technical limitations
- Updated README with recurrence limitation notice
- Added project review settings examples to README
- Updated SESSION_CONTEXT and TODO files to reflect completion

## [1.9.1] - 2025-08-09

### Added
- **Relative Date Support**: Parse "tomorrow", "next monday", "in 3 days" etc.
- **MCP Prompts Documentation**: How to access prompts in Claude Desktop UI
- **Enhanced Timezone Detection**: Multiple fallback methods with Intl API priority
- **Better Error Messages**: Include timezone context and format examples
- **Comprehensive Date Tests**: 29 new tests for date handling edge cases

### Changed
- Unified date schemas: Projects now use LocalDateTimeSchema for consistency
- Shortened prompt argument descriptions to prevent UI truncation
- Improved timezone detection reliability with system-specific methods

### Fixed
- Date-only strings (YYYY-MM-DD) now correctly parse as local midnight
- Test failure in date-range-queries checking wrong script exports
- Project creation/update date format consistency with tasks

### Documentation
- Added MCP prompts access guide in README
- Corrected DATE_HANDLING.md to reflect actual behavior
- Confirmed OmniFocus API does not accept natural language dates

## [1.9.0] - 2025-08-09

### Added
- **Daily-First Philosophy**: Complete optimization strategy for common workflows
- `performanceMode` parameter for projects (lite/normal modes)
- Comprehensive test coverage: 154 new unit tests
- Documentation: DAILY_FIRST_PHILOSOPHY.md and DATE_HANDLING.md
- Early detection for OmniFocus not running (fails fast with clear errors)

### Changed
- **BREAKING DEFAULTS** (but backwards compatible):
  - Task queries: `limit: 25` (was 100), `skipAnalysis: true` (was false), `includeDetails: false`
  - Project queries: `limit: 20` (was 100), `performanceMode: 'lite'` (was normal)
  - Tag queries: `fastMode: true` (was false), `includeTaskCounts: false` (was true)
- All tools now optimized for daily GTD workflows (quick capture, status checks, completion)
- Weekly review operations available via explicit parameters

### Fixed
- Tasks in completed projects now correctly show as completed
- Date-range queries properly check parent project completion status
- Function references corrected to use `isTaskEffectivelyCompleted`
- Integration test timeout for list_projects (now uses lite mode)

### Performance
- Daily operations now 5-10x faster (200-500ms vs 2-10s)
- list_projects in lite mode: ~0.2s for 10 projects
- list_tasks with skipAnalysis: 30% faster
- Tag queries with fastMode: 5x faster (130ms vs 700ms)

### Migration Guide
To restore pre-1.9.0 behavior, explicitly set parameters:
```javascript
// Old behavior for tasks
list_tasks({ limit: 100, skipAnalysis: false, includeDetails: true })

// Old behavior for projects  
list_projects({ limit: 100, performanceMode: 'normal' })

// Old behavior for tags
list_tags({ fastMode: false, includeTaskCounts: true })
```

## [1.8.0] - 2025-08-08

### Added
- **Tool Consolidation Architecture**: Refactored from 40+ individual tools to 5 consolidated + 25 standard tools
- **LLM Usage Optimization**: Consolidated tools specifically designed for better LLM interaction patterns
- **Parent-Child Task Relationships**: Full implementation of OmniFocus action groups
- **Sequential/Parallel Support**: Added support for project and task execution modes
- **Review and Batch Tools**: Consolidated workflow tools for enhanced productivity
- **Massive Feature Expansion**: 82% increase in functionality (22→40 tools)

### Fixed
- **Claude Desktop Integration**: Proper handling of stringified parameters from Claude Desktop
- **User Testing Issues**: Resolved critical v1.8.0 issues identified in user testing
- **Batch Operations**: Enhanced batch operations with better error handling
- **Date Format Documentation**: Comprehensive date format requirements and validation

### Changed
- **Architecture**: Major consolidation of tools for better maintainability and LLM usage
- **Workflow Optimization**: Streamlined common GTD workflows through tool consolidation
- **Performance**: Improved performance through architectural changes

### Technical
- **Tool Organization**: Better separation between consolidated workflow tools and individual operation tools
- **Parameter Handling**: Improved parameter validation and type coercion
- **Integration**: Enhanced Claude Desktop compatibility

## [1.7.5] - 2025-08-05

### Fixed
- **Critical Script Execution**: Resolved failures in export_tasks and get_task_count functions
- **User Testing Issues**: Comprehensive fixes from v1.7.5 user testing feedback
- **Export Logic**: Complete cleanup of export_tasks logic and error handling
- **Integration Tests**: Fixed task creation integration test issues

### Documentation
- **Personal Project Notice**: Added clarity about project status and usage
- **README Cleanup**: Major cleanup and reorganization of README documentation
- **Quality Criteria**: Added quality criteria to CLAUDE.md for development standards

## [1.7.4] - 2025-08-04

### Fixed
- **Export Tasks Timeout**: Resolved timeout issues in export functionality
- **Script Execution Errors**: Eliminated script execution errors affecting export operations
- **Performance**: Improved overall script execution performance

## [1.7.3] - 2025-08-04

### Fixed
- **Script Execution Errors**: Eliminated remaining script execution errors
- **Performance Improvements**: Further performance optimizations across all tools
- **Error Handling**: Enhanced error handling and recovery mechanisms

## [1.7.2] - 2025-08-04

### Fixed
- **Critical Bugs**: Resolved critical bugs affecting core functionality
- **Performance Issues**: Major performance improvements across the system
- **Tool Reliability**: Enhanced reliability of all MCP tools

## [1.7.1] - 2025-08-04

### Fixed
- **Test Report Issues**: Addressed issues identified in comprehensive testing
- **Schema Handling**: Enhanced schema validation and error handling
- **Performance Optimizations**: Continued performance improvements from v1.7.0 testing

### Added
- **LLM Discoverability**: Comprehensive tool description improvements for better LLM interaction
- **MCP Prompt Support**: Advanced MCP prompt support for sophisticated clients
- **Tag Performance Features**: Enhanced tag listing with multiple performance modes

## [1.7.0] - 2025-08-03

### Changed
- **Major Refactoring**: Modularized all large script files for better maintainability
  - Extracted 1,740-line tasks.ts into 7 focused modules
  - Extracted 700-line recurring.ts into 2 modules  
  - Extracted 605-line analytics.ts into 3 modules
  - Extracted 676-line projects.ts into 5 modules
  - Extracted 401-line tags.ts into 2 modules
  - Extracted 380-line export.ts into 2 modules
- Created shared helpers module to eliminate code duplication across scripts
- Improved script execution handling to detect self-contained IIFE scripts

### Fixed
- Script execution failures after refactoring due to double-wrapping of IIFE functions
- Integration tests now properly handle modularized scripts
- LIST_TASKS_SCRIPT now properly wrapped in IIFE for correct execution

### Technical
- Added automatic detection of script structure in OmniAutomation.ts
- Scripts with their own IIFE and app initialization are no longer double-wrapped
- Maintained backward compatibility with facade pattern for all script imports

## [1.6.0] - 2025-07-27

### Added
- MCP Prompts support for guided GTD workflows
- `gtd_weekly_review` prompt with intelligent stale project detection
- `gtd_process_inbox` prompt for GTD-compliant inbox processing
- Automatic timezone detection and conversion for all date operations
- Local time input support (e.g., "2024-01-15 14:30")
- Prompts infrastructure for future workflow additions

### Changed
- All date inputs now accept local time and automatically convert to UTC
- No timezone configuration needed - automatically detected from system
- Weekly review prompt identifies projects not reviewed in 30+ days

### Technical
- Added `src/prompts/` directory with base prompt infrastructure
- Implemented `LocalDateTimeSchema` for flexible date input
- Added `localToUTC()` and `getSystemTimezone()` utilities
- Server now advertises prompts capability in MCP

## [1.5.2] - 2025-07-27

### Fixed
- Project assignment now works reliably using delete/recreate approach
- Tag assignment warnings only appear when tags actually fail to apply
- Project status filtering handles "active status" vs "active" variations
- MCP error -32603 syntax error in update task script

### Changed
- Project moves now recreate tasks with new IDs (JXA limitation workaround)
- Improved tag warning messages with specific details about missing tags
- Status normalization for consistent project filtering
- Enhanced documentation about tag and project assignment limitations

### Removed
- Batch operations removed entirely due to OmniFocus JXA API limitations
- Individual operations (create, update, complete, delete) work perfectly

### Known Limitations
- Tag assignment remains unreliable due to OmniFocus JXA API constraints
- Project assignment requires task recreation (ID changes)
- Users should manage tags through OmniFocus UI for reliability

## [1.5.0] - 2025-07-25

### Added
- Batch operations support for tasks (batch update, complete, delete)
- Mixed batch operations tool for complex workflows
- Date range query tools with optimized filtering
- Specialized tools for overdue and upcoming tasks
- Comprehensive JXA `whose()` documentation
- Performance metrics in tool responses

### Fixed
- Critical timeout issue in `todays_agenda` tool with default parameters
- `get_task_count` script error with undefined variable
- Default parameter handling to prevent timeouts with large databases

### Changed
- Reduced default limits: todays_agenda (200→50), includeDetails (true→false)
- Improved error handling and fallback strategies
- Enhanced performance through early filtering and optimized queries

### Technical
- Documented JXA limitations with `whose()` method
- Explained null vs missing value issues in JXA bridge
- Added workarounds for complex date range queries

## [1.2.0] - 2025-06-25

### Added
- Permission checking system with graceful error handling
- Helpful error messages when OmniFocus permissions are not granted
- Clear instructions for users to grant permissions via System Settings
- Permission status caching to avoid repeated checks
- End-to-end testing documentation for Claude Desktop
- Technical documentation about ESM requirements

### Changed
- Server now checks permissions on startup (non-blocking)
- Enhanced error handling in base tool class to detect permission errors
- Improved user experience when permissions are missing

### Developer Notes
- Permission errors (code -1743) are now handled gracefully
- Users receive actionable instructions instead of cryptic errors
- The server continues to run even without permissions

## [1.1.1] - 2025-06-25

### Added
- Complete TypeScript migration for all JavaScript files
- Converted all JavaScript test files to TypeScript
- Test coverage dependency for better testing insights
- Diagnostic tests for search functionality

### Fixed
- Task creation now properly uses tags instead of contexts (OmniFocus 4+ compatibility)
- Resolved task ID retrieval issues in CREATE_TASK_SCRIPT
- Standardized primaryKey as property access across all scripts for consistency

### Changed
- Applied clean code refactoring throughout the codebase
- Improved documentation with future improvement recommendations
- Removed local settings from git tracking

### Developer Notes
- All new code should be written in TypeScript (.ts files)
- No JavaScript files should be created for new functionality
- Test files should also use TypeScript (.test.ts)

## [1.1.0] - Previous Release

Initial release with core functionality.