# TypeScript Generics Improvements Guide

## Overview

This guide documents potential TypeScript generics improvements for the OmniFocus MCP server. While the current implementation already uses generics effectively, there are opportunities for enhancement to improve type safety and developer experience.

## Current Generics Usage

The codebase already employs generics effectively in key areas:

### 1. BaseTool Class

```typescript
export abstract class BaseTool<TSchema extends z.ZodTypeAny, TResponse> extends BaseToolV1 {
  abstract readonly schema: TSchema;
  
  protected abstract executeValidated(args: z.infer<TSchema>): Promise<TResponse>;
}
```

**Usage:**
```typescript
export class QueryTasksTool extends BaseTool<typeof QueryTasksToolSchemaV2, TasksResponseV2> {
  schema = QueryTasksToolSchemaV2;
  
  async executeValidated(args: QueryTasksArgsV2): Promise<TasksResponseV2> {
    // Implementation
  }
}
```

### 2. Script Result Types

```typescript
export type ScriptResult<T> = ScriptSuccess<T> | ScriptError;

export interface ScriptSuccess<T> {
  success: true;
  data: T;
  metadata?: Record<string, unknown>;
}

export interface ScriptError {
  success: false;
  error: string;
  message: string;
  details?: unknown;
}
```

### 3. Response Types

```typescript
export interface StandardResponseV2<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  suggestion?: string;
  details?: unknown;
  data?: T;
  metadata: StandardMetadataV2;
}
```

### 4. MCP Tool Response

```typescript
export interface MCPToolResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: MCPError;
}
```

## Potential Improvement Areas

### 1. Branded Types for IDs (High Priority)

**Problem:** TaskId, ProjectId, TagId are all plain strings, making it easy to accidentally mix them up.

**Current:**
```typescript
// Easy to mix up different ID types
type TaskId = string;
type ProjectId = string;
type TagId = string;

function completeTask(taskId: TaskId) { /* ... */ }
function getProject(projectId: ProjectId) { /* ... */ }

// ❌ No compile-time error - easy to mix up
completeTask(projectId); // Runtime error!
```

**Improvement:** Use TypeScript branded types:

```typescript
// src/omnifocus/types.ts
export type TaskId = string & { readonly __brand: "TaskId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };
export type TagId = string & { readonly __brand: "TagId" };

export function asTaskId(id: string): TaskId {
  return id as TaskId;
}
export function asProjectId(id: string): ProjectId {
  return id as ProjectId;
}
export function asTagId(id: string): TagId {
  return id as TagId;
}

// Now these are compile-time errors:
completeTask(projectId);  // ❌ Type error: Argument of type 'ProjectId' is not assignable to parameter of type 'TaskId'
getProject(taskId);       // ❌ Type error: Argument of type 'TaskId' is not assignable to parameter of type 'ProjectId'
```

**Migration Strategy:**

1. **Phase 1:** Add branded type definitions
2. **Phase 2:** Update function signatures to use branded types
3. **Phase 3:** Add type assertions at API boundaries
4. **Phase 4:** Update all call sites

**Files to Modify:**
- `src/omnifocus/types.ts` - Add branded type definitions
- `src/tools/tasks/ManageTaskTool.ts` - Update function signatures
- `src/tools/tasks/QueryTasksTool.ts` - Update function signatures
- `src/tools/projects/ProjectsTool.ts` - Update function signatures
- `src/tools/tags/TagsTool.ts` - Update function signatures
- API boundary files - Add type assertions

**Benefits:**
- ✅ Catches ID mixup bugs at compile time
- ✅ Self-documenting code
- ✅ Better IDE autocomplete
- ✅ Prevents runtime errors

**Trade-offs:**
- ⚠️ Requires significant refactoring
- ⚠️ Adds type assertion overhead at API boundaries
- ⚠️ May require changes to external callers

### 2. AST Filter Output Typing (Medium Priority)

**Problem:** The AST filter system generates scripts but the output shape isn't strongly typed based on filter configuration.

**Current:**
```typescript
// Filter builder returns generic script string
const script = buildFilterScript(filter);
const result = await execute(script);  // result is unknown

// Need manual type assertions
const tasks = result as TaskData[];
```

**Improvement:** Generic over expected output shape

```typescript
// src/contracts/ast/types.ts
export interface FilterOutput<T> {
  data: T;
  metadata: FilterMetadata;
}

export interface FilterMetadata {
  filter: unknown;
  executionTimeMs: number;
  cacheHit: boolean;
}

// Generic filter builder
export function buildFilterScript<T extends FilterOutput>(filter: Filter<T['data']>): TypedScript<T>;

// Usage
const script = buildFilterScript<FilterOutput<TaskData[]>>(filter);
const result = await execute(script);  // result is FilterOutput<TaskData[]>

// No manual type assertions needed
const tasks = result.data; // TypeScript knows this is TaskData[]
```

**Implementation:**

```typescript
// src/contracts/ast/builder.ts
export function buildFilterScript<T>(filter: TaskFilter): TypedScript<FilterOutput<T>> {
  const ast = buildAST(filter);
  const script = generateScript(ast);
  
  return {
    script,
    expectedType: 'FilterOutput<T>' as const
  };
}

// src/contracts/ast/types.ts
export interface TypedScript<T> {
  script: string;
  expectedType: string;
  validateOutput: (output: unknown) => output is T;
}
```

**Benefits:**
- ✅ Type-safe script results
- ✅ Eliminates manual type assertions
- ✅ Better IDE support
- ✅ Compile-time validation

**Trade-offs:**
- ⚠️ Complex type gymnastics
- ⚠️ Runtime still dynamic (OmniJS scripts)
- ⚠️ May not provide significant practical benefit

### 3. CacheManager Generic Typing (Low Priority)

**Problem:** Cache entries are typed as `unknown`, requiring type assertions on retrieval.

**Current:**
```typescript
// src/cache/CacheManager.ts
interface CacheEntry {
  data: unknown;
  expiresAt: number;
  metadata: CacheMetadata;
}

// Usage requires type assertions
const tasks = cache.get('tasks:today') as TaskData[] | null;
```

**Improvement:** Generic cache methods

```typescript
// Option 1: Generic get method
export class CacheManager {
  get<T>(key: string): T | null {
    const entry = this.entries.get(key);
    return entry ? entry.data as T : null;
  }
}

// Option 2: Typed cache keys
type CacheKeys = {
  'tasks:today': TaskData[];
  'projects:all': ProjectData[];
  'tags:popular': TagData[];
};

export class CacheManager {
  get<K extends keyof CacheKeys>(key: K): CacheKeys[K] | null {
    const entry = this.entries.get(key);
    return entry ? entry.data as CacheKeys[K] : null;
  }
}

// Usage - no type assertions needed
const tasks = cache.get<TaskData[]>('tasks:today');
// or
const tasks = cache.get('tasks:today'); // TypeScript knows it's TaskData[]
```

**Benefits:**
- ✅ Eliminates type assertions at call sites
- ✅ Better type safety
- ✅ Improved developer experience

**Trade-offs:**
- ⚠️ Cache keys are dynamic (include query params)
- ⚠️ Modest benefit for modest effort
- ⚠️ May not be worth the complexity

**Recommendation:** Only implement if cache key patterns are stable and predictable.

## Implementation Priority Assessment

### Priority Matrix

| Improvement | Priority | Effort | Impact | Risk |
|-------------|----------|--------|--------|------|
| Branded Types | High | High | High | Medium |
| AST Typing | Medium | High | Medium | Low |
| Cache Typing | Low | Low | Low | Low |

### Recommended Implementation Order

1. **Branded Types (High Priority)**
   - Highest impact on preventing bugs
   - Most valuable for large codebases
   - Worth the refactoring effort

2. **AST Filter Typing (Medium Priority)**
   - Moderate impact on developer experience
   - Complex implementation
   - Consider if type safety is critical for your use case

3. **CacheManager Typing (Low Priority)**
   - Low impact, low effort
   - Only implement if you frequently use the cache
   - Current approach works fine

## Migration Guide

### Step-by-Step Migration to Branded Types

**Phase 1: Add Type Definitions**
```bash
# Create migration branch
git checkout -b feat/branded-types
```

```typescript
// src/omnifocus/types.ts
export type TaskId = string & { readonly __brand: "TaskId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };
export type TagId = string & { readonly __brand: "TagId" };
export type FolderId = string & { readonly __brand: "FolderId" };

export function asTaskId(id: string): TaskId {
  return id as TaskId;
}
export function asProjectId(id: string): ProjectId {
  return id as ProjectId;
}
export function asTagId(id: string): TagId {
  return id as TagId;
}
export function asFolderId(id: string): FolderId {
  return id as FolderId;
}
```

**Phase 2: Update Core Function Signatures**
```typescript
// src/tools/tasks/ManageTaskTool.ts
export class ManageTaskTool extends BaseTool<typeof ManageTaskToolSchemaV2, ManageTaskResponseV2> {
  async createTask(taskData: CreateTaskData): Promise<ManageTaskResponseV2> {
    // ... implementation
  }
  
  async updateTask(taskId: TaskId, updates: TaskUpdates): Promise<ManageTaskResponseV2> {
    // ... implementation
  }
  
  async getTask(taskId: TaskId): Promise<GetTaskResponseV2> {
    // ... implementation
  }
}
```

**Phase 3: Update API Boundaries**
```typescript
// src/tools/unified/OmniFocusWriteTool.ts
async function handleCreateTask(args: any): Promise<MCPToolResponse> {
  const taskData = args.data as CreateTaskData;
  
  try {
    const result = await manageTaskTool.createTask(taskData);
    
    if (result.success && result.data?.task) {
      // Convert string ID to branded type
      const taskWithBrandedId = {
        ...result.data.task,
        id: asTaskId(result.data.task.id)
      };
      
      return {
        success: true,
        result: { task: taskWithBrandedId }
      };
    }
    
    return {
      success: false,
      error: result.error
    };
  } catch (error) {
    return {
      success: false,
      error: handleToolError(error, 'create_task')
    };
  }
}
```

**Phase 4: Update All Call Sites**
```typescript
// Before
const taskId = response.data.task.id; // string
manageTaskTool.updateTask(taskId, updates); // No type safety

// After
const taskId = asTaskId(response.data.task.id); // TaskId
manageTaskTool.updateTask(taskId, updates); // Type-safe!

// Compile-time error prevention
manageTaskTool.updateTask(projectId, updates); // ❌ Type error
```

**Phase 5: Add Validation Helpers**
```typescript
// src/utils/validation.ts
export function isTaskId(value: unknown): value is TaskId {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value);
}
export function isProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value);
}
export function isTagId(value: unknown): value is TagId {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value);
}

// Usage
export function validateTaskId(taskId: unknown): TaskId {
  if (!isTaskId(taskId)) {
    throw new Error(`Invalid task ID: ${taskId}`);
  }
  return taskId;
}
```

## Testing Strategy

### Unit Tests for Branded Types
```typescript
// tests/unit/utils/branded-types.test.ts
describe('Branded Types', () => {
  describe('TaskId', () => {
    it('should create valid TaskId', () => {
      const taskId = asTaskId('abc123def45');
      expect(isTaskId(taskId)).toBe(true);
    });

    it('should reject invalid TaskId', () => {
      expect(isTaskId('short')).toBe(false);
      expect(isTaskId(123)).toBe(false);
      expect(isTaskId(null)).toBe(false);
    });

    it('should prevent type mixing', () => {
      const taskId = asTaskId('abc123def45');
      const projectId = asProjectId('abc123def45');

      // These should be type errors at compile time
      // manageTaskTool.updateTask(projectId, {}); // ❌ Type error
      // projectsTool.getProject(taskId); // ❌ Type error
    });
  });

  // Similar tests for ProjectId, TagId, etc.
});
```

### Integration Tests
```typescript
// tests/integration/branded-types-integration.test.ts
describe('Branded Types Integration', () => {
  it('should maintain type safety through API layers', async () => {
    // Create task through unified API
    const createResult = await unifiedTool.createTask({ name: 'Test Task' });
    
    if (createResult.success && createResult.result?.task) {
      const taskId = createResult.result.task.id;
      
      // Type should be inferred as TaskId
      expectType<TaskId>(taskId);
      
      // Should be usable with task-specific functions
      const updateResult = await unifiedTool.updateTask(taskId, { name: 'Updated' });
      expect(updateResult.success).toBe(true);
      
      // Should NOT be usable with project functions
      // @ts-expect-error - Should be type error
      await unifiedTool.getProject(taskId);
    }
  });
});
```

## Performance Considerations

### Runtime Impact

**Branded Types:**
- ✅ Zero runtime overhead (pure TypeScript types)
- ✅ Compiles to regular strings in JavaScript
- ✅ No performance impact

**AST Typing:**
- ✅ Minimal runtime impact
- ✅ Type checking happens at compile time
- ✅ No performance regression

**Cache Typing:**
- ✅ No runtime impact
- ✅ Pure type-level improvement

### Build Time Impact

**Branded Types:**
- ⚠️ Slightly increased TypeScript compilation time
- ⚠️ More complex type checking
- ⚠️ May require more memory for type checking

**Recommendation:** Monitor build times and adjust `tsconfig.json` if needed:
```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

## Backward Compatibility

### Breaking Changes

**Branded Types:**
- ❌ **Breaking change** for external callers
- ❌ Requires updates to all API consumers
- ❌ May break existing integrations

**Mitigation Strategy:**
1. **Versioning:** Introduce in v4.0.0 as major version
2. **Migration Guide:** Provide comprehensive migration documentation
3. **Deprecation Period:** Support both string and branded types during transition
4. **Compatibility Layer:** Provide helper functions for gradual migration

### Non-Breaking Improvements

**AST Typing:**
- ✅ Internal implementation detail
- ✅ No breaking changes to public API
- ✅ Can be implemented incrementally

**Cache Typing:**
- ✅ Internal improvement
- ✅ No breaking changes
- ✅ Optional enhancement

## Recommendations

### Immediate Implementation (High Value)

1. **Branded Types for Critical Paths**
   - Start with most error-prone areas
   - Focus on TaskId, ProjectId, TagId
   - Implement in internal functions first

2. **Documentation First**
   - Add JSDoc comments explaining branded types
   - Create migration guide
   - Update API documentation

### Medium-Term Implementation (Moderate Value)

1. **AST Filter Typing**
   - Implement for new filter types
   - Gradually migrate existing filters
   - Monitor impact on developer experience

2. **Validation Helpers**
   - Add runtime validation for branded types
   - Provide comprehensive error messages
   - Integrate with existing validation system

### Long-Term Consideration (Low Value)

1. **CacheManager Typing**
   - Only implement if cache usage is frequent
   - Consider if benefits outweigh complexity
   - May not be worth the effort

2. **Advanced Type Features**
   - Conditional types for complex scenarios
   - Mapped types for transformations
   - Template literal types for pattern matching

## Conclusion

The TypeScript generics improvements offer opportunities to enhance type safety and developer experience in the OmniFocus MCP server. However, the benefits must be weighed against the implementation effort and potential breaking changes.

### Key Takeaways

1. **Branded Types** provide the highest value but require significant effort
2. **AST Typing** offers moderate benefits with high complexity
3. **Cache Typing** provides minimal benefits with low effort
4. **Prioritize based on your specific needs and pain points**
5. **Consider the cost of migration and breaking changes**

### Recommendation

**Start with Branded Types** if you frequently encounter ID mixup bugs or have a large team working on the codebase. The type safety benefits justify the migration effort for complex systems.

**Skip the other improvements** unless you have specific needs that they address. The current generics usage is already effective, and the additional complexity may not be worth the marginal benefits.

**Monitor TypeScript evolution** - future language features may provide better solutions with less complexity.