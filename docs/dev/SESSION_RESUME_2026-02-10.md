# Session Resume: Week of February 3-10, 2026

Handoff document for a developer picking up this codebase. Covers all structural changes from the past week, current
state, known issues, and where to go next.

**Branch:** `main` (all work merged) **Tests:** 1200 unit, 73 integration, all passing **Build:** Clean
(`npm run build`)

---

## Quick Start

```bash
git fetch && git checkout main && git pull
npm install && npm run build
npm run test:unit          # ~2 seconds, 1200 tests
npm run test:integration   # ~3 minutes, 73 tests (requires OmniFocus running)
```

**Essential reading before coding:**

1. `CLAUDE.md` — AI assistant instructions, quick reference
2. `docs/dev/FILTER_PIPELINE.md` — How filters work end-to-end (NEW this week)
3. `docs/dev/PATTERNS.md` — Symptom-based debugging
4. `docs/dev/LESSONS_LEARNED.md` — Hard-won insights (updated this week)

---

## What Changed This Week (30 commits)

### 1. AST Mode Migration (Feb 4-7)

**Commits:** `42ba5f1`, `321a4b5`, `1cea0ff`, `15b8d8b`

Migrated 4 query modes from legacy hand-written JXA scripts to the AST builder pipeline:

| Mode       | Old Path                       | New Path               | Deleted Script          |
| ---------- | ------------------------------ | ---------------------- | ----------------------- |
| `overdue`  | `date-range-queries.ts`        | `buildAST()` + emitter | `buildOverdueScript()`  |
| `flagged`  | `flagged-tasks-perspective.ts` | `buildAST()` + emitter | Entire file             |
| `upcoming` | `date-range-queries.ts`        | `buildAST()` + emitter | `buildUpcomingScript()` |
| `today`    | `todays-agenda.ts`             | `buildAST()` + emitter | Entire file             |

**What this means:** All task query modes now go through the same code path:
`TaskFilter → buildAST() → validate → emitOmniJS()`. No more per-mode script files with duplicated logic.

**New AST features added for today mode:**

- `todayMode` flag in `TaskFilter` — triggers OR logic (due soon OR flagged)
- `tagStatusValid` filter — excludes tasks with on-hold tags
- `dropped` filter — excludes dropped tasks
- `task.dropped` synthetic field in AST emitter — converts to `taskStatus !== Task.Status.Dropped`

**Key files:**

- `src/contracts/ast/builder.ts` — All mode logic lives here now
- `src/contracts/ast/emitters/omnijs.ts` — Added `dropped` and `tagStatusValid` emitters
- `src/tools/tasks/QueryTasksTool.ts` — Mode handlers simplified to call `buildListTasksScriptV4()`

### 2. Filter Pipeline Refactor (Feb 8-10)

**Commits:** `0809280` through `390166d` (8 commits)

The biggest structural change. Eliminated a pointless round-trip conversion in the filter pipeline.

**Before (6 layers):**

```
Schema → Compiler → OmniFocusReadTool.mapToAdvancedFilters() → QueryTasksTool.processAdvancedFilters() → buildAST() → Emitter
                     ^^^ TaskFilter → advanced format ^^^       ^^^ advanced format → TaskFilter (POINTLESS) ^^^
```

**After (4 layers):**

```
Schema → Compiler → TaskFilter → buildAST() → Emitter
```

**What was done:**

#### Phase 1: Data-Driven Date Filters

- Replaced 3 copy-paste date filter blocks in `buildAST()` with a `DATE_FILTER_DEFS` registry
- Adding a new date filter is now one line in the registry array
- Safety net test (`filter-coverage.test.ts`) catches missing handlers automatically

**Key file:** `src/contracts/ast/builder.ts:33` — the `DATE_FILTER_DEFS` constant

#### Phase 2: Pipeline Function Extraction

- Extracted 7 reusable functions from `QueryTasksTool` into `src/tools/tasks/task-query-pipeline.ts`
- Both `OmniFocusReadTool` and `QueryTasksTool` now call the same shared functions
- Eliminates logic drift between the two code paths

| Function                                      | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `augmentFilterForMode(mode, filter, options)` | Adds mode-specific filters (overdue → dueBefore: now) |
| `getDefaultSort(mode)`                        | Returns default sort for each mode                    |
| `parseTasks(rawData)`                         | Converts raw script output to typed tasks             |
| `sortTasks(tasks, sortOptions)`               | Multi-level sort with null handling                   |
| `projectFields(tasks, fields)`                | Select subset of fields, always includes id           |
| `scoreForSmartSuggest(tasks, limit)`          | Priority scoring for smart suggestions                |
| `countTodayCategories(tasks)`                 | Count overdue/due_soon/flagged by reason field        |

**Key file:** `src/tools/tasks/task-query-pipeline.ts`

#### Phase 3: Direct Path in OmniFocusReadTool

- `routeToTasksTool()` now calls pipeline functions directly instead of going through QueryTasksTool
- Removed: `mapToAdvancedFilters()`, `needsAdvancedFilters()`, QueryTasksTool dependency
- Added: ID lookup fast path with NOT_FOUND / ID_MISMATCH structured errors
- Added: Today mode category counting (overdue_count, due_soon_count, flagged_count in metadata)

**Key file:** `src/tools/unified/OmniFocusReadTool.ts`

#### Phase 4: Documentation

- Created `docs/dev/FILTER_PIPELINE.md` — definitive guide for adding/debugging filters
- Updated `docs/dev/LESSONS_LEARNED.md` — Forecast "Past" view logic

**Impact on adding new filters:**

| Task                       | Before                    | After                               |
| -------------------------- | ------------------------- | ----------------------------------- |
| Add a date filter          | 6 files, easy to miss one | 3-4 files, safety net catches gaps  |
| Add a boolean filter       | 5 files                   | 4 files                             |
| Debug a silent filter drop | Check 6 layers            | Check 4 layers, clear pipeline docs |

### 3. plannedDate Filter (Feb 8)

**Commit:** `68386b0`

Plumbed `plannedDate` filter through all 6 layers (before the refactor reduced them to 4). This was the bug that
motivated the pipeline refactor — it required touching 6 independent files with no automated check.

**Known issue:** `plannedDate` filter with `"before": "now"` returns 0 results. Using an explicit timestamp like
`"before": "2026-02-11"` works. This is a pre-existing bug in the QueryCompiler's date handling, not related to the
refactor. Not yet fixed.

### 4. Bug Fixes (Feb 3-5)

| Commit    | Bug                                   | Fix                                                            |
| --------- | ------------------------------------- | -------------------------------------------------------------- |
| `33f0217` | Project completion silently failing   | JXA/OmniJS ID format mismatch in mutation script builder       |
| `a3d566a` | Subtask creation not working          | Use `parentTask.ending` in moveTasks for subtask relationships |
| `06ba568` | LLM sending strings for object params | Added `coerceObject` to filter schema for string coercion      |

### 5. Documentation Audit (Feb 3-4)

**Commits:** `fae4f41` through `7a13279` (7 commits)

Systematic audit of all docs for stale v2 references after the v3.0.0 API migration:

- Fixed tool name references (v2 names → `omnifocus_read`, `omnifocus_write`, etc.)
- Fixed broken internal links and stale file references
- Updated test counts and integration test timings in CLAUDE.md
- Added Claude Desktop project instructions template

---

## Current Architecture Overview

### Tool Surface (4 tools)

| Tool                | File                                        | Purpose                                                    |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `omnifocus_read`    | `src/tools/unified/OmniFocusReadTool.ts`    | Query tasks, projects, tags, perspectives, folders, export |
| `omnifocus_write`   | `src/tools/unified/OmniFocusWriteTool.ts`   | Create, update, complete, delete, batch                    |
| `omnifocus_analyze` | `src/tools/unified/OmniFocusAnalyzeTool.ts` | Productivity stats, velocity, patterns                     |
| `system`            | `src/tools/unified/SystemTool.ts`           | Version, diagnostics, metrics, cache                       |

### Task Query Data Flow

```
omnifocus_read API call
  → ReadSchema (Zod validation)
  → QueryCompiler.compile() → CompiledQuery { type, mode, filters: TaskFilter, ... }
  → OmniFocusReadTool.routeToTasksTool()
    → augmentFilterForMode() — adds mode-specific constraints
    → buildListTasksScriptV4() — calls buildAST() → emitOmniJS() → wraps in script
    → execJson() — runs OmniJS via JXA bridge
    → parseTasks() → sortTasks() → projectFields()
    → createTaskResponseV2() — standard response envelope
```

### Key Source Directories

```
src/
├── contracts/           # Shared types and AST pipeline
│   ├── filters.ts       # TaskFilter interface (THE contract)
│   └── ast/
│       ├── builder.ts   # TaskFilter → FilterNode AST
│       ├── types.ts     # AST node types, KNOWN_FIELDS
│       ├── emitters/    # AST → JXA/OmniJS code
│       └── script-builder.ts  # Wraps AST output in executable script
├── tools/
│   ├── unified/         # The 4 public MCP tools
│   │   ├── OmniFocusReadTool.ts   # Task routing, direct pipeline path
│   │   ├── compilers/   # API input → internal format
│   │   └── schemas/     # Zod validation schemas
│   └── tasks/
│       ├── task-query-pipeline.ts  # Shared pipeline functions (NEW)
│       └── QueryTasksTool.ts       # Legacy tool (used by CacheWarmer)
└── omnifocus/
    ├── scripts/         # JXA/OmniJS script templates
    └── OmniAutomation.ts  # Script execution engine
```

### Test Structure

```
tests/
├── unit/                    # 1200 tests, ~2 seconds
│   ├── contracts/           # AST builder, filter coverage safety net
│   ├── tools/unified/       # OmniFocusReadTool, compilers, schemas
│   └── tools/tasks/         # Pipeline functions, QueryTasksTool
└── integration/             # 73 tests, ~3 minutes (needs OmniFocus)
    ├── tools/unified/       # End-to-end through MCP server
    └── validation/          # Filter result validation
```

---

## Known Issues and Technical Debt

### Bugs

| Issue                                                | Severity | Details                                                                                                                                                   |
| ---------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plannedDate "before": "now"` returns 0              | Medium   | QueryCompiler doesn't resolve `"now"` for planned dates. Explicit timestamps work.                                                                        |
| `deferDateOperator` not passed through QueryCompiler | Low      | `transformDateFilter()` missing operator param for defer dates. Only affects explicit `<`/`>` operators; `between` still works correctly due to defaults. |

### Technical Debt

| Item                                      | Priority | Details                                                                                                 |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| QueryTasksTool still exists               | Low      | Kept for CacheWarmer. Could be removed if CacheWarmer is refactored to use pipeline functions directly. |
| Inline import types in OmniFocusReadTool  | Low      | Lines 251, 255 use `import()` type expressions instead of top-level imports. Cosmetic.                  |
| `sort_applied` metadata semantics changed | Info     | Now reports `true` when default sort is applied (was `false` before). Arguably more correct.            |

### Potential Next Work

| Task                              | Complexity | Description                                                                                                                      |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Fix `plannedDate "before": "now"` | Small      | Resolve relative date tokens in QueryCompiler for all date filter types                                                          |
| Add `completionDate` filter       | Small      | Follow checklist in `FILTER_PIPELINE.md` — one registry line + 3 files                                                           |
| Forecast "Past" mode              | Medium     | Combine `dueDate < start_of_today OR plannedDate < start_of_today`, exclude blocked. See `LESSONS_LEARNED.md` for exact formula. |
| Remove QueryTasksTool             | Medium     | Refactor CacheWarmer to use pipeline functions, then delete QueryTasksTool                                                       |

---

## Development Workflow

### Adding a New Date Filter

Follow the checklist in `docs/dev/FILTER_PIPELINE.md`. The `filter-coverage.test.ts` safety net will fail if you miss a
step.

### TDD Process

This project uses strict TDD via the `superpowers:test-driven-development` skill:

1. Write failing test
2. Verify it fails for the right reason
3. Write minimal code to pass
4. Verify green
5. Refactor

### Build and Test Commands

```bash
npm run build              # TypeScript compilation (required before running)
npm run test:unit          # Fast: ~2 seconds, 1200 tests
npm run test:integration   # Slow: ~3 minutes, 73 tests (requires OmniFocus)
npx vitest run <path>      # Run specific test file
```

### Pre-Push Hooks

Git pre-push automatically runs: typecheck → lint → unit tests. All must pass before push succeeds.

### Important Conventions

- **TypeScript only** — never create `.js` files
- **Date format** — `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`, never ISO with Z suffix
- **Tags** — always use `bridgeSetTags()` from `minimal-tag-bridge.ts`, never direct assignment
- **JXA vs OmniJS** — JXA uses `task.name()` (method), OmniJS uses `task.name` (property). See
  `JXA-VS-OMNIJS-PATTERNS.md`.
- **MCP string coercion** — Claude Desktop sends all params as strings. Schemas must handle both types.

---

## Commit History (Last Week)

```
8586334 Merge branch 'refactor/filter-pipeline-eliminate-roundtrip'
390166d test: add coverage for today-mode counting, ID lookup, and projectFields guarantee
34ec2e6 docs: document OmniFocus Forecast "Past" view logic
8ec96d0 fix: include offset in response metadata for pagination
335ad81 fix: address code review findings from pipeline refactor
0ef3c08 docs: update FILTER_PIPELINE.md to reflect 4-layer architecture
4e4b740 refactor: eliminate round-trip conversion in OmniFocusReadTool
dc13aba refactor: extract pipeline functions from QueryTasksTool for reuse
0809280 refactor: replace copy-paste date filters with data-driven DATE_FILTER_DEFS registry
68386b0 fix: plumb plannedDate filter through all query execution layers
15b8d8b refactor: migrate today mode from legacy script to AST builder
e7767cf docs: add flagged and upcoming AST migration benchmark results
1cea0ff chore: delete legacy flagged and upcoming scripts after benchmark parity
321a4b5 refactor: migrate flagged and upcoming modes from legacy scripts to AST builder
42ba5f1 refactor: migrate overdue mode from legacy script to AST builder
d5790a5 docs: update unit test count to 1102 in CLAUDE.md
33f0217 fix: project completion silently failing due to JXA/OmniJS ID mismatch
7a13279 docs: fix remaining audit findings - test count and stale filename references
1736203 docs: fix stale internal routing references in API-COMPACT-UNIFIED.md
6b1a956 docs: fix stale v2 references in PATTERNS.md and PATTERN_ANALYSIS_GUIDE.md
c6677da docs: fix low-priority audit findings - user-facing docs and archive v2 test prompts
bd1693f docs: update integration test count and duration in CLAUDE.md
558fa81 docs: fix medium-priority audit findings - v2→v3 tool names and broken links
fae4f41 docs: fix high-priority documentation audit findings across 11 files
9908954 docs: add Claude Desktop project instructions template
5647352 docs: add code standards and debugging guidance to CLAUDE.md
fc64ca9 docs: add git workflow guidance to CLAUDE.md
0d0adb7 chore: clean up root directory clutter
c4d6477 chore: add WebSearch to allowed permissions
a3d566a fix: use parentTask.ending in moveTasks to create subtask relationship
e1fbceb docs: update stale references to v3.0.0 unified API
06ba568 fix: add coerceObject to filters for LLM string coercion
```

---

**Last updated:** 2026-02-10 **Author:** Kip (with Claude Code)
