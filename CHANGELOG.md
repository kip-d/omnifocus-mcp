# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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