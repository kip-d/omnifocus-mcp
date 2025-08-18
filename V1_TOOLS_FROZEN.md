# V1 Tools - FROZEN Legacy Code

## Status: ❄️ FROZEN - DO NOT MODIFY

This document describes the V1 tools that have been moved to `src/tools/legacy-v1/` and are preserved for backward compatibility only.

## Why V1 Tools Are Frozen

1. **Limited User Base**: Very few users experienced V1 tools before V2 was released
2. **V2 Superiority**: V2 tools offer better performance, cleaner APIs, and summary-first responses
3. **Maintenance Burden**: Maintaining two tool versions increases complexity
4. **Clear Migration Path**: V2 tools are the future of this project

## How to Enable V1 Tools

V1 tools are disabled by default. To enable them:

```bash
export OMNIFOCUS_MCP_ENABLE_LEGACY_TOOLS=true
```

When enabled, both V1 and V2 tools will be available.

## V1 to V2 Migration Guide

### Task Tools

| V1 Tool | V2 Replacement | Migration Notes |
|---------|----------------|-----------------|
| `list_tasks` | `tasks` with `mode: "all"` | V2 includes summary-first format |
| `get_task_count` | `tasks` with `mode: "all"` | Count in summary.total_count |
| `todays_agenda` | `tasks` with `mode: "today"` | Includes due and flagged tasks |
| `overdue_tasks` | `tasks` with `mode: "overdue"` | Built-in overdue analysis |
| `upcoming_tasks` | `tasks` with `mode: "upcoming"` | Use daysAhead parameter |
| `available_tasks` | `tasks` with `mode: "available"` | Not deferred or blocked |
| `blocked_tasks` | `tasks` with `mode: "blocked"` | Waiting on other tasks |
| `next_actions` | `tasks` with appropriate filters | Use available mode |
| `query_tasks` | `tasks` with various modes | Consolidated query interface |

### Project Tools

| V1 Tool | V2 Replacement | Migration Notes |
|---------|----------------|-----------------|
| `list_projects` | `projects` with `operation: "list"` | Unified project tool |
| `create_project` | `projects` with `operation: "create"` | Same parameters |
| `update_project` | `projects` with `operation: "update"` | Same parameters |
| `complete_project` | `projects` with `operation: "complete"` | Same parameters |
| `delete_project` | `projects` with `operation: "delete"` | Same parameters |

### Analytics Tools

| V1 Tool | V2 Replacement | Migration Notes |
|---------|----------------|-----------------|
| `get_productivity_stats` | `productivity_stats` | Summary-first format |
| `get_task_velocity` | `task_velocity` | Enhanced metrics |
| `analyze_overdue_tasks` | `analyze_overdue` | Better insights |

### Folder Tools

| V1 Tool | Current Tool | Notes |
|---------|--------------|-------|
| `list_folders` | `query_folders` | Consolidated tool |
| `create_folder` | `manage_folder` | Use operation parameter |
| `update_folder` | `manage_folder` | Use operation parameter |
| `delete_folder` | `manage_folder` | Use operation parameter |
| `move_folder` | `manage_folder` | Use operation parameter |

### Review Tools

| V1 Tool | Current Tool | Notes |
|---------|--------------|-------|
| `projects_for_review` | `manage_reviews` | Use operation: "list_for_review" |
| `mark_project_reviewed` | `manage_reviews` | Use operation: "mark_reviewed" |
| `set_review_schedule` | `manage_reviews` | Use operation: "set_schedule" |

## Known V1 Issues (Won't Fix)

### Import Path Issues
- Legacy tools have incorrect import paths after being moved to `legacy-v1/`
- These will NOT be fixed as the tools are frozen
- If you need V1 tools, they may require manual import fixes

### Performance Issues
- V1 tools use older, less optimized query patterns
- Some V1 tools may timeout with large databases
- Use V2 tools for better performance

### Missing Features
- V1 tools lack perspective query support
- V1 tools don't support task reparenting
- V1 tools have limited repeat rule support

## Development Policy

### What We DON'T Do
- ❌ Fix bugs in V1 tools
- ❌ Add features to V1 tools
- ❌ Optimize V1 tool performance
- ❌ Update V1 tool documentation
- ❌ Refactor V1 tool code

### What We DO
- ✅ Maintain V1 tools in working state (if already working)
- ✅ Document migration paths to V2
- ✅ Help users move to V2 tools
- ✅ Focus all development on V2 tools

## For AI Assistants (Claude Code, Copilot, etc.)

**IMPORTANT**: When working on this codebase:
1. NEVER modify files in `src/tools/legacy-v1/`
2. ALWAYS use V2 tools for new features
3. GUIDE users to V2 tools when they mention V1 tools
4. DOCUMENT V1 issues without fixing them

## Summary

V1 tools are frozen artifacts preserved for backward compatibility. They represent the past of this project. All future development, bug fixes, and improvements happen in V2 tools only.

If you're using V1 tools, please migrate to V2 as soon as possible for a better experience.

---

*Last updated: 2025-08-18*
*Status: Permanently frozen*
*Location: src/tools/legacy-v1/*