# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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