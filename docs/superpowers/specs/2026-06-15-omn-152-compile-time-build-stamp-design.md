# OMN-152 — Compile-time build stamping + staleness detection

**Status:** Approved design (2026-06-15) **Ticket:** OMN-152 — version endpoint buildId is request-time `git rev-parse`;
stamp real build metadata at compile time so it reflects the LOADED code.

## Problem

`src/utils/version.ts` computes `build.hash`/`buildId` by running `git rev-parse --short HEAD` (and friends) via
`execSync` **at request time**, from the project root on disk. So the version endpoint reports _the checkout on disk_,
not _the code the running process actually loaded_.

**Incident (2026-06-11, during the OMN-131 prod deploy):** the prod tree was pulled and rebuilt, but the MCP server
process (spawned ~48 min earlier) kept serving the previous build. The version probe reported the new `buildId` while
live behavior was demonstrably the old code — the canonical "is prod current?" probe passed on a stale process.
Compounding factors: `/mcp` reconnect re-attached without respawning the stdio child, and orphaned `node dist/index.js`
processes accumulated.

### Root insight

The fix is **not** merely "move git to build time." If we write `dist/build-info.json` and read it _per request_, a
stale process would read the _freshly rebuilt_ JSON and report the new buildId — reproducing the exact bug. The stamped
value must be **captured at process-load time** (a top-level module read, frozen for the process lifetime) so an old
process keeps reporting its own old build even after `dist/` is rebuilt under it. A separate **request-time** checkout
hash is then compared against the frozen loaded hash to _detect_ staleness.

## Goals

1. `build.*` / `buildId` provably describe the **loaded artifact**, frozen at process start.
2. The version payload **self-detects** a stale process (`loaded ≠ checkout`) and says "restart the server."
3. Stale-process diagnosis is one probe, not `ps` archaeology (process start time + uptime).
4. The version endpoint never throws — all git/fs access degrades gracefully.

## Non-goals

- Respawning the stdio child on `/mcp` reconnect (separate concern).
- Reaping orphaned processes (covered by the `of-mcp-redeploy` PPID-1 sweep already).
- Changing the four callers' use of `build.*` (new fields are additive).

## Design

### Component 1 — `scripts/stamp-build-info.js` (new)

Plain ESM Node script (matches existing `scripts/check-script-sizes.js` convention; no `tsx`/compile dependency so it
can run as a build step). Captures, reusing the exact git commands currently in `version.ts`:

| Field            | Source                             |
| ---------------- | ---------------------------------- |
| `hash`           | `git rev-parse --short HEAD`       |
| `branch`         | `git rev-parse --abbrev-ref HEAD`  |
| `commitDate`     | `git show -s --format=%ci HEAD`    |
| `commitMessage`  | `git show -s --format=%s HEAD`     |
| `dirty`          | `git status --porcelain` non-empty |
| `buildTimestamp` | ISO timestamp at build time        |

Writes `dist/build-info.json`. On any git failure, writes a record with `hash: "unknown"` (and other fields
`"unknown"`/`false`) — **never** fails the build (exit 0).

### Component 2 — `package.json`

Add `"postbuild": "node scripts/stamp-build-info.js"`. npm runs `postbuild` automatically after `build` (`tsc`), so
`dist/` exists when the script writes into it. `build` itself is unchanged. `dist/build-info.json` is already gitignored
(lives under `dist/`).

### Component 3 — `src/utils/version.ts` (modified)

**Module-load capture (top-level, runs once at process start):**

- `readLoadedBuild()` — resolve `dist/build-info.json` relative to `import.meta.url` (`dist/utils/version.js` →
  `../build-info.json`), parse into a frozen `LOADED_BUILD` const.
  - File missing or unparseable (dev/source run via `tsx`, or pre-stamp) → sentinel `{ hash: "dev-unstamped", … }`.
- `PROCESS_STARTED_AT` — computed once: `new Date(Date.now() - process.uptime() * 1000).toISOString()`.

**`getVersionInfo()` (per request):**

- `build.*` sourced from `LOADED_BUILD` (frozen — reflects the loaded artifact).
- **Dev fallback:** when `LOADED_BUILD.hash === "dev-unstamped"`, populate `build.*` from request-time git (keeps dev
  output useful) and force `buildId: "dev-unstamped"`, `stale: false`.
- `checkout.hash` — `readCheckoutHash()`: request-time `git rev-parse --short HEAD` from project root; failure →
  `"unknown"`.
- `stale` — `true` iff `LOADED_BUILD` is stamped (not dev) AND `checkout.hash !== "unknown"` AND
  `LOADED_BUILD.hash !== checkout.hash`.
- `warning` — when `stale`: `"stale process: loaded build <X> but checkout is <Y> — restart the server"`.
- `process` — `{ startedAt: PROCESS_STARTED_AT, uptimeSeconds: process.uptime() }` (uptime live per call).

`readLoadedBuild()` and `readCheckoutHash()` are small internal seams so unit tests can stub `fs`/`child_process`.

### Component 4 — `VersionInfo` interface

Additive fields (existing `build.*`, `runtime.*`, `git.*` unchanged):

```ts
checkout: { hash: string };
stale: boolean;
warning?: string;
process: { startedAt: string; uptimeSeconds: number };
```

The four callers (`SystemTool`, `http-server`, `index`, `session-manager`) read `build.*` and keep working unchanged.

## Error handling

Every git and fs access is wrapped to degrade to `"unknown"`/fallback. The version endpoint must never throw — it is the
diagnostic of last resort and must work even on a broken checkout.

## Testing

**Unit (vitest, mocking `fs` + `child_process`):**

1. Stamped `build-info.json` present → `build.hash`/`buildId` reflect the stamped SHA.
2. `checkout.hash` differs from loaded → `stale: true` and `warning` present and correctly formatted.
3. `checkout.hash` equals loaded → `stale: false`, no `warning`.
4. No `build-info.json` (dev) → `buildId: "dev-unstamped"`, `stale: false`, `build.*` from request-time git fallback.
5. git failure on checkout read → `checkout.hash: "unknown"`, `stale: false` (cannot assert staleness without a known
   checkout).

**Live acceptance (`/verify`):** rebuild `dist/` **without** restarting the process → version probe reports the **OLD**
buildId AND a stale-process warning. This reproduces the 2026-06-11 incident and proves the probe now catches it
unaided.

## Acceptance criteria (from ticket)

- [ ] Version probe on a deliberately stale process (rebuild dist, don't restart) reports the OLD buildId / explicit
      staleness warning.
- [ ] `reference_version_endpoint_deploy_check` memory/runbook updated to drop the behavioral-probe requirement once
      shipped.

## Rollout note

After merge + prod redeploy (Kip's manual step), the _first_ version probe post-deploy is itself the verification: if
`stale: true`, the redeploy didn't respawn the child. This is exactly the signal that was missing on 2026-06-11.
