# Architecture — Navigation Aid

> Under 150 lines. "What's where and how it connects" — not implementation docs.

## Directory Structure

| Path                            | Contents                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `src/index.ts`                  | Server bootstrap (stdio/HTTP), cache init, tool registration, graceful shutdown     |
| `src/tools/base.ts`             | Abstract `BaseTool<TSchema, TResponse>` — validation, error categorization, metrics |
| `src/tools/index.ts`            | Registers 4 tools, correlation ID generation, MCP request/response handlers         |
| `src/tools/unified/`            | The 4 tool classes + compilers + schemas                                            |
| `src/tools/system/`             | SystemTool (version, diagnostics, metrics, cache)                                   |
| `src/contracts/`                | Type contracts — filters, mutations, responses, AST pipeline                        |
| `src/contracts/ast/`            | Filter compilation: TaskFilter → AST → OmniJS/JXA code                              |
| `src/omnifocus/`                | OmniAutomation executor, JXA/OmniJS scripts, API type definitions                   |
| `src/omnifocus/scripts/shared/` | Helpers injected into all scripts (safeGet, safeGetDate, etc.)                      |
| `src/cache/`                    | TTL cache (CacheManager) + startup warmer (CacheWarmer)                             |
| `src/utils/`                    | Response envelopes, logger, error taxonomy, metrics, timezone, branded types        |
| `tests/unit/`                   | ~1634 tests, ~2s                                                                    |
| `tests/integration/`            | ~73 tests, ~2min (requires OmniFocus running)                                       |
| `docs/dev/`                     | PATTERNS.md (symptom index), LESSONS_LEARNED.md, JXA-VS-OMNIJS-PATTERNS.md          |

## The 4 Tools

| Tool                | Class                  | Lines | Purpose                                                    |
| ------------------- | ---------------------- | ----- | ---------------------------------------------------------- |
| `omnifocus_read`    | `OmniFocusReadTool`    | 1,006 | Query tasks, projects, tags, perspectives, folders, export |
| `omnifocus_write`   | `OmniFocusWriteTool`   | 2,083 | Create/update/complete/delete, batch ops, tag management   |
| `omnifocus_analyze` | `OmniFocusAnalyzeTool` | 2,870 | 8 analytics modes (productivity, overdue, velocity, etc.)  |
| `system`            | `SystemTool`           | ~200  | Version, diagnostics, metrics, cache stats                 |

## Data Flow — Read Request

```
MCP request → ReadSchema (Zod) → QueryCompiler → OmniFocusReadTool.executeValidated()
  → query type router (tasks/projects/tags/folders/perspectives/export)
  → AST filter pipeline: buildAST() → validate → emitOmniJS() → EmitResult { preamble, predicate }
  → script-builder.ts assembles complete OmniJS script
  → OmniAutomation.executeJson() → osascript → OmniFocus
  → field projection + sorting → StandardResponseV2
```

## Data Flow — Write Request

```
MCP request → WriteSchema (Zod) → MutationCompiler → OmniFocusWriteTool.executeValidated()
  → operation router (create/update/complete/delete/batch/bulk_delete/tag_manage)
  → mutation-script-builder.ts builds OmniJS script
  → OmniAutomation.executeJson() → osascript → OmniFocus
  → batch mode: TempIdResolver + DependencyGraph → sequential execution
  → StandardResponseV2 with tempId→realId mapping
```

## Schema Architecture (Dual-Schema)

Each tool has **two schemas that must stay in sync**:

| Schema                     | Purpose                                   | Location                               |
| -------------------------- | ----------------------------------------- | -------------------------------------- |
| **Zod schema**             | Server-side validation (full, recursive)  | `src/tools/unified/schemas/`           |
| **`inputSchema` override** | MCP advertisement (hand-crafted, compact) | `get inputSchema()` in each tool class |

`BaseTool.inputSchema` **throws** if a subclass forgets to override. No auto-conversion.

**Compilers** translate public schemas → internal contracts:

- `QueryCompiler` → `CompiledQuery` (with `TaskFilter`, `ProjectFilter`)
- `MutationCompiler` → `CompiledMutation`
- `AnalysisCompiler` → `CompiledAnalysis`

**MCP bridge coercion**: Claude Desktop stringifies all params. Every numeric field uses
`z.union([z.number(), z.string().transform()])`.

## AST Filter Pipeline

```
TaskFilter (src/contracts/filters.ts)
  → buildAST() (src/contracts/ast/builder.ts) — FILTER_DEFS registry drives compilation
  → FilterNode tree (src/contracts/ast/types.ts) — And/Or/Not/Comparison/Exists/Literal
  → validateFilterAST() (validator.ts)
  → emitOmniJS() (emitters/omnijs.ts) → EmitResult { preamble, predicate }
  → script-builder.ts injects preamble + predicate into complete script
```

**Project filter resolution** (v4.1.0): `Project.byIdentifier()` → `flattenedProjects.byName()` with duplicate detection
via `document.projectsMatching()`. Object identity comparison, not string matching.

## Bridge Layer — JXA/OmniJS

`OmniAutomation.executeJson()` runs scripts via `osascript`. Scripts are OmniJS (property access: `task.name`) executed
inside OmniFocus. JXA (method calls: `task.name()`) is the outer wrapper.

| File                                                 | Purpose                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/omnifocus/OmniAutomation.ts`                    | Script executor — size monitoring (523KB limit), timeout (120s default) |
| `src/omnifocus/scripts/shared/helpers.ts`            | Injected utilities: safeGet, safeGetDate, safeGetTags, isTaskAvailable  |
| `src/omnifocus/scripts/shared/bridge-helpers.ts`     | JXA↔OmniJS bridge operations                                            |
| `src/omnifocus/scripts/shared/minimal-tag-bridge.ts` | `bridgeSetTags()` — tag mutations MUST use OmniJS bridge                |

## Cache Strategy

| Category  | TTL | Notes                                  |
| --------- | --- | -------------------------------------- |
| Tasks     | 5m  | Warmer only; reads always bypass cache |
| Projects  | 5m  |                                        |
| Tags      | 10m |                                        |
| Folders   | 10m |                                        |
| Analytics | 1h  |                                        |
| Reviews   | 3m  |                                        |

`CacheWarmer` runs non-blocking at startup (240s timeout). Task queries always hit OmniFocus directly;
projects/tags/folders use cache.

## Key Files Quick Reference

| File                                              | Purpose                                      |
| ------------------------------------------------- | -------------------------------------------- |
| `src/index.ts`                                    | Server entry point                           |
| `src/tools/index.ts`                              | Tool registration                            |
| `src/tools/unified/OmniFocusReadTool.ts`          | Read orchestration                           |
| `src/tools/unified/OmniFocusWriteTool.ts`         | Write orchestration + batch                  |
| `src/tools/unified/OmniFocusAnalyzeTool.ts`       | Analytics router                             |
| `src/tools/unified/schemas/read-schema.ts`        | Read Zod schema                              |
| `src/tools/unified/schemas/write-schema.ts`       | Write Zod schema                             |
| `src/tools/unified/compilers/QueryCompiler.ts`    | Schema → CompiledQuery                       |
| `src/tools/unified/compilers/MutationCompiler.ts` | Schema → CompiledMutation                    |
| `src/contracts/filters.ts`                        | Filter contract (SSOT)                       |
| `src/contracts/mutations.ts`                      | Mutation contract (SSOT)                     |
| `src/contracts/responses.ts`                      | Response types (TaskData, ProjectData, etc.) |
| `src/contracts/ast/builder.ts`                    | TaskFilter → FilterAST                       |
| `src/contracts/ast/emitters/omnijs.ts`            | AST → OmniJS code (EmitResult)               |
| `src/contracts/ast/script-builder.ts`             | Task query script generation                 |
| `src/contracts/ast/mutation-script-builder.ts`    | Mutation script generation                   |
| `src/omnifocus/OmniAutomation.ts`                 | Script executor (osascript)                  |
| `src/omnifocus/scripts/shared/helpers.ts`         | Injected script utilities                    |
| `src/cache/CacheManager.ts`                       | TTL cache with checksums                     |
| `src/utils/response-format.ts`                    | StandardResponseV2 envelopes                 |
