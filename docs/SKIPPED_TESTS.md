# Skipped Tests Tracker

This document tracks all skipped tests in the codebase with reasons and resolution plans.

## Active Skips

None.

Environment-gated skips are by design and are not tracked here. Examples: integration suites use
`RUN_INTEGRATION_TESTS ? describe : describe.skip`, and `test.skipIf(!isOmniFocusRunning())` skips when OmniFocus isn't
available.

The Performance Benchmarks suite (`describe.skip` since v3.0.0) was retired in OMN-369 (2026-09-29) instead of being
migrated. Performance signal now comes from `tests/integration/PERFORMANCE.md` with its suite-timing baseline,
`npm run benchmark`, and `tests/performance/workflow-analysis-benchmark.ts`.

---

## Resolution Guidelines

When resolving a skipped test:

1. Fix the underlying issue
2. Remove the `.skip`
3. Run the test to verify it passes
4. Remove the entry from this document
5. Commit with message: `test: unskip <test name> - <brief reason>`

## Metrics

- **Total Skipped Suites**: 0
- **Total Skipped Individual Tests**: 0
- **Last Audit**: 2026-09-29
