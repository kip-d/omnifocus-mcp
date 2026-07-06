# Pattern Index

Find established patterns before implementing. If it "feels like it should exist", search first.

---

## Bridge Helper Pattern

**When:** JXA cannot access/set a property (tags, dates, repetition rules).

**Where:** OmniJS bridge scripts are emitted by the builders in `src/contracts/ast/` (grep for `evaluateJavascript`
there); shared JXA helpers live in `src/omnifocus/scripts/shared/helpers.ts`.

**Structure:**

```typescript
export const MY_BRIDGE = `
  function bridgeMyOperation(app, params) {
    const script = '(() => { return JSON.stringify(result); })()';
    return JSON.parse(app.evaluateJavascript(script));
  }
`;
export const getMyBridge = () => MY_BRIDGE;
```

**Usage:** Embed at script top, call from within IIFE. Single JXA execution context.

```bash
grep -r "evaluateJavascript\|bridge" src/omnifocus/scripts/shared/
```

---

## Field Access Pattern

| JXA Works                         | Use Bridge                              |
| --------------------------------- | --------------------------------------- |
| name, dueDate, deferDate, flagged | Tag assignment, added/modified/dropDate |
| completed, estimatedMinutes       | Repetition rules, planned date setting  |

```bash
grep -r "evaluateJavascript" src/contracts/ast/
```

---

## Script Composition

| Need              | Import                                                               |
| ----------------- | -------------------------------------------------------------------- |
| All scripts       | `getUnifiedHelpers()`                                                |
| OmniJS operations | emitted by the `src/contracts/ast/` builders (`mutation/emitter.ts`) |

---

## Two-Stage Enrichment

**Wrong:** Query from TS, enrich from TS, merge in TS.

**Right:** Embed bridge, filter in JXA, call bridge FROM WITHIN script, return complete data.

```typescript
// Inside JXA IIFE (illustrative — substitute your bridge call):
const enriched = bridgeGetX(app, taskIds);
results.forEach((t) => Object.assign(t, enriched[t.id]));
return JSON.stringify({ tasks: results });
```

Single osascript execution.

---

## Use Case Reference

| Use Case            | Pattern | File                                                                                    |
| ------------------- | ------- | --------------------------------------------------------------------------------------- |
| Set tags            | Bridge  | `src/contracts/ast/mutation-script-builder.ts` + `tag-mutation-script-builder.ts`       |
| Get added (created) | Filter  | `src/contracts/filters.ts` (type) + `src/contracts/ast/builder.ts` (`DATE_FILTER_DEFS`) |
| Set planned date    | Bridge  | `src/contracts/ast/mutation-script-builder.ts`                                          |
| Repetition rule     | Bridge  | `src/contracts/ast/mutation/repetition.ts` (`lowerRepetitionRule`)                      |
| Validate project    | Helpers | `helpers.ts`                                                                            |
| Query with filters  | Script  | `list-tasks-ast.ts`                                                                     |
| Create task + tags  | Script  | `src/contracts/ast/mutation-script-builder.ts` (`buildCreateTaskScript`)                |

Notes:

- Only `added` has a date-range filter; **no `modified` filter exists**.
- Mutation pipeline: `mutation-script-builder.ts` (entry points) -> `mutation/defs.ts` (`MUTATION_DEFS` lowering,
  `assignTags`, repetition wiring) -> `mutation/emitter.ts` (emits OmniJS `addTag`).

---

## Pattern Evolution

| Action          | When                                                              |
| --------------- | ----------------------------------------------------------------- |
| Create new      | Solved recurring problem, uses JXA/OmniJS, nothing similar exists |
| Extend existing | Similar exists, fits structure, adding bridge operation           |
| Refactor        | Better approach, performance gain, reduces duplication            |

Document in this file and `LESSONS_LEARNED.md`.

---

## Anti-Patterns

| Don't                   | Why                                | Do Instead           |
| ----------------------- | ---------------------------------- | -------------------- |
| Two-stage query from TS | Two osascript calls, complex merge | Embedded bridge      |
| Call bridge from TS     | Loses JXA context                  | Embed in script IIFE |
| Duplicate bridge logic  | Maintenance nightmare              | Import shared helper |

---

## Related Docs

- **ARCHITECTURE.md** - JXA vs OmniJS decision tree
- **PATTERNS.md** - Symptom → solution lookup
- **LESSONS_LEARNED.md** - War stories

---

## Usage

1. Search this file before implementing
2. Found pattern → read referenced file completely
3. No pattern → check anti-patterns
4. Still nothing → implement, then document here

**30 minutes searching > 2 hours reinventing.**
