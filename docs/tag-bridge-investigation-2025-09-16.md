# Tag Bridge Investigation Notes (2025-09-16)

## Context
- Goal: confirm OmniFocus tag assignment reliability after `manage_task` create/update operations.
- Prior fix relied on `Application('OmniFocus').evaluateJavascript` bridge to reapply tags; current create/update scripts were slimmed to avoid JXA size limits and no longer invoke the bridge.
- Immediate `tasks` queries continue to miss freshly assigned tags, raising the question of whether OmniFocus defers propagation or whether we are reading from a stale object graph.

## Experiments Run
1. **Bridge helper injection (abandoned):** temporarily embedded bridge helpers in `create-task.ts`, `update-task.ts`, and `list-tasks.ts`. Tags still failed to appear in `tasks` results and script size ballooned, so these changes were reverted.
2. **Standalone bridge probe:** built `scripts/manual/probe-tag-bridge.js` to run a pure `osascript` JXA snippet that creates a task, applies tags via `Task.byIdentifier(...).addTag`, reads tags via the bridge, reads again via the JXA `task.tags()` accessor, and cleans up. Result: both bridge and JXA reads returned the tag and the script succeeded, demonstrating that the bridge works in isolation.
3. **Targeted MCP test:** added `scripts/manual/test-manage-task-with-bridge.js` that:
   - Creates a task via `manage_task`.
   - Runs a `tasks` query filtered by the update tag (returns 0 rows).
   - Invokes `scripts/manual/apply-tag-bridge.js`, a small JXA bridge helper that re-applies the tag and attempts a local refetch.
   - Issues another `tasks` query.
   The summary written to `/tmp/manage-task-bridge-summary.json` shows:
   - Initial query: 0 results (pre-bridge)
   - Bridge execution: bridge add/read succeeded, but the local JXA refetch inside the helper threw `ReferenceError: Can't find variable: Task` (the script was running outside full OmniJS context), so `localRead` came back empty even though `bridgeAdd.tags` listed the tag.
   - Post-bridge query: the tag **still** did not appear in the MCP `tasks` result (data array empty or task present without tags).
4. **Timeout handling:** observed that `tasks` queries filtered by the synthetic tag take ~20s, scanning ~1,800 tasks. Server waits for completion and exits gracefully—no lifecycle issues.

## Takeaways (so far)
- The evaluateJavascript bridge is functional when executed directly (via standalone probe).
- Reapplying tags through the bridge *outside* the main scripts does not immediately change what the MCP `tasks` tool sees.
- The failure occurs even when the bridge reports success and an immediate `Task.byIdentifier(...).tags()` (from the bridge context) returns the tag. The MCP `tasks` tool still observes an empty tag list afterward.
- The helper we executed with `osascript` uses OmniJS globals (`Task`, `Tag`). When we call the helper from Node the bridge script runs inside OmniFocus and those globals exist, but any follow-up read routed through main `list-tasks.ts` still relies on the local JXA handle pulled earlier in the script.
- Hypothesis: `list-tasks` iterates `doc.flattenedTasks()` and reads tags synchronously before OmniFocus finishes applying the bridge change, or it needs to resolve a fresh task handle right before emitting results. Another possibility is that `safeGetTags(task)` reads from the stale `task` instance retrieved before the bridge runs. The bridge script itself is likely succeeding, but our MCP `tasks` script is not re-fetching the task after the write.

## Next Steps
1. Revisit `list-tasks.ts` to ensure it can optionally rehydrate tasks (or use the bridge for `safeGetTagsWithBridge`) when details are requested.
2. Consider emitting the bridge call directly within manage_task (post creation/update) to rehydrate the same task and update the local object before returning.
3. Validate whether issuing a dedicated `tasks` bridge read (e.g., via helper that fetches the task via `Task.byIdentifier` and serializes it) resolves the visibility issue.
4. Continue exploring bridge usage while monitoring script length—standalone helpers can be wrapped into a reusable module to stay below the JXA truncation threshold.
