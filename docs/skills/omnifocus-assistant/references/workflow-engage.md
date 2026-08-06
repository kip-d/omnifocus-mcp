# Workflow: Engage (choosing what to do)

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

Apply GTD's four criteria in order — each narrows the list:

**1. Context** — What's available where you are now? `filters: { tags: { any: ["@computer"] } }` (or @phone, @office,
etc.)

**2. Time** — Short window (quick wins) vs long (deep work): `filters: { estimatedMinutes: { lessThan: 15 } }` or
`filters: { tags: { any: ["@deep-work"] } }`

**3. Energy** — Match task type to current energy: `filters: { tags: { any: ["@high-energy"] } }` or `["@low-energy"]`

**4. Priority** — Of what remains, flagged first, then overdue:
`omnifocus_read({ query: { type: "tasks", mode: "flagged", limit: 10 } })`

Guide the user progressively through these until they have a short list.

**`smart_suggest` is a screen, not a ranking (OMN-259):** it returns a candidate shortlist selected by mechanical
signals, and each task carries `screen_reasons` (e.g. `overdue_5d`, `due_today`, `flagged`, `available`, `quick_win`)
naming why it was selected. The list ORDER is not a priority verdict — re-rank the candidates yourself using the four
criteria above plus context the server can't see (the user's stated intent, calendar, energy), and explain your ordering
to the user in terms of the reasons.

---
