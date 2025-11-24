# AST-Based Filter Contracts Design

**Date:** 2025-11-24
**Status:** Approved Design
**Author:** Brainstorming session

## Overview

Transform the contracts system from string-based code generation to an AST (Abstract Syntax Tree) representation. This enables static analysis, validation, testing, and multi-target code emission.

## Goals

1. **Complete the integration** - Wire QueryCompiler to use TaskFilter (✅ DONE)
2. **Use code generator with AST** - Replace hand-written script filter logic with generated code from a verifiable AST
3. **Add mutation contracts** - Define contracts for create/update/delete operations
4. **Enable verification** - Allow DSL/AST tools to verify filter correctness

## Architecture

### Pipeline

```
TaskFilter  →  buildAST()  →  FilterAST  →  validate()  →  emit(target)  →  Code String
   ↑                              ↑                              ↓
(contracts/filters.ts)    (unit testable!)           (OmniJS or JXA)
```

### Why AST Instead of String Generation?

**String generation limitations:**
- Generated code is opaque strings - no static analysis
- Can't use TypeScript to verify the generated JS is correct
- Hard to unit test the *logic* vs just "does it produce a string"
- Can't transform to different targets

**AST benefits:**
- Testable: Unit test the AST structure, not string output
- Verifiable: Static analysis tools can check the AST
- Extensible: Add new output targets without rewriting logic
- Optimizable: AST transformations (simplify, reorder for performance)

## AST Node Types

```typescript
// src/contracts/ast/types.ts

type FilterNode =
  | AndNode
  | OrNode
  | NotNode
  | ComparisonNode
  | ExistsNode;

interface AndNode {
  type: 'and';
  children: FilterNode[];
}

interface OrNode {
  type: 'or';
  children: FilterNode[];
}

interface NotNode {
  type: 'not';
  child: FilterNode;
}

interface ComparisonNode {
  type: 'comparison';
  field: string;           // 'task.completed', 'task.flagged', etc.
  operator: '==' | '!=' | '<' | '>' | '<=' | '>=' | 'includes' | 'some' | 'every';
  value: unknown;          // The value to compare against
}

interface ExistsNode {
  type: 'exists';
  field: string;
  exists: boolean;         // true = must exist, false = must not exist
}
```

## Example Transformation

**Input: TaskFilter**
```typescript
{ completed: false, flagged: true, tags: ['work'], tagsOperator: 'OR' }
```

**Output: FilterAST**
```typescript
{
  type: 'and',
  children: [
    { type: 'comparison', field: 'task.completed', operator: '==', value: false },
    { type: 'comparison', field: 'task.flagged', operator: '==', value: true },
    { type: 'comparison', field: 'taskTags', operator: 'some', value: ['work'] }
  ]
}
```

## Validation

The validator catches errors before code generation:

```typescript
// src/contracts/ast/validator.ts

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

function validateFilterAST(ast: FilterNode): ValidationResult {
  // Checks:
  // - Known fields only (catches typos like 'complted')
  // - No contradictions (completed: true AND completed: false)
  // - No tautologies (always-true conditions)
  // - Type correctness (string field compared to string value)
}
```

## Code Emitters

Transform AST to target language:

```typescript
// src/contracts/ast/emitters/jxa.ts
function emitJXA(ast: FilterNode): string {
  switch (ast.type) {
    case 'and':
      return ast.children.map(emitJXA).join(' && ');
    case 'or':
      return `(${ast.children.map(emitJXA).join(' || ')})`;
    case 'not':
      return `!(${emitJXA(ast.child)})`;
    case 'comparison':
      return emitJXAComparison(ast);
  }
}

// src/contracts/ast/emitters/omnijs.ts
function emitOmniJS(ast: FilterNode): string {
  // Similar but with OmniJS-specific syntax
}
```

## File Structure

```
src/contracts/
├── filters.ts              # (existing) TaskFilter type
├── responses.ts            # (existing) Response contracts
├── mutations.ts            # (NEW) Mutation contracts
├── generator.ts            # (existing → deprecate gradually)
├── index.ts                # (existing) Re-exports
├── ast/
│   ├── types.ts            # FilterNode, AndNode, OrNode, etc.
│   ├── builder.ts          # buildAST(TaskFilter) → FilterAST
│   ├── validator.ts        # validateFilterAST() → ValidationResult
│   ├── emitters/
│   │   ├── omnijs.ts       # emitOmniJS(ast) → string
│   │   └── jxa.ts          # emitJXA(ast) → string
│   └── index.ts            # Re-exports
```

## Integration Point

```typescript
// In QueryTasksToolV2 or similar
import { buildAST, validateFilterAST, emitJXA } from '../contracts/ast';

const ast = buildAST(compiledQuery.filters);
const validation = validateFilterAST(ast);

if (!validation.valid) {
  throw new McpError('INVALID_FILTER', validation.errors[0].message);
}

if (validation.warnings.length > 0) {
  logger.warn('Filter warnings', { warnings: validation.warnings });
}

const filterCode = emitJXA(ast);
const script = buildQueryScript({ filterCode, ...options });
```

## Mutation Contracts

Extend the pattern to write operations:

```typescript
// src/contracts/mutations.ts

interface TaskMutation {
  operation: 'create' | 'update' | 'complete' | 'delete';
  target: 'task' | 'project';
  data?: TaskCreateData | TaskUpdateData;
  id?: string;  // Required for update/complete/delete
}

interface TaskCreateData {
  name: string;
  project?: string | null;  // null = inbox
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  flagged?: boolean;
  note?: string;
}

interface TaskUpdateData {
  name?: string;
  // ... partial updates allowed
}

interface MutationResult {
  success: boolean;
  id: string;
  operation: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}
```

## Migration Strategy

1. **Build AST infrastructure** (types, builder, validator) - with full test coverage
2. **Add JXA emitter** - most scripts use JXA
3. **Add OmniJS emitter** - for bridge operations
4. **Wire into QueryTasksToolV2** - as proof of concept
5. **Run full test suite** - verify behavior unchanged
6. **Gradually migrate other scripts**
7. **Add mutation contracts** - after filter AST is proven

## Success Criteria

- [ ] AST types defined with full TypeScript coverage
- [ ] Builder transforms all TaskFilter properties to AST
- [ ] Validator catches unknown fields, contradictions, tautologies
- [ ] JXA emitter produces correct code for all filter types
- [ ] OmniJS emitter produces correct code for all filter types
- [ ] QueryTasksToolV2 uses AST-generated filter code
- [ ] All existing tests pass (behavior unchanged)
- [ ] New unit tests for AST builder, validator, emitters
- [ ] Mutation contracts defined and integrated

## Estimated Effort

- Phase 1: AST Infrastructure (types, builder, validator): 2-3 hours
- Phase 2: Emitters (JXA, OmniJS): 2-3 hours
- Phase 3: Integration with QueryTasksToolV2: 1-2 hours
- Phase 4: Full migration of other scripts: 2-3 hours
- Phase 5: Mutation contracts: 1-2 hours

**Total: 8-13 hours**

## References

- Existing contracts: `src/contracts/`
- QueryCompiler with TaskFilter: `src/tools/unified/compilers/QueryCompiler.ts`
- Current string generator: `src/contracts/generator.ts`
