# Skipped Tests Tracker

This document tracks all skipped tests in the codebase with reasons and resolution plans.

## Active Skips

### 1. Performance Benchmarks Suite

- **File**: `tests/performance/performance-benchmarks.test.ts`
- **Type**: `describe.skip` (entire suite)
- **Skipped Since**: v3.0.0 release
- **Reason**: Tests need updating for v3.0.0 unified API
- **Required Changes**:
  - Change `'tasks'` tool calls to `'omnifocus_read'` with `query.type: 'tasks'`
  - Change `'projects'` tool calls to `'omnifocus_read'` with `query.type: 'projects'`
  - Change `cleanupTestData()` to `cleanup()`
  - Review performance thresholds (may need adjustment for unified API overhead)
- **Priority**: Low (performance tests are supplementary)
- **Owner**: Unassigned

---

## Resolution Guidelines

When resolving a skipped test:

1. Fix the underlying issue
2. Remove the `.skip`
3. Run the test to verify it passes
4. Remove the entry from this document
5. Commit with message: `test: unskip <test name> - <brief reason>`

## Metrics

- **Total Skipped Suites**: 1
- **Total Skipped Individual Tests**: 0
- **Last Audit**: 2025-12-25
