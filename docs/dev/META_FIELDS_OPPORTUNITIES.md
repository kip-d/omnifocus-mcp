# Meta Fields for Tools - Opportunities Analysis

## Overview

Meta fields are optional, tool-level metadata that can be attached to tool definitions in the MCP specification (v1.18.0+). They provide a way to embed machine-readable information about tools that goes beyond the standard `name`, `description`, and `inputSchema` properties.

**Feature Status**: Available in @modelcontextprotocol/sdk@^1.20.1 (we just upgraded!)

---

## What Are Meta Fields?

Meta fields are an optional object that can be added to tool definitions to provide structured metadata about the tool. They are:

- **Machine-readable**: Can be parsed and processed by tools, clients, or automation
- **Optional**: Not required for MCP compliance; purely additive
- **Flexible**: Can contain any key-value pairs as custom metadata
- **Untrustworthy in strict mode**: According to MCP spec, should be considered untrusted unless from a trusted server (but this is your own server)

### Standard Structure

```typescript
{
  name: "tasks",
  description: "...",
  inputSchema: { ... },
  meta?: {
    category: "string",           // Tool category/grouping
    stability: "stable|beta|experimental",  // Stability indicator
    version: "semantic_version",  // Tool version independent of server version
    deprecated: boolean,          // Deprecation status
    tags: string[],              // Custom tags for filtering
    complexity: "simple|moderate|complex",  // Query complexity
    performanceClass: "fast|moderate|slow"  // Expected execution time class
  }
}
```

---

## Opportunities for OmniFocus MCP

### 1. **Tool Organization & Discovery** 🎯

**Opportunity**: Automatically organize and display tools by category

```typescript
meta: {
  category: "Task Management",
  tags: ["queries", "read-only", "analytics"],
  priority: 1
}
```

**Benefits**:
- Claude Desktop can group tools by category in UI
- LLM can understand tool relationships and hierarchies
- Programmatic discovery: "show me all task management tools"
- Better documentation generation

**Applicable To**: All 17 tools
- Task Management: `tasks`, `manage_task`, `batch_create`
- Organization: `projects`, `folders`, `tags`
- Analytics: `productivity_stats`, `task_velocity`, `analyze_overdue`, etc.

---

### 2. **Performance Hints & Cost Awareness** ⚡

**Opportunity**: Help LLMs make intelligent decisions about tool selection

```typescript
meta: {
  performanceClass: "fast",        // < 500ms typical
  expectedTokens: 2000,            // Approximate response size
  complexity: "simple",            // Query complexity
  cacheEffective: true             // Benefits from caching
}
```

**Example Application**:
```typescript
// For productivity_stats (currently slow - 60s+)
meta: {
  performanceClass: "slow",
  expectedTokens: 5000,
  complexity: "complex",
  warning: "Analyzes entire database; can take 30-60 seconds"
}

// For simple queries
meta: {
  performanceClass: "fast",
  expectedTokens: 1000,
  complexity: "simple",
  cachedResponse: true
}
```

**Benefits**:
- LLMs can prioritize fast tools when time is critical
- Helps with token budgeting in multi-step queries
- Enables intelligent fallback strategies
- Supports cost-conscious deployments

**Applicable To**: All tools, especially analytics
- Fast: `tasks` (with filters), `projects` (list)
- Moderate: `workflow_analysis`, `patterns`
- Slow: `productivity_stats`, `task_velocity`

---

### 3. **Stability & Deprecation Management** 📦

**Opportunity**: Communicate API stability and evolution

```typescript
meta: {
  stability: "stable",             // stable, beta, experimental
  version: "2.2.0",               // Tool version (independent of server version)
  deprecated: false,
  successor: null                 // For deprecated tools
}
```

**Benefits**:
- Clients can warn users about beta tools
- Deprecation path for future versions
- Version tracking independent of server version
- Migration guidance when tools change

**Application**:
```typescript
// Stable tools (17 core tools)
meta: { stability: "stable", version: "2.2.0" }

// If we ever deprecate something:
meta: {
  stability: "deprecated",
  version: "2.1.0",
  successor: "new_tool_name",
  migrationGuide: "See docs/migration/v2.2.0.md"
}
```

---

### 4. **Capability & Limitation Documentation** 📋

**Opportunity**: Embed technical constraints and capabilities in metadata

```typescript
meta: {
  maxResults: 2000,
  maxQueryDuration: 60000,         // milliseconds
  requiresOmniFocusVersion: "4.6+",
  limitations: [
    "Bulk operations limited to 500 items",
    "Real-time updates not guaranteed"
  ],
  capabilities: [
    "full-text-search",
    "regex-filtering",
    "date-range-queries"
  ]
}
```

**Benefits**:
- LLMs understand hard limits before calling tools
- Reduces failed queries and retry storms
- Enables intelligent query optimization
- Helps with error prediction

**Application**:
```typescript
// For manage_task
meta: {
  maxResults: null,  // Single operation
  limitations: [
    "Task IDs are immutable after creation",
    "Moving tasks between projects preserves subtasks"
  ],
  capabilities: ["create", "update", "delete", "complete"]
}

// For analyze_patterns
meta: {
  maxQueryDuration: 120000,
  limitations: [
    "Requires minimum 100 tasks for meaningful patterns",
    "Pattern detection only on completed tasks"
  ]
}
```

---

### 5. **Authentication & Permission Requirements** 🔐

**Opportunity**: Declare permission requirements and constraints

```typescript
meta: {
  requiresPermission: true,
  requiredCapabilities: ["read", "write"],
  userConsentRequired: false,       // Already granted at startup
  auditLogged: true
}
```

**Benefits**:
- Clients can proactively check permissions
- Enables permission-based tool filtering
- Supports security-conscious deployments
- Compliance documentation

**Application**:
```typescript
// Read-only tools
meta: {
  requiresPermission: true,
  requiredCapabilities: ["read"],
  userConsentRequired: false,
  auditLogged: true
}

// Write tools
meta: {
  requiresPermission: true,
  requiredCapabilities: ["read", "write"],
  userConsentRequired: false,
  auditLogged: true
}
```

---

### 6. **Cost & Token Estimation** 💰

**Opportunity**: Enable token-aware query planning

```typescript
meta: {
  estimatedTokens: {
    min: 500,
    typical: 2000,
    max: 10000
  },
  costsAggressiveFiltering: true,  // If you use big limits
  filteringRecommendation: "Always use limit <= 50"
}
```

**Benefits**:
- Applications can estimate query costs before execution
- Supports token budgeting in multi-step workflows
- Helps with rate limiting decisions
- Enables cost-optimized LLM workflows

---

### 7. **Tool Grouping for Better LLM Reasoning** 🧠

**Opportunity**: Help LLMs understand tool relationships

```typescript
meta: {
  category: "Task Management",
  relatedTools: ["manage_task", "productivity_stats"],
  workflowClass: "query",           // query, mutation, analysis
  suggestedCombinations: [
    {
      with: "manage_task",
      reason: "Query first, then perform bulk updates"
    }
  ]
}
```

**Benefits**:
- Multi-step workflows become more intelligent
- Reduces irrelevant tool calls
- Improves accuracy of complex queries
- Helps with error recovery

---

### 8. **Feature Flags & A/B Testing** 🧪

**Opportunity**: Enable feature rollout and testing

```typescript
meta: {
  featureFlags: {
    "new-regex-engine": true,
    "experimental-caching": false
  },
  beta: false,
  experimental: false
}
```

**Benefits**:
- Gradual rollout of new features
- A/B testing support
- Feature opt-in/opt-out
- Backward compatibility management

---

## Implementation Strategy

### Phase 1: Essential Metadata (v2.3.0)
- Add `category` to all tools
- Add `stability` to all tools
- Add `complexity` to analytical tools
- Add `performanceClass` to all tools

**Effort**: ~20 minutes
**Impact**: High (immediate tool organization benefits)

### Phase 2: Capability Documentation (v2.4.0)
- Add `limitations` and `capabilities`
- Add `maxResults` and `maxQueryDuration`
- Add `requiresPermission`

**Effort**: ~30 minutes
**Impact**: Very High (reduces failed queries)

### Phase 3: Advanced Features (Future)
- Token estimation
- Tool relationships
- Feature flags
- Cost tracking

---

## How to Use Meta Fields in OmniFocus MCP

### Quick Example

In `src/tools/tasks/QueryTasksToolV2.ts`:

```typescript
export class QueryTasksToolV2 implements Tool {
  name = 'tasks';
  description = '...';
  inputSchema = { ... };

  // NEW: Add meta fields
  meta = {
    category: 'Task Management',
    stability: 'stable',
    version: '2.2.0',
    complexity: 'moderate',
    performanceClass: 'fast',
    tags: ['queries', 'read-only'],
    capabilities: ['search', 'filter', 'sort', 'paginate']
  };

  // ... rest of implementation
}
```

### In Tool Registration

Update `src/tools/index.ts`:

```typescript
// Register handlers
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      meta: t.meta,  // NEW: Include meta fields
    })),
  };
});
```

---

## Strategic Value

### For Users/Developers
- **Better tool discovery**: Know what each tool does and costs
- **Intelligent querying**: LLMs can make smarter tool selection
- **Error prevention**: Know tool limits before hitting them
- **Documentation**: Auto-generated, accurate, always current

### For LLMs
- **Reasoning**: Understand tool capabilities and limitations
- **Planning**: Optimize queries based on cost/performance
- **Recovery**: Better error handling with capability information
- **Efficiency**: Avoid tools that can't handle the query

### For Your Codebase
- **Type safety**: TypeScript interfaces for metadata
- **Maintainability**: Metadata stays with tool implementation
- **Scalability**: Easy to add new metadata as needs evolve
- **Observability**: Metrics and monitoring use metadata

---

## Recommendation

**Implement Phase 1 now** (20 minutes):
- Add category, stability, version to all tools
- This provides immediate value with minimal effort
- Enables better tool organization in UI
- Helps LLMs understand tool landscape

**Save Phase 2 for next iteration** (30 minutes):
- Add limitations and capability information
- This reduces failed queries significantly
- Can be data-driven (analyze logs first)

---

## Next Steps

1. **Review this document** - Understand opportunities and impact
2. **Decide scope** - Which phases/features matter most?
3. **Implement** - Add meta fields to tool definitions
4. **Test** - Verify metadata is included in tool list responses
5. **Measure** - Track reduction in failed queries, token usage

---

## Reference

- **MCP Specification**: https://modelcontextprotocol.io/specification/2025-06-18/
- **SDK Support**: Available in @modelcontextprotocol/sdk@^1.18.0+
- **Current Version**: 1.20.1 ✅

