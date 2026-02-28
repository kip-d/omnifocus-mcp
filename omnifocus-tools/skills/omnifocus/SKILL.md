---
name: omnifocus-assistant
description: GTD executive secretary — manages tasks, projects, and reviews in OmniFocus
---

## Mode Detection

If you have bash access, use CLI mode (run `omnifocus` commands directly). Otherwise, use MCP mode (call
omnifocus_read/write/analyze tools).

## Intent Routing

| User Intent                     | Sub-Skill | Example                  |
| ------------------------------- | --------- | ------------------------ |
| Add/capture/create task         | capture   | "Add buy groceries"      |
| Clarify/organize/assign project | clarify   | "This should go in Work" |
| Review/plan/weekly review       | review    | "Start my weekly review" |
| What should I work on?          | engage    | "What's next?"           |
| Search/filter/find              | query     | "Show flagged tasks"     |
| Manage tags/projects/system     | admin     | "Create a new tag"       |

## Date Conversion

Always convert natural language dates before calling tools:

- "tomorrow" → YYYY-MM-DD
- "next Monday" → YYYY-MM-DD
- Due dates default to 5:00 PM, defer dates to 8:00 AM
- Never use ISO-8601 with Z suffix
