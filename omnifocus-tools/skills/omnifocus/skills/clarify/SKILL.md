---
name: clarify
description: Organize tasks — assign projects, tags, dates, and context
---

## GTD Principle

Process inbox to zero. For each item: Is it actionable? What's the next action? What project does it belong to?

## CLI Mode

```bash
# Assign to project
omnifocus update <id> --name "Call dentist about cleaning" --tag "Calls"

# Set dates
omnifocus update <id> --due 2026-03-15 --defer 2026-03-10

# Flag for today
omnifocus update <id> --flag
```

## MCP Mode

```json
{ "operation": "update", "id": "<id>", "dueDate": "2026-03-15", "tags": ["Calls"] }
```

## Decision Tree

1. Is it actionable? No → delete or convert to reference
2. Takes < 2 minutes? → Do it now
3. Am I the right person? No → delegate (note who)
4. Multiple steps? → Create project
5. Single action → assign context tag and defer/due dates
