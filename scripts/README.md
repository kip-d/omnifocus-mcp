# scripts/ — Index

Curated toolbox (OMN-271). Every entry is listed here with its purpose and invocation. One-off/superseded scripts live
in `.archive/` (local, gitignored) → pushed to the
[omnifocus-mcp-archive](https://github.com/kip-d/omnifocus-mcp-archive) repo. Before writing a new script, grep this
index — the OMN-269 verify-driver reinvention happened because nobody could.

Run everything from the repo root. Most scripts need `npm run build` first; anything touching OmniFocus needs it running
and unblocked.

## Verification & diagnostics

| Script                     | Purpose                                                                                                                                                                                                                                                                                                                                                                       | Invocation                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `verify-deploy.ts`         | Standalone MCP verify driver on the shared `StdioJsonRpcTransport` (OMN-181): spawn any server artifact by path, full init handshake, version probe (`--expect-build <sha>` gates buildId + `stale===false`), optional one tool call, `--timeout <ms>` per RPC, server stderr replayed on failure. Supersedes `test-single-tool-proper.js` and `verify-deploy.mjs` (OMN-275). | `npx tsx scripts/verify-deploy.ts <path>/dist/index.js [--expect-build <sha>] [--timeout <ms>] [tool [argsJSON]]` |
| `diagnose-failures.ts`     | Weekly failure-log diagnosis driver (clusters, classifies; residuals go to the mcp-failure-diagnoser agent)                                                                                                                                                                                                                                                                   | `npm run diagnose-failures` (also the launchd job via `ops/of-mcp-diagnose`)                                      |
| `analyze-tool-failures.ts` | Analyze tool-failure logs for patterns                                                                                                                                                                                                                                                                                                                                        | `npm run analyze-failures`                                                                                        |
| `mcp-failure-marker.sh`    | PostToolUse hook — appends failure timestamps for the diagnose pipeline                                                                                                                                                                                                                                                                                                       | wired in `.claude/settings.local.json` (see `docs/dev/mcp-failure-diagnosis.md`)                                  |

## Testing & conformance

| Script                      | Purpose                                                                                                                                     | Invocation                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `test-cleanup.ts`           | Inspect/clean OmniFocus test-sandbox data (dry-run by default)                                                                              | `npm run test:cleanup`         |
| `test-quick.sh`             | Quick dev smoke test                                                                                                                        | `npm run test:dev`             |
| `test-comprehensive.sh`     | Comprehensive suite incl. real-LLM testing. NOTE: several tool calls still use pre-unified tool names — known rot, see OMN-271 ticket trail | `npm run test:comprehensive`   |
| `llm-conformance-probe.ts`  | Local-model tool-calling conformance probe (support gate for Ollama models)                                                                 | `npm run conformance`          |
| `setup-real-llm-testing.ts` | Set up Ollama-based real-LLM testing                                                                                                        | `npm run setup-real-llm`       |
| `baseline-conformance.ts`   | Conformance probe with timing, records to suite-timing log                                                                                  | `npm run baseline:conformance` |
| `record-suite-timing.ts`    | Append a suite-timing record (JSONL)                                                                                                        | `npm run baseline:record`      |
| `check-suite-timing.ts`     | Check newest run against rolling baseline                                                                                                   | `npm run baseline:check`       |
| `ci-local.sh`               | Mirror GitHub Actions CI locally                                                                                                            | `npm run ci:local`             |

## Build & benchmarks

| Script                              | Purpose                                                                                                         | Invocation                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `stamp-build-info.js`               | Stamp git metadata into `dist/build-info.json` (the version-probe source)                                       | automatic (`postbuild`)                          |
| `benchmark-performance.ts`          | Validate performance claims vs CHANGELOG                                                                        | `npm run benchmark`                              |
| `diagnose-benchmark-environment.ts` | Gather OmniFocus DB/hardware state for cross-machine benchmark comparison                                       | `./scripts/run-diagnostics.sh`                   |
| `run-diagnostics.sh`                | Wrapper for the above; saves output per machine                                                                 | `./scripts/run-diagnostics.sh`                   |
| `measure-actual-script-sizes.js`    | Measure generated script sizes vs empirical limits (cited by `docs/dev/SCRIPT_SIZE_LIMITS.md`)                  | `node scripts/measure-actual-script-sizes.js`    |
| `measure-bridge-return-limit.ts`    | Measure OmniJS bridge RETURN-path size limit — run manually, supervised, against live OmniFocus (still pending) | `npx tsx scripts/measure-bridge-return-limit.ts` |

## kmm/ — KMM test-ground deploy + reset (OMN-279, spec `docs/superpowers/specs/2026-07-02-kmm-test-ground-design.md`)

Runs ON KMM (the physical test-ground Mac), not on the dev machine. **Unverified pending KMM's physical existence** —
see OMN-280 (manual machine setup) for the live acceptance pass; this repo-code slice was built blind against the
approved spec.

| Script                                            | Purpose                                                                                                                                     | Invocation                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kmm/of-db-reset.sh`                              | Quit OmniFocus → restore the frozen golden snapshot → relaunch → verify counts vs PROVENANCE.md                                             | `ssh kmm of-db-reset` (requires `OF_GOLDEN_DIR`, `OF_CONTAINER_PATH`)                                                                                              |
| `kmm/install-kmm-server.sh`                       | Install/reload the KMM MCP HTTP server LaunchAgent (RunAtLoad+KeepAlive); `--verify` checks auth enforcement + a real authenticated request | `scripts/kmm/install-kmm-server.sh [--verify\|--uninstall]` (requires `TAILSCALE_IP`, `MCP_AUTH_TOKEN`)                                                            |
| `kmm/com.omnifocus-mcp.kmm-server.plist.template` | LaunchAgent plist template, substituted by the installer above                                                                              | not invoked directly                                                                                                                                               |
| `kmm/of-kmm-redeploy`                             | git pull + npm ci + build + restart the LaunchAgent + verify (both the fresh-build sanity check and the live HTTP check)                    | `of-kmm-redeploy` (same required env vars as the installer; set `OF_MCP_KMM_PORT` too if the install used a non-default port — the redeploy regenerates the plist) |
| `kmm/lib.sh`                                      | Shared `log`/`die`/`require_env` helpers sourced by the three scripts above                                                                 | not invoked directly                                                                                                                                               |

## Prompts

| Script            | Purpose                            | Invocation             |
| ----------------- | ---------------------------------- | ---------------------- |
| `list-prompts.ts` | List/discover manual + MCP prompts | `npm run prompts:list` |

## lib/ — shared modules (not entry points)

| Module                       | Used by                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `lib/conformance-grading.ts` | conformance probe (grading core, unit-tested)                                                  |
| `lib/ollama-lifecycle.ts`    | conformance probe (Ollama start/stop decisions)                                                |
| `lib/run-directly.ts`        | run-directly-vs-imported check (diagnose-failures, list-prompts, setup-real-llm, test support) |
| `lib/suite-timing.ts`        | per-machine JSONL suite-timing store (baseline scripts, vitest reporter)                       |

## ops/ — deployed operational jobs

| File                                            | Purpose                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ops/install-diagnose-schedule.sh`              | Install/uninstall the weekly diagnose-failures launchd job                                   |
| `ops/of-mcp-diagnose`                           | The deployed wrapper the launchd job runs (`npm run diagnose-failures` in the prod checkout) |
| `ops/com.omnifocus-mcp.diagnose.plist.template` | launchd plist template the installer substitutes                                             |

## See also

- `tests/` — unit + integration suites (vitest; see `tests/integration/PERFORMANCE.md`)
- `docs/operational/TESTING_TOOLS.md` — testing-tool guide
- `.archive/scripts-curation-2026-07-16/` — what was archived in this curation and why (PR trail on OMN-271)
