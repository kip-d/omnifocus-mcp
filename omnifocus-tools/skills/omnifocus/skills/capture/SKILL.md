---
name: capture
description: Quick task capture — inbox items with optional metadata
---

## GTD Principle

Capture everything. Don't organize during capture. Add to inbox by default.

## CLI Mode

```bash
# Basic capture
omnifocus add "Buy groceries"

# With metadata
omnifocus add "Review proposal" --due tomorrow --flag --tag "Work"

# With note
omnifocus add "Call dentist" --note "Ask about appointment next week"
```

## MCP Mode

```json
{ "operation": "add", "name": "Buy groceries" }
{ "operation": "add", "name": "Review proposal", "dueDate": "2026-03-01", "flagged": true, "tags": ["Work"] }
```

## Guidelines

- Default to inbox (no --project) unless user specifies
- Parse natural language dates: "tomorrow", "next Friday", "end of month"
- Flag if user says "important", "urgent", or "priority"
- Add time estimate if user mentions duration
