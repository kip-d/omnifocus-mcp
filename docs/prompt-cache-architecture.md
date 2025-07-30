# Claude Code Prompt: Build OmniFocus MCP Server

## Project Overview

Create a new Model Context Protocol (MCP) server for OmniFocus from scratch that:
- Uses ONLY official OmniAutomation API (no database hacking or private APIs)
- Implements smart caching for performance
- Provides comprehensive task management and productivity analytics
- Maintains full type safety with TypeScript
- Follows MCP best practices

## Technical Architecture

### Core Stack
- TypeScript with strict mode
- Node.js with ES modules
- MCP SDK (`@modelcontextprotocol/sdk`)
- OmniAutomation via osascript execution
- In-memory cache with TTL support

### Architecture Pattern: OmniAutomation with Smart Caching
```
Claude Desktop <-> MCP Server <-> Cache Layer <-> OmniAutomation Scripts <-> OmniFocus
```

## Implementation Requirements

### 1. Project Structure
```
omnifocus-mcp-pro/
├── src/
│   ├── server.ts              # MCP server setup
│   ├── cache/
│   │   ├── CacheManager.ts    # TTL-based cache
│   │   └── types.ts           # Cache interfaces
│   ├── omnifocus/
│   │   ├── OmniAutomation.ts  # Script executor
│   │   ├── scripts/           # OmniAutomation scripts
│   │   └── types.ts           # OmniFocus types
│   ├── tools/
│   │   ├── tasks/             # Task operations
│   │   ├── projects/          # Project operations
│   │   ├── analytics/         # Productivity analytics
│   │   └── index.ts           # Tool registry
│   └── utils/
│       └── logger.ts          # Structured logging
├── tests/
├── package.json
└── tsconfig.json
```

### 2. Core Features to Implement

#### Task Operations
- `list_tasks` - Get tasks with advanced filtering (by project, tag, due date, etc.)
- `create_task` - Create task with full metadata
- `update_task` - Update any task property
- `complete_task` - Mark complete with completion date
- `delete_task` - Move to trash

#### Project Operations
- `list_projects` - Get all projects with stats
- `create_project` - Create with folder placement
- `update_project` - Modify project properties
- `archive_project` - Set to dropped/completed

#### Analytics Tools
- `productivity_summary` - Daily/weekly/monthly stats
- `task_velocity` - Completion rate analysis
- `overdue_analysis` - Overdue patterns and causes
- `tag_analytics` - Most used tags, tag completion rates
- `time_estimates_accuracy` - Compare estimates vs actual

#### Advanced Features
- `smart_search` - Natural language task search
- `bulk_operations` - Batch updates with transactions
- `recurring_task_analysis` - Pattern detection
- `focus_recommendations` - AI-powered task prioritization

### 3. Smart Caching Strategy

```typescript
interface CacheConfig {
  tasks: { ttl: 60 },        // 1 minute for task lists
  projects: { ttl: 600 },    // 10 minutes for projects
  analytics: { ttl: 3600 },  // 1 hour for analytics
  tags: { ttl: 1200 }        // 20 minutes for tags
}
```

- Implement cache invalidation on writes
- Use cache warming for common queries
- Add cache hit/miss metrics

### 4. OmniAutomation Integration

Create a robust script executor that:
- Handles script errors gracefully
- Escapes parameters safely
- Returns typed responses
- Supports streaming for large datasets

Example script structure:
```javascript
(() => {
  const app = Application('OmniFocus').defaultDocument;
  // Script logic here
  return JSON.stringify(result);
})();
```

### 5. Type Safety

Define comprehensive TypeScript types:
```typescript
interface OmniFocusTask {
  id: string;
  name: string;
  note?: string;
  project?: string;
  dueDate?: Date;
  deferDate?: Date;
  completionDate?: Date;
  flagged: boolean;
  tags: string[];
  estimatedMinutes?: number;
  completed: boolean;
}
```

### 6. Error Handling

Implement proper error hierarchy:
- `OmniFocusNotFoundError`
- `OmniFocusPermissionError`
- `CacheError`
- `ScriptExecutionError`

### 7. Performance Optimizations

- Batch similar operations
- Implement request deduplication
- Use async/await properly
- Add operation timeouts
- Log slow queries

### 8. Testing Strategy

- Unit tests for cache logic
- Integration tests with mock OmniAutomation
- E2E tests with real OmniFocus (optional)
- Performance benchmarks

## Getting Started

1. Initialize the project with TypeScript and ESM
2. Set up the MCP server skeleton
3. Implement the OmniAutomation executor
4. Build the cache layer
5. Add tools incrementally, starting with basic task operations
6. Layer in analytics once basics work

## Key Principles

1. **Respect OmniFocus**: Use only official APIs
2. **Performance Matters**: Cache aggressively but intelligently
3. **Type Everything**: Full TypeScript coverage
4. **Error Gracefully**: Never crash, always provide useful errors
5. **Analytics Focus**: Make productivity insights a first-class feature

## Deliverables

Create a production-ready MCP server that:
- Installs easily with `npm install -g omnifocus-mcp-pro`
- Provides 15+ useful tools out of the box
- Handles 1000+ tasks without performance issues
- Includes comprehensive documentation
- Ships with example Claude Desktop configuration

Start by creating the project structure and basic MCP server setup, then incrementally add features. Focus on making the basic task operations rock-solid before moving to analytics.