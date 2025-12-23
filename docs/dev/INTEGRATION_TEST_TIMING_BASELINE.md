# Integration Test Timing Baseline

**Generated:** 2024-12-22
**Purpose:** Guard against regression in integration test wall time duration

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Test Suites | 9 (7 passed, 2 skipped) |
| Total Tests | 96 |
| Passed | 69 |
| Failed | 5 (timeouts) |
| Skipped | 22 (LLM simulation tests) |
| **Total Duration** | ~586s (~10 minutes) |

## Test File Timings (Sorted by Duration)

| Test File | Duration | Tests | Status | Notes |
|-----------|----------|-------|--------|-------|
| analytics-validation.test.ts | ~570s | 4 | 1 fail | Slowest - creates/validates analytics data |
| update-operations.test.ts | ~202s | 12 | pass | Date and tag persistence validation |
| end-to-end.test.ts | ~195s | 19 | 3 fail | Unified API comprehensive tests |
| batch-operations.test.ts | ~101s | 8 | 1 fail | Batch create with tempId resolution |
| http-transport.test.ts | ~95s | 17 | pass | HTTP transport and sessions |
| filter-results.test.ts | ~40s | 7 | pass | Filter validation tests |
| mcp-protocol.test.ts | ~12s | 7 | pass | Protocol compliance |
| llm-assistant-simulation.test.ts | 0s | 14 | skip | Requires LLM, skipped by default |
| real-llm-integration.test.ts | 0s | 8 | skip | Requires LLM, skipped by default |

## Slowest Individual Tests (>30s)

| Test | Duration | File |
|------|----------|------|
| productivity_stats calculation | ~382s | analytics-validation.test.ts |
| create a new task (unified) | ~140s | end-to-end.test.ts |
| overdue analysis validation | ~109s | analytics-validation.test.ts |
| query tasks via omnifocus_read | ~78s | http-transport.test.ts |
| nested tasks (task with subtask) | ~60s | batch-operations.test.ts |
| cross-tool data consistency | ~59s | analytics-validation.test.ts |

## Test Duration by Category

### Fast Tests (<5s) - 45 tests
- Protocol compliance checks
- Error handling validation
- Session management
- Tool discovery

### Medium Tests (5-30s) - 35 tests
- Single task CRUD operations
- Filter validation
- Date/tag updates
- Basic analytics queries

### Slow Tests (30-120s) - 12 tests
- Batch operations with multiple items
- Complex analytics calculations
- HTTP transport with OmniFocus operations
- Read-back validation (create → query → verify)

### Very Slow Tests (>120s) - 4 tests
- Full productivity stats calculation
- Unified API task creation (includes validation)
- Analytics with multiple test data setup

## Known Timeout-Prone Tests

These tests may timeout under load or when OmniFocus is busy:

1. **"should create nested tasks (task with subtask)"** - 60s timeout
   - Creates project → task → subtask with validation
   - Each step requires OmniJS bridge execution

2. **"should calculate correct completion rates"** - 360s timeout
   - Creates test data, runs analytics, validates calculations
   - Cleanup adds significant time

3. **"should create a new task" (unified)** - 120s timeout
   - Full unified API routing + sandbox validation
   - May timeout if OmniFocus is processing

## Performance Regression Indicators

**🚨 Alert if:**
- Total suite time exceeds 15 minutes
- Any single test exceeds 5 minutes
- More than 3 tests timeout in a run
- Fast tests (<5s) start taking >10s

**✅ Healthy range:**
- Total suite: 8-12 minutes
- Slowest test: <4 minutes
- 0-1 timeout failures
- Fast tests remain <5s

## Optimization Notes

### What's Already Optimized
- Sandbox guard: O(1) lookup via `Task.byIdentifier()` / `Project.byIdentifier()`
- Shared MCP server across test suites
- Cache warming before tests start
- Quick cleanup for small test data sets

### Potential Future Optimizations
- Parallelize independent test files (requires careful sandbox isolation)
- Mock OmniFocus for unit-like integration tests
- Reduce analytics test data volume
- Skip redundant validation in batch operations

## Baseline Comparison Command

```bash
# Run tests with timing output
npm run test:integration -- --reporter=json --outputFile=docs/dev/integration-test-timing-current.json

# Compare durations (manual review)
# Look for tests that increased by >50% from baseline
```

## Historical Context

- **Pre-optimization (Dec 2024):** ~14 minutes, O(n) sandbox guard
- **Post-optimization (Dec 2024):** ~10 minutes, O(1) sandbox guard
- **Test consolidation:** 93 tests → 96 tests (added batch-operations)

---

*This baseline was generated from a full integration test run. Individual test times may vary based on system load, OmniFocus database size, and concurrent processes.*
