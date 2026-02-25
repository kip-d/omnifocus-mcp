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

## 🎯 Unified API (v3.0.0)

**Tools:** `omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`

```typescript
// Query tasks
{ query: { type: "tasks", filters: { project: null }, limit: 10 } }

// Count-only (33x faster for "how many" questions)
{ query: { type: "tasks", filters: { status: "active" }, countOnly: true } }
// Returns: metadata.total_count

// Create task
{ mutation: { operation: "create", target: "task", data: { name: "Example", flagged: true } } }

// Export
{ query: { type: "export", exportType: "tasks", format: "json" } }
```

**Files:** `src/tools/unified/` (schemas, compilers, tools)

---

## 📚 Architecture Documentation

| Document                              | Purpose                                  |
| ------------------------------------- | ---------------------------------------- |
| `/docs/dev/PATTERNS.md`               | Quick symptom lookup (START HERE)        |
| `/docs/dev/ARCHITECTURE.md`           | Execution patterns                       |
| `/docs/dev/JXA-VS-OMNIJS-PATTERNS.md` | Syntax differences (source of many bugs) |
| `/docs/dev/LESSONS_LEARNED.md`        | Hard-won insights                        |

**JXA vs OmniJS Quick Reference:**

- **JXA (outer script):** `task.name()`, `folder.parent()` (method calls)
- **OmniJS (inside evaluateJavascript):** `task.name`, `folder.parent` (property access)
- **Parent relationships ONLY work in OmniJS** → `project.parentFolder`, `folder.parent`

## 🔍 Quick Symptom Index

| Symptom                                 | Quick Fix                                                 |
| --------------------------------------- | --------------------------------------------------------- |
| Tool returns 0s/empty but has data      | Test MCP integration first! Compare script vs tool output |
| Test expects data.id but gets undefined | Test MCP response structure first                         |
| Tags not saving/empty                   | Use `bridgeSetTags()` from `minimal-tag-bridge.ts`        |
| Script timeout (25+ seconds)            | Never use `.where()/.whose()`                             |
| Dates wrong time                        | Use `YYYY-MM-DD HH:mm` not ISO+Z                          |
| Parent/folder returns null              | Use OmniJS bridge: `project.parentFolder`                 |
| "X is not a function" error             | You're in OmniJS - remove `()`                            |
| Property returns function not value     | You're in JXA - add `()`                                  |

**Full symptom guide:** `/docs/dev/PATTERNS.md`

## Key Files

| File                                                 | Purpose           |
| ---------------------------------------------------- | ----------------- |
| `src/omnifocus/scripts/shared/helpers.ts`            | Core utilities    |
| `src/omnifocus/scripts/shared/bridge-helpers.ts`     | Bridge operations |
| `src/omnifocus/scripts/shared/minimal-tag-bridge.ts` | Tag operations    |

## JavaScript Execution

**For NEW scripts:** Use OmniJS-first pattern. See `/docs/dev/OMNIJS-FIRST-PATTERN.md`

**For EXISTING scripts:** See `cluster_jxa_bridge` in DOT file for decision tree.

**Bridge is REQUIRED for:** Tag assignment, repetition rules, task movement between projects.

## 🏷️ Tag Operations

```javascript
// ❌ These fail silently
task.addTags(tags);
task.tags = tags;

// ✅ Use bridge for assignment
const bridgeResult = bridgeSetTags(app, taskId, tagNames);
```

**Function:** `bridgeSetTags()` in `src/omnifocus/scripts/shared/minimal-tag-bridge.ts:41`

## Code & Writing Standards

- **TypeScript only** - Never create `.js` files. Follow existing patterns in the codebase.
- **Markdown for documentation** - Apply Elements of Style: tables over prose, omit needless words, active voice.
- **Build before running:** `npm run build`
- **Run integration tests** before considering features complete

## Documentation

- Archive obsolete docs to `.archive/` → push to https://github.com/kip-d/omnifocus-mcp-archive
- Follow Strunk's Elements of Style (tables > prose, omit needless words, active voice)

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
- **Current largest script:** 31KB (6% of limit)

**See:** `/docs/dev/SCRIPT_SIZE_LIMITS.md`

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
npm run test:unit                # ~2 seconds, 1487 tests
npm run test:integration         # ~2 minutes, 73 tests (use npm, not bun)

# MCP Testing
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
```

## MCP Specification

**Spec:** https://modelcontextprotocol.io/specification/2025-06-18/

| Detail           | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| Protocol Version | 2025-06-18                                                      |
| Transport        | stdio (stdin/stdout)                                            |
| SDK              | @modelcontextprotocol/sdk@1.17.4                                |
| Response Format  | `{ content: [{ type: 'text', text: JSON.stringify(result) }] }` |

## Project Structure

- `src/omnifocus/` - OmniAutomation integration via JXA
- `src/tools/` - MCP tools
- `src/cache/` - TTL-based caching (5m tasks, 5m projects, 10m tags, 1h analytics)

## Git Workflow

Run `git pull --rebase` before `git push` to avoid failures from diverged remote branches (common when work spans
multiple machines or sessions).

## Debugging & Investigation

When diagnosing issues, analyze carefully before suggesting a cause. Do not guess (e.g., "cache warming") or suggest
confidently wrong solutions (e.g., "/verbose command"). If uncertain, say so and investigate systematically.

- **Server won't start?** Run `npm run build`
- **Script timeouts?** Check OmniFocus not blocked by dialogs
- **Graceful exit is NOT an error** - it's required MCP compliance
