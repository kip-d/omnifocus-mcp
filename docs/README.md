# OmniFocus MCP Documentation

**📖 Quick Access:**
- **[User Prompts & Workflows](../prompts/README.md)** - Ready-to-use prompts for testing and daily use
- **[Main README](../README.md)** - Installation, setup, and overview
- **[LLM API Reference](./API-REFERENCE-LLM.md)** - Quick tool reference for AI assistants

## Core Documentation

### API Understanding
- **[JXA_COMPREHENSIVE_REFERENCE.md](JXA_COMPREHENSIVE_REFERENCE.md)** - Complete reference for JXA with OmniFocus
- **[JXA_API_DISCOVERY.md](JXA_API_DISCOVERY.md)** - Initial discovery of the three JavaScript APIs
- **[JXA_LEARNING_JOURNEY.md](JXA_LEARNING_JOURNEY.md)** - Summary of our learning process and key insights
- **[AppleScript_Dictionary_Analysis.md](AppleScript_Dictionary_Analysis.md)** - Analysis of the official dictionary

### Architecture & Design
- **[architecture-decisions.md](architecture-decisions.md)** - Key architectural choices
- **[prompt-cache-architecture.md](prompt-cache-architecture.md)** - Caching strategy design
- **[task-filtering-behavior.md](task-filtering-behavior.md)** - How task filtering works

### Setup & Configuration
- **[PERMISSIONS.md](PERMISSIONS.md)** - Required macOS permissions
- **[claude-desktop-config.md](claude-desktop-config.md)** - Claude Desktop configuration

### Testing
- **[jxa-test-utilities.js](jxa-test-utilities.js)** - Consolidated test utilities for API exploration
- **[cucumber-testing-guide.md](cucumber-testing-guide.md)** - BDD testing approach
- **[claude-desktop-test-checklist.md](claude-desktop-test-checklist.md)** - Testing checklist

### Performance & Issues
- **[PERFORMANCE_ISSUE.md](PERFORMANCE_ISSUE.md)** - Performance analysis and solutions
- **[USER_FEEDBACK_AND_LIMITATIONS.md](USER_FEEDBACK_AND_LIMITATIONS.md)** - Known limitations

## Key Learnings

1. **OmniFocus has three JavaScript APIs** - OmniJS (plugins), JXA (external), and AppleScript bridge
2. **We use JXA, not OmniJS** - This explains why many methods don't work
3. **whose() is the key to performance** - Use it for O(1) lookups instead of O(n) iteration
4. **Read operations work well, write operations are limited** - We can query extensively but can't use AppleScript commands

## Quick Reference

### Fast Task Lookup
```javascript
// Don't do this (slow):
for (let task of doc.flattenedTasks()) {
    if (task.id() === targetId) return task;
}

// Do this (fast):
doc.flattenedTasks.whose({id: targetId})[0]
```

### Correct Collection Usage
```javascript
// Wrong - whose() on array result:
doc.flattenedTasks().whose({id: 'xyz'})

// Right - whose() on function:
doc.flattenedTasks.whose({id: 'xyz'})
```

### Available Collections
- `doc.flattenedTasks()` - All tasks (use this)
- `doc.tasks()` - Root level only (usually empty)
- `doc.inboxTasks()` - Inbox tasks
- `tag.availableTasks()` - Unblocked incomplete tasks for a tag
- `tag.remainingTasks()` - All incomplete tasks for a tag