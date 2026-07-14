# CLAUDE.md - Essential Guide for Claude Code

## 🧠 User-Facing Guidance

For intent interpretation, GTD methodology, date conversion, and result interpretation, see
**`docs/skills/omnifocus-assistant/SKILL.md`** (installed as a user-level Claude Code skill via symlink). This CLAUDE.md
focuses on developer implementation details.

---

## 🔄 Process Rules

_(Extracted 2026-07-14 from the retired `CLAUDE-PROCESSES.dot` — transcript audit showed the DOT was never read
in-session; prose here is the delivery mechanism that works. TDD (`superpowers:test-driven-development`), debugging
discipline including the stuck→escalate-after-third-failed-attempt protocol (`superpowers:systematic-debugging`), and
pre-completion verification (`superpowers:verification-before-completion`) arrive via those skills — not restated
here.)_

- **Ambiguous request?** Ask targeted clarifying questions before acting — don't guess at intent.
- **Before writing code:** grep `src/omnifocus/scripts/shared/` for an existing pattern; read any match completely
  before reinventing. Symptom-driven work starts at `docs/dev/PATTERNS.md`.
- **Debugging is MCP-first:** when a tool returns wrong data, do NOT open the generated script. Test the tool call at
  the MCP seam first (via `MCPTestClient` — see `tests/`; a raw `echo | node dist/index.js` pipe drops the last
  in-flight response). If the script output is correct, the bug is in the wrapper/tool layer.
- **Public field/operation changes** walk the Vertical Contract Matrix below — every layer done or explicitly N/A.
- **Measure before optimizing;** bulk operations are NOT the same as multiple single queries — check how the batch route
  actually lowers before assuming equivalence.
- **Before declaring a task complete:** `npm run build`, `npm run lint` (`--max-warnings=0` — warnings fail), and
  `npm run test:unit` pass locally; `grep -rn 'console\.log' src/` shows no hits beyond the known `--help` printer in
  `src/utils/cli.ts` (runs and exits before stdio mode) — ESLint's `no-console` is deliberately off here, and a stray
  `console.log` on a stdio MCP server corrupts JSON-RPC framing for every client (`console.error`/`console.warn` write
  to stderr and are safe); TODO comments you touched still reflect reality. Features additionally need integration tests
  before they're considered complete (long-running — see `tests/integration/PERFORMANCE.md`; run in the background,
  never inside fleet builds).
- **Changes spanning >10 files:** STOP and get explicit approval of the blast radius before proceeding.

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

## ✅ Vertical Contract Matrix (public fields & operations)

Any change that adds or alters a **public field or operation** must be verified at every layer below before merge. Mark
irrelevant layers **N/A explicitly** in the PR body — an unmarked layer means "not checked", not "not needed".

| #   | Layer               | Stable anchor                                                                          |
| --- | ------------------- | -------------------------------------------------------------------------------------- |
| 1   | Schema (both)       | `src/tools/unified/schemas/` + the tool's `inputSchema` override                       |
| 2   | Normalization       | `src/tools/normalization/` (grep for `WRAPPER_HINTS`)                                  |
| 3   | Single-item path    | the tool's single-target handler                                                       |
| 4   | Batch path          | the batch handler(s) — grep for the field name in every batch route                    |
| 5   | Script lowering     | `src/contracts/ast/` (`MUTATION_DEFS` for mutations)                                   |
| 6   | Live bridge         | `/verify` against real OmniFocus — mocked tests don't count for this row               |
| 7   | Response validation | response schema + projection/`fields` handling                                         |
| 8   | Cache key           | the tool's cache-key builder — new inputs that change script output must key the cache |

**Don't advertise partial contracts:** the `inputSchema`/description change lands in the slice where the **last** matrix
layer completes, not the first. A field the client can see must already behave intentionally on single, batch, read, and
projection paths.

Origin (each a merged defect one unchecked layer caused): #72 (lowering emitted un-bridged OmniJS — a layer-5 defect,
catchable only by layer 6's live verify), #142 (batch path silently dropped `sequential` the schema accepted — layer 4),
#204 (list-path call site never wired the emitter — layer 4's check-every-route lesson; plus a cache-key collision and a
projection strip — layers 8 and 7).

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
| Tool returns 0s/empty but has data                   | MCP-first — see Process Rules (MCPTestClient at the seam) |
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

**For EXISTING scripts — JXA vs Bridge decision:** needs tag assignment, repetition rules, or task movement between
projects → bridge REQUIRED, regardless of item count (JXA tag writes silently no-op — see Tag Operations); >100 items →
add streaming/pagination (still bridged if tags are involved); otherwise pure JXA is fine.

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
# MCP smoke test (handshake only — for debugging tool behavior use MCPTestClient;
# raw pipes can drop the last in-flight response, see Process Rules "MCP-first")
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

## Git Workflow

Run `git pull --rebase` before `git push` to avoid failures from diverged remote branches (common when work spans
multiple machines or sessions).

**Corrective PRs:** a PR that fixes something merged earlier includes a `Corrects #NNN` line in its body, and its Linear
ticket gets the `corrective` label. This keeps planned slices (one architectural outcome) distinguishable from
corrective follow-ups (a preventable defect lineage) when reviewing project health.

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
