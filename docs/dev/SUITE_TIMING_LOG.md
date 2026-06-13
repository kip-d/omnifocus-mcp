# Suite Timing Log

**Purpose (OMN-173):** a persisted, per-run time-series of how long the **integration** and **conformance** suites take,
so "is the suite getting slower as it grows?" and "did a model-load regression creep in?" are answerable from a **git
diff**, not from scraping old logs. Mirrors the cold-start reconnect baseline convention
(`project_mcp_cold_start_reconnect`: "drift is a diff, not a memory").

This is the **time-series**. For the curated, per-test breakdown snapshot see
[`INTEGRATION_TEST_TIMING_BASELINE.md`](INTEGRATION_TEST_TIMING_BASELINE.md).

## How to record a row

```bash
# Conformance: the probe writes a timing artifact when PROBE_TIMING_JSON is set.
PROBE_TIMING_JSON=/tmp/conf.json npm run conformance -- llama3.1:8b qwen2.5:7b
npm run baseline:record -- --conformance-json /tmp/conf.json --notes "post-merge"

# Integration: capture the reported wall (seconds) and test count.
npm run baseline:record -- --integration-wall 529 --integration-tests 159

# Both halves of one run, or --dry-run to preview the row without writing.
```

Date + build (`git rev-parse --short HEAD`) are auto-filled. Either suite may be omitted in a given run — the absent
column renders `—`.

## How to check for drift

```bash
npm run baseline:check          # newest row vs rolling median of prior 5; ±25% default
npm run baseline:check -- --threshold 20 --window 8
```

Exits non-zero when a measured metric (integration wall, conformance total, or per-model conformance elapsed) deviates
beyond the threshold. Metrics with no prior history are reported as skipped, not failed.

## Cell format (machine-parseable, no literal pipes)

- **Integration wall** — `529s` · **Tests** — `159`
- **Conformance** — `model score% elapsed/load`, one per model, `; `-separated:
  `llama3.1:8b 100% 31.2s/8.1s; qwen2.5:7b 84% 41.8s/7.0s`. `n/a` where unmeasured.
- **Conf total** — total probe wall incl. Ollama start + model loads.

## Runs (newest first)

| Date       | Build   | Integration wall | Tests | Conformance (model score elapsed/load)                 | Conf total | Notes                                                                                                                              |
| ---------- | ------- | ---------------- | ----- | ------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-13 | 7403e72 | —                | —     | llama3.1:8b 100% 16.6s/2.5s; qwen2.5:7b 84% 17.0s/2.9s | 37.8s      | first instrumented run (OMN-173); warm 8B loads                                                                                    |
| 2026-06-13 | 7403e72 | 529s             | 159   | llama3.1:8b 100% n/a; qwen2.5:7b 84% n/a               | n/a        | pre-instrumentation seed (OMN-173 ticket): conformance ~55s incl. cold 8B loads — timing n/a (not instrumented), scores comparable |
