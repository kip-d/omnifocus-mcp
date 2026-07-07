# CLAUDE.md - Essential Guide for Claude Code

## 🧠 User-Facing Guidance

For intent interpretation, GTD methodology, date conversion, and result interpretation, see
**`docs/skills/omnifocus-assistant/SKILL.md`** (installed as a user-level Claude Code skill via symlink). This CLAUDE.md
focuses on developer implementation details.

---

## 🔄 Process Workflows

**All workflows in:** `.claude/processes/CLAUDE-PROCESSES.dot` (read this file for decision trees)

| Cluster              | When to Use                                         |
| -------------------- | --------------------------------------------------- |
| `cluster_understand` | New request arrives                                 |
| `cluster_pre_code`   | Before writing any code                             |
| `cluster_implement`  | TDD via `superpowers:test-driven-development` skill |
| `cluster_jxa_bridge` | Choosing JXA vs Bridge                              |
| `cluster_debugging`  | Tool returns wrong data                             |
| `cluster_stuck`      | Third attempt failed                                |
| `cluster_verify`     | Before completing task                              |
| `cluster_warnings`   | Critical mistakes to avoid                          |

**Full docs:** [docs/DOCS_MAP.md](docs/DOCS_MAP.md)

---

## 🎯 Unified API

**Tools:** `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`

```typescript
// Query tasks
{ query: { type: "tasks", filters: { project: null }, limit: 10 } }

// Count-only (33x faster for "how many" questions)
{ query: { type: "tasks", filters: { status: "active" }, countOnly: true } }
// Returns: metadata.total_count

// Create task
{ mutation: { operation: "create", target: "task", data: { name: "Example", flagged: true } } }
```

**Files:** `src/tools/unified/` (schemas, compilers, tools)

## 🔧 Dual-Schema Architecture (inputSchema vs Zod)

Each tool has **two schemas** that must stay in sync:

| Schema                     | Purpose                                   | Location                               |
| -------------------------- | ----------------------------------------- | -------------------------------------- |
| **Zod schema**             | Server-side validation (full, recursive)  | `src/tools/unified/schemas/`           |
| **`inputSchema` override** | MCP advertisement (hand-crafted, compact) | `get inputSchema()` in each tool class |

`BaseTool.inputSchema` **throws** if a subclass forgets to override. There is no auto-conversion.

**When changing a Zod schema, you MUST also update the corresponding `inputSchema` override.** Changes include:
adding/removing/renaming fields, changing enums, adding new operations to discriminated unions, or modifying
descriptions. The `inputSchema` is what MCP clients (Claude Desktop, etc.) see to understand available parameters.

| Tool                   | inputSchema location                        |
| ---------------------- | ------------------------------------------- |
| `OmniFocusReadTool`    | `src/tools/unified/OmniFocusReadTool.ts`    |
| `OmniFocusWriteTool`   | `src/tools/unified/OmniFocusWriteTool.ts`   |
| `OmniFocusAnalyzeTool` | `src/tools/unified/OmniFocusAnalyzeTool.ts` |
| `SystemTool`           | `src/tools/system/SystemTool.ts`            |

Also update the tool's **description string** if the change affects user-facing behavior (new operations, changed
semantics).

---

## 📚 Architecture Documentation

| Document                              | Purpose                                    |
| ------------------------------------- | ------------------------------------------ |
| `/docs/dev/PATTERNS.md`               | Quick symptom lookup (START HERE)          |
| `/docs/dev/ARCHITECTURE.md`           | Execution patterns                         |
| `/docs/dev/JXA-VS-OMNIJS-PATTERNS.md` | Syntax differences (source of many bugs)   |
| `/docs/dev/LESSONS_LEARNED.md`        | Hard-won insights                          |
| `/docs/dev/SETTER-PATTERNS.md`        | OmniJS/JXA property setter decision matrix |

**JXA vs OmniJS Quick Reference:**

- **JXA (outer script):** `task.name()`, `folder.parent()` (method calls)
- **OmniJS (inside evaluateJavascript):** `task.name`, `folder.parent` (property access)
- **Parent relationships ONLY work in OmniJS** → `project.parentFolder`, `folder.parent`

## 🔍 Quick Symptom Index

| Symptom                                              | Quick Fix                                                 |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Tool returns 0s/empty but has data                   | Test MCP integration first! Compare script vs tool output |
| Test expects data.id but gets undefined              | Test MCP response structure first                         |
| Tags not saving/empty                                | Assign via OmniJS `addTag()` — see Tag Operations         |
| Typed-value write returns success but didn't persist | Read-back required — see `docs/dev/SETTER-PATTERNS.md`    |
| Script timeout (25+ seconds)                         | Never use `.where()/.whose()`                             |
| Dates wrong time                                     | Use `YYYY-MM-DD HH:mm` not ISO+Z                          |
| Parent/folder returns null                           | Use OmniJS bridge: `project.parentFolder`                 |
| "X is not a function" error                          | You're in OmniJS - remove `()`                            |
| Property returns function not value                  | You're in JXA - add `()`                                  |

**Full symptom guide:** `/docs/dev/PATTERNS.md`

## Key Files

| File                                      | Purpose                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `src/omnifocus/scripts/shared/helpers.ts` | Core utilities                                 |
| `src/contracts/ast/`                      | Mutation + tag script builders (setters, tags) |

## JavaScript Execution

**For NEW scripts:** Use OmniJS-first pattern. See `/docs/dev/OMNIJS-FIRST-PATTERN.md`

**For EXISTING scripts:** See `cluster_jxa_bridge` in DOT file for decision tree.

**Bridge is REQUIRED for:** Tag assignment, repetition rules, task movement between projects.

## 🏷️ Tag Operations

JXA `task.tags = …` and `task.addTags()` silently no-op. Assign tags via OmniJS `addTag()` inside the mutation script
(`src/contracts/ast/mutation-script-builder.ts`) or the AST tag builders
(`src/contracts/ast/tag-mutation-script-builder.ts`).

**Pipeline:** `mutation-script-builder.ts` / `tag-mutation-script-builder.ts` (entry points) route into
`mutation/defs.ts` (`MUTATION_DEFS` lowering builds an `assignTags` AST node), which `mutation/emitter.ts` emits as
OmniJS `addTag()` / `removeTag()` calls inside `evaluateJavascript`. This is the single authoritative description of the
pipeline — other docs should link here rather than restate it.

## Code & Writing Standards

- **TypeScript only** - Never create `.js` files. Follow existing patterns in the codebase.
- **Markdown for documentation** - Apply Elements of Style: tables over prose, omit needless words, active voice.
- **Build before running:** `npm run build`
- **Run integration tests** before considering features complete

## Documentation

- Archive obsolete docs to `.archive/` → push to https://github.com/kip-d/omnifocus-mcp-archive
- Follow Strunk's Elements of Style (tables > prose, omit needless words, active voice)
- **Don't hardcode the current version in prose.** `package.json` and `CHANGELOG.md` are the single source of truth.
  Historical references like "introduced in v3.0.0" are fine — descriptive labels like "(current v4.1.0)" go stale on
  every release.

## Referencing code in this doc

Cite **stable anchors**, never volatile specifics — this is the version-pin rule generalized:

- ✅ directories (`src/contracts/ast/`), grep targets ("grep for `bridgeSetTags`"), command invocations
  (`npm run test:unit`)
- ❌ `file.ts:NN` line numbers, hardcoded version strings, hardcoded test/size counts

Volatile references rot silently; `tests/unit/docs/claude-md-paths.test.ts` fails CI when a path reference stops
resolving, but it cannot catch a stale line number or count — those must not be written in the first place.

## 🚨 MCP Bridge Type Coercion

Claude Desktop converts ALL parameters to strings. Handle both:

```typescript
limit: z.union([z.number(), z.string().transform((val) => parseInt(val, 10))])
  .pipe(z.number().min(1).max(200))
  .default(25);
```

## Date Formats

Convert natural language ("tomorrow") to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` before calling tools.

| Date Type   | Default Time |
| ----------- | ------------ |
| Due dates   | 5:00 PM      |
| Defer dates | 8:00 AM      |
| Completion  | 12:00 PM     |

**Never use:** ISO-8601 with Z suffix (`2025-03-15T17:00:00Z`)

## Script Size Limits

- **JXA Direct:** 523KB limit
- **OmniJS Bridge:** 261KB limit

**See:** `/docs/dev/SCRIPT_SIZE_LIMITS.md` (live measurement of the largest script)

## MCP Lifecycle

**Always call `server.close()` before `process.exit()`** to flush responses.

```typescript
process.stdin.on('end', async () => {
  await Promise.allSettled([...pendingOperations]);
  await server.close();
  process.exit(0);
});
```

## Quick Reference

```bash
# Build & Test
npm run build                    # Required before running
npm run test:unit                # (counts vary; run it)
npm run test:integration         # (counts vary; run it — use npm, not bun)

# MCP Testing
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
# protocolVersion is the client-declared value; use one your installed @modelcontextprotocol/sdk supports
```

## MCP Specification

**Spec:** https://modelcontextprotocol.io/specification/

| Detail           | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Protocol Version | determined by the installed `@modelcontextprotocol/sdk` (see `package.json`) |
| Transport        | stdio (stdin/stdout)                                                         |
| SDK              | see `package.json` → `@modelcontextprotocol/sdk`                             |
| Response Format  | `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`              |

## Project Structure

- `src/omnifocus/` - OmniAutomation integration via JXA
- `src/tools/` - MCP tools
- `src/cache/` - TTL-based caching (5m tasks, 5m projects, 10m tags, 1h analytics)

## Git Workflow

Run `git pull --rebase` before `git push` to avoid failures from diverged remote branches (common when work spans
multiple machines or sessions).

## Workflow norms

- PRs target `kip-d/omnifocus-mcp` (use `--repo kip-d/omnifocus-mcp`), not any upstream fork.
- Before merge, **stop and have Kip run `/code-review`** (user-invoked slash command → main-loop Opus); gate the merge
  on a Safe/Approved verdict. Do **not** dispatch a `superpowers:code-reviewer` subagent — `/code-review` can't be
  model-dispatched, and a `~/.claude` hook blocks the old reviewer (which would also run on the pinned Sonnet model).
- Merge via `gh pr merge --squash` after Kip's explicit per-PR go-ahead — never `--admin`. The repo has auto-merge
  disabled, so `--auto` fails with "Auto merge is not allowed"; wait for CI green, then merge plainly.
- `git pull --rebase` before `git push` (work spans multiple machines/sessions).

## Debugging & Investigation

When diagnosing issues, analyze carefully before suggesting a cause. Do not guess (e.g., "cache warming") or suggest
confidently wrong solutions (e.g., "/verbose command"). If uncertain, say so and investigate systematically.

- **Server won't start?** Run `npm run build`
- **Script timeouts?** Check OmniFocus not blocked by dialogs
- **Graceful exit is NOT an error** - it's required MCP compliance
