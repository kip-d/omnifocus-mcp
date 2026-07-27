# Workflow: Daily Planning

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

## Workflow: Daily Planning

When user asks "what should I focus on today" or "help me plan my day":

```
1. Show today's work:
   omnifocus_read({ query: { type: "tasks", mode: "today", limit: 20 } })

2. Check for overdue (needs attention):
   omnifocus_read({ query: { type: "tasks", mode: "overdue", limit: 10 } })

3. Smart suggestions:
   omnifocus_read({ query: { type: "tasks", mode: "smart_suggest", limit: 5 } })
```

Summarize: "You have X tasks due today, Y overdue. Some candidates worth considering..." — then give YOUR ordering with
the reason for each. Do **not** call the `smart_suggest` output "top priorities" and do not present its returned order
as a ranking; it is a mechanical screen (see the Result-reading hazards in `SKILL.md`).

---
