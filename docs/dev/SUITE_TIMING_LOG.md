# Suite Timing Log

**The live time-series is per-machine, not in git (OMN-182).** Every integration run auto-appends one JSON record to:

```
$XDG_STATE_HOME/of-mcp-suite-timing/runs.jsonl     # defaults to ~/.local/state/of-mcp-suite-timing/runs.jsonl
```

This mirrors the `of-mcp-redeploy` cold-start log convention (`project_mcp_cold_start_reconnect`: "drift is a diff, not
a memory") — the record answers "is **this machine** getting slower, and was a slow run the machine being bogged down
vs. genuinely more/slower tests?", which is machine-local data, not a shared-repo artifact. Storing it outside git also
means a row is written on every run without ever dirtying a worktree.

## How it records (automatic)

```bash
# Integration: the vitest reporter (tests/support/suite-timing-reporter.ts) is attached to every
# non-unit run via vitest.config.ts. Just run the suite — a row is appended automatically.
npm run test:integration            # → appends one integration record (wall, test count, machine load)

# Conformance: explicit (Ollama-gated). The probe emits a timing artifact; record it.
npm run baseline:conformance        # runs probe → appends a conformance record → drift warning
```

Unit-only runs do **not** record (fast feedback, not a baseline). Set `SUITE_TIMING_NOTE="…"` to tag a run, or
`SUITE_TIMING_LOG_PATH=…` to redirect the log (used by tests).

## Each record (one JSONL line)

`{ ts, build, suite, wallMs, totalTests, perTestMs, env: { loadAvg1, cpuCount, loadPerCpu, memUsedPct }, conformance?, notes? }`

`wallMs` is the canonical wall on **every** record (integration suite wall, or conformance total wall); conformance rows
carry the per-model breakdown in `conformance[]`. The three signals that disambiguate a slow run: **test count** (more
tests) vs. **perTestMs** (slower per test) vs. **env.loadPerCpu / memUsedPct** (machine was busy).

## How to check for drift

```bash
npm run baseline:check                       # newest run vs rolling median of prior 5 same-suite; ±25%
npm run baseline:check -- --threshold 20 --window 8
```

Exits non-zero when a metric (integration wall / per-test, or conformance total / per-model elapsed) deviates beyond the
threshold, and echoes the run's machine load so a flagged regression can be read as contention vs. a genuine slowdown.
Metrics with no prior same-suite history are skipped, not failed.

## Inspect the log

```bash
tail -5 ~/.local/state/of-mcp-suite-timing/runs.jsonl | jq .
```

---

## Historical seed rows (OMN-173, pre-JSONL — archived)

These four data points were recorded by hand into a tracked Markdown table before the per-machine JSONL store existed
(OMN-182). Kept for posterity; not machine-comparable to the JSONL series (cold vs. warm regimes, hand-entered).

| Date       | Build   | Integration wall | Tests | Conformance (model score elapsed/load)                 | Conf total | Notes                                                                                                        |
| ---------- | ------- | ---------------- | ----- | ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-06-13 | 3346b05 | 1291s            | 166   | —                                                      | —          | vitest Duration (npm wall 1315s); +144% vs 529s seed — suite grew via OMN-161 S2-S4 (+~50 tests), ~7.8s/test |
| 2026-06-13 | 3346b05 | —                | —     | llama3.1:8b 100% 16.0s/1.9s; qwen2.5:7b 89% 16.1s/2.1s | 45.2s      | post-merge serial (OMN-178 workaround); probe-started Ollama, warm-ish 8B loads                              |
| 2026-06-13 | 7403e72 | —                | —     | llama3.1:8b 100% 16.6s/2.5s; qwen2.5:7b 84% 17.0s/2.9s | 37.8s      | first instrumented run (OMN-173); warm 8B loads                                                              |
| 2026-06-13 | 7403e72 | 529s             | 159   | llama3.1:8b 100% n/a; qwen2.5:7b 84% n/a               | n/a        | pre-instrumentation seed (OMN-173 ticket): conformance ~55s incl. cold 8B loads                              |
