# Three-Tool Builder API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 17 MCP tools into 3 builder-pattern tools (read/write/analyze) while reusing all existing backend infrastructure.

**Architecture:** Create translation layer that maps builder JSON to existing JXA/OmniJS scripts. Each tool (OmniFocusReadTool, OmniFocusWriteTool, OmniFocusAnalyzeTool) has compiler that routes to appropriate existing script handlers. Maximum code reuse, minimal new implementation.

**Tech Stack:** TypeScript, Zod (schema validation), existing JXA/OmniJS scripts, MCP SDK

**Reference Design:** See `docs/plans/2025-11-04-three-tool-builder-api-design.md` for complete specifications

---

## Phase 1: Schemas & Type Definitions

### Task 1: Create Read Tool Schema

**Files:**
- Create: `src/tools/unified/schemas/read-schema.ts`
- Test: `tests/unit/tools/unified/schemas/read-schema.test.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
import { describe, it, expect } from 'vitest';
import { ReadSchema } from '../../../../src/tools/unified/schemas/read-schema.js';

describe('ReadSchema', () => {
  it('should validate simple tasks query', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: { status: 'active' },
        limit: 25
      }
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate complex filter with tags', () => {
    const input = {
      query: {
        type: 'tasks',
        filters: {
          tags: { any: ['work', 'urgent'] },
          dueDate: { before: '2025-01-31' }
        }
      }
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const input = {
      query: {
        type: 'invalid',
        filters: {}
      }
    };

    const result = ReadSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/unit/tools/unified/schemas/read-schema.test.ts`
Expected: FAIL with "Cannot find module" error

**Step 3: Write minimal implementation**

Create schema file:

```typescript
import { z } from 'zod';

// Filter operators for flexible queries
const TagFilterSchema = z.object({
  all: z.array(z.string()).optional(),
  any: z.array(z.string()).optional(),
  none: z.array(z.string()).optional(),
});

const DateFilterSchema = z.object({
  before: z.string().optional(),
  after: z.string().optional(),
  between: z.tuple([z.string(), z.string()]).optional(),
});

const TextFilterSchema = z.object({
  contains: z.string().optional(),
  matches: z.string().optional(),
});

// Recursive filter for AND/OR/NOT
type FilterType = z.ZodType<{
  // Task filters
  status?: 'active' | 'completed' | 'dropped' | 'on_hold';
  tags?: z.infer<typeof TagFilterSchema>;
  project?: string | null;
  dueDate?: z.infer<typeof DateFilterSchema>;
  deferDate?: z.infer<typeof DateFilterSchema>;
  flagged?: boolean;
  blocked?: boolean;
  available?: boolean;
  text?: z.infer<typeof TextFilterSchema>;

  // Project filters
  folder?: string;

  // Logical operators
  AND?: Array<any>;
  OR?: Array<any>;
  NOT?: any;
}>;

const FilterSchema: FilterType = z.lazy(() => z.object({
  // Task filters
  status: z.enum(['active', 'completed', 'dropped', 'on_hold']).optional(),
  tags: TagFilterSchema.optional(),
  project: z.union([z.string(), z.null()]).optional(),
  dueDate: DateFilterSchema.optional(),
  deferDate: DateFilterSchema.optional(),
  flagged: z.boolean().optional(),
  blocked: z.boolean().optional(),
  available: z.boolean().optional(),
  text: TextFilterSchema.optional(),

  // Project filters
  folder: z.string().optional(),

  // Logical operators
  AND: z.array(FilterSchema).optional(),
  OR: z.array(FilterSchema).optional(),
  NOT: FilterSchema.optional(),
}).passthrough());

// Sort options
const SortSchema = z.object({
  field: z.string(),
  order: z.enum(['asc', 'desc']),
});

// Main query schema
export const ReadSchema = z.object({
  query: z.object({
    type: z.enum(['tasks', 'projects', 'tags', 'perspectives', 'folders']),
    filters: FilterSchema.optional(),
    fields: z.array(z.string()).optional(),
    sort: z.array(SortSchema).optional(),
    limit: z.number().min(1).max(500).optional(),
    offset: z.number().min(0).optional(),
    mode: z.enum(['search', 'smart_suggest']).optional(),
  }),
});

export type ReadInput = z.infer<typeof ReadSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/unit/tools/unified/schemas/read-schema.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/schemas/read-schema.ts tests/unit/tools/unified/schemas/read-schema.test.ts
git commit -m "feat(unified): add read tool schema with filter validation"
```

---

### Task 2: Create Write Tool Schema

**Files:**
- Create: `src/tools/unified/schemas/write-schema.ts`
- Test: `tests/unit/tools/unified/schemas/write-schema.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { WriteSchema } from '../../../../src/tools/unified/schemas/write-schema.js';

describe('WriteSchema', () => {
  it('should validate create task mutation', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Test task',
          tags: ['work'],
          dueDate: '2025-01-15'
        }
      }
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate update mutation with changes', () => {
    const input = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-id-123',
        changes: {
          flagged: true,
          addTags: ['urgent']
        }
      }
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const input = {
      mutation: {
        operation: 'create',
        target: 'task'
        // Missing data
      }
    };

    const result = WriteSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/unit/tools/unified/schemas/write-schema.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import { z } from 'zod';

// Repetition rule schema
const RepetitionRuleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().min(1),
  daysOfWeek: z.array(z.number().min(1).max(7)).optional(),
  endDate: z.string().optional(),
});

// Create data schema
const CreateDataSchema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
  project: z.union([z.string(), z.null()]).optional(),
  tags: z.array(z.string()).optional(),
  dueDate: z.string().optional(),
  deferDate: z.string().optional(),
  flagged: z.boolean().optional(),
  estimatedMinutes: z.number().optional(),
  repetitionRule: RepetitionRuleSchema.optional(),

  // Project-specific
  folder: z.string().optional(),
  sequential: z.boolean().optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'dropped']).optional(),
});

// Update changes schema
const UpdateChangesSchema = z.object({
  name: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
  dueDate: z.union([z.string(), z.null()]).optional(),
  deferDate: z.union([z.string(), z.null()]).optional(),
  flagged: z.boolean().optional(),
  status: z.enum(['completed', 'dropped']).optional(),
  project: z.union([z.string(), z.null()]).optional(),
  estimatedMinutes: z.number().optional(),
}).passthrough();

// Batch operation schema
const BatchOperationSchema = z.object({
  operation: z.enum(['create', 'update']),
  target: z.enum(['task', 'project']),
  data: CreateDataSchema.optional(),
  id: z.string().optional(),
  changes: UpdateChangesSchema.optional(),
});

// Main write schema
export const WriteSchema = z.object({
  mutation: z.object({
    operation: z.enum(['create', 'update', 'complete', 'delete', 'batch']),
    target: z.enum(['task', 'project']),
    data: CreateDataSchema.optional(),
    id: z.string().optional(),
    changes: UpdateChangesSchema.optional(),
    operations: z.array(BatchOperationSchema).optional(),
  }),
}).superRefine((data, ctx) => {
  const { operation, data: createData, id, changes, operations } = data.mutation;

  // Validation rules per operation
  if (operation === 'create' && !createData) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'data is required for create operation',
      path: ['mutation', 'data'],
    });
  }

  if ((operation === 'update' || operation === 'complete' || operation === 'delete') && !id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'id is required for update/complete/delete operations',
      path: ['mutation', 'id'],
    });
  }

  if (operation === 'update' && !changes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'changes is required for update operation',
      path: ['mutation', 'changes'],
    });
  }

  if (operation === 'batch' && !operations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'operations is required for batch operation',
      path: ['mutation', 'operations'],
    });
  }
});

export type WriteInput = z.infer<typeof WriteSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/unit/tools/unified/schemas/write-schema.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/schemas/write-schema.ts tests/unit/tools/unified/schemas/write-schema.test.ts
git commit -m "feat(unified): add write tool schema with mutation validation"
```

---

### Task 3: Create Analyze Tool Schema

**Files:**
- Create: `src/tools/unified/schemas/analyze-schema.ts`
- Test: `tests/unit/tools/unified/schemas/analyze-schema.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { AnalyzeSchema } from '../../../../src/tools/unified/schemas/analyze-schema.js';

describe('AnalyzeSchema', () => {
  it('should validate productivity stats analysis', () => {
    const input = {
      analysis: {
        type: 'productivity_stats',
        scope: {
          dateRange: {
            start: '2025-01-01',
            end: '2025-01-31'
          }
        },
        params: {
          groupBy: 'week',
          metrics: ['completed', 'velocity']
        }
      }
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate parse meeting notes', () => {
    const input = {
      analysis: {
        type: 'parse_meeting_notes',
        params: {
          text: 'Follow up with Sarah',
          extractTasks: true
        }
      }
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid type', () => {
    const input = {
      analysis: {
        type: 'invalid_type'
      }
    };

    const result = AnalyzeSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/unit/tools/unified/schemas/analyze-schema.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import { z } from 'zod';

// Scope schema for filtering analysis
const AnalysisScopeSchema = z.object({
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  projects: z.array(z.string()).optional(),
  includeCompleted: z.boolean().optional(),
  includeDropped: z.boolean().optional(),
});

// Analysis-type-specific parameters
const AnalysisParamsSchema = z.object({
  // productivity_stats / task_velocity
  groupBy: z.enum(['day', 'week', 'month']).optional(),
  metrics: z.array(z.string()).optional(),

  // pattern_analysis
  insights: z.array(z.string()).optional(),

  // recurring_tasks
  operation: z.enum(['analyze', 'patterns']).optional(),
  sortBy: z.enum(['nextDue', 'frequency', 'name']).optional(),

  // parse_meeting_notes
  text: z.string().optional(),
  extractTasks: z.boolean().optional(),
  defaultProject: z.string().optional(),
  defaultTags: z.array(z.string()).optional(),

  // manage_reviews
  projectId: z.string().optional(),
  reviewDate: z.string().optional(),
}).passthrough();

// Main analyze schema
export const AnalyzeSchema = z.object({
  analysis: z.object({
    type: z.enum([
      'productivity_stats',
      'task_velocity',
      'overdue_analysis',
      'pattern_analysis',
      'workflow_analysis',
      'recurring_tasks',
      'parse_meeting_notes',
      'manage_reviews',
    ]),
    scope: AnalysisScopeSchema.optional(),
    params: AnalysisParamsSchema.optional(),
  }),
});

export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/unit/tools/unified/schemas/analyze-schema.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/schemas/analyze-schema.ts tests/unit/tools/unified/schemas/analyze-schema.test.ts
git commit -m "feat(unified): add analyze tool schema with type validation"
```

---

## Phase 2: Query Compiler (Read Tool Backend)

### Task 4: Create Query Compiler Foundation

**Files:**
- Create: `src/tools/unified/compilers/QueryCompiler.ts`
- Test: `tests/unit/tools/unified/compilers/QueryCompiler.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { QueryCompiler } from '../../../../src/tools/unified/compilers/QueryCompiler.js';
import type { ReadInput } from '../../../../src/tools/unified/schemas/read-schema.js';

describe('QueryCompiler', () => {
  const compiler = new QueryCompiler();

  it('should compile simple tasks query to mode and filters', () => {
    const input: ReadInput = {
      query: {
        type: 'tasks',
        filters: {
          status: 'active',
          project: null,
        },
        limit: 25,
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.type).toBe('tasks');
    expect(compiled.mode).toBe('all');
    expect(compiled.filters.status).toBe('active');
    expect(compiled.filters.project).toBe(null);
    expect(compiled.limit).toBe(25);
  });

  it('should compile smart_suggest mode', () => {
    const input: ReadInput = {
      query: {
        type: 'tasks',
        mode: 'smart_suggest',
        limit: 10,
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.type).toBe('tasks');
    expect(compiled.mode).toBe('smart_suggest');
    expect(compiled.limit).toBe(10);
  });

  it('should compile tag filters', () => {
    const input: ReadInput = {
      query: {
        type: 'tasks',
        filters: {
          tags: { any: ['work', 'urgent'] },
        }
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.filters.tags).toEqual({ any: ['work', 'urgent'] });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import type { ReadInput } from '../schemas/read-schema.js';

export interface CompiledQuery {
  type: 'tasks' | 'projects' | 'tags' | 'perspectives' | 'folders';
  mode: 'all' | 'search' | 'smart_suggest';
  filters: Record<string, any>;
  fields?: string[];
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
}

/**
 * QueryCompiler translates builder JSON into parameters for existing tools
 */
export class QueryCompiler {
  compile(input: ReadInput): CompiledQuery {
    const { query } = input;

    // Determine mode
    let mode: CompiledQuery['mode'] = 'all';
    if (query.mode === 'search') mode = 'search';
    else if (query.mode === 'smart_suggest') mode = 'smart_suggest';

    // Pass through filters (existing tools can handle the structure)
    const filters = query.filters || {};

    return {
      type: query.type,
      mode,
      filters,
      fields: query.fields,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/unit/tools/unified/compilers/QueryCompiler.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/compilers/QueryCompiler.ts tests/unit/tools/unified/compilers/QueryCompiler.test.ts
git commit -m "feat(unified): add query compiler for read tool"
```

---

## Phase 3: OmniFocus Read Tool

### Task 5: Create OmniFocusReadTool

**Files:**
- Create: `src/tools/unified/OmniFocusReadTool.ts`
- Test: `tests/integration/tools/unified/OmniFocusReadTool.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { OmniFocusReadTool } from '../../../../src/tools/unified/OmniFocusReadTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusReadTool Integration', () => {
  let tool: OmniFocusReadTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusReadTool(cache);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('omnifocus_read');
    expect(tool.description).toContain('Query OmniFocus data');
  });

  it('should query inbox tasks', async () => {
    const input = {
      query: {
        type: 'tasks' as const,
        filters: {
          project: null,
          status: 'active' as const,
        },
        limit: 5,
      }
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
  });

  it('should use smart_suggest mode', async () => {
    const input = {
      query: {
        type: 'tasks' as const,
        mode: 'smart_suggest' as const,
        limit: 10,
      }
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('metadata');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/integration/tools/unified/OmniFocusReadTool.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { ReadSchema, type ReadInput } from './schemas/read-schema.js';
import { QueryCompiler } from './compilers/QueryCompiler.js';
import { QueryTasksToolV2 } from '../tasks/QueryTasksToolV2.js';
import { ProjectsToolV2 } from '../projects/ProjectsToolV2.js';
import { TagsToolV2 } from '../tags/TagsToolV2.js';
import { PerspectivesToolV2 } from '../perspectives/PerspectivesToolV2.js';
import { FoldersTool } from '../folders/FoldersTool.js';

export class OmniFocusReadTool extends BaseTool<typeof ReadSchema, any> {
  name = 'omnifocus_read';
  description = `Query OmniFocus data with flexible filtering. Returns tasks, projects, tags, perspectives, or folders.

COMMON QUERIES:
- Inbox: { query: { type: "tasks", filters: { project: null } } }
- Overdue: { query: { type: "tasks", filters: { dueDate: { before: "now" }, status: "active" } } }
- Smart suggestions: { query: { type: "tasks", mode: "smart_suggest", limit: 10 } }

FILTER OPERATORS:
- tags: { any: [...] } (has any), { all: [...] } (has all), { none: [...] } (has none)
- dates: { before: "YYYY-MM-DD" }, { after: "..." }, { between: ["...", "..."] }
- text: { contains: "..." }, { matches: "regex" }
- logic: { OR: [...] }, { AND: [...] }, { NOT: {...} }

PERFORMANCE:
- Use fields parameter to select only needed data
- Set reasonable limits (default: 25)
- Smart suggest uses scoring: overdue +100, due today +80, flagged +50`;

  schema = ReadSchema;

  private compiler: QueryCompiler;
  private tasksTool: QueryTasksToolV2;
  private projectsTool: ProjectsToolV2;
  private tagsTool: TagsToolV2;
  private perspectivesTool: PerspectivesToolV2;
  private foldersTool: FoldersTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new QueryCompiler();

    // Instantiate existing tools for routing
    this.tasksTool = new QueryTasksToolV2(cache);
    this.projectsTool = new ProjectsToolV2(cache);
    this.tagsTool = new TagsToolV2(cache);
    this.perspectivesTool = new PerspectivesToolV2(cache);
    this.foldersTool = new FoldersTool(cache);
  }

  async executeValidated(args: ReadInput): Promise<any> {
    const compiled = this.compiler.compile(args);

    // Route to appropriate existing tool based on type
    switch (compiled.type) {
      case 'tasks':
        return this.routeToTasksTool(compiled);
      case 'projects':
        return this.routeToProjectsTool(compiled);
      case 'tags':
        return this.routeToTagsTool(compiled);
      case 'perspectives':
        return this.routeToPerspectivesTool(compiled);
      case 'folders':
        return this.routeToFoldersTool(compiled);
      default:
        throw new Error(`Unsupported query type: ${compiled.type}`);
    }
  }

  private async routeToTasksTool(compiled: any): Promise<any> {
    // Map compiled query to existing tasks tool parameters
    const tasksArgs: any = {
      mode: compiled.mode,
      limit: compiled.limit || 25,
      fields: compiled.fields,
      sort: compiled.sort,
    };

    // Map filters to existing parameters
    if (compiled.filters.status) tasksArgs.completed = compiled.filters.status === 'completed';
    if (compiled.filters.project !== undefined) tasksArgs.project = compiled.filters.project;
    if (compiled.filters.tags) tasksArgs.tags = this.extractSimpleTags(compiled.filters.tags);
    if (compiled.filters.flagged !== undefined) tasksArgs.flagged = compiled.filters.flagged;

    // Use advanced filters for complex queries
    if (this.needsAdvancedFilters(compiled.filters)) {
      tasksArgs.filters = this.mapToAdvancedFilters(compiled.filters);
    }

    return this.tasksTool.execute(tasksArgs);
  }

  private async routeToProjectsTool(compiled: any): Promise<any> {
    const projectsArgs: any = {
      operation: 'list',
      includeCompleted: compiled.filters.status === 'completed',
    };

    if (compiled.filters.folder) projectsArgs.folder = compiled.filters.folder;
    if (compiled.filters.tags) projectsArgs.tags = this.extractSimpleTags(compiled.filters.tags);

    return this.projectsTool.execute(projectsArgs);
  }

  private async routeToTagsTool(compiled: any): Promise<any> {
    return this.tagsTool.execute({ operation: 'list' });
  }

  private async routeToPerspectivesTool(compiled: any): Promise<any> {
    return this.perspectivesTool.execute({ operation: 'list' });
  }

  private async routeToFoldersTool(compiled: any): Promise<any> {
    return this.foldersTool.execute({ operation: 'list' });
  }

  private extractSimpleTags(tagFilter: any): string[] | undefined {
    if (tagFilter.any) return tagFilter.any;
    if (tagFilter.all) return tagFilter.all;
    return undefined;
  }

  private needsAdvancedFilters(filters: any): boolean {
    return Boolean(
      filters.tags?.all ||
      filters.tags?.none ||
      filters.dueDate ||
      filters.deferDate ||
      filters.text ||
      filters.OR ||
      filters.AND ||
      filters.NOT
    );
  }

  private mapToAdvancedFilters(filters: any): any {
    // Map builder filters to existing advanced filter structure
    const advanced: any = {};

    if (filters.tags) {
      if (filters.tags.any) {
        advanced.tags = { operator: 'OR', values: filters.tags.any };
      } else if (filters.tags.all) {
        advanced.tags = { operator: 'AND', values: filters.tags.all };
      } else if (filters.tags.none) {
        advanced.tags = { operator: 'NOT_IN', values: filters.tags.none };
      }
    }

    if (filters.dueDate) {
      if (filters.dueDate.before) {
        advanced.dueDate = { operator: '<=', value: filters.dueDate.before };
      } else if (filters.dueDate.after) {
        advanced.dueDate = { operator: '>=', value: filters.dueDate.after };
      }
    }

    // Handle OR/AND/NOT recursively if needed
    if (filters.OR) {
      advanced.OR = filters.OR.map((f: any) => this.mapToAdvancedFilters(f));
    }

    return advanced;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/integration/tools/unified/OmniFocusReadTool.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusReadTool.ts tests/integration/tools/unified/OmniFocusReadTool.test.ts
git commit -m "feat(unified): add OmniFocusReadTool routing to existing tools"
```

---

## Phase 4: OmniFocus Write Tool

### Task 6: Create Mutation Compiler

**Files:**
- Create: `src/tools/unified/compilers/MutationCompiler.ts`
- Test: `tests/unit/tools/unified/compilers/MutationCompiler.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { MutationCompiler } from '../../../../src/tools/unified/compilers/MutationCompiler.js';
import type { WriteInput } from '../../../../src/tools/unified/schemas/write-schema.js';

describe('MutationCompiler', () => {
  const compiler = new MutationCompiler();

  it('should compile create mutation', () => {
    const input: WriteInput = {
      mutation: {
        operation: 'create',
        target: 'task',
        data: {
          name: 'Test task',
          tags: ['work'],
          dueDate: '2025-01-15',
        }
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('create');
    expect(compiled.target).toBe('task');
    expect(compiled.data?.name).toBe('Test task');
    expect(compiled.data?.tags).toEqual(['work']);
  });

  it('should compile update mutation', () => {
    const input: WriteInput = {
      mutation: {
        operation: 'update',
        target: 'task',
        id: 'task-123',
        changes: {
          flagged: true,
          addTags: ['urgent']
        }
      }
    };

    const compiled = compiler.compile(input);

    expect(compiled.operation).toBe('update');
    expect(compiled.taskId).toBe('task-123');
    expect(compiled.changes?.flagged).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/unit/tools/unified/compilers/MutationCompiler.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
import type { WriteInput } from '../schemas/write-schema.js';

export interface CompiledMutation {
  operation: 'create' | 'update' | 'complete' | 'delete' | 'batch';
  target: 'task' | 'project';
  data?: Record<string, any>;
  taskId?: string;
  projectId?: string;
  changes?: Record<string, any>;
  operations?: Array<any>;
}

export class MutationCompiler {
  compile(input: WriteInput): CompiledMutation {
    const { mutation } = input;

    const compiled: CompiledMutation = {
      operation: mutation.operation,
      target: mutation.target,
    };

    // Map data for create
    if (mutation.data) {
      compiled.data = mutation.data;
    }

    // Map ID for update/complete/delete
    if (mutation.id) {
      if (mutation.target === 'task') {
        compiled.taskId = mutation.id;
      } else {
        compiled.projectId = mutation.id;
      }
    }

    // Map changes for update
    if (mutation.changes) {
      compiled.changes = mutation.changes;
    }

    // Map operations for batch
    if (mutation.operations) {
      compiled.operations = mutation.operations;
    }

    return compiled;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/unit/tools/unified/compilers/MutationCompiler.test.ts`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add src/tools/unified/compilers/MutationCompiler.ts tests/unit/tools/unified/compilers/MutationCompiler.test.ts
git commit -m "feat(unified): add mutation compiler for write tool"
```

---

### Task 7: Create OmniFocusWriteTool

**Files:**
- Create: `src/tools/unified/OmniFocusWriteTool.ts`
- Test: `tests/integration/tools/unified/OmniFocusWriteTool.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';

describe('OmniFocusWriteTool Integration', () => {
  let tool: OmniFocusWriteTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusWriteTool(cache);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('omnifocus_write');
    expect(tool.description).toContain('Create, update, complete, or delete');
  });

  it('should create task', async () => {
    const input = {
      mutation: {
        operation: 'create' as const,
        target: 'task' as const,
        data: {
          name: 'Builder API test task',
          tags: ['test'],
        }
      }
    };

    const result = await tool.execute(input);

    expect(result).toHaveProperty('success', true);
    expect(result.data).toHaveProperty('task');
    expect(result.data.task).toHaveProperty('taskId');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/integration/tools/unified/OmniFocusWriteTool.test.ts`
Expected: FAIL

**Step 3: Implement OmniFocusWriteTool**

```typescript
import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { WriteSchema, type WriteInput } from './schemas/write-schema.js';
import { MutationCompiler } from './compilers/MutationCompiler.js';
import { ManageTaskTool } from '../tasks/ManageTaskTool.js';
import { BatchCreateTool } from '../batch/BatchCreateTool.js';

export class OmniFocusWriteTool extends BaseTool<typeof WriteSchema, any> {
  name = 'omnifocus_write';
  description = `Create, update, complete, or delete OmniFocus tasks and projects.

OPERATIONS:
- create: New task/project with data
- update: Modify existing (provide id + changes)
- complete: Mark done (provide id)
- delete: Remove permanently (provide id)
- batch: Multiple operations in one call

TAG OPERATIONS:
- tags: [...] - Replace all tags
- addTags: [...] - Add to existing
- removeTags: [...] - Remove from existing

DATE FORMATS:
- Date only: "YYYY-MM-DD" (defaults: due=5pm, defer=8am)
- Date+time: "YYYY-MM-DD HH:mm" (local time)
- Clear date: null

MOVE TO INBOX: Set project: null

SAFETY:
- Delete is permanent - confirm with user first
- Batch supports up to 100 operations
- Tags handled automatically via bridge`;

  schema = WriteSchema;

  private compiler: MutationCompiler;
  private manageTaskTool: ManageTaskTool;
  private batchTool: BatchCreateTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new MutationCompiler();
    this.manageTaskTool = new ManageTaskTool(cache);
    this.batchTool = new BatchCreateTool(cache);
  }

  async executeValidated(args: WriteInput): Promise<any> {
    const compiled = this.compiler.compile(args);

    // Route to batch tool if batch operation
    if (compiled.operation === 'batch') {
      return this.routeToBatch(compiled);
    }

    // Otherwise route to manage_task
    return this.routeToManageTask(compiled);
  }

  private async routeToManageTask(compiled: any): Promise<any> {
    const manageArgs: any = {
      operation: compiled.operation,
    };

    // Add ID for update/complete/delete
    if (compiled.taskId) manageArgs.taskId = compiled.taskId;
    if (compiled.projectId) manageArgs.projectId = compiled.projectId;

    // Add data for create
    if (compiled.data) {
      Object.assign(manageArgs, compiled.data);
    }

    // Add changes for update
    if (compiled.changes) {
      Object.assign(manageArgs, compiled.changes);
    }

    return this.manageTaskTool.execute(manageArgs);
  }

  private async routeToBatch(compiled: any): Promise<any> {
    if (!compiled.operations) {
      throw new Error('Batch operation requires operations array');
    }

    // Convert builder batch format to existing batch tool format
    const batchArgs: any = {
      items: compiled.operations.map((op: any) => ({
        type: op.target,
        name: op.data?.name,
        ...op.data,
      }))
    };

    return this.batchTool.execute(batchArgs);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/integration/tools/unified/OmniFocusWriteTool.test.ts`
Expected: 2 tests PASS (may need OmniFocus running)

**Step 5: Commit**

```bash
git add src/tools/unified/OmniFocusWriteTool.ts tests/integration/tools/unified/OmniFocusWriteTool.test.ts
git commit -m "feat(unified): add OmniFocusWriteTool routing to manage_task"
```

---

## Phase 5: OmniFocus Analyze Tool

### Task 8: Create Analysis Compiler

**Files:**
- Create: `src/tools/unified/compilers/AnalysisCompiler.ts`
- Test: `tests/unit/tools/unified/compilers/AnalysisCompiler.test.ts`

**Step 1-5: Similar pattern to previous compilers**

(Abbreviated for space - follow same TDD pattern: test, fail, implement, pass, commit)

```typescript
// AnalysisCompiler.ts - maps analysis type to appropriate existing tool
export class AnalysisCompiler {
  compile(input: AnalyzeInput): CompiledAnalysis {
    // Extract type and parameters
    // Map scope to filter parameters
    // Return compiled form ready for routing
  }
}
```

**Commit message:**
```
feat(unified): add analysis compiler for analyze tool
```

---

### Task 9: Create OmniFocusAnalyzeTool

**Files:**
- Create: `src/tools/unified/OmniFocusAnalyzeTool.ts`
- Test: `tests/integration/tools/unified/OmniFocusAnalyzeTool.test.ts`

**Implementation:**

```typescript
export class OmniFocusAnalyzeTool extends BaseTool<typeof AnalyzeSchema, any> {
  name = 'omnifocus_analyze';
  description = `Analyze OmniFocus data for insights, patterns, and specialized operations.

ANALYSIS TYPES:
- productivity_stats: GTD health metrics (completion rates, velocity)
- task_velocity: Completion trends over time
- overdue_analysis: Bottleneck identification
- pattern_analysis: Database-wide patterns (tags, projects, stale items)
- workflow_analysis: Deep workflow analysis
- recurring_tasks: Recurring task patterns and frequencies
- parse_meeting_notes: Extract action items from meeting notes
- manage_reviews: Project review operations

PERFORMANCE WARNINGS:
- pattern_analysis on 1000+ items: ~5-10 seconds
- workflow_analysis: ~3-5 seconds for comprehensive
- Most others: <1 second with caching

SCOPE FILTERING:
- Use dateRange for time-based analysis
- Use tags/projects to focus analysis`;

  // Instantiate all analysis tools
  private productivityTool: ProductivityStatsToolV2;
  private velocityTool: TaskVelocityToolV2;
  private overdueTool: OverdueAnalysisToolV2;
  private patternTool: PatternAnalysisToolV2;
  private workflowTool: WorkflowAnalysisTool;
  private recurringTool: RecurringTasksTool;
  private meetingNotesTool: ParseMeetingNotesTool;
  private reviewsTool: ManageReviewsTool;

  async executeValidated(args: AnalyzeInput): Promise<any> {
    // Route to appropriate tool based on type
    switch (args.analysis.type) {
      case 'productivity_stats':
        return this.routeToProductivityStats(args);
      case 'task_velocity':
        return this.routeToVelocity(args);
      // ... etc for all types
    }
  }
}
```

**Commit:**
```
feat(unified): add OmniFocusAnalyzeTool routing to analysis tools
```

---

## Phase 6: Tool Registration

### Task 10: Register New Tools

**Files:**
- Modify: `src/tools/index.ts`

**Step 1: Add imports for new tools**

```typescript
import { OmniFocusReadTool } from './unified/OmniFocusReadTool.js';
import { OmniFocusWriteTool } from './unified/OmniFocusWriteTool.js';
import { OmniFocusAnalyzeTool } from './unified/OmniFocusAnalyzeTool.js';
```

**Step 2: Add to tools array**

```typescript
const tools: Tool[] = [
  // NEW: Unified builder API tools
  new OmniFocusReadTool(cache),
  new OmniFocusWriteTool(cache),
  new OmniFocusAnalyzeTool(cache),

  // EXISTING: Keep all 17 original tools for parallel operation
  new QueryTasksToolV2(cache),
  // ... rest of existing tools
];
```

**Step 3: Run build to verify no errors**

Run: `npm run build`
Expected: Clean build

**Step 4: Test server starts**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js`
Expected: See all 20 tools listed (17 old + 3 new)

**Step 5: Commit**

```bash
git add src/tools/index.ts
git commit -m "feat(unified): register three new builder API tools in parallel with existing tools"
```

---

## Phase 7: Integration Testing

### Task 11: End-to-End Integration Tests

**Files:**
- Create: `tests/integration/tools/unified/builder-api-e2e.test.ts`

**Test scenarios:**
1. Read tool queries inbox and returns tasks
2. Write tool creates task with tags
3. Analyze tool runs productivity stats
4. All three tools work together in sequence
5. Error handling for invalid inputs
6. Migration hints appear in old tool responses

**Commit:**
```
test(unified): add comprehensive integration tests for builder API
```

---

## Phase 8: Documentation & Migration

### Task 12: Add Migration Hints to Old Tools

**Files:**
- Modify: All existing tool response formatters

Add migration hints to responses from old tools:

```typescript
{
  success: true,
  data: { /* ... */ },
  _migration: {
    deprecated: true,
    newTool: 'omnifocus_read',
    example: { query: { type: 'tasks', filters: { /* ... */ } } }
  }
}
```

**Commit:**
```
feat(unified): add migration hints to existing tools
```

---

### Task 13: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Add section documenting new tools and migration path.

**Commit:**
```
docs: update CLAUDE.md with builder API tools and migration guide
```

---

## Success Criteria

After completing all tasks:

- [ ] All 3 new tools (read/write/analyze) functional
- [ ] All existing 17 tools still work (parallel operation)
- [ ] Integration tests pass (45+ existing + new tests)
- [ ] Build completes without errors
- [ ] Server starts and lists all 20 tools
- [ ] Migration hints appear in old tool responses
- [ ] Documentation updated

## Next Steps After Implementation

1. **Validation Period** (Week 3)
   - Test with real Claude Desktop usage
   - Gather feedback
   - Monitor error rates
   - Performance benchmarking

2. **Cleanup** (Week 4+)
   - Remove old 17 tools if new tools proven
   - Update tool registration
   - Archive old implementations
   - Final documentation pass

---

## Notes for Implementation

- **Reuse aggressively**: All existing scripts, helpers, cache logic unchanged
- **Test incrementally**: Each phase builds on previous, don't skip tests
- **Commit frequently**: Small commits make debugging easier
- **DRY principle**: Don't duplicate existing tool logic, route to it
- **YAGNI**: Don't add features not in design doc
- **TDD**: Write test first, watch it fail, make it pass

This plan assumes ~2-3 days of focused implementation following TDD discipline.
