# OmniFocus MCP - Critical Tips

**Dates:** Convert natural language to `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`. "Tomorrow" → calculate actual date. Schema
rejects "tomorrow", "next week", etc.

**Inbox:** Set `project: null` to move task to inbox. Omitting project field keeps task in current location.

**Counting:** Use `countOnly: true` for "how many" questions - 33x faster than fetching all tasks then counting.

**Tags:**

- `tags: [...]` replaces ALL tags
- `addTags: [...]` adds to existing
- `removeTags: [...]` removes specific tags

**Batch preview:** Use `dryRun: true` to preview batch/bulk_delete operations before executing.

**IDs:** Task/project IDs are short alphanumeric strings like `kz7wD9uVzJB`. Use `filters: {id: "..."}` for exact
lookup.

**Modes:** `mode: "today"` returns due soon OR flagged. `mode: "smart_suggest"` ranks by urgency score.
