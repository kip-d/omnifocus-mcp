# OmniFocus Assistant Skill Research Findings

**Date:** 2026-01-21 **Purpose:** Document the research and design decisions for separating "brain" (skill) from "hands"
(MCP server)

---

## The Problem

Social media discussion: "Most MCP servers just load information into context and ought to be replaced by skills."

**Our Analysis:** This criticism applies to context-loading MCP servers (documentation, RAG), but NOT to execution-layer
servers like ours that:

- Execute code against external applications (JXA → OmniFocus)
- Modify external state bidirectionally
- Require stateful operations (caching, connection management)
- Need typed tool schemas for reliable LLM invocation

## The Solution: Brain + Hands Architecture

| Layer             | Responsibility                                     | Implementation                  |
| ----------------- | -------------------------------------------------- | ------------------------------- |
| **Skill (Brain)** | Intent interpretation, methodology, best practices | `skills/omnifocus-assistant.md` |
| **MCP (Hands)**   | Execution, state, external communication           | Existing server (unchanged)     |

---

## Content Sources Analyzed

### GTD Methodology

- `docs/reference/GTD-WORKFLOW-MANUAL.md` - Weekly review, inbox processing workflows
- `prompts/daily-gtd-workflow.md` - Morning review, daily planning
- `docs/success-stories/2025-12-04-design-to-tasks-workflow.md` - Real usage example

### User-Facing Documentation

- `docs/user/GETTING_STARTED.md` - Common requests, vocabulary, tips
- `CLAUDE.md` - Date conversion section (lines 597-628)

### Tool Patterns

- `src/tools/unified/schemas/*.ts` - Parameter structures
- Tool descriptions throughout codebase

---

## Key Findings by Category

### 1. GTD Methodology Guidance

**The Five Stages:**

1. CAPTURE - Everything to inbox, don't organize while capturing
2. CLARIFY - Is it actionable? What's the next action? <2 min rule
3. ORGANIZE - Project, context tags, defer/due dates
4. REVIEW - Weekly review is critical
5. ENGAGE - Work from contexts, not random lists

**Defer vs Due Dates:**

- Defer = when task becomes visible ("not until Tuesday")
- Due = hard deadline ("must be done by Friday")
- Defaults: defer 8am, due 5pm

**Context Tags:**

- Location: @computer, @phone, @office, @home, @errands
- Energy: @high-energy, @low-energy, @deep-work
- Time: @15min, @30min, @1hour
- People: @waiting-for, @agenda-{person}

### 2. Intent Recognition Patterns

| User Says                   | Maps To                                        |
| --------------------------- | ---------------------------------------------- |
| "What's in my inbox?"       | `omnifocus_read` filters: `{ project: null }`  |
| "What's on my plate today?" | `omnifocus_read` mode: `"today"`               |
| "What am I overdue on?"     | `omnifocus_read` mode: `"overdue"`             |
| "What should I work on?"    | `omnifocus_read` mode: `"smart_suggest"`       |
| "How many tasks...?"        | `omnifocus_read` with `countOnly: true`        |
| "Add task..."               | `omnifocus_write` operation: `"create"`        |
| "Am I behind?"              | `omnifocus_analyze` type: `"overdue_analysis"` |

### 3. Date Conversion (Critical)

MCP tools reject natural language. Skill must convert:

| Input          | Output                      |
| -------------- | --------------------------- |
| "tomorrow"     | Calculate from today's date |
| "next Friday"  | Next occurrence of Friday   |
| "by Friday"    | Due date = Friday           |
| "after Monday" | Defer date = Monday         |
| "in 3 days"    | Today + 3                   |

### 4. Task Creation Best Practices

**Naming:**

- Start with action verb: "Call client about proposal"
- Be specific: "Email John@acme.com to confirm budget"
- One action per task (compound tasks → project)

**Field Usage:**

- `project: null` = move to inbox
- Tags for context, not status
- 2-3 tags per task is ideal

### 5. Result Interpretation

**Productivity Stats Healthy Ranges:**

- Completion rate: 70-90%
- Inbox count: 0-10
- Overdue count: 0-5
- Available tasks: 10-30

**Pattern Analysis:**

- Stale projects (30+ days): Review intention
- Vague tasks: Need action verb
- Bunched deadlines: Spread to avoid overwhelm

---

## What Moves to Skill vs Stays in CLAUDE.md

### Moves to Skill (User-Facing)

- Intent → tool call mapping
- Date conversion responsibility
- GTD methodology guidance
- Result interpretation
- Clarifying question patterns
- Task creation best practices

### Stays in CLAUDE.md (Developer-Facing)

- Architecture documentation references
- JXA vs OmniJS technical patterns
- Tag operations (implementation details)
- Script size limits
- MCP lifecycle management
- Testing patterns
- Debugging workflows

---

## Files Created

1. **`skills/omnifocus-assistant.md`** (413 lines)
   - Intent recognition
   - Date conversion
   - GTD methodology
   - Workflow guides (inbox, weekly review, daily planning)
   - Task creation best practices
   - Result interpretation
   - Anti-patterns

2. **`docs/dev/SKILL-RESEARCH-FINDINGS.md`** (this file)
   - Research summary
   - Design decisions
   - Content categorization

---

## Packaging Considerations

**Challenge:** MCP server configured in Claude Desktop settings, skill needs separate installation in skills directory.

**Options:**

1. Publish separately (users install both)
2. Include in repo, users symlink/copy
3. Post-install script copies skill
4. Documentation-only (expand tool descriptions)

**Recommendation:** Option 2 with documentation: "After installing MCP server, copy `skills/omnifocus-assistant.md` to
your Claude Code skills directory."

---

## Future Considerations

1. **Skill evolution:** GTD methodology can evolve independently of tool implementation
2. **Testing skills:** Use `testing-skills-with-subagents` to validate skill works under pressure
3. **Tool description simplification:** Once skill handles "when to use", tool descriptions can focus on "how to use"
