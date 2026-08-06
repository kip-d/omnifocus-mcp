# Scheduled integration runs (OMN-302)

`npm run test:integration` is the project's only layer-6 (live-bridge) check. **CI cannot run it** — OmniFocus is
macOS-only, so the GitHub job is `if: false` on `ubuntu-latest` by design. Until OMN-302 nothing else triggered it
either, so contract changes rotted in the suite silently.

That is not hypothetical. A hand-run on 2026-08-06 — the first in roughly two weeks — returned **7 failures**, from
three unrelated merges, none of which had swept the suite:

| Source            | Merged     | Undetected for | Outcome |
| ----------------- | ---------- | -------------- | ------- |
| OMN-286 (#246)    | 2026-07-24 | 13 days        | 6 stale guard expectations (OMN-300) |
| OMN-278 (#240)    | 2026-07-24 | 13 days        | 1 stale vocabulary expectation (OMN-301) |
| OMN-292 (#251)    | 2026-08-05 | caught at review | stale `healthScore` assertion |

The weekly job closes that window to a week. It does not replace running the suite when you change a public contract —
CLAUDE.md still requires that, and that requirement is exactly what failed three times.

## Layout

Committed under `scripts/ops/` and deployed by a script; the runtime locations are install targets, not sources of
truth. Edit the canonical files and re-run the installer — never hand-edit a deployed copy. Same shape as the
diagnose job (see `mcp-failure-diagnosis.md` § Scheduling).

| Committed source                                           | Deployed to                                                  | Role |
| ---------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| `scripts/ops/of-mcp-integration`                            | `~/bin/of-mcp-integration`                                    | launchd wrapper: preflight → build → suite → leak check. |
| `scripts/ops/com.omnifocus-mcp.integration.plist.template`  | `~/Library/LaunchAgents/com.omnifocus-mcp.integration.plist`  | Job definition (paths substituted). |
| `scripts/ops/install-integration-schedule.sh`               | —                                                             | Installs both, (re)loads the job. |

```bash
scripts/ops/install-integration-schedule.sh             # install / reload
scripts/ops/install-integration-schedule.sh --verify    # also run it now (~15 min)
scripts/ops/install-integration-schedule.sh --uninstall # bootout + remove plist
```

Runs **Saturday 08:00**, offset from the diagnose job (Sunday 09:00) so the two never contend for OmniFocus.

## What the wrapper does, and why

**It writes to the real OmniFocus database.** The suite creates, mutates, and deletes fixtures in the
`__MCP_TEST_SANDBOX__` folder and `__TEST__`-prefixed inbox tasks. That is inherent to a live-bridge check.

Three design choices exist because the obvious implementation would have been quietly wrong:

**A wedge is reported as WEDGED, not FAILED.** Two environment blockers make the suite unrunnable through no fault of
the code: OmniFocus not running, and the AppleEvent/TCC wedge (app up, stops answering events). Either produces a wall
of red indistinguishable from a regression. The wrapper round-trips one real AppleEvent first, capped by a watchdog
because a wedged OmniFocus can block forever; failure exits **0** with a WEDGED banner saying the suite never ran. A job
that cries wolf trains its owner to ignore it.

**The suite's exit code is read directly, never through a pipe.** `npm ... | tail` yields *tail's* status. On 2026-08-06
that exact mistake made a 7-failure run report exit 0 — the wrapper would have reported green forever.

**Leaks are detected, not auto-deleted.** The suite's cleanup is folder-scoped and has left `__TEST__` inbox tasks
behind. `npm run test:cleanup` is dry-run by default *because loose substring matching once deleted real user tasks*
(OMN-46). A scheduled unattended job is the worst possible place to override a safety default adopted after an
incident, so it reports an inventory and leaves the deletion to a human:

```bash
npm run test:cleanup -- --apply
```

## Reading the result

Durable log: `~/.omnifocus-mcp/integration.log` (launchd's own stdout/stderr: `integration-launchd.log`).

Every run ends with two lines:

```
STATUS: PASS (suite exit 0)          # or FAILED — suite exit N / WEDGED — …
LEAK: none detected                  # or LEAK: test fixtures remain …
```

`--verify` distinguishes the three outcomes: exit 0 (job ran, suite passed), exit 1 (job ran, suite failed), exit 3
(**inconclusive** — OmniFocus was unreachable, so the suite never ran; the job itself is fine). It also checks the run
log's mtime *before* trusting the exit code, because launchd's "last exit code" persists from the previous run — a
stale 0 would otherwise read as success for a job that never executed.
