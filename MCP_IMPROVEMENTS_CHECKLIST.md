# MCP Improvements Checklist

**Based on**: MCP Builder Skill Evaluation (November 21, 2025) **Current Score**: 95/100 (A+) **Target Score**: 100/100

---

## Quick Summary

Your OmniFocus MCP server is **outstanding** (95/100). These improvements will bring it to a perfect score:

- ✅ **Add tool annotations** (readOnlyHint, destructiveHint, etc.)
- ✅ **Implement character limits** (25,000 char truncation)
- ✅ **Optimize backend to JSON** (save 20-30% tokens; optionally expose format parameter for power users)

---

## High Priority Improvements

### ☑️ 1. Add Standard Tool Annotations

**Why**: MCP ecosystem compatibility, better client UX **Effort**: Low (~30 minutes) **Impact**: High

#### What to Do:

Add annotations to all tool definitions:

```typescript
// Example for OmniFocusReadTool
export class OmniFocusReadTool extends BaseTool<typeof ReadSchema, unknown> {
  name = 'omnifocus_read';
  description = `...`;
  schema = ReadSchema;

  // ADD THIS:
  annotations = {
    title: 'Query OmniFocus Data',
    readOnlyHint: true, // Does not modify data
    destructiveHint: false, // Safe to call repeatedly
    idempotentHint: true, // Same params = same result
    openWorldHint: true, // Interacts with OmniFocus (external system)
  };

  meta = {
    // ... existing meta
  };
}
```

#### Files to Modify:

1. **src/tools/unified/OmniFocusReadTool.ts**

   ```typescript
   annotations = {
     title: 'Query OmniFocus Data',
     readOnlyHint: true,
     destructiveHint: false,
     idempotentHint: true,
     openWorldHint: true,
   };
   ```

2. **src/tools/unified/OmniFocusWriteTool.ts**

   ```typescript
   annotations = {
     title: 'Manage OmniFocus Tasks',
     readOnlyHint: false, // Modifies data
     destructiveHint: true, // Delete is permanent
     idempotentHint: false, // Multiple calls have different effects
     openWorldHint: true,
   };
   ```

3. **src/tools/unified/OmniFocusAnalyzeTool.ts**

   ```typescript
   annotations = {
     title: 'Analyze OmniFocus Data',
     readOnlyHint: true,
     destructiveHint: false,
     idempotentHint: true,
     openWorldHint: true,
   };
   ```

4. **src/tools/system/SystemTool.ts** (already has meta, add annotations)
   ```typescript
   annotations = {
     title: 'System Utilities',
     readOnlyHint: true,
     destructiveHint: false,
     idempotentHint: true,
     openWorldHint: false, // No external interaction
   };
   ```

#### How to Register Annotations:

Check your tool registration in `src/index.ts`. If using the standard MCP SDK pattern, annotations should be part of the
tool definition:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.schema),
        annotations: tool.annotations, // ADD THIS
      },
    ],
  };
});
```

---

### ☑️ 2. Implement Character Limits

**Why**: Prevent context overflow for LLMs **Effort**: Medium (~1 hour) **Impact**: Medium

#### What to Do:

**Step 1**: Add constant to `src/utils/constants.ts` (create if doesn't exist):

```typescript
/**
 * Maximum response size in characters to prevent overwhelming LLM context.
 * Based on MCP best practices recommendation.
 */
export const CHARACTER_LIMIT = 25000;
```

**Step 2**: Create truncation utility in `src/utils/response-format.ts`:

```typescript
import { CHARACTER_LIMIT } from './constants.js';

export interface TruncationInfo {
  truncated: boolean;
  originalLength?: number;
  truncatedLength?: number;
  message?: string;
}

export function truncateResponse<T>(
  data: T,
  limit: number = CHARACTER_LIMIT,
): { data: T; truncation?: TruncationInfo } {
  const serialized = JSON.stringify(data);

  if (serialized.length <= limit) {
    return { data };
  }

  // For arrays, truncate by removing items from the end
  if (Array.isArray(data)) {
    const truncatedData = data.slice(0, Math.max(1, Math.floor(data.length / 2)));
    return {
      data: truncatedData as T,
      truncation: {
        truncated: true,
        originalLength: data.length,
        truncatedLength: truncatedData.length,
        message: `Response truncated from ${data.length} to ${truncatedData.length} items. Use 'limit' or 'offset' parameters to see more results.`,
      },
    };
  }

  // For strings, truncate with ellipsis
  if (typeof data === 'string') {
    return {
      data: (data.slice(0, limit - 100) + '\n\n[... truncated ...]') as T,
      truncation: {
        truncated: true,
        originalLength: data.length,
        truncatedLength: limit,
        message: 'Response truncated. Use filters to reduce result size.',
      },
    };
  }

  // For objects, return as-is (already limited by other mechanisms)
  return { data };
}
```

**Step 3**: Apply to response creators in `src/utils/response-format.ts`:

```typescript
export function createTaskResponseV2(
  tool: string,
  tasks: OmniFocusTask[],
  operation?: string,
  metadata?: Record<string, unknown>,
  customMetadata?: Record<string, unknown>,
): TasksResponseV2 {
  // ADD TRUNCATION CHECK
  const { data: truncatedTasks, truncation } = truncateResponse(tasks);

  return {
    success: true,
    data: {
      items: truncatedTasks,
      count: truncatedTasks.length,
      total: tasks.length, // Original count
    },
    metadata: {
      tool,
      operation,
      // ADD TRUNCATION INFO
      ...(truncation && {
        truncated: truncation.truncated,
        truncation_message: truncation.message,
      }),
      ...metadata,
      ...customMetadata,
    },
  };
}
```

**Step 4**: Test the truncation:

```bash
# Create test with large result set
npm run test:unit -- truncation

# Or add to existing tests
```

---

### ☑️ 3. Optimize Backend to Return JSON (Token Efficiency)

**Why**: Save 20-30% tokens in LLM-mediated workflows **Effort**: Low (~15 minutes for Tier 1, +15 minutes for Tier 2)
**Impact**: Medium (token savings) + Optional (power user flexibility)

#### Understanding the Context

**Your Use Case**: LLM-mediated access (Claude Desktop/Code)

```
User → Claude → Your Server (JSON) → Claude formats → Natural language to user
```

**Current State**: Backend tools default to Markdown

- More verbose (33% more characters)
- Wastes tokens (LLM never shows user the raw Markdown)
- LLM is excellent at formatting JSON into readable output

**Token Comparison**:

```json
// JSON (efficient): ~150 chars
{"tasks": [{"id":"123","name":"Call dentist","dueDate":"2025-03-15"}]}

// Markdown (verbose): ~200+ chars
# Task: Call dentist (123)
- **Due Date**: March 15, 2025
```

**When Markdown Has Value**:

- MCP Inspector debugging/testing
- Power users writing scripts without LLM
- Direct API access for report generation

#### Implementation Options

**TIER 1: Simple Backend Optimization** (Recommended - Best for 95% of users)

Just change the default format passed to backend tools:

**Step 1**: Update `src/tools/unified/OmniFocusReadTool.ts`:

```typescript
private async routeToTasksTool(compiled: CompiledQuery): Promise<unknown> {
  const tasksArgs: Record<string, unknown> = {
    mode: compiled.mode,
    limit: compiled.limit || 25,
    response_format: 'json',  // ← Changed from 'markdown' to 'json'
    // ... rest of args
  };

  return this.tasksTool.execute(tasksArgs);
}

// Apply the same change to:
private async routeToProjectsTool(compiled: CompiledQuery): Promise<unknown> {
  const projectsArgs: Record<string, unknown> = {
    operation: 'list',
    response_format: 'json',  // ← Add this
    // ... rest
  };
}

// And all other routing methods
```

**That's it!** Backend tools already support both formats - you're just changing the default.

**TIER 2: Expose Parameter** (Optional - For power users, debugging, direct API access)

If you want to allow users to choose the format (for MCP Inspector, debugging, or script integrations):

**Step 1**: Update `src/tools/unified/schemas/read-schema.ts`:

```typescript
const ResponseFormatEnum = z.enum(['json', 'markdown']);

export const ReadSchema = z.object({
  query: z.object({
    type: z.enum(['tasks', 'projects', 'tags', 'perspectives', 'folders']),

    // ADD THIS FIELD
    response_format: ResponseFormatEnum.default('json') // Note: JSON default for LLM efficiency
      .optional()
      .describe(
        'Output format: "json" (recommended for LLM processing, 20-30% more compact), "markdown" (human-readable for direct inspection/debugging)',
      ),

    filters: FilterSchema.optional(),
    // ... rest of fields
  }),
});
```

**Step 2**: Update compiler `src/tools/unified/compilers/QueryCompiler.ts`:

```typescript
export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  // ... other fields
  response_format?: 'json' | 'markdown';
}

export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    return {
      // ... other fields
      response_format: query.response_format || 'json',
    };
  }
}
```

**Step 3**: Update routing to use compiled format:

```typescript
private async routeToTasksTool(compiled: CompiledQuery): Promise<unknown> {
  const tasksArgs: Record<string, unknown> = {
    mode: compiled.mode,
    response_format: compiled.response_format || 'json',
    // ... rest
  };
}
```

#### Decision Guide

Choose your approach:

| Option            | Effort | Best For                  | Flexibility   |
| ----------------- | ------ | ------------------------- | ------------- |
| **Tier 1 only**   | 15 min | 95% of users (LLM access) | Fixed JSON    |
| **Tier 1 + 2**    | 30 min | Power users + debugging   | User choice   |
| **Current state** | 0 min  | Nobody (wastes tokens)    | Uses Markdown |

**Recommendation**: Start with Tier 1 (simple backend optimization). Add Tier 2 later if you get requests for Markdown
output or need better debugging workflows.

---

## Medium Priority Improvements

### 4. Consider Prefixing Backend Tool Names

**Why**: Avoid naming conflicts in MCP ecosystem **Effort**: Medium (2-3 hours - requires testing) **Impact**: Low
(mostly internal consistency)

**Decision Point**: Since your **unified API is the primary interface**, this is optional. Backend tools are internal
routing targets.

**If you choose to do this**:

```typescript
// Option 1: Rename backend tools
export class QueryTasksTool {
  name = 'omnifocus_tasks_backend'; // Clear internal designation
}

// Option 2: Document as internal
// Add to CLAUDE.md:
// Backend tools (tasks, projects, tags) are internal routing targets.
// Users should use the unified API (omnifocus_read, omnifocus_write, omnifocus_analyze).
```

### 5. Enhance Evaluation Suite

**Why**: Better quality assurance **Effort**: High (~4 hours) **Impact**: Medium

**Add to `evaluation.xml`**:

```xml
<!-- Multi-hop query -->
<qa_pair>
  <question>Find all overdue tasks in sequential projects, group by project, and identify which project has the task with the earliest due date. What is the project name?</question>
  <answer>[Expected answer]</answer>
</qa_pair>

<!-- Analysis tool testing -->
<qa_pair>
  <question>Run productivity stats analysis for the last 7 days and identify which day had the highest completion rate. Answer in format: YYYY-MM-DD.</question>
  <answer>[Expected answer]</answer>
</qa_pair>

<!-- Error recovery -->
<qa_pair>
  <question>Query tasks with an invalid filter syntax, then use the error message to correct the query and retrieve inbox tasks. How many inbox tasks exist?</question>
  <answer>[Expected answer]</answer>
</qa_pair>
```

---

## Testing Checklist

After implementing improvements:

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Focus on new functionality
npm run test:unit -- annotations
npm run test:unit -- truncation
npm run test:unit -- response-format
```

### Integration Tests

```bash
# Run full integration suite
npm run test:integration

# Test MCP protocol compliance
npm run test:integration -- mcp-protocol
```

### Manual Testing

```bash
# Test tool discovery shows annotations
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js

# Look for "annotations" field in response

# Test backend returns JSON (Tier 1)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"omnifocus_read","arguments":{"query":{"type":"tasks","mode":"inbox","limit":"5"}}}}' | node dist/index.js

# Verify response is JSON (not Markdown)

# Test response_format parameter (Tier 2 - if implemented)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"omnifocus_read","arguments":{"query":{"type":"tasks","mode":"inbox","limit":"5","response_format":"markdown"}}}}' | node dist/index.js

# Compare JSON vs Markdown formatting

# Test character limit with large query
echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"omnifocus_read","arguments":{"query":{"type":"tasks","mode":"all","limit":"1000"}}}}' | node dist/index.js

# Check for truncation_message in response
```

### Evaluation Suite

```bash
# Run full evaluation (requires Anthropic API key)
export ANTHROPIC_API_KEY=your_key_here
python scripts/evaluation.py -t stdio -c node -a dist/index.js evaluation.xml

# Should maintain or improve >80% accuracy
```

---

## Implementation Order

**Recommended sequence** (easiest to hardest):

1. ✅ **Add tool annotations** (~30 min)
   - Straightforward, no logic changes
   - High impact for MCP compliance

2. ✅ **Optimize backend to JSON** (~15 min Tier 1, +15 min Tier 2)
   - Change defaults in routing methods (Tier 1)
   - Optionally expose parameter for power users (Tier 2)
   - Medium impact for token efficiency

3. ✅ **Implement character limits** (~1 hour)
   - Requires utility functions + testing
   - Medium impact for context management

4. ⚠️ **Backend tool naming** (~2-3 hours) - Optional
   - Low priority, mostly for consistency
   - Can defer or skip entirely

5. ⚠️ **Enhanced evaluations** (~4 hours) - Optional
   - Nice to have, not critical
   - Can be done incrementally

---

## Success Criteria

### After completing high-priority items:

- ✅ All tools have complete `annotations` objects
- ✅ Tool discovery returns annotations in MCP protocol
- ✅ Backend defaults to JSON for LLM token efficiency
- ✅ (Optional) `response_format` parameter exposed for power users
- ✅ Large responses include truncation warnings
- ✅ All tests still pass (740+ tests)
- ✅ Evaluation score remains >80%

### Final score prediction:

**100/100** - Perfect MCP implementation

---

## Questions?

Refer to:

- **Full evaluation**: `MCP_BUILDER_EVALUATION.md`
- **MCP Best Practices**:
  `/Users/kip/.claude/plugins/marketplaces/anthropic-agent-skills/mcp-builder/reference/mcp_best_practices.md`
- **Tool annotations spec**: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

---

**Status**: Ready to implement **Estimated Total Time**: 2-3 hours for high-priority items **Expected Outcome**: Perfect
100/100 MCP score
