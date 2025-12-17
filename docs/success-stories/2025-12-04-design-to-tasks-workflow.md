# Success Story: From Design Session to OmniFocus Project in Seconds

**Date:** December 4, 2025 **Workflow:** Design brainstorming → Implementation planning → Task capture

---

## The Scenario

During a Claude Code session, we spent about 20 minutes brainstorming a new feature: adding Streamable HTTP transport to
the OmniFocus MCP server. This would enable remote access to OmniFocus from Windows machines via Tailscale.

The brainstorming covered:

- Architecture decisions (CLI flags, native http module, session management)
- Security considerations (optional bearer token auth)
- Phase 2 compatibility (streaming tool responses)
- Testing requirements

We refined the design through iterative Q&A, wrote it to `docs/plans/`, and committed it to git.

## The Ask

At the end of the session:

> "Go ahead and create a project in OmniFocus for this and add those 3 next steps as tasks in that project. Feel free to
> include any useful notes in either the project or the tasks themselves."

## What Happened

Claude Code used the OmniFocus MCP server's `omnifocus_write` tool with a single batch operation:

```json
{
  "operation": "batch",
  "target": "task",
  "operations": [
    { "operation": "create", "target": "project", "data": { "name": "...", "note": "...", "sequential": true } },
    { "operation": "create", "target": "task", "data": { "name": "...", "note": "...", "parentTempId": "..." } },
    { "operation": "create", "target": "task", "data": { ... } },
    { "operation": "create", "target": "task", "data": { ... } }
  ]
}
```

**Result:** 1.3 seconds later, OmniFocus had:

- A new sequential project with the design summary in notes
- 3 tasks with detailed implementation notes
- Cross-references to the design document
- Testing checklists embedded in task notes

## Why This Matters

**No context switching.** The entire workflow happened in one conversation:

1. Brainstorm the feature design
2. Write and commit the design document
3. Capture next actions in OmniFocus

**Rich context preserved.** The tasks weren't just titles - they included:

- Links to the design document
- Implementation order details
- Testing checklists
- Branch naming suggestions

**Natural language, structured output.** The request was conversational ("add those 3 next steps as tasks"), but the
result was properly structured GTD: a sequential project with actionable tasks.

## The Takeaway

This is what the OmniFocus MCP server is built for: seamless capture of commitments during the flow of work. No app
switching, no copy-pasting, no losing context. Just ask, and it's in OmniFocus.

---

_Total time from "create a project" to tasks in OmniFocus: ~2 seconds_
