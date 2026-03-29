---
name: review
description: Weekly review and project review workflows
---

## GTD Principle

Review weekly to maintain trust in the system. Check every project, clear inbox, update stale items.

## CLI Mode

```bash
# Weekly review workflow
omnifocus inbox                    # Process inbox to zero
omnifocus review                   # Projects due for review
omnifocus overdue                  # Address overdue items
omnifocus stats                    # Check productivity trends
```

## MCP Mode

```json
{ "command": "inbox" }
{ "command": "review" }
{ "command": "overdue" }
```

## Weekly Review Checklist

1. **Collect** — Is inbox empty? Capture any loose items
2. **Process** — Clarify each inbox item (use clarify skill)
3. **Review projects** — Each active project has a next action?
4. **Review waiting-for** — Follow up on delegated items
5. **Review someday/maybe** — Anything to activate?
6. **Check calendar** — Upcoming commitments captured?
7. **Flag today** — What are the 3-5 most important tasks?
