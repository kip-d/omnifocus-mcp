# Workflow: Process Inbox

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

## Workflow: Process Inbox

When user says "process my inbox" or "help me with inbox":

```
1. Fetch: omnifocus_read({ query: { type: "tasks", mode: "inbox", limit: 10 } })
2. Clarify each: actionable? → < 2 min (do now) → delegate (@waiting-for) → one action or project?
3. Execute: omnifocus_write to move, update, or complete/create
4. Offer time estimates after batch (see `references/task-creation.md`)
5. Repeat until inbox empty
```

Alternative: `eisenhower_matrix_inbox` MCP prompt for Eisenhower matrix approach.

---
