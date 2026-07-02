# KMM Test Ground — Design

**Date:** 2026-07-02 **Status:** Approved design, pre-implementation **Prior art:** `docs/SELF_HOSTED_CI_MAC.md`
(self-hosted CI runner sketch — becomes Phase 2 of this design)

## Goal

Stand up **KMM**, a Tailscale-reachable Mac mini running a frozen copy of Kip's OmniFocus database, as a rich,
disposable test ground for omnifocus-mcp. Primary role: a **remote MCP endpoint** that Mac Studio sessions connect to as
a third server. Secondary role (Phase 2, deferred): a GitHub Actions self-hosted runner for the integration suite.

This provides the capability neither existing server offers: exercising **real destructive mutations** (delete, drop,
batch operations, repetition rules) against a realistic database where every write is harmless by construction.

## Decisions (with alternatives considered)

| Decision              | Chosen                                                          | Alternatives rejected                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary role          | Remote MCP endpoint over Tailscale                              | Agent workstation (sessions run on KMM) — Kip prefers driving from Mac Studio sessions; CI-runner-first — lower value than interactive endpoint                                                    |
| Transport             | Existing `--http` mode (`src/http-server.ts`, `SessionManager`) | SSH-piped stdio — unnecessary; HTTP transport already ships in the product (added for eventual Windows→macOS access) and gets its first operational workout here                                   |
| DB restore trigger    | On-demand SSH script                                            | MCP `system` operation — server orchestrating the quit of the app it talks to is awkward and ships test-ground code in the product; scheduled nightly — can't produce a mid-day clean slate        |
| Guard posture         | Fully open — no sandbox guard, no `NODE_ENV=test`               | Guarded like omnifocus-dev — re-imposes exactly the write restrictions that make dev insufficient. Safety is environmental: disposable DB, no sync, tailnet-only reachability, one-command restore |
| Reset script location | Repo, `scripts/kmm/`                                            | Personal `~/bin` glue — rejected because Phase 2 CI invokes the same script, so it ships with the repo                                                                                             |

## Architecture

```
Mac Studio session ──HTTP over Tailscale──▶ KMM: node dist/index.js --http (LaunchAgent)
                                              │ osascript / Apple Events (console session)
                                              ▼
                                            OmniFocus 4 ── frozen golden DB (no Omni Sync)
                                              ▲
ssh kmm of-db-reset ──────────────────────────┘ (quit → restore golden → relaunch → verify)
```

Three-server registry once shipped:

| Server          | Posture              | Use                                                       |
| --------------- | -------------------- | --------------------------------------------------------- |
| `omnifocus`     | prod                 | real GTD work                                             |
| `omnifocus-dev` | guarded, verify-only | safe verification against live data                       |
| `omnifocus-kmm` | open, disposable     | destructive probes, integration exploration, rich fixture |

## Components

### 1. Machine baseline

- Dedicated non-admin user, auto-login, no sleep (`pmset -a sleep 0 displaysleep 0 disksleep 0`), dummy HDMI plug if
  headless.
- Tailscale with Tailscale SSH enabled; Astropad Workbench or VNC as the TCC escape hatch (Kip's existing Mac Studio
  playbook).
- OmniFocus 4 with a **local-only account — Omni Sync never configured**, so no path exists to the production sync
  store.
- Node 20+ (Homebrew), repo cloned to `~/omnifocus-mcp`.
- One-time TCC grant: trigger `osascript -e 'tell application "OmniFocus" to get name of default document'` from an SSH
  shell; click the Automation dialog via VNC. Re-grant needed only when the node/osascript binary changes (rare on a
  single-purpose machine).

### 2. Golden database (with coverage enrichment)

**Seed:** an old copy of Kip's OmniFocus database.

**Enrichment before freezing:** the seed is realistic but not necessarily complete. Before declaring it golden, audit it
against the coverage matrix below (via `omnifocus_read` / `omnifocus_analyze` once loaded on KMM) and create labeled
fixture items for every gap, under a dedicated top-level `Fixtures` folder with a `FIXTURE:` name prefix so they never
read as real GTD data.

Coverage matrix (each row must have at least one instance):

| Dimension        | Required coverage                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project type     | parallel, sequential, single-action list                                                                                                                                                    |
| Project status   | active, on-hold, completed, dropped                                                                                                                                                         |
| Project features | review interval set, defer+due dates, complete-with-last-action, repeating project, empty project, project with 100+ tasks (perf), **duplicate project names** (OF allows them; known trap) |
| Folder structure | top-level folder, nested folder (2+ deep), dropped folder                                                                                                                                   |
| Task location    | inbox task, root-level project task, action group (nested 2+ levels), sequential group inside parallel project and vice versa                                                               |
| Task state       | available, blocked-by-sequence, deferred (future), due soon, overdue, flagged, completed, dropped                                                                                           |
| Task features    | repetition (fixed, defer-another, due-again), estimated duration, plain note, note with URL, planned date, no dates at all                                                                  |
| Tags             | untagged task, single tag, multiple tags, nested tags, tag with on-hold status, dropped tag, tag with zero tasks                                                                            |
| Names            | unicode/emoji name, name with quotes/backslashes (injection-adjacent), very long name                                                                                                       |
| Perspectives     | at least one custom perspective                                                                                                                                                             |

**Freeze:** snapshot the enriched database to `~/of-golden/` on KMM (zipped, read-only), with `PROVENANCE.md` recording
export date and exact entity counts (tasks, projects, tags, folders, per-status counts). Those counts become assertable
fixture facts — integration tests can pin exact numbers instead of fixture-bound hedges. The golden copy is never
modified in place; a new version is a deliberate, documented replacement (re-run the coverage audit, update
`PROVENANCE.md`).

### 3. `of-db-reset` script — `scripts/kmm/of-db-reset.sh` (the one new build)

1. Quit OmniFocus gracefully via osascript; fall back to `pkill` after a timeout.
2. Restore the golden `.ofocus` over the OmniFocus 4 container database path.
3. Relaunch OmniFocus.
4. Poll `osascript` until the default document answers (bounded retries).
5. Verify: read task/project counts and diff against `PROVENANCE.md` numbers; fail loudly on mismatch.

Invoked over SSH (`ssh kmm of-db-reset`) by Kip or by agent sessions before a test run. Works even when the MCP server
is wedged (it doesn't depend on the server).

### 4. MCP server service

- **LaunchAgent** in the logged-in user's GUI session (a LaunchDaemon cannot send Apple Events — console-session
  constraint).
- Command: `node dist/index.js --http --port 3111 --host <tailscale-ip>`. Binding to the Tailscale interface makes the
  tailnet the network boundary; `--auth-token` on top as defense-in-depth.
- Fully open: no sandbox guard, no `NODE_ENV=test`. Cache warming ON — a long-lived process pays the warm once, not per
  session.
- Deploy: `of-kmm-redeploy` (git pull, npm ci, build, `launchctl kickstart`), verified via the `system{version}`
  buildId + `stale===false` probe.

### 5. Client configuration (Mac Studio)

Local-scope `~/.claude.json` entry: `omnifocus-kmm`, `type: http`, `url: http://<kmm-tailscale-ip>:3111/mcp`, auth token
alongside (local scope keeps the secret out of tracked files). On shipping, update the `reference_omnifocus_dev_server`
memory to the three-way routing rule.

## Phase 2 (deferred): CI runner

The `SELF_HOSTED_CI_MAC.md` plan, updated for KMM: self-hosted runner labeled `self-hosted, macos, omnifocus`;
`workflow_dispatch`/nightly integration suite; and `of-db-reset` as the pre-suite step. That makes the integration suite
deterministic — dissolving the `__TEST__` inbox-leak accumulation and fixture-bound assertions — without rewriting
tests. Nothing in Phase 1 blocks or prejudges this.

## Risks and open items

- **HTTP transport is unproven operationally.** This is its first real workout. Shakedown explicitly: session lifecycle,
  reconnects, and confirmation that HTTP requests route through the same warm-gated tool dispatch the stdio path uses
  (the OMN-228 gate was designed against stdio).
- **Single automation channel:** concurrent sessions against KMM serialize on OmniFocus, as everywhere. Expectation, not
  a defect.
- **OF licensing:** confirm the Omni license covers the KMM install (personal licenses generally allow multiple Macs for
  one user).
- **Old-DB schema:** an old database copy should open cleanly in current OmniFocus 4 (in-place upgrade on first open);
  the enrichment pass happens after that upgrade, so the golden snapshot is already current-format.

## Acceptance criteria (Phase 1 done when)

1. From a Mac Studio session, `omnifocus-kmm` connects over Tailscale and answers `system{version}` with the expected
   buildId.
2. A destructive mutation (e.g., batch delete) succeeds against KMM — an operation omnifocus-dev's guard would refuse.
3. `ssh kmm of-db-reset` restores the golden DB and its count-verification passes; the deleted items from (2) are back.
4. Coverage-matrix audit passes: every row has at least one instance in the golden DB, recorded in `PROVENANCE.md`.
5. Production OmniFocus sync store shows no trace of KMM activity (no sync account configured on KMM).
