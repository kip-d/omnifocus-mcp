# Cognitive Complexity Assessment

**Date:** 2026-04-03
**Tool:** eslint-plugin-sonarjs v4.0.2, threshold set to 25

## All Warnings (sorted by score)

| # | Score | File | Function | Refactorable? |
|---|-------|------|----------|---------------|
| 1 | **58** | `src/contracts/ast/script-builder.ts:290` | `buildFilteredTasksScript` | Not recommended — AST builder with many branches; splitting scatters related logic |
| 2 | **57** | `src/utils/cli.ts:28` | `parseCLIArgs` | Not recommended — arg parsing is inherently branchy |
| 3 | **52** | `src/utils/response-format.ts:138` | `generateTaskSummary` | **Yes** — stat-counting is pure data transforms, easy to extract |
| 4 | **51** | `src/tools/unified/OmniFocusWriteTool.ts:1191` | `routeToBatch` | **Yes** — phase-based; each phase is an independent method |
| 5 | **48** | `src/omnifocus/scripts/shared/helpers.ts:82` | `isTaskEffectivelyCompleted` | No — inherent domain complexity, not accidental |
| 6 | **40** | `src/tools/tasks/task-query-pipeline.ts:210` | `sortTasks` | **Yes** — type comparators → lookup map eliminates most branching |
| 7 | **35** | `src/tools/unified/OmniFocusWriteTool.ts:1390` | `executeBatchCreates` | **Yes** — three distinct responsibilities (dep graph, execution, rollback) |
| 8 | **33** | `src/contracts/ast/filter-generator.ts:925` | filter code gen | Not recommended — code gen maps 1:1 to filter types |
| 9 | **33** | `src/tools/unified/OmniFocusWriteTool.ts:1457` | batch creates (cont.) | Same function as #7 |
| 10 | **32** | `src/contracts/mutations.ts:563` | `validateRepetitionRule` | **Yes** — per-field validation → small focused validators |
| 11 | **32** | `src/utils/response-format.ts:28` | response formatting | **Yes** — same file as #3 |
| 12 | **31** | `src/tools/unified/OmniFocusWriteTool.ts:982` | `handleProjectCreate` | Moderate — validation + script build + result processing |
| 13 | **31** | `src/tools/tasks/task-query-pipeline.ts:530` | pipeline operation | Moderate |
| 14 | **31** | `src/tools/unified/OmniFocusWriteTool.ts:524` | `handleTaskUpdate` | Moderate |
| 15 | **31** | `src/contracts/ast/filter-generator.ts:290` | `generateProjectFilterCode` | Not recommended — code gen |
| 16 | **30** | `src/tools/unified/OmniFocusWriteTool.ts:731` | write tool method | Moderate |
| 17 | **29** | `src/tools/unified/OmniFocusWriteTool.ts:379` | write tool method | Moderate |
| 18 | **28** | `src/utils/response-format.ts:304` | response formatting | **Yes** |
| 19 | **27** | `src/omnifocus/scripts/shared/helpers.ts:77` | helper function | No — domain logic |
| 20 | **27** | `src/contracts/ast/filter-generator.ts:218` | filter code gen | Not recommended — code gen |
| 21 | **27** | `src/tools/unified/OmniFocusWriteTool.ts:1607` | write tool method | Moderate |
| 22 | **27** | `src/tools/unified/compilers/AnalysisCompiler.ts` | analysis compilation | Moderate |

## Refactor Priorities (completed 2026-04-03)

| Priority | Function | Before | After | Strategy |
|----------|----------|--------|-------|----------|
| 1 | `generateTaskSummary` | 52 | ≤25 | Extracted `countTaskStats`, `generateTaskInsights`, `generateTaskPreview` |
| 2 | `routeToBatch` | 51 | 39 | Extracted `dispatchBatchOp` method for operation routing |
| 3 | `sortTasks` | 40 | ≤25 | Extracted `compareValues` and `toSortableString` helpers |
| 4 | `validateRepetitionRule` | 32 | ≤25 | Extracted `validateDaysOfWeek`, `validateArrayRange` |
| 5 | `executeBatchCreates` | 35 | ≤25 | Extracted `invalidateBatchCaches` method |
| — | `generateProjectSummary` | 32 | ≤25 | Extracted stalled project detection helper |

**Result:** 22 → 17 cognitive complexity warnings, 99 → 92 total warnings, 0 errors.

## Skip List (with reasoning)

| Function | Score | Why skip |
|----------|-------|----------|
| `buildFilteredTasksScript` | 58 | AST/script generation is inherently branchy; splitting scatters the mental model of how scripts are built |
| `parseCLIArgs` | 57 | Argument parsing functions are sequential and flat — high score from many independent `if` blocks, not nested complexity. Splitting into sub-parsers adds indirection without clarity |
| `isTaskEffectivelyCompleted` | 48 | Domain complexity — the function must check completion, dropped status, and parent project state. The complexity reflects the actual problem, not poor structure |
| `filter-generator.ts` functions | 31–33 | Code generation that maps directly to OmniFocus filter types; each branch handles a distinct filter and they share context. Extracting would require passing many parameters |
