# Advanced queries

> Reference for the `omnifocus-assistant` skill. Loaded on demand — see the reference map in `SKILL.md`. Content below
> is verbatim from the pre-split SKILL.md.

## Advanced Queries

### Sort and Pagination

```javascript
// Sort by due date ascending, then by name
{ query: { type: "tasks", sort: [
  { field: "dueDate", direction: "asc" },
  { field: "name", direction: "asc" }
], limit: 25, offset: 0 } }
```

**Sortable fields:** `dueDate`, `deferDate`, `plannedDate`, `name`, `flagged`, `estimatedMinutes`, `added`, `modified`,
`completionDate`

**Sort-before-limit:** When both `sort` and `limit` are specified, the server collects all matching tasks, sorts them,
then applies the limit. This guarantees correct top-N results (e.g., "10 most overdue" works as expected).

**Pagination metadata:** `metadata.total_count` always reports the full matching population (not just the returned
rows), and `metadata.truncated: true` appears whenever `offset + returned_count < total_count`. Use these to decide
whether to raise `limit` or page with `offset`; a separate `countOnly` query is no longer needed just to detect
truncation.

### Logical Operators

Combine filters with `AND`, `OR`, `NOT` — one level only (no nesting operators inside operators):

```javascript
// AND: merge multiple conditions
{ query: { type: "tasks", filters: {
  AND: [
    { available: true },
    { tags: { none: ["@waiting-for"] } }
  ]
} } }

// OR: returns tasks matching ANY branch (full OR support)
{ query: { type: "tasks", filters: {
  OR: [
    { flagged: true },
    { dueDate: { between: ["{Monday}", "{Friday}"] } }
  ]
} } }

// NOT: status negation only (other fields use tag/date operators directly)
{ query: { type: "tasks", filters: { NOT: { status: "completed" } } } }
```

**Limitations:** NOT only handles status negation (`completed` → show active, `active` → show completed). For tag
exclusion, use `tags: { none: [...] }` directly. Items inside AND/OR/NOT cannot contain nested logical operators. OR/NOT
are **tasks-only** — projects queries reject them with a steering error (use one query per alternative).

### Planned Date

Planned dates are distinct from due/defer — they represent when you **intend** to work on something:

```javascript
// What did I plan for today?
{ query: { type: "tasks", filters: { plannedDate: { between: ["{today}", "{today}"] } } } }
```

### Search Mode

```javascript
// Full search (names + notes)
{ query: { type: "tasks", mode: "search", filters: { text: { contains: "budget" } } } }

// Fast search (names only, better performance)
{ query: { type: "tasks", mode: "search", filters: { text: { contains: "budget" } }, fastSearch: true } }
```

### Exports

There is **no export tool** — exporting/backing up the database is a job for the OmniFocus app, not the MCP server.
Direct the user there:

| Goal                        | Do this in OmniFocus                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Full backup / snapshot      | Automatic backups run already; for an on-demand copy use **File ▸ Back Up Database** (`.ofocus-archive`). |
| Spreadsheet / filtered data | Build a perspective, select the rows, and copy-paste, or use the app's built-in export.                   |

Why no server-side export: a full export either dumps the whole database into the model's context (token-prohibitive on
a large library) or just repeats a query you can already run. If a user genuinely needs an ad-hoc file, run a _targeted_
query for exactly the rows they want and write that small result to a file — don't reach for a bulk dump.

### Project Queries

Project queries support their own `fields` parameter for field projection:

```javascript
// Get active projects with specific fields
{ query: { type: "projects", filters: { status: "active" },
  fields: ["id", "name", "status", "folder", "nextReviewDate"] } }
```

**Project fields:** `id`, `name`, `status`, `flagged`, `note`, `dueDate`, `deferDate`, `completedDate`, `folder`,
`folderPath`, `folderId`, `sequential`, `lastReviewDate`, `nextReviewDate`, `defaultSingletonActionHolder`

### Perspectives and Folders

```javascript
// List all perspectives
omnifocus_read({ query: { type: 'perspectives' } });

// List all folders
omnifocus_read({ query: { type: 'folders' } });
```

### Filter Reference

| Filter    | Type       | Purpose                                                                      |
| --------- | ---------- | ---------------------------------------------------------------------------- |
| `id`      | string     | Exact task ID lookup                                                         |
| `inInbox` | boolean    | Explicitly filter inbox tasks                                                |
| `name`    | TextFilter | Filter by task/project name (separate from `text` which also searches notes) |

---
