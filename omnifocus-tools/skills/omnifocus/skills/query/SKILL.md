---
name: query
description: Search and filter tasks, projects, and tags
---

## CLI Mode

```bash
# Filter by project
omnifocus tasks --project "Work"

# Filter by tag
omnifocus tasks --tag "Calls"

# Multiple filters
omnifocus tasks --project "Work" --flagged --available

# Search by text
omnifocus tasks --search "meeting"

# Date ranges
omnifocus tasks --due-before 2026-03-15 --due-after 2026-03-01

# Count only (fast)
omnifocus tasks --project "Work" --count

# Custom fields
omnifocus tasks --fields "name,dueDate,flagged" --format json

# Sort
omnifocus tasks --sort "dueDate:asc"

# Pagination
omnifocus tasks --limit 10 --offset 20
```

## MCP Mode

```json
{ "command": "tasks", "project": "Work", "flagged": true, "available": true }
{ "command": "tasks", "search": "meeting", "limit": 10 }
{ "command": "tasks", "countOnly": true }
```

## Output Formats

- `--format text` (default) — Human-readable table
- `--format json` — Machine-parseable
- `--format csv` — Spreadsheet-friendly
- `--format markdown` — Documentation-friendly
