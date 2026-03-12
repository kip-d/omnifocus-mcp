# OMN-34: Project Filter Resolution — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or
> superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the regex-based project ID/name heuristic with proper OmniJS API resolution and duplicate detection.

**Architecture:** Widen emitter return type from `string` to `EmitResult { preamble, predicate }`. Project filters emit
a preamble that resolves the project once via `Project.byIdentifier()` / `flattenedProjects.byName()`, then compare by
object identity. Duplicates detected via `document.projectsMatching()` and surfaced as structured metadata.

**Tech Stack:** TypeScript, Vitest, OmniJS/OmniAutomation APIs

**Spec:** `docs/superpowers/specs/2026-03-12-omn34-project-filter-design.md`

---

## File Map

| File                                                  | Action | Responsibility                                                                             |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `src/contracts/ast/emitters/omnijs.ts`                | Modify | New `EmitResult` type, rewrite all functions to return it, new project resolution preamble |
| `src/contracts/ast/emitters/jxa.ts`                   | Modify | Same `EmitResult` return type (preamble always empty)                                      |
| `src/contracts/ast/filter-generator.ts`               | Modify | Update `FilterPipeline`, `generateFilterCode`, etc. to handle `EmitResult`                 |
| `src/contracts/ast/script-builder.ts`                 | Modify | Inject preamble in 5 script builders, add warning assembly                                 |
| `tests/unit/contracts/ast/emitters/omnijs.test.ts`    | Modify | Update ~60 tests to expect `EmitResult`, add project resolution tests                      |
| `tests/unit/contracts/ast/emitters/jxa.test.ts`       | Modify | Update ~45 tests to expect `EmitResult`                                                    |
| `tests/unit/contracts/ast/filter-generator.test.ts`   | Modify | Update to handle `EmitResult` returns                                                      |
| `tests/unit/contracts/ast/pipeline-isolation.test.ts` | Modify | Update to handle `EmitResult` returns                                                      |
| `tests/unit/completed-project-tasks.test.ts`          | Verify | Likely needs no changes (consumes script-builder, not emitters directly)                   |

---

## Chunk 1: EmitResult Type and OmniJS Emitter

### Task 1: Define EmitResult and update emitOmniJS return type

**Files:**

- Modify: `src/contracts/ast/emitters/omnijs.ts:1-21`

- [ ] **Step 1: Add EmitResult interface and update emitOmniJS signature**

Add `EmitResult` export at the top of the file. Change `emitOmniJS` to return `EmitResult`. Add a closure-scoped counter
for unique variable names.

```typescript
export interface EmitResult {
  /** Code that runs once before the filter loop (variable declarations, lookups) */
  preamble: string;
  /** The filter predicate expression */
  predicate: string;
}

export function emitOmniJS(ast: FilterNode): EmitResult {
  let projectCounter = 0;
  function nextProjectVar(): string {
    return `__projectTarget_${projectCounter++}`;
  }

  function emitNode(node: FilterNode): EmitResult {
    // ... (all existing logic moves inside this closure)
  }

  return emitNode(ast);
}
```

- [ ] **Step 2: Convert emitNode to return EmitResult**

Every case in `emitNode` returns `{ preamble, predicate }`. Non-project cases return empty preamble. AND/OR/NOT merge
child preambles.

```typescript
function emitNode(node: FilterNode): EmitResult {
  switch (node.type) {
    case 'literal':
      return { preamble: '', predicate: String(node.value) };

    case 'comparison':
      return emitComparison(node);

    case 'exists':
      return { preamble: '', predicate: emitExists(node) };

    case 'and': {
      if (node.children.length === 0) return { preamble: '', predicate: 'true' };
      const results = node.children.map(emitNode);
      return {
        preamble: results
          .map((r) => r.preamble)
          .filter(Boolean)
          .join('\n'),
        predicate: `(${results.map((r) => r.predicate).join(' && ')})`,
      };
    }

    case 'or': {
      if (node.children.length === 0) return { preamble: '', predicate: 'false' };
      const results = node.children.map(emitNode);
      return {
        preamble: results
          .map((r) => r.preamble)
          .filter(Boolean)
          .join('\n'),
        predicate: `(${results.map((r) => r.predicate).join(' || ')})`,
      };
    }

    case 'not': {
      const child = emitNode(node.child);
      return {
        preamble: child.preamble,
        predicate: `!(${child.predicate})`,
      };
    }

    default:
      throw new Error(`Unknown node type: ${(node as FilterNode).type}`);
  }
}
```

- [ ] **Step 3: Convert emitComparison to return EmitResult**

All non-project comparisons wrap their existing string return in `{ preamble: '', predicate: ... }`. The project case
delegates to the new `emitProjectComparison` (next task).

```typescript
function emitComparison(node: ComparisonNode): EmitResult {
  const { field, operator, value } = node;

  if (field === 'taskTags') {
    return { preamble: '', predicate: emitTagComparison(operator, value as string[]) };
  }

  if (field === 'task.containingProject') {
    return emitProjectComparison(operator, value as string);
  }

  const syntheticDef = SYNTHETIC_FIELD_MAP.get(field);
  if (syntheticDef?.omnijs) {
    return { preamble: '', predicate: syntheticDef.omnijs(operator, value) };
  }

  const accessor = getFieldAccessor(field);

  let predicate: string;
  switch (operator) {
    case '==':
      predicate = `${accessor} === ${emitValue(value)}`;
      break;
    case '!=':
      predicate = `${accessor} !== ${emitValue(value)}`;
      break;
    case '<':
    case '>':
    case '<=':
    case '>=':
      predicate = emitDateComparison(accessor, operator, value as string);
      break;
    case 'includes':
      predicate = `${accessor}.toLowerCase().includes(${emitValue(value)}.toLowerCase())`;
      break;
    case 'matches':
      predicate = `/${String(value)}/i.test(${accessor})`;
      break;
    case 'some':
    case 'every':
      predicate = `${accessor}.${operator}(v => ${emitValue(value)}.includes(v))`;
      break;
    default:
      throw new Error(`Unknown operator: ${String(operator)}`);
  }

  return { preamble: '', predicate };
}
```

Note: `emitTagComparison`, `emitDateComparison`, `emitExists`, `getFieldAccessor`, `emitValue` remain as
`string`-returning helper functions. They are internal and only produce predicates, never preambles.

- [ ] **Step 4: Run build to verify types compile**

Run: `npm run build` Expected: Compile errors in consumers of `emitOmniJS` (expected — they still expect `string`). The
emitter itself should compile cleanly.

- [ ] **Step 5: Commit emitter type change (will break consumers temporarily)**

```bash
git add src/contracts/ast/emitters/omnijs.ts
git commit -m "refactor(OMN-34): change emitOmniJS return type to EmitResult

Introduces EmitResult { preamble, predicate } interface. All existing
filter types return empty preamble. Consumers will be updated next."
```

### Task 2: Rewrite emitProjectComparison with resolution preamble

**Files:**

- Modify: `src/contracts/ast/emitters/omnijs.ts:119-136`

- [ ] **Step 1: Replace emitProjectComparison**

Remove the regex heuristic. Return `EmitResult` with a preamble that resolves the project via OmniJS APIs, and a
predicate that compares by object identity.

```typescript
function emitProjectComparison(operator: ComparisonOperator, projectValue: string): EmitResult {
  const varName = nextProjectVar();
  const val = JSON.stringify(projectValue);

  const preamble = `var ${varName} = (function() {
  var target = ${val};
  var byId = Project.byIdentifier(target);
  if (byId) return { project: byId, method: "id", duplicates: 0, allMatches: [{ id: byId.id.primaryKey, name: byId.name }] };
  var byName = flattenedProjects.byName(target);
  if (!byName) return null;
  var matches = document.projectsMatching(target);
  var exact = matches.filter(function(p) { return p.name === target; });
  return {
    project: byName,
    method: "name",
    duplicates: exact.length - 1,
    allMatches: exact.map(function(p) { return { id: p.id.primaryKey, name: p.name }; })
  };
})();`;

  let predicate: string;
  switch (operator) {
    case '==':
      predicate = `(${varName} && task.containingProject === ${varName}.project)`;
      break;
    case '!=':
      predicate = `(!${varName} || task.containingProject !== ${varName}.project)`;
      break;
    default:
      throw new Error(`Unsupported project operator: ${operator}`);
  }

  return { preamble, predicate };
}
```

- [ ] **Step 2: Run build**

Run: `npm run build` Expected: Same consumer compile errors as before (not worse). The emitter itself compiles.

- [ ] **Step 3: Commit**

```bash
git add src/contracts/ast/emitters/omnijs.ts
git commit -m "feat(OMN-34): replace project heuristic with OmniJS API resolution

emitProjectComparison now generates a preamble that resolves the project
via Project.byIdentifier() then flattenedProjects.byName(), with
duplicate detection via document.projectsMatching()."
```

### Task 3: Update JXA emitter to return EmitResult

**Files:**

- Modify: `src/contracts/ast/emitters/jxa.ts`

- [ ] **Step 1: Import EmitResult from omnijs emitter and update all functions**

Import `EmitResult` from `./omnijs.js`. Change `emitJXA` signature to return `EmitResult`. Apply the same pattern as the
OmniJS emitter — all cases return `{ preamble: '', predicate: ... }`. The JXA `emitProjectComparison` keeps its existing
string-based heuristic (JXA preamble support is out of scope) but wraps it in `EmitResult`.

```typescript
import type { EmitResult } from './omnijs.js';
export type { EmitResult };

export function emitJXA(ast: FilterNode): EmitResult {
  // No counter needed — JXA never produces preambles
  return emitNode(ast);
}

function emitNode(node: FilterNode): EmitResult {
  // Same pattern as omnijs emitNode but all preambles are ''
  // ...
}
```

The JXA emitter's `emitProjectComparison` stays as-is (returns the heuristic-based string), just wrapped in
`{ preamble: '', predicate: ... }`. The JXA path is not used for task queries and is out of scope for OMN-34.

- [ ] **Step 2: Run build**

Run: `npm run build` Expected: Same consumer errors (both emitters now return `EmitResult`).

- [ ] **Step 3: Commit**

```bash
git add src/contracts/ast/emitters/jxa.ts
git commit -m "refactor(OMN-34): update emitJXA to return EmitResult

JXA emitter returns EmitResult with empty preamble for contract
consistency. No behavioral change."
```

### Task 4: Update OmniJS emitter tests

**Files:**

- Modify: `tests/unit/contracts/ast/emitters/omnijs.test.ts` (620 lines)

- [ ] **Step 1: Add test helper and update all existing tests**

Add a helper at the top of the test file to reduce noise:

```typescript
function expectPredicate(result: EmitResult, expected: string): void {
  expect(result.preamble).toBe('');
  expect(result.predicate).toBe(expected);
}
```

Then mechanically update every test that does `expect(code).toBe(...)` or `expect(code).toContain(...)`:

- `const code = emitOmniJS(ast)` stays the same (variable name is fine)
- `expect(code).toBe('...')` → `expectPredicate(code, '...')`
- `expect(code).toContain('...')` → `expect(code.predicate).toContain('...')`

The existing project comparison tests (that test the old heuristic) should be **replaced**, not updated, by the new
tests in Step 2.

- [ ] **Step 2: Add new project resolution tests**

Replace old project heuristic tests with:

```typescript
describe('project resolution (EmitResult preamble)', () => {
  it('emits resolution preamble for project == comparison', () => {
    const ast: FilterNode = {
      type: 'comparison',
      field: 'task.containingProject',
      operator: '==',
      value: 'My Project',
    };
    const result = emitOmniJS(ast);
    expect(result.preamble).toContain('Project.byIdentifier');
    expect(result.preamble).toContain('flattenedProjects.byName');
    expect(result.preamble).toContain('document.projectsMatching');
    expect(result.preamble).toContain('__projectTarget_0');
    expect(result.predicate).toBe('(__projectTarget_0 && task.containingProject === __projectTarget_0.project)');
  });

  it('emits negation predicate for project != comparison', () => {
    const ast: FilterNode = {
      type: 'comparison',
      field: 'task.containingProject',
      operator: '!=',
      value: 'My Project',
    };
    const result = emitOmniJS(ast);
    expect(result.preamble).toContain('__projectTarget_0');
    expect(result.predicate).toBe('(!__projectTarget_0 || task.containingProject !== __projectTarget_0.project)');
  });

  it('uses unique variable names for multiple project comparisons', () => {
    const ast: FilterNode = {
      type: 'and',
      children: [
        {
          type: 'comparison',
          field: 'task.containingProject',
          operator: '==',
          value: 'Project A',
        },
        {
          type: 'comparison',
          field: 'task.containingProject',
          operator: '!=',
          value: 'Project B',
        },
      ],
    };
    const result = emitOmniJS(ast);
    expect(result.preamble).toContain('__projectTarget_0');
    expect(result.preamble).toContain('__projectTarget_1');
    expect(result.predicate).toContain('__projectTarget_0');
    expect(result.predicate).toContain('__projectTarget_1');
  });

  it('merges preambles from AND children', () => {
    const ast: FilterNode = {
      type: 'and',
      children: [
        {
          type: 'comparison',
          field: 'task.containingProject',
          operator: '==',
          value: 'Work',
        },
        {
          type: 'comparison',
          field: 'task.flagged',
          operator: '==',
          value: true,
        },
      ],
    };
    const result = emitOmniJS(ast);
    // Preamble only from project comparison
    expect(result.preamble).toContain('__projectTarget_0');
    // Predicate combines both
    expect(result.predicate).toContain('__projectTarget_0');
    expect(result.predicate).toContain('task.flagged === true');
  });

  it('merges preambles from OR children', () => {
    const ast: FilterNode = {
      type: 'or',
      children: [
        {
          type: 'comparison',
          field: 'task.containingProject',
          operator: '==',
          value: 'Work',
        },
        {
          type: 'comparison',
          field: 'task.containingProject',
          operator: '==',
          value: 'Home',
        },
      ],
    };
    const result = emitOmniJS(ast);
    expect(result.preamble).toContain('__projectTarget_0');
    expect(result.preamble).toContain('__projectTarget_1');
  });

  it('passes preamble through NOT node', () => {
    const ast: FilterNode = {
      type: 'not',
      child: {
        type: 'comparison',
        field: 'task.containingProject',
        operator: '==',
        value: 'Work',
      },
    };
    const result = emitOmniJS(ast);
    expect(result.preamble).toContain('__projectTarget_0');
    expect(result.predicate).toContain('!(');
  });

  it('resets counter per emitOmniJS call', () => {
    const ast: FilterNode = {
      type: 'comparison',
      field: 'task.containingProject',
      operator: '==',
      value: 'Test',
    };
    const result1 = emitOmniJS(ast);
    const result2 = emitOmniJS(ast);
    // Both calls should start at _0
    expect(result1.preamble).toContain('__projectTarget_0');
    expect(result2.preamble).toContain('__projectTarget_0');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test:unit -- --reporter verbose tests/unit/contracts/ast/emitters/omnijs.test.ts` Expected: All tests
pass.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/contracts/ast/emitters/omnijs.test.ts
git commit -m "test(OMN-34): update OmniJS emitter tests for EmitResult

All existing tests updated to use expectPredicate helper. Old project
heuristic tests replaced with resolution preamble tests."
```

### Task 5: Update JXA emitter tests

**Files:**

- Modify: `tests/unit/contracts/ast/emitters/jxa.test.ts` (473 lines)

- [ ] **Step 1: Mechanically update all tests**

Same pattern as OmniJS tests: add `expectPredicate` helper, update all assertions. JXA project tests stay as-is
(heuristic unchanged) but wrapped in `EmitResult` expectations.

- [ ] **Step 2: Run tests**

Run: `npm run test:unit -- --reporter verbose tests/unit/contracts/ast/emitters/jxa.test.ts` Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/contracts/ast/emitters/jxa.test.ts
git commit -m "test(OMN-34): update JXA emitter tests for EmitResult

Mechanical update — all assertions now expect EmitResult. No behavioral
change in JXA emitter."
```

---

## Chunk 2: Filter Generator and Consumer Updates

### Task 6: Update filter-generator.ts

**Files:**

- Modify: `src/contracts/ast/filter-generator.ts:1-199`

- [ ] **Step 1: Update imports and types**

Import `EmitResult` from the emitter. Update `GenerateFilterCodeResult.code` from `string` to `EmitResult`.

```typescript
import { emitOmniJS, type EmitResult } from './emitters/omnijs.js';

export interface GenerateFilterCodeResult {
  success: boolean;
  code: EmitResult; // was: string
  ast: FilterNode;
  validation: ValidationResult;
  target: EmitTarget;
}
```

- [ ] **Step 2: Update FilterPipeline.emit()**

```typescript
emit(target: EmitTarget = 'omnijs'): EmitResult {
  if (!this._ast) this.build();
  if (!this._validation) this.validate();

  if (!this._validation!.valid) {
    throw new Error(`Filter validation failed: ${this._validation!.errors.map((e) => e.message).join('; ')}`);
  }

  return target === 'jxa' ? emitJXA(this._ast!) : emitOmniJS(this._ast!);
}
```

- [ ] **Step 3: Update generateFilterCode()**

```typescript
export function generateFilterCode(
  filter: TaskFilter | NormalizedTaskFilter,
  target: EmitTarget = 'omnijs',
): EmitResult {
  return FilterPipeline.from(filter).emit(target);
}
```

- [ ] **Step 4: Update generateFilterFunction()**

```typescript
export function generateFilterFunction(
  filter: TaskFilter | NormalizedTaskFilter,
  target: EmitTarget = 'omnijs',
): string {
  const { preamble, predicate } = generateFilterCode(filter, target);

  return `${preamble ? preamble + '\n' : ''}function matchesFilter(task, taskTags) {
  taskTags = taskTags || (task.tags ? task.tags.map(t => t.name) : []);
  return ${predicate};
}`;
}
```

- [ ] **Step 5: Update generateFilterBlock()**

```typescript
export function generateFilterBlock(filter: TaskFilter): string {
  const { preamble, predicate } = generateFilterCode(filter, 'omnijs');

  return `
${preamble ? preamble + '\n' : ''}// Generated filter predicate
const taskTags = task.tags ? task.tags.map(t => t.name) : [];
const matchesFilter = ${predicate};
if (!matchesFilter) return;
`;
}
```

- [ ] **Step 6: Update generateFilterCodeSafe()**

The `code` field in the success return already uses the pipeline's `emit()` method, which now returns `EmitResult`. The
type change in `GenerateFilterCodeResult` handles this.

- [ ] **Step 7: Re-export EmitResult from ast/index.ts**

Add `EmitResult` to the exports in `src/contracts/ast/index.ts`:

```typescript
export type { EmitResult } from './emitters/omnijs.js';
```

- [ ] **Step 8: Run build**

Run: `npm run build` Expected: Compile errors now only in `script-builder.ts` (the last consumer). Filter-generator
should compile cleanly.

- [ ] **Step 9: Commit**

```bash
git add src/contracts/ast/filter-generator.ts src/contracts/ast/index.ts
git commit -m "refactor(OMN-34): update filter-generator to handle EmitResult

FilterPipeline.emit(), generateFilterCode(), generateFilterFunction(),
generateFilterBlock(), and generateFilterCodeSafe() all updated."
```

### Task 7: Update script-builder.ts — preamble injection

**Files:**

- Modify: `src/contracts/ast/script-builder.ts`

This is the largest consumer change. Five script builders need preamble injection.

- [ ] **Step 1: Update buildFilteredTasksScript — sort path (line ~328)**

Change `const filterCode = generateFilterCode(filter, 'omnijs');` to destructure:

```typescript
const filterCode = generateFilterCode(filter, 'omnijs');
```

The variable stays the same but is now `EmitResult`. In the sort-path template, inject the preamble before
`matchesFilter`:

```typescript
script = `
(() => {
  const allResults = [];

  ${filterCode.preamble ? filterCode.preamble + '\n' : ''}
  // AST-generated filter predicate
  // Filter: ${filterDescription}
  function matchesFilter(task) {
    const taskTags = task.tags ? task.tags.map(t => t.name) : [];
    return ${filterCode.predicate};
  }

  flattenedTasks.forEach(task => {
    // ...existing loop body...
  });

  // ...sort and slice...

  ${/* warning assembly — see Task 8 */ ''}

  return JSON.stringify({
    tasks: sliced,
    // ...metadata...
  });
})()
`;
```

- [ ] **Step 2: Update buildFilteredTasksScript — no-sort path (line ~374)**

Same pattern — inject `filterCode.preamble` before `matchesFilter`, use `filterCode.predicate` in the return statement.

- [ ] **Step 3: Update buildInboxScript (line ~499)**

Same pattern — `filterCode` is now `EmitResult`, inject preamble, use `.predicate`.

- [ ] **Step 4: Update buildRecurringTasksScript (line ~629)**

Function is `buildRecurringTasksScript` (not "Repeating"). Same pattern — `filterCode` is now `EmitResult`, inject
preamble, use `.predicate`.

- [ ] **Step 5: Update buildExportTasksScript (line ~1400)**

Same pattern.

- [ ] **Step 6: Update JXA fast-search path (line ~1842)**

Update to destructure `EmitResult`. The `needsTags` check changes:

```typescript
const filterCode = generateFilterCode(filterForCode, 'jxa');
const needsTags = filterCode.predicate.includes('taskTags');
```

In the template, use `filterCode.predicate` instead of `filterCode`:

```typescript
return ${filterCode.predicate};
```

JXA preamble is always empty so no injection needed, but use `.predicate` for correctness.

- [ ] **Step 7: Run build**

Run: `npm run build` Expected: Clean compile — all consumers now handle `EmitResult`.

- [ ] **Step 8: Commit**

```bash
git add src/contracts/ast/script-builder.ts
git commit -m "refactor(OMN-34): inject preamble in all script builders

All five OmniJS script builders and the JXA fast-search path updated
to handle EmitResult. Preamble injected before matchesFilter definition."
```

### Task 8: Add warning assembly to buildFilteredTasksScript

**Files:**

- Modify: `src/contracts/ast/script-builder.ts`

- [ ] **Step 1: Extract project value from filter for warning message**

In `buildFilteredTasksScript`, after generating `filterCode`, extract the project value if present:

```typescript
const projectValue = filter.projectId ?? filter.project;
const hasProjectPreamble = !!filterCode.preamble;
```

- [ ] **Step 2: Add warning assembly code in sort path**

After the sort/slice and before `return JSON.stringify(...)`, inject warning assembly if `hasProjectPreamble`:

```typescript
${hasProjectPreamble ? `
  var __warnings = [];
  var __duplicateProjects = [];
  if (typeof __projectTarget_0 !== 'undefined' && __projectTarget_0 && __projectTarget_0.duplicates > 0) {
    __warnings.push("Multiple projects named \\"" + ${JSON.stringify(String(projectValue))} + "\\" found (" + (__projectTarget_0.duplicates + 1) + " total). Showing tasks from the first match. Use project ID to target a specific one.");
    __duplicateProjects = __projectTarget_0.allMatches;
  }` : ''}
```

And in the metadata block:

```typescript
${hasProjectPreamble ? 'warnings: __warnings,' : ''}
${hasProjectPreamble ? 'duplicateProjects: __duplicateProjects.length > 0 ? __duplicateProjects : undefined,' : ''}
```

- [ ] **Step 3: Add same warning assembly in no-sort path**

Same pattern.

- [ ] **Step 4: Run build**

Run: `npm run build` Expected: Clean compile.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ast/script-builder.ts
git commit -m "feat(OMN-34): add duplicate project warning assembly

When a project filter is present and resolved by name, the generated
script checks for duplicate project names and surfaces warnings with
all matching project IDs in response metadata."
```

### Task 9: Update filter-generator and pipeline-isolation tests

**Files:**

- Modify: `tests/unit/contracts/ast/filter-generator.test.ts`
- Modify: `tests/unit/contracts/ast/pipeline-isolation.test.ts`
- Modify: `tests/unit/completed-project-tasks.test.ts`

- [ ] **Step 1: Update filter-generator.test.ts**

Update all assertions that expect `generateFilterCode()` to return a string. Now returns `EmitResult`. For tests
checking the code value in `GenerateFilterCodeResult`, access `.code.predicate`.

Add new tests:

```typescript
it('generateFilterCode returns EmitResult with preamble and predicate', () => {
  const filter = { completed: false, flagged: true };
  const result = generateFilterCode(filter);
  expect(result).toHaveProperty('preamble');
  expect(result).toHaveProperty('predicate');
  expect(result.preamble).toBe('');
  expect(result.predicate).toContain('task.completed');
});

it('generateFilterCode returns preamble for project filter', () => {
  const filter = { projectId: 'My Project' };
  const result = generateFilterCode(filter);
  expect(result.preamble).toContain('Project.byIdentifier');
  expect(result.predicate).toContain('__projectTarget_0');
});
```

- [ ] **Step 2: Update pipeline-isolation.test.ts**

Same pattern — update `emitOmniJS()` call results from string to `EmitResult`. Access `.predicate` for assertion checks.

- [ ] **Step 3: Verify completed-project-tasks.test.ts**

This test file consumes `buildFilteredTasksScript` and `buildExportTasksScript` — it checks `.script` string content,
not emitter return types. It should pass without modification. Verify by running:

Run: `npm run test:unit -- --reporter verbose tests/unit/completed-project-tasks.test.ts` Expected: All tests pass
without changes.

- [ ] **Step 4: Add generateFilterFunction preamble placement test**

Add to `tests/unit/contracts/ast/filter-generator.test.ts`:

```typescript
it('generateFilterFunction places preamble before function body', () => {
  const filter = { projectId: 'Work' };
  const result = generateFilterFunction(filter);
  // Preamble (project resolution) appears before function definition
  const preambleIndex = result.indexOf('__projectTarget_0 = (function');
  const functionIndex = result.indexOf('function matchesFilter');
  expect(preambleIndex).toBeGreaterThanOrEqual(0);
  expect(preambleIndex).toBeLessThan(functionIndex);
});

it('generateFilterFunction omits preamble when not needed', () => {
  const filter = { flagged: true };
  const result = generateFilterFunction(filter);
  expect(result).not.toContain('__projectTarget');
  expect(result).toContain('function matchesFilter');
});
```

- [ ] **Step 5: Run all unit tests**

Run: `npm run test:unit` Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/contracts/ast/filter-generator.test.ts tests/unit/contracts/ast/pipeline-isolation.test.ts
git commit -m "test(OMN-34): update filter-generator and pipeline tests for EmitResult

Includes generateFilterFunction preamble placement tests."
```

---

## Chunk 3: Script Builder Tests and Final Verification

### Task 10: Add script-builder tests for preamble and warnings

**Files:**

- Modify: `tests/unit/contracts/ast/script-builder.test.ts` (or create if it doesn't exist under that name)

Find the existing script-builder test file first. Tests should verify:

- [ ] **Step 1: Write test — project filter embeds preamble in generated script**

```typescript
it('embeds project resolution preamble before matchesFilter', () => {
  const filter = { projectId: 'Work' };
  const result = buildFilteredTasksScript(filter, { limit: 10 });
  expect(result.script).toContain('Project.byIdentifier');
  expect(result.script).toContain('flattenedProjects.byName');
  expect(result.script).toContain('__projectTarget_0');
  // Preamble appears before matchesFilter
  const preambleIndex = result.script.indexOf('__projectTarget_0 = (function');
  const matchesFilterIndex = result.script.indexOf('function matchesFilter');
  expect(preambleIndex).toBeLessThan(matchesFilterIndex);
});
```

- [ ] **Step 2: Write test — sort path also includes preamble**

```typescript
it('embeds preamble in sort path', () => {
  const filter = { projectId: 'Work' };
  const result = buildFilteredTasksScript(filter, {
    limit: 10,
    sort: [{ field: 'dueDate', direction: 'asc' }],
  });
  expect(result.script).toContain('__projectTarget_0');
  expect(result.script).toContain('allResults.sort');
});
```

- [ ] **Step 3: Write test — warning assembly present when project filter used**

```typescript
it('includes warning assembly code when project filter present', () => {
  const filter = { projectId: 'Home Renovation' };
  const result = buildFilteredTasksScript(filter, { limit: 10 });
  expect(result.script).toContain('__warnings');
  expect(result.script).toContain('__duplicateProjects');
  expect(result.script).toContain('duplicates > 0');
});
```

- [ ] **Step 4: Write test — no warning assembly without project filter**

```typescript
it('does not include warning assembly when no project filter', () => {
  const filter = { flagged: true };
  const result = buildFilteredTasksScript(filter, { limit: 10 });
  expect(result.script).not.toContain('__warnings');
  expect(result.script).not.toContain('__duplicateProjects');
});
```

- [ ] **Step 5: Run tests**

Run: `npm run test:unit` Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/contracts/ast/script-builder.test.ts
git commit -m "test(OMN-34): add script-builder tests for preamble and warnings"
```

### Task 11: Full verification

- [ ] **Step 1: Run full unit test suite**

Run: `npm run test:unit` Expected: All ~1622 tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build` Expected: Clean compile.

- [ ] **Step 3: Run lint**

Run: `npm run lint` Expected: No lint errors.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck` Expected: No type errors.

- [ ] **Step 5: Run integration tests**

Run: `npm run test:integration` Expected: All 73 tests pass. Project-filtered queries should still work — they now use
the new resolution path.

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git commit -m "chore(OMN-34): final cleanup after verification"
```

- [ ] **Step 7: Squash or keep commits per preference, push**

The branch should have a clean history. Push for review.
