---
name: MCP Resources Implementation
about: Implement MCP resource system for data exposure
title: '[MCP] Implement Resources for Direct Data Access'
labels: 'enhancement, mcp-compliance, priority-medium'
assignees: ''

---

## Overview
The MCP specification supports three main capabilities: tools, resources, and prompts. We currently only implement tools. Resources would allow direct data access without tool calls, which could improve performance for read-heavy operations.

## Proposed Resources

### Core Resources
```typescript
// Active projects
{
  uri: "omnifocus://projects/active",
  name: "Active Projects",
  description: "All currently active projects with metadata",
  mimeType: "application/json"
}

// Today's tasks
{
  uri: "omnifocus://tasks/today",
  name: "Today's Tasks", 
  description: "Tasks due or deferred to today",
  mimeType: "application/json"
}

// Inbox tasks
{
  uri: "omnifocus://tasks/inbox",
  name: "Inbox Tasks",
  description: "Unprocessed inbox items",
  mimeType: "application/json"
}
```

### Dynamic Resources with Templates
```typescript
// Project-specific tasks
{
  uri: "omnifocus://projects/{projectId}/tasks",
  name: "Project Tasks",
  description: "All tasks for a specific project"
}

// Tag-based resources
{
  uri: "omnifocus://tags/{tagName}/tasks",
  name: "Tagged Tasks",
  description: "All tasks with specific tag"
}
```

## Implementation Plan

### 1. Create Resource Infrastructure
```typescript
// src/resources/base.ts
export abstract class BaseResource {
  abstract uri: string;
  abstract name: string;
  abstract description: string;
  abstract mimeType: string;
  
  constructor(protected cache: CacheManager) {}
  
  abstract read(uri: string): Promise<ResourceContent>;
}
```

### 2. Implement Resource Classes
```typescript
// src/resources/projects/ActiveProjectsResource.ts
export class ActiveProjectsResource extends BaseResource {
  uri = "omnifocus://projects/active";
  name = "Active Projects";
  
  async read(): Promise<ResourceContent> {
    // Use existing project listing logic
    // Return cached data when available
  }
}
```

### 3. Register Resources
```typescript
// src/resources/index.ts
export function registerResources(server: Server, cache: CacheManager) {
  const resources = [
    new ActiveProjectsResource(cache),
    new TodaysTasksResource(cache),
    new InboxTasksResource(cache),
    // ... more resources
  ];
  
  resources.forEach(resource => {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      // Return available resources
    });
    
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      // Handle resource read requests
    });
  });
}
```

## Benefits
- **Performance**: Direct data access without tool overhead
- **Caching**: Resources naturally fit caching patterns
- **Discoverability**: Clients can browse available data
- **URLs**: Resource URIs are more intuitive than tool parameters

## Testing Requirements
- [ ] Unit tests for each resource
- [ ] Integration tests with MCP Inspector
- [ ] Performance comparison vs tools
- [ ] Cache hit rate monitoring

## Documentation Needs
- [ ] Update README with resource examples
- [ ] Add resource development guide
- [ ] Document URI scheme conventions