---
name: omnifocus-assistant
description: Use when user asks about tasks, projects, OmniFocus, GTD, productivity, or task management
---

# OmniFocus Assistant

> **Brain + Hands Architecture**: This skill provides the "brain" (methodology, intent interpretation, guidance). The
> OmniFocus MCP server provides the "hands" (tool execution). Use both together.

## Intent Recognition

### Step 1: Information or Action?

```
User wants information → omnifocus_read (read-only)
User wants to change something → omnifocus_write (creates/updates/deletes)
User wants insights → omnifocus_analyze
User wants GTD guidance → Provide advice (no tool call needed)
```

## Reference map

The detail lives in `references/`. Read a file when its trigger fires — never read them all up front. Read more than one
when a request spans them (a weekly review needs the workflow file _and_ the GTD file).

**When no row clearly matches, do not answer from general knowledge.** These files hold project-specific conventions
that used to be unconditionally in context, so a miss silently substitutes generic advice for Kip's actual conventions.
On an ambiguous or compound request, read `references/intent-to-tool-calls.md` first — it maps phrasing to tools and
usually disambiguates — then the closest-matching row above. Reading one file too many costs a few hundred tokens;
reading one too few silently changes the answer.

**What belongs in a `references/` file** (the extraction rule, adopted from `wrap-up` PR #7): content whose trigger
fires **no later than the earliest moment that needs it**. The test is direction, not how many places use the content —
a file may serve several triggers, so long as every one of them precedes a use. What a reference file may **never**
carry is anything needed _before_ it would be opened: a reader who loads it on the "creating a task" trigger never sees
it while deciding whether to create one at all. That content stays resident here — which is why Date Conversion and the
three result-reading hazards below are in this file rather than in the topic files they belong to. Group by _when it's
needed_, not by which topic it concerns.

| Trigger                                                                                                                                                                                                                                                                                                                                       | Read                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Turning any request into a tool call — the natural-language to `omnifocus_read` / `_write` / `_analyze` mapping                                                                                                                                                                                                                               | `references/intent-to-tool-calls.md`    |
| GTD guidance asked for, or a workflow needs GTD definitions (waiting-for, someday/maybe, defer-vs-due)                                                                                                                                                                                                                                        | `references/gtd-methodology.md`         |
| "Process my inbox" — read `references/task-creation.md` too before the Execute step (batch-create has a silent `project` limitation)                                                                                                                                                                                                          | `references/workflow-process-inbox.md`  |
| "Weekly review" — a full review spans four files: also read `references/gtd-methodology.md`, `references/workflow-process-inbox.md` (step 1 empties the inbox) and `references/interpreting-results.md` (step 12 reads productivity stats)                                                                                                    | `references/workflow-weekly-review.md`  |
| "What's on for today?" / daily planning                                                                                                                                                                                                                                                                                                       | `references/workflow-daily-planning.md` |
| "What should I work on now?" / choosing among available tasks                                                                                                                                                                                                                                                                                 | `references/workflow-engage.md`         |
| Creating or rewriting a task or project — naming, time estimates, tags, sequencing, **repetition / recurrence rules**, project **review intervals**                                                                                                                                                                                           | `references/task-creation.md`           |
| Non-trivial queries — date ranges, tag combinations, projections, counts, pagination; also **exports** (there is no server-side export tool)                                                                                                                                                                                                  | `references/advanced-queries.md`        |
| `omnifocus_analyze` in either direction — **read this BEFORE calling `parse_meeting_notes`** (you must structure the items yourself, not paste raw prose), and after any analyze call to read back productivity stats, pattern analysis, judgment detectors; also **stalled / stale projects** (30+ days unchanged) and what to do about them | `references/interpreting-results.md`    |

## Result-reading hazards (always apply)

These three produce a **silently wrong answer** — no error, nothing in the response flags them — so they stay here
rather than in a reference file. Each file below carries the fuller context.

- **`smart_suggest` is a screen, not a ranking (OMN-259).** The list ORDER is not a priority verdict. Re-rank the
  candidates yourself using `screen_reasons` plus context the server can't see (stated intent, calendar, energy), and
  explain your ordering in terms of those reasons. Never present the returned order as "top priorities". Detail:
  `references/workflow-engage.md`.
- **`completionRate` is a decimal**, not a percentage — `0.75` means 75%. Reporting it verbatim is an order-of-magnitude
  error. Detail: `references/interpreting-results.md`.
- **Batch-create may silently drop the `project` field** when assigning to an existing project by name. Use
  `parentTempId` for a project created in the same batch, or create individually. Nothing in the batch response reports
  this. Detail: `references/task-creation.md`.

## Date Conversion (Critical)

**You must convert natural language dates to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` before tool calls.**

The MCP tools reject natural language. Calculate dates based on today's date.

### Conversion Table

| User Says                | Convert To            | Notes                      |
| ------------------------ | --------------------- | -------------------------- |
| "today"                  | Current date          | Calculate from system date |
| "tomorrow"               | Today + 1             |                            |
| "yesterday"              | Today - 1             |                            |
| "Monday" / "next Monday" | Next occurrence       | Calculate from today       |
| "this Friday"            | Current week's Friday |                            |
| "next week"              | Today + 7 days        |                            |
| "in 3 days"              | Today + 3             |                            |
| "end of week"            | Current Friday        |                            |
| "end of month"           | Last day of month     |                            |
| "by Friday"              | Due date = Friday     | Use as `dueDate`           |
| "after Monday"           | Defer date = Monday   | Use as `deferDate`         |
| "starting Tuesday"       | Defer date = Tuesday  | Use as `deferDate`         |

### Time Defaults (When Only Date Given)

- **Due dates**: 5:00 PM (end of business)
- **Defer dates**: 8:00 AM (start of day)
- **Completion dates**: 12:00 PM (noon)

---

## Clarifying Questions

Ask when user request is ambiguous:

| Missing  | Ask                                                         |
| -------- | ----------------------------------------------------------- |
| Deadline | "When does this need to be done?" or default to no deadline |
| Context  | "Where will you do this? @computer, @phone, @errands?"      |
| Scope    | "Is this one task or multiple steps?"                       |
| Project  | "Which project does this belong to?" or add to inbox        |

**But don't over-ask.** For simple captures, just add to inbox:

- "Add task to call Bob" → Create in inbox, no questions needed

---

## Anti-Patterns to Avoid

**Don't:**

- Use natural language dates in tool calls (convert first!)
- Use ISO-8601 with Z suffix (`2025-03-15T17:00:00Z`) — use `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`
- Fetch all tasks then filter client-side (use server filters, sort, and logical operators)
- Create compound tasks (break them up)
- Complete or delete tasks without confirmation
- Over-engineer simple captures
- Guess project/folder names — verify with `omnifocus_read` first

**Do:**

- Infer intent from context
- Use `countOnly: true` for "how many" questions (33x faster)
- Batch related operations with `tempId`/`parentTempId`
- Use `tag_manage` for reorganizing tag hierarchy (merge, nest, reparent)
- Use nested tag path syntax (`"Parent : Child"`) to create hierarchies on the fly
- Ask before destructive actions (delete, bulk_delete)
- Default to inbox when project unclear
- Use `sort` and `offset` for paginated browsing

---

## Quick Reference: Patterns Not Covered Above

These patterns supplement the intent mapping table (`references/intent-to-tool-calls.md`) and the workflow files — read
those rather than assuming they are already in context.

```javascript
// Move task to inbox
{ mutation: { operation: "update", target: "task", id: "...", changes: { project: null } } }

// Clear a date or field
{ mutation: { operation: "update", target: "task", id: "...", changes: { clearDueDate: true } } }
// Also: clearDeferDate, clearPlannedDate, clearEstimatedMinutes, clearRepeatRule

// Complete with backdated date
{ mutation: { operation: "complete", target: "task", id: "...", completionDate: "{past date}" } }

// Bulk delete (confirm with user first!)
{ mutation: { operation: "bulk_delete", target: "task", ids: ["id1", "id2", "id3"] } }

// Reduce response size on mutations
{ mutation: { operation: "create", target: "task", data: { name: "Quick task" }, minimalResponse: true } }
// Also works on update and complete operations
```

---

## System Diagnostics

```javascript
// Test OmniFocus connection
system({ operation: 'diagnostics' });

// Server version info
system({ operation: 'version' });

// Cache statistics
system({ operation: 'cache', cacheAction: 'stats' });
```

---

## Remember

**You are the brain. The MCP server is the hands.**

- Interpret what the user really wants
- Convert dates before calling tools
- Apply GTD principles naturally
- Provide meaningful summaries of results
- Guide through workflows when appropriate

The goal: make task management feel like talking to a knowledgeable assistant, not operating software.
