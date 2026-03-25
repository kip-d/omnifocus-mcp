# Applying Anthropic's Harness Design Patterns to OmniFocus MCP Usage

> Source: [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (Anthropic Engineering Blog, Prithvi Rajasekaran)
>
> Context: How the article's patterns apply to Claude's **use** of the OmniFocus MCP server as a tool during extended task management sessions.

---

## Article Summary

Anthropic designed a **three-agent architecture** (Planner, Generator, Evaluator) inspired by GANs that enabled multi-hour autonomous coding sessions. Key findings:

- **Planner Agent** expands 1-4 sentence prompts into full product specs
- **Generator Agent** works in sprints, one feature at a time
- **Evaluator Agent** grades outputs against concrete criteria (the "discriminator")
- **Generator-Evaluator Loop** maps to the software development lifecycle (code review + QA)
- **Opus 4.5** removed "context anxiety," allowing context resets to be dropped entirely
- **Claude Agent SDK's automatic compaction** handles context growth in continuous sessions
- **`claude-progress.txt`** helps agents recover state when starting with fresh context windows

---

## Mapping to OmniFocus MCP

### Generator-Evaluator Loop as Read/Write/Analyze Cycle

| Harness Role | OmniFocus MCP Equivalent |
|---|---|
| **Generator** | `omnifocus_write` (creates/updates tasks) |
| **Evaluator** | `omnifocus_read` + `omnifocus_analyze` (query and validate results) |
| **Contract** | Zod schemas defining valid operations |

### Planner Agent as GTD Spec Decomposition

- User says: "Set up my quarterly review project"
- Planner decomposes into: create project, create sequential action groups, set defer/due dates, assign tags, flag key items
- Each step becomes a discrete `omnifocus_write` call with verification

### Context Management

- `system` tool could expose session summaries ("you've created 12 tasks, completed 5, moved 3") for agent reorientation after compaction
- Large-scale task management (reorganizing hundreds of tasks, weekly reviews) benefits from state recovery

### One-Feature-at-a-Time Sprints

- Sequential single-operation calls with verification between each, rather than massive batch mutations
- Trades throughput for reliability — critical when operations can fail silently (tags, repetition rules, task movement)

---

## Concrete Opportunities

| Pattern | Implementation | Effort |
|---|---|---|
| **Write-verify loop** | MCP prompt: "after every write, read back and confirm" | Low |
| **Progress summary** | `system` tool returning session mutation history | Medium |
| **Plan decomposition prompts** | GTD-aware planning templates in `src/prompts/gtd/` | Medium |
| **Evaluator criteria for GTD** | Grading rubric for task quality (has due date? tagged? in project?) | Medium |
| **Contract negotiation** | Agent proposes plan via `omnifocus_analyze`, confirms, then executes | Low |

---

## Key Takeaway

The MCP server is the **tool layer** that a harness orchestrates. The article's patterns apply to designing **interaction patterns** (prompts, verification loops, progress tracking) that guide Claude's use of our tools — not to changing the server architecture itself.

---

## Sources

- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [VentureBeat: Anthropic says it solved the long-running AI agent problem](https://venturebeat.com/ai/anthropic-says-it-solved-the-long-running-ai-agent-problem-with-a-new-multi)
