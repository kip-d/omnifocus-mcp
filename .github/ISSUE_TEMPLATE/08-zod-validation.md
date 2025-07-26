---
name: Migrate to Zod Validation
about: Replace JSON schemas with Zod for better type safety
title: '[REFACTOR] Migrate from JSON Schema to Zod Validation'
labels: 'enhancement, refactoring, type-safety, priority-high'
assignees: ''

---

## Overview
The MCP TypeScript SDK recommends using Zod for schema validation. This would provide better type inference, runtime validation, and clearer error messages compared to our current JSON schema approach.

## Current State
```typescript
// Current JSON schema approach
inputSchema = {
  type: 'object',
  properties: {
    completed: { type: 'boolean' },
    project: { type: 'string' },
    limit: { type: 'number' }
  },
  required: ['completed']
};
```

## Proposed Zod Implementation
```typescript
// New Zod approach
import { z } from 'zod';

const ListTasksSchema = z.object({
  completed: z.boolean().optional().describe('Filter by completion status'),
  project: z.string().optional().describe('Filter by project name or ID'),
  tags: z.array(z.string()).optional().describe('Filter by tag names'),
  limit: z.number().min(1).max(1000).default(100).describe('Maximum results'),
  dueBefore: z.string().datetime().optional().describe('ISO 8601 date'),
  dueAfter: z.string().datetime().optional().describe('ISO 8601 date'),
  search: z.string().optional().describe('Search in task names/notes'),
  flagged: z.boolean().optional().describe('Filter by flagged status')
});

// Type inference works automatically
type ListTasksArgs = z.infer<typeof ListTasksSchema>;
```

## Migration Plan

### 1. Add Zod Dependency
```bash
npm install zod
```

### 2. Create Schema Definitions
```typescript
// src/tools/schemas/index.ts
export * from './task-schemas';
export * from './project-schemas';
export * from './analytics-schemas';
```

### 3. Update BaseTool
```typescript
// src/tools/base.ts
import { z } from 'zod';

export abstract class BaseTool<TSchema extends z.ZodType = z.ZodType> {
  abstract schema: TSchema;
  
  get inputSchema() {
    // Convert Zod schema to JSON schema for MCP compatibility
    return zodToJsonSchema(this.schema);
  }
  
  async execute(args: unknown): Promise<any> {
    // Validate with Zod
    const validated = this.schema.parse(args);
    return this.executeValidated(validated);
  }
  
  abstract executeValidated(args: z.infer<TSchema>): Promise<any>;
}
```

### 4. Migrate Each Tool
```typescript
// src/tools/tasks/ListTasksTool.ts
export class ListTasksTool extends BaseTool<typeof ListTasksSchema> {
  schema = ListTasksSchema;
  
  async executeValidated(args: z.infer<typeof ListTasksSchema>) {
    // Implementation with full type safety
  }
}
```

## Benefits

### 1. Better Type Inference
```typescript
// Automatic type inference
const args = ListTasksSchema.parse(input);
// args.limit is number
// args.tags is string[] | undefined
// TypeScript knows all types
```

### 2. Improved Error Messages
```typescript
// Zod provides clear errors
try {
  schema.parse({ limit: "invalid" });
} catch (error) {
  // Error: Expected number, received string at "limit"
}
```

### 3. Built-in Transformations
```typescript
const DateSchema = z.string().transform(str => new Date(str));
const TagSchema = z.string().transform(str => str.toLowerCase().trim());
```

### 4. Composable Schemas
```typescript
const BaseTaskFilter = z.object({
  completed: z.boolean().optional(),
  flagged: z.boolean().optional()
});

const ExtendedTaskFilter = BaseTaskFilter.extend({
  project: z.string().optional(),
  tags: z.array(z.string()).optional()
});
```

## Testing Requirements
- [ ] Unit tests for each schema
- [ ] Validation edge cases
- [ ] Error message clarity
- [ ] Performance comparison
- [ ] JSON schema compatibility

## Migration Checklist
- [ ] Add Zod dependency
- [ ] Create schema utilities
- [ ] Update BaseTool class
- [ ] Migrate task tools
- [ ] Migrate project tools
- [ ] Migrate analytics tools
- [ ] Migrate export tools
- [ ] Update documentation
- [ ] Update tests

## Documentation Updates
- [ ] Schema definition examples
- [ ] Validation error handling
- [ ] Custom validators guide
- [ ] Type inference benefits