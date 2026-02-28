---
name: admin
description: System administration — diagnostics, cache, version info
---

## CLI Mode

```bash
# Version info
omnifocus version

# Connection diagnostics
omnifocus doctor

# Cache management
omnifocus cache
omnifocus cache --clear

# Complete a task
omnifocus complete <id>

# Delete a task (requires confirmation)
omnifocus delete <id> --confirm
```

## MCP Mode

```json
{ "operation": "version" }
{ "operation": "diagnostics" }
{ "operation": "cache", "cacheAction": "clear" }
```

## Troubleshooting

| Symptom       | Fix                                           |
| ------------- | --------------------------------------------- |
| Commands hang | Check `omnifocus doctor` — OmniFocus running? |
| Slow queries  | Large database — use filters and limits       |
| Stale data    | Run `omnifocus cache --clear`                 |
