# Applying Harness Design to OmniFocus MCP Development

> Source: [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (Anthropic Engineering)
>
> Context: How to structure Claude Code's development workflow when coding on this MCP server, especially for multi-hour sessions spanning compaction boundaries.

---

## Article's Core Architecture

A **three-agent harness** inspired by GANs:

| Agent | Role | Key Insight |
|---|---|---|
| **Planner** | Decomposes 1-4 sentence prompt into full spec | Constrains on deliverables, not technical details |
| **Generator** | Implements one feature per sprint | Scope isolation prevents drift |
| **Evaluator** | Grades output against concrete criteria | Turns subjective "is this good?" into testable checks |

The generator and evaluator negotiate a **contract** before each sprint: what will be built and how to verify it.

**Context management**: Opus 4.5+ removed context anxiety, enabling continuous sessions with automatic compaction instead of context resets. A `claude-progress.txt` file lets agents recover state after compaction.

---

## Current Development Harness (`.claude/`)

### What exists

| Component | File | Article Equivalent |
|---|---|---|
| Process workflow (DOT graph) | `.claude/processes/CLAUDE-PROCESSES.dot` | Partial planner (decision trees, not decomposition) |
| TDD implementation skill | `cluster_implement` in DOT | Generator (single-feature scope) |
| Code standards reviewer | `.claude/agents/code-standards-reviewer.md` | Evaluator (reactive, not looped) |
| Test runner | `.claude/agents/test-runner.md` | Evaluator (reactive, not looped) |
| JXA expert | `.claude/agents/jxa-omnifocus-expert.md` | Domain-specific evaluator |

### What's missing

| Gap | Impact | Article Solution |
|---|---|---|
| **No progress tracking** | After compaction, Claude loses track of multi-step work | `claude-progress.txt` pattern |
| **No sprint decomposition** | Large features attempted monolithically, leading to drift | Planner agent decomposes into ordered sprints |
| **Evaluators are optional** | `code-standards-reviewer` exists but isn't required | Evaluator is a mandatory loop step |
| **No contract negotiation** | Claude jumps to code without stating what it will verify | Generator-evaluator contract before each sprint |
| **No dual-schema enforcement** | Zod/inputSchema sync is documented but not harness-enforced | Evaluator checks schema sync automatically |

---

## Recommended Harness Improvements

### 1. Progress File Protocol

**Purpose**: Let Claude recover state after compaction during long sessions.

**Implementation**: Add to `CLAUDE.md` or the DOT file:

> For any task expected to span more than 3 tool calls, create or update `claude-progress.md` at the repo root. Update it after completing each sprint. Read it at the start of any session or after receiving a compaction marker.

**Format**:

```markdown
## Current Task: [Brief description]
### Sprint Plan
- [x] Sprint 1: [description] — DONE
- [ ] Sprint 2: [description] — IN PROGRESS
- [ ] Sprint 3: [description]

### Decisions Made
- [Decision and rationale]

### Files Modified
- path/to/file.ts (what changed)

### Known Issues
- [Anything the next context window needs to know]
```

**Why it works**: Git history shows *what* changed but not *why* or *what's next*. The progress file bridges that gap. It's the equivalent of the article's mechanism for "quickly understanding the state of work when starting with a fresh context window."

### 2. Sprint Decomposition for Multi-File Changes

**Purpose**: Prevent drift on tasks touching >3 files.

**Implementation**: Add a new cluster to the DOT file between `cluster_understand` and `cluster_pre_code`:

```
subgraph cluster_plan_sprints {
    label="0.5 PLAN SPRINTS";
    "Task touches >3 files?" [shape=diamond];
    "Decompose into sprints" [shape=box];
    "Write sprint plan to progress file" [shape=box];
    "State contract: what each sprint delivers and how to verify" [shape=box];
}
```

Each sprint should be a **vertical slice**: one change that compiles, passes tests, and can be committed independently.

**Example** — Adding a new filter to `omnifocus_read`:

| Sprint | Deliverable | Verification |
|---|---|---|
| 1 | Zod schema + inputSchema for new filter | Unit tests pass, schemas match |
| 2 | QueryCompiler generates correct JXA | Unit tests for compiler output |
| 3 | Integration test with MCP protocol | `echo '...' \| node dist/index.js` returns expected data |

### 3. Mandatory Evaluator Loop

**Purpose**: Make evaluation a required harness step, not an optional afterthought.

**Current state**: The `code-standards-reviewer` and `test-runner` agents exist but Claude only invokes them when it remembers to (or when prompted).

**Implementation**: Update `cluster_verify` in the DOT file to explicitly require:

1. **Schema sync check**: After any change to `src/tools/unified/schemas/`, verify the corresponding `inputSchema` override matches
2. **Test runner**: Required, not optional — run `npm run test:unit` after every sprint
3. **Standards review**: Required after any new function, class, or module

The key shift from the article: the evaluator doesn't just say "pass/fail" — it provides **specific feedback that the generator acts on** before moving to the next sprint.

### 4. Contract Negotiation Before Implementation

**Purpose**: Prevent Claude from diving into code without stating what it will build and how it will verify success.

**Implementation**: Add to `CLAUDE.md`:

> Before writing code for any sprint, state:
> 1. What files will be modified
> 2. What the change delivers (user-visible behavior or internal improvement)
> 3. How to verify it works (specific test command or manual check)
> 4. What schemas need to stay in sync (if applicable)

This is the article's "contract" concept. It forces Claude to plan before acting, which is especially valuable after compaction when context is thin.

### 5. Reduced Harness Complexity for Better Models

The article found that Opus 4.5+ needed less scaffolding. For our harness:

- **Keep**: Progress tracking (model-independent, solves a real problem)
- **Keep**: Sprint decomposition (structural, not compensating for model weakness)
- **Simplify**: The DOT file's debugging clusters could be lighter — Opus 4.6 is better at systematic debugging without needing the full decision tree
- **Drop**: Overly prescriptive step-by-step instructions that the model would follow naturally

The goal is a harness that **adds structure the model can't provide itself** (progress persistence, external verification) without **adding friction the model doesn't need** (obvious decision trees).

---

## Implementation Priority

| Change | Effort | Impact | Do First? |
|---|---|---|---|
| Progress file protocol | Low (CLAUDE.md update) | High (solves compaction amnesia) | Yes |
| Contract negotiation | Low (CLAUDE.md update) | Medium (prevents drift) | Yes |
| Sprint decomposition cluster | Medium (DOT file update) | High (enables multi-hour work) | Yes |
| Mandatory evaluator loop | Medium (DOT file + agent updates) | High (catches schema sync) | Second |
| Schema sync checker agent | Medium (new agent definition) | High (automates biggest risk) | Second |
| Simplify debugging clusters | Low (DOT file edit) | Low (quality of life) | Later |

---

## How This Differs from the Usage Application

The [companion document](harness-design-for-omnifocus-usage.md) covers how these patterns apply to Claude **using** the OmniFocus MCP tools. This document covers how they apply to **developing** the server itself.

| Concern | Usage Application | Development Application |
|---|---|---|
| Generator | `omnifocus_write` tool calls | Writing TypeScript code |
| Evaluator | `omnifocus_read` to verify mutations | `test-runner` + `code-standards-reviewer` agents |
| Progress | Session mutation history via `system` tool | `claude-progress.md` file in repo |
| Contract | Write-then-verify loop for OmniFocus data | Sprint deliverable + verification criteria |
| Planner | GTD prompt templates | Sprint decomposition for multi-file changes |

---

## Sources

- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
