# QueryCompiler TaskFilter Integration Design

**Date:** 2025-11-24 **Status:** Approved **Context:** Session notes in `src/contracts/SESSION_NOTES_2025-11-24.md`

## Problem Statement

15+ bugs in git history share a common pattern: property name mismatches between the API schema (`FilterValue`) and what
OmniJS scripts expect. For example:

- API sends: `status: 'completed'`
- Script checks: `filter.completed === true`
- Result: Filter doesn't work, bug reported

## Solution

Transform `FilterValue` (API schema) to `TaskFilter` (contracts) inside `QueryCompiler.compile()`. This creates a single
translation point with compile-time type safety.

## Architecture

```
┌──────────────┐      ┌───────────────────┐      ┌─────────────┐
│ FilterValue  │ ──→  │  QueryCompiler    │ ──→  │ TaskFilter  │
│ (API Schema) │      │  .transformFilter │      │ (Contract)  │
└──────────────┘      └───────────────────┘      └─────────────┘
     ↑                                                  ↓
  Zod validates                                   Scripts use
  MCP input                                       consistent types
```

## Transformation Rules

| FilterValue                   | TaskFilter                                              | Notes                |
| ----------------------------- | ------------------------------------------------------- | -------------------- |
| `status: 'completed'`         | `completed: true`                                       | Explicit mapping     |
| `status: 'active'`            | `completed: false`                                      |                      |
| `status: undefined`           | `completed: undefined`                                  | Default behavior     |
| `tags: { any: [...] }`        | `tags: [...], tagsOperator: 'OR'`                       | Operator extracted   |
| `tags: { all: [...] }`        | `tags: [...], tagsOperator: 'AND'`                      |                      |
| `tags: { none: [...] }`       | `tags: [...], tagsOperator: 'NOT_IN'`                   |                      |
| `dueDate: { before: x }`      | `dueBefore: x`                                          | Flattened            |
| `dueDate: { after: x }`       | `dueAfter: x`                                           |                      |
| `dueDate: { between: [a,b] }` | `dueAfter: a, dueBefore: b, dueDateOperator: 'BETWEEN'` |                      |
| `text: { contains: x }`       | `text: x, textOperator: 'CONTAINS'`                     |                      |
| `text: { matches: x }`        | `text: x, textOperator: 'MATCHES'`                      |                      |
| `project: null`               | `inInbox: true`                                         | Null project = inbox |
| `flagged: true`               | `flagged: true`                                         | Direct passthrough   |
| `available: true`             | `available: true`                                       | Direct passthrough   |

## Logical Operators (AND/OR/NOT)

**Current approach:** Flatten simple cases, log and reject complex ones.

| Operator                       | Handling                                |
| ------------------------------ | --------------------------------------- |
| `AND: [a, b]`                  | Merge filters (most common use)         |
| `OR: [...]`                    | Log warning, use first condition only   |
| `NOT: { status: 'completed' }` | Transform to `completed: false`         |
| Complex NOT                    | Log warning, best-effort simplification |

**Observability:** All rejections are logged to `mcp.log` with structured JSON:

```
[WARN] [QueryCompiler] OR operator not yet supported - flattening to first condition
  {"originalFilter":{...},"flattenedTo":{...},"suggestion":"Open issue with use case"}
```

**Analysis script:** `scripts/analyze-filter-rejections.ts` summarizes rejection patterns from logs to inform when full
support is needed.

## Migration Strategy

### Phase 1: Transform in QueryCompiler (This PR)

- `CompiledQuery.filters` type changes from `FilterValue` to `TaskFilter`
- New private method `transformFilters(input: FilterValue): TaskFilter`
- Import `TaskFilter` from `src/contracts/filters.ts`
- Existing scripts continue to work (already check most TaskFilter properties)
- Fix any property name mismatches discovered

### Phase 2: Migrate Scripts to Generator (Future)

- Start with simplest mode (e.g., "all")
- Use `generateFilterBlock()` from `src/contracts/generator.ts`
- Verify identical behavior with integration tests
- Replace hand-written filter logic

### Phase 3: Remove Duplicated Code (Future)

- Delete hand-written filter functions from scripts
- All filtering comes from generator
- Single source of truth achieved

## Type Safety Enforcement

```typescript
// CompiledQuery changes
import { TaskFilter } from '../../contracts/filters.js';

export interface CompiledQuery {
  type: 'tasks' | 'projects' | ...;
  filters: TaskFilter;  // Changed from FilterValue
  // ...
}
```

Compile-time errors if downstream code expects `FilterValue` properties that don't exist on `TaskFilter`.

## Testing Strategy

### Unit Tests (QueryCompiler.transformFilters)

```typescript
describe('transformFilters', () => {
  it('transforms status: completed → completed: true');
  it('transforms tags.any → tags + tagsOperator: OR');
  it('transforms dueDate.between → dueAfter + dueBefore + operator');
  it('logs warning and flattens OR operator');
  it('transforms project: null → inInbox: true');
});
```

### Integration Tests

- Existing `tests/integration/validation/filter-results.test.ts` validates end-to-end behavior
- No new integration tests needed initially

### Coverage Goals

- 100% coverage of transformation rules in unit tests
- Integration tests verify behavior unchanged

## Files to Modify

1. **`src/tools/unified/compilers/QueryCompiler.ts`**
   - Import `TaskFilter` from contracts
   - Add `transformFilters()` method
   - Change `CompiledQuery.filters` type

2. **`src/contracts/filters.ts`**
   - May need to add properties if gaps found

3. **`tests/unit/tools/unified/compilers/QueryCompiler.test.ts`**
   - Add transformation unit tests

4. **`docs/dev/PATTERNS.md`**
   - Add "Complex Filter Operators" section

5. **`scripts/analyze-filter-rejections.ts`** (new)
   - Log analysis script for operator rejections

## Success Criteria

1. All existing integration tests pass
2. New unit tests cover all transformation rules
3. TypeScript catches property name mismatches at compile time
4. OR/NOT rejections are logged and analyzable
5. No user-facing behavior changes (except clearer errors for unsupported operators)

## Future Considerations

- If >50 OR operator rejections/month, consider implementing full support
- Generator adoption can happen incrementally per mode
- Consider adding `TaskFilter` validation in scripts as defense-in-depth
