# Guided-review inbox push (OMN-314)

The push half of the guided-decision review layer (spec: vault
`Technical/specs/Guided-Decision Review Layer - design.md`). A launchd job runs the existing detectors and creates or
updates **one** OmniFocus inbox item — `Review: N decisions waiting` — so the review starts from the inbox the user
already processes (decision D1). The item's last note line points at the `guided_review` prompt /
`workflow-guided-review.md` skill reference (OMN-313).

## Layout

| Committed source                                             | Deployed to                                                    | Role                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------- |
| `scripts/ops/guided-review-push.ts`                          | — (run from the prod checkout)                                 | Counts, builds the item, creates/updates |
| `scripts/ops/of-mcp-guided-review`                           | `~/bin/of-mcp-guided-review`                                   | launchd wrapper: PATH, pgrep, bounded    |
| `scripts/ops/com.omnifocus-mcp.guided-review.plist.template` | `~/Library/LaunchAgents/com.omnifocus-mcp.guided-review.plist` | Mon–Sat 07:00; Saturday = deep mode      |
| `scripts/ops/install-guided-review-schedule.sh`              | —                                                              | Installs both, (re)loads the job         |

Edit the canonical files and re-run the installer — never hand-edit a deployed copy (repo-vs-`~/bin` drift is the
OMN-302 lesson).

## Behavior

| Rule                                                                                                                            | Why                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero decisions and no open item → nothing created                                                                               | A daily "nothing to do" item trains the eye to skip the prefix                                                                                                      |
| An open `Review: …` inbox item is updated, never duplicated                                                                     | One item per unprocessed stretch, not five                                                                                                                          |
| The job never completes the item                                                                                                | Completing it is the user's act; the inbox count is the honest signal                                                                                               |
| OmniFocus not running → `STATUS: SKIPPED`, exit 0                                                                               | Fail-safe for the reboot window, not an operating mode                                                                                                              |
| Stale build (`system version` → `stale:true`) → `FAILED`                                                                        | Same probe `verify-deploy.ts` uses                                                                                                                                  |
| `deadline_health` count shows `N+`                                                                                              | The detector caps samples at 5; the count is a floor when it saw more                                                                                               |
| `waiting_for` / `dormant_projects` counts show `N+`, and in deep mode use the detector's true total, not the returned-row count | Both are capped detectors too (`missing_next_actions` is not — it ships every stalled project unsliced); showing only what fit in the response undercounts silently |
| Malformed detector/review response (missing `data.projects` / `data`) → `FAILED`, non-zero exit                                 | A missing field must never silently read as "0 decisions" — it means the response shape changed, not that nothing is waiting                                        |
| AppleEvent preflight fails → `STATUS: WEDGED`, exit 0                                                                           | Environment, not code — pgrep only proves OmniFocus is running, not that it answers AppleEvents; the installer's `--verify` exits 3 for this case                   |

## Install / verify / uninstall

```bash
scripts/ops/install-guided-review-schedule.sh            # install or reload
scripts/ops/install-guided-review-schedule.sh --verify   # kickstart once, then check the log
scripts/ops/install-guided-review-schedule.sh --uninstall
tail -20 ~/.omnifocus-mcp/guided-review.log
```

### Exit codes of `--verify`

| Exit | Meaning                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | OK — the push ran and the wrapper logged `STATUS: OK`                                                                                                                      |
| `1`  | FAILED — the push ran and failed, or the wrapper's STATUS disagrees with launchd's exit code                                                                               |
| `3`  | WEDGED (inconclusive) — the push exceeded its timeout and was killed, OR the AppleEvent preflight timed out; either way the job itself is fine, the environment blocked it |
| `4`  | SKIPPED (nothing verified) — OmniFocus was not running when the job fired, so the push never attempted a run; re-run `--verify` once OmniFocus is up                       |

Manual run against any checkout (the dev server's sandbox guard only allows inbox tasks with the `__TEST__` prefix):

```bash
OF_MCP_REVIEW_ITEM_PREFIX="__TEST__ Review: " npx tsx scripts/ops/guided-review-push.ts <dev-checkout>/dist/index.js --mode quick
```

## Knobs

| Env                            | Default                              | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OF_MCP_REPO_DIR`              | `~/omnifocus-mcp`                    | Prod checkout the job runs against (baked into the plist)                                                                                                                                                                                                                                                                                                                                                                                                |
| `OF_MCP_GUIDED_REVIEW_LOG`     | `~/.omnifocus-mcp/guided-review.log` | Run log                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `OF_MCP_GUIDED_REVIEW_TIMEOUT` | `600`                                | Seconds before the push is killed (124 = wedged). Read **at install time** and baked into the plist's `EnvironmentVariables`, like the item prefix below — the installer validates it is a positive integer and derives its own `--verify` poll budget from the same resolved value, so the deployed timeout and the poll budget can never disagree. Set it before running the installer, not before a scheduled run.                                    |
| `OF_MCP_PREFLIGHT_TIMEOUT`     | `30`                                 | Seconds to wait for the AppleEvent preflight probe (same knob and default as `of-mcp-integration`) before logging `STATUS: WEDGED` and skipping the push                                                                                                                                                                                                                                                                                                 |
| `OF_MCP_REVIEW_ITEM_PREFIX`    | `Review: `                           | Inbox item name prefix (dev server: `__TEST__ Review: `). Read **at install time** and baked into the plist's `EnvironmentVariables`, not read fresh at run time — set it before running the installer, not before a scheduled run. The installer prints the resolved prefix and warns when it is not the default, so a mistaken prod install with the `__TEST__` prefix (or vice versa) is visible immediately rather than silently missing every scan. |
| `OF_MCP_FORCE_FALLBACK`        | unset                                | Set (to any value) to skip the `timeout`/`gtimeout` probe and force the wrapper's manual process-group-kill fallback, even on a machine with coreutils installed — lets that branch be exercised deliberately instead of only on a stock macOS with no Homebrew coreutils. Same mechanism as `of-mcp-integration`.                                                                                                                                       |
