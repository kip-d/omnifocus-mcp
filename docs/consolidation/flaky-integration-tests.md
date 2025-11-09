# Flaky Integration Tests Issue

**Date Discovered:** 2025-11-06
**Status:** Known Issue - Not Blocking Consolidation Work

## Summary

Two integration tests fail with timeouts when run as part of full test suite, but pass reliably when run individually. This indicates a test isolation/resource contention issue rather than code bugs.

## Failing Tests (Full Suite)

1. **`tests/integration/mcp-protocol.test.ts`**
   - Error: `Request 1 timed out after 60000ms`
   - Secondary error: `TypeError: Cannot read properties of undefined (reading 'thoroughCleanup')`

2. **`tests/integration/tools/unified/end-to-end.test.ts`**
   - Error: `Hook timed out in 30000ms` during `beforeAll`

## Test Results

### When Run Individually (Both Pass ✅)

**mcp-protocol.test.ts:**
```
✅ 7/7 tests passed
Duration: 66.41s
- Server Initialization: ✅
- Tools Discovery: ✅
- Task Operations: ✅
- Project Operations: ✅
- Error Handling: ✅
```

**end-to-end.test.ts:**
```
✅ 17/17 tests passed
Duration: 182.08s
- omnifocus_read queries: ✅
- omnifocus_write operations: ✅
- omnifocus_analyze: ✅
- OmniFocus 4.7+ features: ✅
```

### When Run in Full Suite (Fail ⚠️)

```bash
npm test
# Result: 2 failed | 5 passed | 3 skipped
# Duration: 61.22s
```

## Root Cause Analysis

**Likely Issue:** Shared MCP server state/resource contention

The tests use a shared MCP server instance (`tests/integration/helpers/shared-server.ts`) that persists across test files. When tests run concurrently or in rapid succession:
- Server may not fully initialize before next test
- Resources (osascript processes, OmniFocus connections) may be exhausted
- Cleanup between tests may not complete before next test starts

**Evidence:**
1. Tests pass individually (fresh server state)
2. Tests timeout during initialization/setup phases
3. `thoroughCleanup()` undefined error suggests client not initialized
4. Timeouts occur at exactly 60s and 30s (test timeout limits)

## Configuration Context

From `vitest.config.ts`:
```typescript
testTimeout: isIntegrationTest ? 120000 : 30000,     // 2min integration, 30s unit
hookTimeout: isIntegrationTest ? 300000 : 60000,     // 5min integration, 1min unit
```

Note: `end-to-end.test.ts` hits 30s hook timeout (not 5min), suggesting it's not being detected as integration test in some scenarios.

## Impact

- **Not blocking:** Tests pass individually, code works correctly
- **Affects CI/CD:** Full test suite may fail intermittently
- **Workaround:** Run integration tests individually or with `--no-parallel`

## Recommended Fix (Post-Consolidation)

1. **Investigate shared server lifecycle:**
   - Add logging to track server state transitions
   - Verify initialization completes before tests run
   - Ensure cleanup fully completes between test files

2. **Consider test isolation improvements:**
   - Use separate server instances per test file
   - Add retry logic for initialization
   - Increase timeouts for setup/teardown phases

3. **Add test ordering:**
   - Run heavy tests (end-to-end) sequentially
   - Run lighter tests (protocol) in parallel

4. **Verify vitest configuration:**
   - Check why `end-to-end.test.ts` gets 30s timeout not 5min
   - Ensure `isIntegrationTest` detection works for all test files

## Related Files

- `tests/integration/helpers/shared-server.ts` - Shared server singleton
- `tests/integration/helpers/mcp-test-client.ts` - MCP client implementation
- `tests/support/setup-integration.ts` - Global teardown
- `vitest.config.ts` - Test configuration and timeouts

## Action Items

- [ ] Add to post-consolidation backlog
- [ ] Create issue in GitHub (if using issue tracker)
- [ ] Fix shared server initialization race condition
- [ ] Add better logging for test lifecycle debugging
- [ ] Run full test suite after consolidation to verify issue persists

## Notes

This issue was discovered during worktree setup for script-helper-consolidation work. Both test files validated individually and confirmed working correctly. The flakiness is a test infrastructure issue, not a code correctness issue.
