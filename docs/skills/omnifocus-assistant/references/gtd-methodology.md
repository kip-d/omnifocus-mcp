# GTD methodology guide

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. This file is
> canonical for its topic; edit it directly.

## GTD Methodology Guide

### The Five Stages

| Stage        | GTD Purpose                        | OmniFocus Action                |
| ------------ | ---------------------------------- | ------------------------------- |
| **Capture**  | Empty your head                    | Add to inbox, no organizing     |
| **Clarify**  | Actionable? < 2 min? Who?          | Process inbox workflow          |
| **Organize** | Project, context, dates            | Assign project, tags, defer/due |
| **Review**   | Keep system current                | Weekly review workflow          |
| **Engage**   | Context → time → energy → priority | Context tag filters             |

### Defer Date vs Due Date

| Defer Date                                 | Due Date                  |
| ------------------------------------------ | ------------------------- |
| When task becomes visible                  | Hard deadline             |
| "I want to work on this, but not until..." | "This MUST be done by..." |
| Hides task until relevant                  | Shows urgency             |
| Default: 8:00 AM                           | Default: 5:00 PM          |

### Recommended Context Tags

**Location**: `@computer`, `@phone`, `@office`, `@home`, `@errands`, `@anywhere`

**Energy**: `@high-energy`, `@low-energy`, `@deep-work`

**Time**: `@15min`, `@30min`, `@1hour`

**People**: `@waiting-for`, `@agenda-{person}`, `@delegated-to-{person}`

**Priority**: `@urgent`, `@important`, `@someday`

### Someday/Maybe Management

Tag with `@someday`, place in an on-hold project, defer far in the future. Review during weekly review — activate or
drop items that no longer resonate.

### Waiting-For Tracking

Tag `@waiting-for`, note who/what/when, defer 3–7 days for follow-up. Review during weekly review.

```
User: "I emailed John about the budget, waiting on his reply"
→ Create task: "Follow up with John re: budget"
  tags: ["@waiting-for"], deferDate: "{3 days from now}"
  note: "Emailed John on {today}, waiting for budget approval"
```

### Reference Material

Not everything captured is actionable. Non-actionable reference material belongs in **Obsidian**, not OmniFocus.

| Belongs in OmniFocus           | Belongs in Obsidian                           |
| ------------------------------ | --------------------------------------------- |
| Actions, projects, commitments | Meeting notes, research, articles             |
| Waiting-for items              | Project support material                      |
| Someday/maybe (actionable)     | Idea-stage someday/maybe (not yet actionable) |

Cross-link using `obsidian://open?file=Path%2FTo%2FNote` in OmniFocus task notes.

---
