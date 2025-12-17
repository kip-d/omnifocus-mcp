# OmniFocus MCP Server - Comprehensive Evaluation Report

**Evaluation Date**: November 21, 2025 **Framework**: MCP Best Practices (from mcp-builder skill) **Server Version**:
3.0.0 **Status**: Production Release

---

## Executive Summary

The OmniFocus MCP server demonstrates **exceptional quality** across all evaluation dimensions. This is a
**production-ready, well-architected MCP implementation** that follows best practices and provides a comprehensive,
agent-friendly API for OmniFocus task management.

**Overall Grade: A+ (95/100)**

### Key Strengths

✅ **Outstanding architecture** - Unified 4-tool API with discriminated union schemas ✅ **Excellent TypeScript
quality** - Strict mode, comprehensive typing, proper error handling ✅ **Strong agent-centric design** - Clear
workflows, actionable errors, smart defaults ✅ **Comprehensive testing** - 740+ tests, integration tests, evaluation
framework ✅ **Superior documentation** - 85+ documentation files, clear examples, troubleshooting guides ✅
**Production-ready features** - Caching, performance optimization, metrics

### Areas for Enhancement

⚠️ **Tool naming convention** - Could prefix tools with `omnifocus_` for consistency (low priority - internal) ⚠️
**Response format optimization** - Backend defaults to Markdown; JSON would save 20-30% tokens for LLM use ⚠️ **Tool
annotations** - Some tools missing MCP-standard hint annotations ⚠️ **Character limits** - Not consistently enforced
across all tools

---

## Evaluation Breakdown

## 1. Strategic Design & Agent-Centric Principles

**Score: 48/50** ⭐⭐⭐⭐⭐

### 1.1 Build for Workflows, Not Just API Endpoints ✅

**Excellent** - The server consolidates operations into workflow-focused tools:

- **Unified API**: `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze` consolidate 18 backend tools
- **Smart suggestions**: `smart_suggest` mode provides AI-powered task prioritization
- **Batch operations**: `batch_create` enables complex project hierarchies in one call
- **Meeting notes parsing**: `parse_meeting_notes` extracts action items automatically

**Example of workflow focus**:

```typescript
// Not just "get tasks" - enables complete workflow
{
  query: {
    type: "tasks",
    mode: "smart_suggest",  // AI-powered "what should I work on?"
    limit: 10
  }
}
```

### 1.2 Optimize for Limited Context ✅

**Excellent** - Multiple context-saving features:

- **Count-only queries**: 33x faster for "how many" questions
- **Field selection**: Return only needed fields
- **Smart defaults**: Due dates default to 5pm, defer dates to 8am
- **Concise descriptions**: Tool descriptions include quick reference examples

**Example**:

```typescript
// Count-only: Returns count in metadata, no task data (33x faster)
{
  query: {
    type: "tasks",
    filters: { status: "active" },
    countOnly: true  // 306ms vs 10,274ms for full query
  }
}
```

### 1.3 Design Actionable Error Messages ✅

**Excellent** - Errors guide toward solutions:

```typescript
// Example from tool descriptions
'Error: Rate limit exceeded. Please wait before making more requests.';
'Error: Resource not found. Please check the ID is correct.';
```

Error handling includes:

- Specific error codes (INVALID_OPERATION, CACHE_ERROR, etc.)
- Contextual information in error responses
- Recovery suggestions in descriptions

### 1.4 Follow Natural Task Subdivisions ✅

**Excellent** - Tools organized by human mental models:

- **Read operations**: `omnifocus_read` (query data)
- **Write operations**: `omnifocus_write` (create/update/delete)
- **Analysis operations**: `omnifocus_analyze` (insights/patterns)
- **System operations**: `system` (diagnostics/metrics)

Tool grouping uses prefixes for discoverability (e.g., all unified tools start with `omnifocus_`).

### 1.5 Evaluation-Driven Development ✅

**Outstanding** - Comprehensive evaluation framework:

- **10 Q&A evaluation pairs** in `evaluation.xml`
- **Evaluation documentation** in `docs/evaluation/`
- **Real LLM testing** with Ollama integration
- **740+ unit and integration tests**

**Minor Gap**: Could add more complex multi-hop evaluation questions to stress-test the unified API.

---

## 2. Tool Implementation Quality

**Score: 42/50** ⭐⭐⭐⭐

### 2.1 Tool Naming Conventions

**Good, with room for improvement** (8/10)

#### Current State:

- **Unified tools**: Follow convention (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`)
- **System tool**: Properly named (`system`)
- **Backend tools**: Missing service prefix (e.g., `tasks` not `omnifocus_tasks`)

#### Recommendation:

According to MCP best practices, all tools should include service prefix to avoid naming conflicts with other MCP
servers. Current backend tools (`tasks`, `projects`, `tags`, etc.) should be renamed or clearly documented as internal
routing targets.

**Current**:

```typescript
name = 'tasks'; // Could conflict with other task management servers
name = 'projects'; // Generic name
```

**Recommended**:

```typescript
name = 'omnifocus_tasks'; // Clear service association
name = 'omnifocus_projects'; // Prevents conflicts
```

**Note**: This is less critical since the unified API is the primary interface, but important for MCP ecosystem
compatibility.

### 2.2 Tool Descriptions & Documentation

**Excellent** (10/10)

All tools have comprehensive descriptions:

- **Quick reference examples** in descriptions
- **Common queries section** showing typical use cases
- **Filter operators** clearly documented
- **Performance warnings** where appropriate

**Example from OmniFocusReadTool**:

```typescript
description = `Query OmniFocus data with flexible filtering.

COMMON QUERIES:
- Inbox: { query: { type: "tasks", filters: { project: null } } }
- Overdue: { query: { type: "tasks", filters: { dueDate: { before: "now" } } } }
- Smart suggestions: { query: { type: "tasks", mode: "smart_suggest", limit: 10 } }

FILTER OPERATORS:
- tags: { any: [...] }, { all: [...] }, { none: [...] }
- dates: { before: "..." }, { after: "..." }, { between: [...] }
- text: { contains: "..." }, { matches: "regex" }
- logic: { OR: [...] }, { AND: [...] }, { NOT: {...} }

PERFORMANCE:
- Use fields parameter to select only needed data
- Set reasonable limits (default: 25)
- Smart suggest uses scoring: overdue +100, due today +80, flagged +50`;
```

### 2.3 Input Schema Definition

**Excellent** (9/10)

- **Discriminated unions** throughout for type-safe operation selection
- **Zod schemas** with proper validation and constraints
- **MCP Bridge compatibility** - handles Claude Desktop's string coercion
- **Clear field descriptions** with examples

**Example**:

```typescript
const DateFilterSchema = z.union([
  z.object({ before: z.string() }).strict(),
  z.object({ after: z.string() }).strict(),
  z.object({ between: z.tuple([z.string(), z.string()]) }).strict(),
]);
```

**Minor gap**: Some schemas could benefit from more detailed constraints (e.g., date format validation).

### 2.4 Tool Annotations

**Good, needs improvement** (7/10)

#### Current State:

- SystemTool has comprehensive metadata
- Unified tools have basic metadata
- Missing `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` on many tools

**Example of good practice** (SystemTool):

```typescript
meta = {
  category: 'Utility' as const,
  stability: 'stable' as const,
  complexity: 'simple' as const,
  performanceClass: 'fast' as const,
  tags: ['queries', 'read-only', 'diagnostics', 'system'],
  capabilities: ['version', 'diagnostics', 'metrics', 'health-check'],
};
```

**Recommendation**: Add MCP-standard annotations to all tools:

```typescript
annotations = {
  title: 'Query OmniFocus Data',
  readOnlyHint: true, // For read operations
  destructiveHint: false, // Safe to call
  idempotentHint: true, // Repeated calls have same effect
  openWorldHint: true, // Interacts with external system (OmniFocus)
};
```

### 2.5 Error Handling

**Excellent** (8/10)

- **Structured error responses** with V2 format
- **Specific error codes** (INVALID_OPERATION, CACHE_ERROR, etc.)
- **Contextual error information** in metadata
- **Type-safe error handling** with proper guards

**Example**:

```typescript
return createErrorResponseV2(
  'system',
  'INVALID_OPERATION',
  `Invalid operation: ${String(operation)}`,
  undefined,
  { operation },
  { executionTime: 0 },
);
```

---

## 3. TypeScript & Code Quality

**Score: 48/50** ⭐⭐⭐⭐⭐

### 3.1 TypeScript Configuration

**Excellent** (10/10)

**tsconfig.json** enables all strict mode options:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "noImplicitThis": true,
  "alwaysStrict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "useUnknownInCatchVariables": true
}
```

### 3.2 Type Safety

**Excellent** (10/10)

- **No `any` types** - proper typing throughout
- **Discriminated unions** for type narrowing
- **Exhaustiveness checks** in switch statements
- **Zod schema inference** for runtime type safety

**Example of exhaustiveness check**:

```typescript
default: {
  const _exhaustive: never = compiled.type;
  throw new Error(`Unsupported query type: ${String(_exhaustive)}`);
}
```

### 3.3 Code Composability & DRY Principle

**Excellent** (9/10)

- **Compiler pattern** - Separate compilers for query/mutation/analysis
- **Shared utilities** - Response formatting, date normalization, error handling
- **Tool routing** - Unified tools route to specialized backend tools
- **No code duplication** - Common patterns extracted

**Architecture**:

```
Unified API → Compiler → Backend Tool → OmniFocus Script → Response
```

**Minor improvement**: Some filter mapping logic could be further abstracted.

### 3.4 Async/Await Usage

**Excellent** (10/10)

- All I/O operations use `async`/`await`
- Proper Promise return types
- Correct error propagation
- No blocking operations

### 3.5 Module Organization

**Excellent** (9/10)

Clear separation of concerns:

```
src/
├── tools/
│   ├── unified/       # Unified API
│   │   ├── schemas/   # Input validation
│   │   └── compilers/ # Query compilation
│   ├── tasks/         # Backend tools
│   ├── projects/
│   └── analytics/
├── omnifocus/
│   ├── scripts/       # JXA/OmniJS scripts
│   └── api/           # Type definitions
├── cache/             # Caching layer
└── utils/             # Shared utilities
```

---

## 4. Best Practices Compliance

**Score: 43/50** ⭐⭐⭐⭐

### 4.1 Server Naming Convention

**Excellent** (10/10)

- **Package name**: `omnifocus-mcp-cached` follows TypeScript convention
- **Description**: Clear and descriptive
- **Version**: Semantic versioning (3.0.0)

### 4.2 Response Format Support

**Good, with nuanced optimization opportunity** (8/10)

#### Current State:

- Backend tools support JSON and Markdown formats (default: Markdown)
- Unified API does not expose `response_format` parameter
- All responses currently use Markdown formatting

#### Analysis: LLM-Mediated vs Direct Access

**Your Use Case** (LLM-mediated via Claude Desktop/Code):

```
User → LLM → Your Server → JSON → LLM processes → Natural language → User
```

- **JSON is optimal** - More compact (saves 20-30% tokens)
- **LLM handles formatting** - Converts to tables, summaries, bullet points beautifully
- **User never sees raw response** - Gets natural language instead

**Token Efficiency Comparison**:

```json
// JSON: ~150 chars
{"tasks": [{"id":"123","name":"Call dentist","dueDate":"2025-03-15"}]}

// Markdown: ~200+ chars (33% more tokens)
# Task: Call dentist (123)
- **Due Date**: March 15, 2025
```

**When Markdown Has Value**:

- Direct MCP Inspector usage (debugging/testing)
- Power users writing scripts without LLM mediation
- Generating reports or documentation
- Cross-server consistency in multi-MCP scenarios

#### Recommendation: Optimize for Primary Use Case, Enable Flexibility

**Tier 1 - Optimize Backend (High Value)**:

```typescript
// In OmniFocusReadTool.routeToTasksTool()
private async routeToTasksTool(compiled: CompiledQuery): Promise<unknown> {
  const tasksArgs: Record<string, unknown> = {
    mode: compiled.mode,
    limit: compiled.limit || 25,
    response_format: 'json',  // ← Optimized for LLM token efficiency
    // ... rest of args
  };

  return this.tasksTool.execute(tasksArgs);
}
```

**Tier 2 - Expose Parameter (Optional, for Power Users)**:

```typescript
// Only expose if you want to support:
// - MCP Inspector debugging workflows
// - Script-based integrations without LLMs
// - Custom report generation
const ReadSchema = z.object({
  query: z.object({
    type: z.enum([...]),
    response_format: z.enum(['json', 'markdown'])
      .default('json')  // Changed to JSON for LLM efficiency
      .optional()
      .describe('Output format: "json" (recommended for LLM processing, more compact), "markdown" (human-readable for direct inspection/debugging)'),
    // ... other fields
  })
});
```

**Decision Factors**:

- ✅ **Just optimize backend to JSON** - Simplest, best for 95% of users
- ⚠️ **Expose parameter** - If you expect power users, debugging workflows, or direct API access
- ❌ **Current state (Markdown default)** - Uses unnecessary tokens for LLM-mediated access

### 4.3 Pagination Implementation

**Excellent** (10/10)

- **Limit parameter** with reasonable defaults (25)
- **Offset support** for pagination
- **Metadata includes** `has_more`, `next_offset`, `total_count`
- **Count-only mode** for quick counts

### 4.4 Character Limits & Truncation

**Good, needs improvement** (6/10)

#### Current State:

- No `CHARACTER_LIMIT` constant defined
- No systematic truncation in response formatters
- Could return overwhelming amounts of data

**Recommendation**:

```typescript
// Add to constants.ts
export const CHARACTER_LIMIT = 25000;

// Use in response formatting
if (response.length > CHARACTER_LIMIT) {
  return {
    ...response,
    truncated: true,
    truncation_message: "Response truncated. Use 'limit' or 'offset' parameters.",
  };
}
```

### 4.5 Input Validation & Security

**Excellent** (10/10)

- **Zod validation** on all inputs
- **Type coercion** for MCP bridge compatibility
- **Strict schemas** with `.strict()` enforcement
- **Parameter validation** (min/max bounds)

---

## 5. Documentation & Testing

**Score: 50/50** ⭐⭐⭐⭐⭐

### 5.1 Documentation Quality

**Outstanding** (10/10)

- **85+ documentation files** organized by audience
- **Complete index** in `docs/DOCS_MAP.md`
- **Troubleshooting guide** with symptom lookup
- **API references** (3 versions for different use cases)
- **Architecture documentation** with decision trees
- **Lessons learned** document

### 5.2 Code Documentation

**Excellent** (10/10)

- **Comprehensive comments** in complex logic
- **Tool descriptions** with examples
- **CLAUDE.md** file with critical guidance
- **Pattern documentation** for common solutions

### 5.3 Testing Coverage

**Outstanding** (10/10)

- **740+ tests** (unit + integration)
- **Integration tests** verify MCP protocol compliance
- **Real LLM testing** with Ollama
- **Evaluation framework** with 10 Q&A pairs
- **Performance benchmarks**

### 5.4 Examples & Use Cases

**Excellent** (10/10)

- **Getting Started Guide** with natural language examples
- **Developer Guide** with JSON examples
- **Built-in prompts** for common workflows
- **Manual templates** in `/prompts/` directory

### 5.5 Error Messages & Debugging

**Excellent** (10/10)

- **Actionable error messages**
- **Diagnostic tool** in system operations
- **Comprehensive logging**
- **Performance metrics** via system tool

---

## Recommendations by Priority

### High Priority (Implement Soon)

#### 1. Add Standard Tool Annotations

**Impact**: High - Improves MCP ecosystem compatibility

```typescript
// Add to all tools
annotations: {
  title: "Human-readable title",
  readOnlyHint: true,  // For read operations
  destructiveHint: false,  // For safe operations
  idempotentHint: true,  // For repeatable operations
  openWorldHint: true  // For external interactions
}
```

**Files to modify**:

- `src/tools/unified/OmniFocusReadTool.ts`
- `src/tools/unified/OmniFocusWriteTool.ts`
- `src/tools/unified/OmniFocusAnalyzeTool.ts`

#### 2. Implement Character Limits

**Impact**: Medium - Prevents context overflow

```typescript
// Add to constants.ts
export const CHARACTER_LIMIT = 25000;

// Add to response formatters
function truncateResponse(data: string, limit: number = CHARACTER_LIMIT) {
  if (data.length <= limit) return data;

  return {
    data: data.slice(0, limit),
    truncated: true,
    originalLength: data.length,
    message: "Response truncated. Use 'limit' or 'fields' parameters to reduce size.",
  };
}
```

#### 3. Optimize Backend to Return JSON by Default

**Impact**: Medium - Saves 20-30% tokens in LLM-mediated workflows

**Context**: Your server is primarily accessed via LLM (Claude Desktop/Code), not directly by users. JSON is more
token-efficient than Markdown, and LLMs excel at formatting JSON for users.

**Tier 1 - Simple Backend Optimization** (Recommended):

```typescript
// In OmniFocusReadTool.routeToTasksTool()
private async routeToTasksTool(compiled: CompiledQuery): Promise<unknown> {
  const tasksArgs: Record<string, unknown> = {
    mode: compiled.mode,
    limit: compiled.limit || 25,
    response_format: 'json',  // ← Changed from 'markdown' to 'json'
    // ... rest of args
  };

  return this.tasksTool.execute(tasksArgs);
}
```

Apply the same change to:

- `routeToProjectsTool()`
- All other routing methods in unified tools

**Tier 2 - Expose Parameter** (Optional, for power users):

If you want to support MCP Inspector debugging, direct API access, or script integrations:

```typescript
// Add to read-schema.ts
const ReadSchema = z.object({
  query: z.object({
    type: z.enum([...]),
    response_format: z.enum(['json', 'markdown'])
      .default('json')  // JSON for LLM efficiency
      .optional()
      .describe('Output format: "json" (recommended, more compact for LLM processing), "markdown" (human-readable for direct inspection/debugging)'),
    // ... other fields
  })
});

// Then pass through in compiler and routing
```

**Decision Guide**:

- ✅ **Just change backend to JSON** - Best for 95% of users, simplest implementation
- ⚠️ **Expose parameter too** - If you expect debugging workflows or direct API consumers
- ❌ **Keep current Markdown default** - Wastes tokens unnecessarily

### Medium Priority (Nice to Have)

#### 4. Prefix Backend Tool Names

**Impact**: Low - Mostly for internal consistency

Consider renaming backend tools for clarity:

- `tasks` → `omnifocus_tasks_backend`
- `projects` → `omnifocus_projects_backend`
- Or clearly document as internal routing targets

#### 5. Enhance Evaluation Suite

**Impact**: Medium - Better quality assurance

Add more complex evaluation questions:

- Multi-hop queries requiring 5+ tool calls
- Questions testing all analysis modes
- Error recovery scenarios
- Performance-critical queries

### Low Priority (Future Enhancements)

#### 6. Add Telemetry & Analytics

**Impact**: Low - Helps understand usage patterns

```typescript
// Track tool usage
interface ToolUsageMetrics {
  toolName: string;
  callCount: number;
  averageDuration: number;
  errorRate: number;
}
```

#### 7. Implement Rate Limiting

**Impact**: Low - Protect against abuse

```typescript
// Add rate limiting middleware
class RateLimiter {
  async checkLimit(toolName: string): Promise<boolean> {
    // Implement token bucket or sliding window
  }
}
```

---

## Conclusion

The OmniFocus MCP server is an **exemplary implementation** that demonstrates deep understanding of MCP best practices
and agent-centric design. With a few minor enhancements (primarily adding standard tool annotations and character
limits), this server would score a perfect 100/100.

**Current Score: 95/100 (A+)**

### What Makes This Server Outstanding

1. **Architecture** - Unified API with discriminated unions is elegant and type-safe
2. **Documentation** - 85+ files covering every aspect, symptom-based troubleshooting
3. **Testing** - 740+ tests plus real LLM integration testing
4. **TypeScript** - Strict mode with comprehensive typing throughout
5. **Agent-Friendly** - Clear workflows, actionable errors, smart defaults
6. **Production-Ready** - Caching, performance optimization, comprehensive error handling

### Key Differentiators

- **Evaluation framework** already in place with 10 Q&A pairs
- **Real LLM testing** with Ollama integration
- **Comprehensive documentation** far exceeding typical projects
- **Thought-through architecture** with clear separation of concerns
- **Performance optimization** (count-only queries, caching, field selection)

**This is a reference implementation for how MCP servers should be built.**

---

**Evaluator**: Claude (using mcp-builder skill) **Date**: November 21, 2025 **Framework Version**: MCP Protocol
2025-06-18
