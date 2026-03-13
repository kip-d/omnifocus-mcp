# Clean-Room Reimplementation Design: OmniFocus GTD Assistant

**Date:** 2026-02-28
**Status:** Approved design — ready for implementation planning
**Approach:** CLI-First with MCP Wrapper (Approach A)

---

## Vision

An AI-powered GTD executive secretary for OmniFocus, built as a three-layer system optimized for both
Claude Code (CLI-first, token-efficient) and cross-client compatibility (MCP standard). The system reduces
the current 122-file, 6-layer architecture to ~30 files across 3 clean layers, while preserving all
hard-won JXA/OmniJS execution knowledge.

## Architecture

```
Layer 2: SKILL (GTD Methodology)
  "The brain" — knows GTD, interprets intent, guides workflows
  → Open standard Agent Skill (agentskills.io compatible)
  → 6 focused sub-skills, ~200-300 tokens each
  → Dual-mode: CLI examples for Claude Code, MCP examples for other clients

Layer 1: MCP SERVER (Cross-client standard)
  "The bridge" — thin wrapper (~300 lines) for Claude Desktop, Codex, GPT, etc.
  → Calls CLI binary via process boundary (never shares source code)
  → 4 tools with flat schemas + tool annotations
  → MCP spec 2025-11-25 (async Tasks, extensions, structured output)

Layer 0: CLI (omnifocus)
  "The hands" — standalone TypeScript CLI
  → All capabilities live here
  → ScriptBuilder with embedded JXA/OmniJS execution strategy
  → File-based caching, natural language date parsing
  → Usable from bash, shell scripts, MCP, or Shortcuts
```

### Why This Architecture

| Factor | Evidence |
|--------|----------|
| CLI uses 18x fewer tokens than MCP | OneUptime benchmark (Feb 2026) |
| 4 tools is optimal for LLM accuracy | Microsoft Research: degradation starts at ~30 |
| Flat schemas improve tool-calling by 47% | Microsoft Research |
| Skills are now an open standard | Adopted by OpenAI, Microsoft, GitHub (Dec 2025) |
| Process boundary keeps MCP wrapper thin | Prevents evolutionary complexity growth |
| No OmniFocus CLI exists | This fills a real gap in the ecosystem |

---

## Layer 0: CLI (`@omnifocus/cli`)

### Commands

#### Core Entity Commands

```
omnifocus tasks [filters]        Query tasks
omnifocus task <id>              Get single task details
omnifocus add <name> [options]   Capture a new task
omnifocus complete <id>          Mark task done
omnifocus update <id> [options]  Modify a task
omnifocus delete <id>            Delete (with confirmation)
omnifocus projects [filters]     Query projects
omnifocus tags [filters]         Query tags
omnifocus folders [filters]      Query folders
```

#### GTD Workflow Shortcuts

```
omnifocus inbox                  Tasks with no project
omnifocus today                  Due within 3 days OR flagged
omnifocus overdue                Past due date
omnifocus flagged                Flagged tasks
omnifocus upcoming [--days N]    Due within N days (default 14)
omnifocus review                 Projects due for review
omnifocus suggest [--limit N]    Smart suggestions
```

#### Filter Options (for `tasks`)

```
--project <name>       --tag <name>            --flagged
--due-before <date>    --due-after <date>      --defer-before <date>
--defer-after <date>   --planned-before <date> --planned-after <date>
--available            --blocked               --search <text>
--completed            --since <date>          --count
--tag-mode any|all|none
--filter <json>        Complex boolean filters (JSON expression)
```

#### Mutation Options

```
# omnifocus add
--project <name>    --tag <name> (repeatable)   --due <date>
--defer <date>      --planned <date>            --flag
--note <text>       --estimate <minutes>

# omnifocus update <id>
--name <text>       --project <name>     --due <date>
--defer <date>      --flag / --unflag    --add-tag / --remove-tag <name>
--clear-due         --clear-defer        --clear-planned
```

#### Output Control

```
--format text|json|csv|markdown    Default: text (LLM-friendly)
--fields <comma-separated>         Select specific fields
--limit N                          Pagination (default 25, max 500)
--offset N                         Pagination offset
--sort <field>:<asc|desc>          Sort order
--quiet                            Suppress headers, just data
```

#### Analysis Commands

```
omnifocus stats [--period day|week|month]
omnifocus velocity [--group-by week|month]
omnifocus analyze [--type overdue|patterns|workflow]
```

#### System Commands

```
omnifocus version                  CLI + OmniFocus version
omnifocus doctor                   Connection diagnostics
omnifocus cache --clear            Clear cached data
```

### Key Design Decisions

- **Natural language dates:** `tomorrow`, `next monday`, `end of month`, `2026-03-15` all accepted;
  CLI converts to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` internally
- **Date defaults:** Due dates default to 5:00 PM, defer dates to 8:00 AM (matches OmniFocus behavior)
- **Tag hierarchy:** `--tag "Context : Computer"` uses ` : ` separator
- **Text output** is default, designed for LLM consumption (concise, scannable, no decorative formatting)
- **JSON output** (`--format json`) is for MCP wrapper and programmatic use
- **Task IDs** are OmniFocus internal IDs (stable, unique)
- **Complex boolean filters:** `--filter` flag accepts JSON: `{"AND": [{"tags": {"any": ["work"]}}, ...]}`

### ScriptBuilder with Execution Strategy

A ~200-line module that encodes the empirically tested JXA/OmniJS decision matrix.

#### Execution Strategies

```typescript
enum ExecStrategy {
  JXA_DIRECT,     // Property reads via method calls — fast, simple
  OMNIJS_BRIDGE,  // Complex writes, bulk ops, parent traversal
  HYBRID,         // JXA for creation, bridge for complex properties
}
```

#### Decision Matrix (Empirically Tested)

| Operation | Strategy | Why |
|-----------|----------|-----|
| Read task properties | JXA Direct | Fast; method calls work for all reads |
| Read project/tag lists | JXA Direct | Cacheable; simple iteration |
| Read folder hierarchy | JXA Direct | `folder.folders()` works; traverse down |
| Create task (simple) | JXA Direct | `app.Task({name, note, flagged})` works |
| Create task (with tags/planned) | Hybrid | Create in JXA, bridge for complex props |
| Update task (name/note/flag/due) | JXA Direct | Simple property assignment |
| Update task (tags/planned/repeat) | OmniJS Bridge | JXA assignment fails silently |
| Complete/delete task | JXA Direct | Simple operations |
| Move task between projects | OmniJS Bridge | `moveTasks()` required |
| Bulk analytics | OmniJS Bridge | Direct property access avoids N round-trips |
| Folder-to-folder parent | OmniJS Bridge | Apple Events can't marshal this |

#### Safety Model

Values enter JXA scripts via a single injection point:

```typescript
// All external data serialized as PARAMS object via JSON.stringify
const script = `
  const PARAMS = ${JSON.stringify(params)};
  // All script logic reads PARAMS.filterStatus, PARAMS.limit, etc.
  // No other interpolation anywhere in the script
`;
```

Filter composition is structural (method calls on ScriptBuilder), preventing the
double-quoting bugs documented in the git history (commits `6db45d9`, `0d0f4e5`).

#### Preserved JXA Patterns

- NEVER use `whose()` or `where()` (25+ second timeout)
- Direct iteration with early exit for all queries
- Bridge required for: tags, plannedDate, repetitionRule, task movement
- `JSON.stringify()` for all value serialization into scripts
- Bridge operations read AND write in the same `evaluateJavascript` context
- `stderr` for logging; `stdout` is the data channel only
- Write scripts to temp files for `osascript` (never pass via `-e` flag)

#### Performance Baselines

| Operation | Target | Killer to Avoid |
|-----------|--------|----------------|
| Query 2000+ tasks | < 1s | `whose()` adds 25+ seconds |
| Write operations | < 500ms | `safeGet()` in loops adds 50% |
| Analytics | < 2s | Date objects in loops add 30% |
| Upcoming tasks | < 10s | JXA per-task method calls timeout at 60s; use bridge |

### Caching Strategy

| Data | TTL | Storage |
|------|-----|---------|
| Projects list | 5 minutes | `~/.omnifocus-cli/cache/` (JSON files) |
| Tags list | 10 minutes | Same |
| Task queries | Not cached | Always fresh |
| Analytics | 1 hour | Same |
| Folders | 10 minutes | Same |

---

## Layer 1: MCP Server (`@omnifocus/mcp-server`)

### Specification Target

- **MCP spec:** 2025-11-25 (async Tasks, extensions, structured output)
- **SDK:** Latest v1.x (@modelcontextprotocol/sdk), prepared for v2 import changes
- **Transport:** stdio (primary), Streamable HTTP (optional future)

### Tools (4 total, flat schemas)

#### `omnifocus_read`

```typescript
{
  command: "tasks" | "task" | "projects" | "tags" | "folders" | "inbox" |
           "today" | "overdue" | "flagged" | "upcoming" | "review" | "suggest",
  id: string,
  project: string,
  tag: string,
  flagged: boolean,
  dueBefore: string,       // YYYY-MM-DD
  dueAfter: string,
  deferBefore: string,
  deferAfter: string,
  available: boolean,
  search: string,
  completed: boolean,
  since: string,
  countOnly: boolean,
  fields: string,          // comma-separated
  limit: number,
  offset: number,
  sort: string,            // "field:direction"
  daysAhead: number,
  tagMode: "any" | "all" | "none",
  filter: string,          // JSON filter expression for complex queries
}
// Annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
```

#### `omnifocus_write`

```typescript
{
  operation: "add" | "complete" | "update" | "delete" | "batch",
  id: string,
  name: string,
  project: string,
  tags: string[],
  dueDate: string,
  deferDate: string,
  plannedDate: string,
  clearDueDate: boolean,
  clearDeferDate: boolean,
  clearPlannedDate: boolean,
  flagged: boolean,
  note: string,
  estimatedMinutes: number,
  operations: Array<{operation, id?, name?, ...}>,  // for batch mode
}
// Annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
```

#### `omnifocus_analyze`

```typescript
{
  type: "stats" | "velocity" | "overdue" | "patterns" | "workflow",
  period: "day" | "week" | "month",
  groupBy: "day" | "week" | "month",
}
// Annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
```

#### `system`

```typescript
{
  operation: "version" | "diagnostics" | "cache",
  cacheAction: "stats" | "clear",
}
// Annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
```

### CLI Bridge

```typescript
async function callCli(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFile('omnifocus', [...args, '--format', 'json']);
  if (stderr) log(stderr);
  return stdout;
}
```

Each tool handler translates flat params to CLI args, calls `callCli`, returns JSON.
Total MCP server: ~300-400 lines.

### Type Coercion

Claude Desktop converts all parameters to strings. Schemas use Zod transforms:

```typescript
limit: z.union([z.number(), z.string().transform(v => parseInt(v, 10))])
  .pipe(z.number().min(1).max(500))
  .default(25)
```

---

## Layer 2: Skills

### Skill Organization

```
~/.claude/skills/omnifocus/
  SKILL.md              Root: intent recognition + mode detection + routing
  skills/
    capture/SKILL.md    GTD Capture phase (~250 tokens)
    clarify/SKILL.md    GTD Clarify + Organize phases (~300 tokens)
    review/SKILL.md     Weekly review + daily planning (~300 tokens)
    engage/SKILL.md     Task selection + engagement (~200 tokens)
    query/SKILL.md      Advanced filtering and search (~250 tokens)
    admin/SKILL.md      Tag/project management, diagnostics (~200 tokens)
```

### Root Skill

~150 tokens. Intent recognition → sub-skill routing. Mode detection:

```
If bash access available → CLI mode (run omnifocus commands directly)
Otherwise → MCP mode (call omnifocus_read/write/analyze tools)
```

### Sub-Skill Structure

Each skill contains:
1. **GTD methodology** for that phase (mode-independent)
2. **CLI examples** (2-3 lines)
3. **MCP examples** (2-3 lines)
4. **Common patterns and anti-patterns**

### Key Skill Content

**capture:** Action verb naming, one-action-per-task, project detection, tag inference,
time estimate heuristics (call=15min, review=15-30min, write=30-60min)

**clarify:** 2-minute rule, actionable vs reference vs trash, defer vs due semantics,
project vs single action determination, waiting-for patterns

**review:** Weekly review 10-step checklist, daily planning workflow, overdue triage,
project status review

**engage:** Four GTD criteria (context, time available, energy, priority), smart suggestion
interpretation

**query:** Filter composition, date ranges, tag combinations, sort/pagination, export

**admin:** Tag hierarchy management, project creation, system diagnostics, cache management

### Open Standard Compatibility

Skills follow the Agent Skills specification (agentskills.io) with YAML frontmatter:

```yaml
---
name: omnifocus-capture
description: GTD capture phase - creating tasks with proper metadata in OmniFocus
---
```

---

## Package Structure (Monorepo)

```
omnifocus-tools/
  packages/
    cli/                          @omnifocus/cli
      src/
        commands/                 One file per command (~15 files)
        scripts/                  ScriptBuilder + execution helpers
          script-builder.ts       ~200 lines, embedded execution strategy
          bridge-helpers.ts       ~100 lines, reusable bridge operations
          jxa-helpers.ts          ~100 lines, reusable JXA patterns
        cache/                    File-based cache
        utils/                    Date parsing, arg validation
        index.ts                  CLI entry (commander.js)
      package.json
      tsconfig.json

    mcp-server/                   @omnifocus/mcp-server
      src/
        tools/                    4 tool handlers (~300 lines total)
        cli-bridge.ts             Spawns CLI process
        index.ts                  MCP server entry
      package.json                depends on @omnifocus/cli
      tsconfig.json

  docs/
    EXECUTION-STRATEGY.md         JXA/OmniJS decision matrix
    plans/                        Design docs

  skills/                         Agent Skills (open standard)
    omnifocus/
      SKILL.md
      skills/
        capture/SKILL.md
        clarify/SKILL.md
        review/SKILL.md
        engage/SKILL.md
        query/SKILL.md
        admin/SKILL.md

  package.json                    Monorepo root (npm workspaces)
  vitest.config.ts
```

### Estimated Size

| Component | Current | New | Reduction |
|-----------|---------|-----|-----------|
| Source files | 122 | ~25-30 | ~75% |
| Lines of source | ~15,000 | ~3,000-4,000 | ~75% |
| Test files | 81 | ~30-40 | ~55% |
| Documentation | ~100 files | ~10-15 | ~85% |
| Prod dependencies | 4 | 3 | — |
| Dev dependencies | 12 | ~8 | ~33% |

---

## Testing Strategy

### Level 1: CLI Unit Tests (fast, no OmniFocus)

- ScriptBuilder generates correct scripts for all filter combinations
- Date parsing converts natural language correctly
- Arg parsing handles edge cases
- Cache TTL logic works
- **~100 tests, < 2 seconds**

### Level 2: CLI Integration Tests (requires OmniFocus)

- Each command produces correct results against real data
- Filter combinations return expected counts
- Write operations persist correctly
- Bridge operations (tags, plannedDate) work
- Performance baselines met
- **~30 tests, ~2 minutes**

### Level 3: MCP Wrapper Tests (fast, no OmniFocus)

- Tool handlers correctly translate flat params to CLI args
- Schema validation rejects bad input
- Error responses include actionable messages
- Tool annotations are correct
- **~20 tests, < 1 second**

### Testing Principles

- vitest (fast, TypeScript-native)
- No "vibe testing" — every test asserts specific output
- CLI integration tests use shell execution (same path as MCP wrapper)
- Performance baseline tests verify targets

---

## OmniFocus Compatibility

- **Minimum:** OmniFocus 4.7 (plannedDate, mutually exclusive tags)
- **Recommended:** OmniFocus 4.8+ (Foundation Models integration is orthogonal)
- **JXA:** Required; runs via `osascript -l JavaScript`
- **OmniJS Bridge:** Required for complex operations; runs via `app.evaluateJavascript()`

---

## Security Considerations

- **Local-only execution:** CLI runs locally; no network requests except OmniFocus IPC
- **No auth needed:** stdio transport, OS process isolation
- **Injection prevention:** All values enter scripts via JSON.stringify (single injection point)
- **MCP tool poisoning:** Not applicable (locally installed, not from registry)
- **Destructive operations:** `delete` requires `--confirm` flag; MCP `destructiveHint: true`

---

## Migration from Current Codebase

This is a true clean-room reimplementation. The current codebase (`clean-of-mcp`) serves as:

1. **Reference for JXA/OmniJS patterns** — the LESSONS_LEARNED.md and JXA-VS-OMNIJS-PATTERNS.md
   contain empirically verified knowledge that informs the ScriptBuilder design
2. **Performance baselines** — the benchmarks in LESSONS_LEARNED.md define targets
3. **Bug history** — the git log documents serialization pitfalls to avoid

No code is carried forward. The new implementation is built from the spec above.

---

## Research Sources

This design is informed by extensive research across the LLM tooling community (February 2026):

**MCP Best Practices:**
- [Phil Schmid: MCP Best Practices](https://www.philschmid.de/mcp-best-practices)
- [Klavis: Less is More](https://www.klavis.ai/blog/less-is-more-mcp-design-patterns-for-ai-agents)
- [Microsoft Research: Tool-space interference](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/)
- [MCP Spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)

**CLI vs MCP:**
- [OneUptime: CLI is the New MCP](https://oneuptime.com/blog/post/2026-02-03-cli-is-the-new-mcp/view)
- [Speakeasy: Reducing Token Usage 100x](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2)

**Agent Skills:**
- [Anthropic: Agent Skills Open Standard](https://venturebeat.com/ai/anthropic-launches-enterprise-agent-skills-and-opens-the-standard)
- [Simon Willison: Skills Are Awesome](https://simonwillison.net/2025/Oct/16/claude-skills/)

**OmniFocus Automation:**
- [OmniAutomation](https://omni-automation.com/omnifocus/index.html)
- [OmniFocus 4.7/4.8 Release Notes](https://www.omnigroup.com/blog/omnifocus-4.7-now-available)
- [FocusRelayMCP](https://github.com/deverman/FocusRelayMCP) — evaluated, not adopted

**Task Management MCP Servers Surveyed:**
- Todoist (Doist/todoist-ai), Linear (jerhadf, tacticlaunch), Notion (official + community),
  ClickUp (taazkareem), Asana (roychri), Jira (nguyenvanduocit), GTD-specific (peerjakobsen, ekicyou)
