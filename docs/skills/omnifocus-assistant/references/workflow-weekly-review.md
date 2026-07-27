# Workflow: Weekly Review

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. Content below
> is verbatim from the pre-split SKILL.md.

## Workflow: Weekly Review

Execute in sequence — each step: run the MCP call, act on results:

**1. Empty inbox** — Process before anything else
`omnifocus_read({ query: { type: "tasks", mode: "inbox", countOnly: true } })`

**2. Review completed** — Acknowledge progress
`omnifocus_read({ query: { type: "tasks", filters: { status: "completed", completionDate: { after: "{7 days ago}" } }, limit: 50 } })`

**3. Overdue** — Reschedule, delegate, or drop every item
`omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 50 } })`

**4. Active projects** — Each needs at least one next action
`omnifocus_read({ query: { type: "projects", filters: { status: "active" } } })`

**5. On-hold projects** — Reactivate, drop, or keep waiting?
`omnifocus_read({ query: { type: "projects", filters: { status: "on_hold" } } })` (filter input uses `on_hold`; the
returned project rows carry `status: "onHold"` — the canonical read vocabulary)

**6. Waiting-for** — Follow up on anything stale
`omnifocus_read({ query: { type: "tasks", filters: { tags: { any: ["@waiting-for"] } }, limit: 50 } })`

**7. Someday/maybe** — Activate or delete what no longer resonates
`omnifocus_read({ query: { type: "tasks", filters: { tags: { any: ["@someday"] } }, limit: 50 } })`

**8. Upcoming week** — Check overcommitment, spread bunched deadlines
`omnifocus_read({ query: { type: "tasks", mode: "upcoming", daysAhead: 7 } })`

**9. Ensure next actions** — Every active project needs one
`omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "list_for_review" } } })`

**10. Mark reviewed** — After walking a batch of stale projects from step 9's list, mark them all reviewed in one call
(OMN-256) instead of one round-trip per project:
`omnifocus_analyze({ analysis: { type: "manage_reviews", params: { operation: "mark_reviewed", projectIds: ["<id1>", "<id2>", "..."] } } })`
(single-project form still works: `{ operation: "mark_reviewed", projectId: "<id>" }`). The batch response reports a
per-project outcome — an unresolvable id in the batch shows up as its own error row, not a silent drop; check
`data.batch.results.failed` (the batch envelope nests under `data.batch`) before assuming the whole batch succeeded. The
single-id form keeps its original envelope under `data.project`.

**11. Get creative** — New projects? Stuck items? Someday/maybe to activate? Ask the user.

**12. Productivity check**
`omnifocus_analyze({ analysis: { type: "productivity_stats", params: { groupBy: "week" } } })`

---
