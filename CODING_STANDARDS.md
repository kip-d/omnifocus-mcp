# OmniFocus MCP Coding Standards

This document defines the coding standards and patterns that should be followed throughout the codebase to ensure consistency.

## Core Principles

1. **TypeScript First** - All new code must be TypeScript
2. **Consistency Over Perfection** - Follow existing patterns even if not ideal
3. **Explicit Over Implicit** - Be clear about types, returns, and error handling

## Established Patterns (MUST FOLLOW)

### 1. Tool Structure

All tools MUST extend `BaseTool` and follow this pattern:

```typescript
import { z } from 'zod';
import { BaseTool } from '../base.js';
import { YOUR_SCRIPT } from '../../omnifocus/scripts/[domain].js';
import { createSuccessResponse, createErrorResponse, OperationTimer } from '../../utils/response-format.js';
import { YourSchema } from '../schemas/[domain]-schemas.js';

export class YourTool extends BaseTool<typeof YourSchema> {
  name = 'tool_name';
  description = 'Tool description';
  schema = YourSchema;

  async executeValidated(args: z.infer<typeof YourSchema>): Promise<StandardResponse<YourResponseType>> {
    const timer = new OperationTimer();
    try {
      // Implementation
      return createSuccessResponse('tool_name', data, timer.toMetadata());
    } catch (error) {
      return this.handleError(error);
    }
  }
}
```

### 2. Response Format

ALWAYS use the standardized response utilities:

```typescript
// Success responses
return createSuccessResponse('operation_name', data, metadata);
return createListResponse('operation_name', items, metadata);
return createEntityResponse('operation_name', entity, metadata);

// Error responses
return createErrorResponse('operation_name', 'ERROR_CODE', message, details, metadata);

// NEVER return plain objects like:
// ❌ return { success: true, data: {...} }
```

### 3. Error Handling

Use the base class error handler for consistency:

```typescript
try {
  // Your code
} catch (error) {
  return this.handleError(error);  // ✅ Preferred
  
  // NOT:
  // ❌ throw error;
  // ❌ return { error: true, message: error.message };
}
```

### 4. Type Definitions

NEVER use `any` in return types:

```typescript
// ✅ Good
async executeValidated(args: z.infer<typeof Schema>): Promise<StandardResponse<TaskResponse>> {

// ❌ Bad
async executeValidated(args: any): Promise<any> {
```

### 5. Import Order

Follow this consistent order:

```typescript
// 1. External libraries
import { z } from 'zod';

// 2. Base classes
import { BaseTool } from '../base.js';

// 3. Scripts
import { SCRIPT_NAME } from '../../omnifocus/scripts/domain.js';

// 4. Utilities
import { createSuccessResponse } from '../../utils/response-format.js';

// 5. Types and schemas
import { ResponseType } from '../types.js';
import { Schema } from '../schemas/domain-schemas.js';
```

### 6. File Extensions

ALWAYS include `.js` extension for local imports:

```typescript
import { something } from './file.js';  // ✅
import { something } from './file';     // ❌
```

### 7. Naming Conventions

- **Classes**: PascalCase ending with `Tool` (e.g., `CreateTaskTool`)
- **Files**: kebab-case or PascalCase matching class name
- **Variables/Functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Metadata fields**: snake_case (for external API consistency)

```typescript
// Metadata should use snake_case
{
  operation: 'create_task',
  from_cache: true,
  query_time_ms: 1234,  // ✅ snake_case
  // NOT: queryTimeMs   // ❌ camelCase
}
```

### 8. Cache Management

Use cache manager consistently:

```typescript
// Cache keys should be deterministic
const cacheKey = `tasks:${JSON.stringify(filter)}`;

// Check cache
const cached = this.cache.get(cacheKey);
if (cached) {
  return createSuccessResponse('operation', cached, {
    from_cache: true,
    ...timer.toMetadata()
  });
}

// Set cache with appropriate TTL
this.cache.set(cacheKey, data, CacheTTL.TASKS);

// Invalidate related caches
this.cache.invalidate('tasks');
```

### 9. Schema Validation

All tools MUST use Zod schemas:

```typescript
// Define in schemas file
export const OperationSchema = z.object({
  requiredField: z.string(),
  optionalField: z.string().optional(),
  booleanField: coerceBoolean().default(false),
  numberField: coerceNumber().default(10)
});

// Use in tool
schema = OperationSchema;
```

### 10. Async/Await

ALWAYS use async/await, never `.then()`:

```typescript
// ✅ Good
const result = await this.omniAutomation.execute(script);

// ❌ Bad
this.omniAutomation.execute(script).then(result => {});
```

## Tool Categories and Their Patterns

### CRUD Tools (tasks, projects, folders)
- Use `createEntityResponse` for single entity operations
- Use `createListResponse` for list operations
- Always invalidate cache after modifications
- Include operation metadata (created_id, updated_fields, etc.)

### Analytics Tools
- MUST be updated to use `createSuccessResponse`
- Define proper TypeScript types for responses
- Use consistent cache TTL from configuration
- Include performance metrics in metadata

### Export Tools
- Return file content with proper MIME type indication
- Use `createSuccessResponse` with export metadata
- Include format and field information in metadata

### Query Tools (perspectives, searches)
- Use `createListResponse` for consistency
- Include filter criteria in metadata
- Cache with appropriate TTL

## Migration Priority

Based on the analysis, these files need immediate updates:

### High Priority (Breaking inconsistencies)
1. `src/tools/analytics/ProductivityStatsTool.ts`
2. `src/tools/analytics/TaskVelocityTool.ts`
3. `src/tools/analytics/OverdueAnalysisTool.ts`
4. `src/tools/export/ExportTasksTool.ts`
5. `src/tools/export/ExportProjectsTool.ts`
6. `src/tools/export/BulkExportTool.ts`

### Medium Priority (Style inconsistencies)
1. Update metadata field naming to snake_case consistently
2. Add proper TypeScript types where `any` is used

## Enforcement

1. **Code Reviews**: Check against these standards
2. **Tests**: Ensure tests follow the same patterns
3. **New Features**: Must follow these patterns exactly
4. **Refactoring**: Update to these patterns when touching old code

## Examples of Good Patterns

### Good Tool Example: `CreateTaskTool`
- Extends BaseTool properly ✅
- Uses standardized responses ✅
- Proper error handling ✅
- Strong typing ✅
- Cache invalidation ✅

### Good Schema Example: `CreateTaskSchema`
- Uses Zod validation ✅
- Coercion helpers for MCP compatibility ✅
- Clear field documentation ✅

## When to Deviate

Only deviate from these patterns when:
1. External API requirements conflict (document why)
2. Performance requirements demand it (document measurements)
3. JXA/OmniFocus limitations require workarounds (document limitation)

Always document deviations with comments explaining why.

---

*Last Updated: 2025-08-11*
*Version: 1.0.0*