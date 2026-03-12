# OMN-34: Project Filter Resolution

> Replace the regex-based project ID/name heuristic with proper OmniJS API resolution and duplicate detection.

## Problem

`emitters/omnijs.ts:124` guesses whether a user-supplied string is a project ID or name:

```javascript
const isLikelyId = /^[a-zA-Z0-9_-]+$/.test(v) && v.length > 10;
```

Short IDs misclassify as names. Long alphanumeric names (e.g., "Thanksgiving2025") misclassify as IDs. Duplicate project
names are silently resolved to the first match with no warning.

## Solution

Widen the emitter return type from `string` to `EmitResult { preamble, predicate }`. Project filters emit a preamble
that resolves the project once via OmniJS APIs, then compare by object identity in the predicate. Duplicate project
names are detected and surfaced as metadata warnings.

## Emitter Return Type

```typescript
export interface EmitResult {
  /** Code that runs once before the filter loop (variable declarations, lookups) */
  preamble: string;
  /** The filter predicate expression */
  predicate: string;
}
```

Both `emitOmniJS()` and `emitJXA()` return `EmitResult`. For all non-project filter types, `preamble` is empty string —
no behavior change.

## Project Resolution Preamble

When the AST contains a project comparison, `emitProjectComparison` generates:

**Preamble (runs once, before filter loop):**

```javascript
var __projectTarget_0 = (function () {
  var target = 'User Input';
  var byId = Project.byIdentifier(target);
  if (byId) return { project: byId, method: 'id', duplicates: 0 };
  var byName = flattenedProjects.byName(target);
  if (!byName) return null;
  var matches = document.projectsMatching(target);
  var exact = matches.filter(function (p) {
    return p.name === target;
  });
  return { project: byName, method: 'name', duplicates: exact.length - 1 };
})();
```

**Predicate:**

```
== operator:  (__projectTarget_0 && task.containingProject === __projectTarget_0.project)
!= operator:  (!__projectTarget_0 || task.containingProject !== __projectTarget_0.project)
```

### Design Decisions

| Decision                                | Rationale                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Object identity comparison (`===`)      | Faster and unambiguous vs string property comparison                                     |
| `__` prefix on variable names           | Avoid collision with user-facing variables in generated script                           |
| `method` field in result                | Feeds duplicate detection — only name-resolved projects check for duplicates             |
| `null` return when not found            | Predicate short-circuits: `false` for `==`, `true` for `!=`                              |
| `byName()` for exact match              | Returns first match. `document.projectsMatching()` is substring — only used for counting |
| `flattenedProjects` is an OmniJS global | Available in `evaluateJavascript` context alongside `flattenedTasks`                     |
| `project: null` handled upstream        | `QueryCompiler` converts `project: null` to `inInbox: true` — never reaches emitter      |
| Counter for unique names                | `__projectTarget_0`, `__projectTarget_1` — scoped to `emitOmniJS` call                   |

## Preamble Merging

`emitNode` recursively collects preambles from all children and concatenates them:

```typescript
case 'and': {
  const results = node.children.map(emitNode);
  return {
    preamble: results.map(r => r.preamble).filter(Boolean).join('\n'),
    predicate: `(${results.map(r => r.predicate).join(' && ')})`,
  };
}
```

OR and NOT nodes follow the same pattern. Each project comparison uses a unique variable name via a closure-scoped
counter initialized at the start of `emitOmniJS()`. The counter resets per call — each invocation of `emitOmniJS()`
starts at 0. The JXA emitter uses the same mechanism for contract consistency, though its preambles are currently always
empty.

## Duplicate Warnings

When a project is resolved by name and duplicates exist, a warning appears in response metadata:

```json
{
  "metadata": {
    "warnings": [
      "Multiple projects named \"Home Renovation\" found (3 total). Showing tasks from the first match. Use project ID (e.g. filters.project: \"abc123DEFgh\") to target a specific one."
    ]
  }
}
```

The warning includes the resolved project's ID so the LLM assistant can suggest the precise identifier.

### Warning Assembly Location

Warning assembly code lives in `script-builder.ts`, not in the emitter. The emitter only produces the preamble (which
defines `__projectTarget_N`) and the predicate. The script-builder knows the variable names (from `EmitResult.preamble`)
and generates the warning-assembly code in the response metadata block.

**In `buildFilteredTasksScript`**, after the filter loop and before `JSON.stringify`:

```javascript
// Warning assembly — generated by script-builder, not the emitter
var __warnings = [];
if (typeof __projectTarget_0 !== 'undefined' && __projectTarget_0 && __projectTarget_0.duplicates > 0) {
  __warnings.push("Multiple projects named \\"" + "${projectValue}" + "\\" found ("
    + (__projectTarget_0.duplicates + 1) + " total). Showing tasks from the first match. "
    + "Use project ID (e.g. filters.project: \\""
    + __projectTarget_0.project.id.primaryKey + "\\") to target a specific one.");
}

return JSON.stringify({
  tasks: sliced,
  metadata: {
    // ...existing fields...
    warnings: __warnings
  }
});
```

**How script-builder knows to emit this:** The `EmitResult.preamble` is non-empty. The script-builder checks
`if (filterCode.preamble)` and, if truthy, injects both the preamble (before the loop) and the warning assembly (after
the loop). The project value string is available at code-generation time (it's a compile-time constant from the filter).

**Upstream:** `OmniFocusReadTool` already passes through all `metadata` fields from script responses. No MCP layer
changes needed — warnings ride the existing metadata path.

## Consumer Updates

| Consumer                      | File                  | Change                                                                                       |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `FilterPipeline.emit()`       | `filter-generator.ts` | Returns `EmitResult` instead of `string`                                                     |
| `generateFilterCode()`        | `filter-generator.ts` | Returns `EmitResult` instead of `string`                                                     |
| `generateFilterCodeSafe()`    | `filter-generator.ts` | `GenerateFilterCodeResult.code` field becomes `EmitResult`                                   |
| `generateFilterFunction()`    | `filter-generator.ts` | Emits preamble before function body, predicate in return statement                           |
| `generateFilterBlock()`       | `filter-generator.ts` | Emits preamble before predicate assignment                                                   |
| `buildFilteredTasksScript()`  | `script-builder.ts`   | Injects `filterCode.preamble` before `matchesFilter` definition, both sort and no-sort paths |
| `buildInboxScript()`          | `script-builder.ts`   | Same preamble injection pattern                                                              |
| `buildRepeatingTasksScript()` | `script-builder.ts`   | Same preamble injection pattern                                                              |
| `buildExportTasksScript()`    | `script-builder.ts`   | Same preamble injection pattern                                                              |
| JXA fast-search path          | `script-builder.ts`   | Uses JXA emitter (preamble always empty); update to destructure `EmitResult`                 |

**Note on `needsTags` optimization:** The JXA fast-search path (`~line 1847`) currently checks
`filterCode.includes('taskTags')`. After the change, this becomes `filterCode.predicate.includes('taskTags')`.

## Testing

### Emitter Tests (`omnijs.test.ts`)

| Test                                          | Verifies                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Non-project filters return empty preamble     | All existing tests updated to check `EmitResult` — behavior unchanged          |
| Project `==` emits resolution preamble        | Preamble contains `Project.byIdentifier` and `flattenedProjects.byName`        |
| Project `!=` emits correct negation           | `!__projectTarget_0 \|\| task.containingProject !== __projectTarget_0.project` |
| Multiple project comparisons get unique names | `__projectTarget_0`, `__projectTarget_1`                                       |
| AND/OR/NOT merge preambles from children      | Combined preamble contains all child preambles                                 |

### Filter Generator Tests

| Test                                                            | Verifies               |
| --------------------------------------------------------------- | ---------------------- |
| `generateFilterCode()` returns `EmitResult`                     | Return type contract   |
| `FilterPipeline.emit()` returns `EmitResult`                    | Pipeline contract      |
| `generateFilterFunction()` places preamble before function body | Structural correctness |

### Script Builder Tests

| Test                                                | Verifies                               |
| --------------------------------------------------- | -------------------------------------- |
| Project filter embeds preamble before forEach       | Preamble placement in generated script |
| Both sort and no-sort paths include preamble        | Both code paths covered                |
| Duplicate warning in metadata when `duplicates > 0` | Warning string in response JSON        |
| No warning when resolved by ID                      | Clean path                             |

### Existing Tests

~60+ emitter tests need mechanical update from `string` to `EmitResult`. A test helper like
`expectPredicate(result, expectedCode)` reduces noise.

Integration tests validate end-to-end against real OmniFocus — no new integration tests needed.

## Out of Scope

| Item                                        | Reason                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| QueryCompiler changes                       | Compiler stays pure — no runtime OmniJS calls                             |
| Fuzzy/substring matching                    | `byName()` exact match is correct; text filter handles substring          |
| Project caching                             | Resolution runs once per query; no cross-query persistence                |
| Zod schema changes                          | `project` field stays `z.union([z.string(), z.null()])`                   |
| JXA preamble support                        | JXA emitter returns `EmitResult` for consistency but preamble stays empty |
| `projectsMatching()` as user-facing feature | Internal use only for duplicate counting                                  |
| 106s JXA IPC performance                    | Separate problem in legacy JXA scripts, not the OmniJS filter pipeline    |
| JXA deprecation                             | Future work, independent of this change                                   |
