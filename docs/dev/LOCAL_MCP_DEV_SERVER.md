# Running a Local Dev MCP Server (without endangering real data)

**Problem this solves:** your editor's MCP client (Claude Code / Claude Desktop) connects to _some_ OmniFocus MCP
server. If that's a **production** server running from a separate, pinned checkout, your code edits don't show up there
— and pointing the client at your working copy naively is a footgun, because the dev server talks to the **same
OmniFocus database** as the real one.

This doc describes the recommended setup: a **separate, guarded dev server** alongside prod, so you can test in-progress
write code without (a) destabilizing your daily-driver server or (b) ever mutating real data through half-finished code.

---

## Why production runs from a separate checkout (and why that's correct)

A common setup keeps the "real work" server running from a **separate, pinned-to-`main` checkout** (e.g.
`~/omnifocus-mcp`) rather than your dev working copy (e.g. `~/src/omnifocus-mcp`).

This is intentional. It **insulates your daily-driver server from dev churn**: a half-written branch, a build error, or
a mid-rebase working tree would otherwise break the MCP server you rely on for actual task management.

**Key fact that trips people up:** the separation is _not_ what forces you to rebuild/reconnect to see new code. **MCP
stdio servers don't hot-reload** — the client holds a pipe to the already-spawned process. You must **`/mcp reconnect`**
(or restart the app) to pick up new code _regardless_ of where the server runs. So merging dev into prod buys you zero
"live-ness"; it only costs you the insulation. Keep them separate.

## The recommended setup: a second, guarded dev server

Add a **locally-scoped** dev server that points at your working copy and is **incapable of touching real data**.

```bash
# Run from your dev working-copy directory so --scope local attaches to this project.
# NODE_ENV=test + SANDBOX_GUARD_ENABLED=true => the server's OWN code refuses any write
#   outside the test sandbox folder (see src/utils/sandbox-guard.ts, isTestMode()).
# tsx runs TypeScript directly => no `npm run build` step; edit + reconnect.
claude mcp add omnifocus-dev --scope local \
  --env NODE_ENV=test --env SANDBOX_GUARD_ENABLED=true \
  -- npx tsx /absolute/path/to/your/working-copy/src/index.ts
```

| Flag / env                                     | Why                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--scope local`                                | Present **only** in this project's directory — not globally. Working on an unrelated project won't surface a dev OmniFocus server. (It's stored privately in `~/.claude.json`; **not** `--scope project`, which would commit your absolute path into `.mcp.json` for every clone.) |
| `npx tsx …/src/index.ts`                       | Runs TypeScript directly; pick up edits with a reconnect, no build.                                                                                                                                                                                                                |
| `NODE_ENV=test` + `SANDBOX_GUARD_ENABLED=true` | Turns on the server-side sandbox guard. Both are required together — `assertSandboxGuardAtStartup` refuses to boot with `NODE_ENV=test` but no `SANDBOX_GUARD_ENABLED`, so you can't accidentally run dev unguarded-in-test-mode.                                                  |

**Workflow:** edit a `.ts` file → `/mcp reconnect` → the dev server (`mcp__omnifocus-dev__*` tools) is running your
edits. Do real work through the prod server (`mcp__omnifocus__*`).

## Why the guard lives in the server, not in a permission prompt

It's tempting to instead gate dev writes with a Claude Code permission rule (`ask`/`deny` on
`mcp__omnifocus-dev__omnifocus_write`). **Don't rely on that as your safety boundary.** A permission prompt is only as
strong as the weakest mode you run in — **auto / bypass-permissions mode auto-answers prompts**, so the gate becomes
theater exactly when you've stopped watching. A **server-side guard throws regardless of client mode**: auto-mode can
approve the call all it wants, the server still refuses. Put the guard where no setting can defeat it.

This also means a _misrouted_ real write (the model picks `omnifocus-dev` for a real task) **fails loudly** instead of
silently mutating your data — consistent with the project's no-silent-failures stance.

`NODE_ENV=test` here only disables cache-warming and failure-logging and enables the guard; it does **not** change the
emitted mutation scripts, so verifying create/update logic against the guarded dev server is faithful to prod behavior.

## The one limitation, and how to handle it

The guard confines dev writes to the test **sandbox folder**. Verifying behaviors that _require_ a non-sandbox target —
root placement (no folder), or creation into an arbitrary real folder — will **throw** under the guard.

For those rarer full-matrix checks, stand up a **deliberate, short-lived UNGUARDED** server and tear it down when done:

```bash
claude mcp add omnifocus-wt --scope local -- node /absolute/path/to/a/build/dist/index.js   # unguarded
# … /mcp reconnect, verify the non-sandbox cases, then:
claude mcp remove omnifocus-wt
```

Auto-mode is a genuine footgun **only** during that brief, intentional window — which is acceptable because you opened
it on purpose. Don't leave an unguarded dev server registered.

## Summary

|                       | Prod (`omnifocus`)              | Guarded dev (`omnifocus-dev`)    | Ad-hoc unguarded (rare)        |
| --------------------- | ------------------------------- | -------------------------------- | ------------------------------ |
| Source                | separate pinned `main` checkout | your working copy, via `tsx`     | a specific build               |
| Scope                 | however you use it daily        | `local` (this project only)      | `local`, temporary             |
| Can mutate real data? | yes (that's the point)          | **no** — sandbox-guarded         | yes — so keep the window short |
| Use for               | real task management            | verifying in-progress write code | non-sandbox verifies only      |

See also: [GIT_WORKTREES.md](GIT_WORKTREES.md) for isolating feature work, and `src/utils/sandbox-guard.ts` /
`isTestMode()` for the guard implementation.
