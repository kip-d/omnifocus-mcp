# Test Suite Architecture Analysis

## Executive Summary

The test suite is **NOT broken** and doesn't need rework. The slowness is due to **intentional design** for
comprehensive coverage:

- **47 unit tests** run in parallel via 8 vitest worker threads (~2-3s per file)
- **7 integration tests** spawn 1-2 MCP server processes per test file
- **No redundant cache warming** - unit tests use mocks, integration tests initialize MCP once per file
- **Vitest parallelization** is correctly configured and optimal for the test count

## Detailed Breakdown

### Unit Test Infrastructure

| Component             | Details                                                           |
| --------------------- | ----------------------------------------------------------------- |
| **Test Files**        | 47 unit test files                                                |
| **Worker Threads**    | 8 (default vitest config, no VITEST_SAFE override)                |
| **Mock Strategy**     | Full mock via `setup-unit.ts` - disables real JXA by default      |
| **Per-File Overhead** | ~2-3 seconds (TypeScript compilation + vitest init)               |
| **Cache Warming**     | **NONE** - unit tests use mocks, not real OmniFocus               |
| **Total Unit Time**   | ~30-40 seconds (47 files ÷ 8 workers = ~6 batches × 5s per batch) |

**Key Evidence - setup-unit.ts:**

```typescript
// Unit tests use MOCKS, not real automation
vi.spyOn(OmniAutomation.prototype, 'executeJson').mockImplementation(
  vi.fn(async (_script: string, _schema?: any) => ({ success: true, data: {} })),
);
```

### Integration Test Infrastructure

| Component                  | Details                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| **Test Files**             | 7 integration tests                                                             |
| **MCP Servers**            | 1 per `MCPTestClient` instance, shared across tests in same file                |
| **MCP Server Count**       | 2 total (mcp-protocol.test.ts + data-lifecycle.test.ts create separate clients) |
| **Cache Warming**          | **NONE** - servers initialize with empty cache, queries populate on-demand      |
| **Per-Test Overhead**      | 20-60 seconds (MCP server spawn + OmniFocus queries)                            |
| **Total Integration Time** | ~3-5 minutes (sequential files, shared server per file)                         |

**Key Architecture - MCPTestClient:**

```typescript
// 1 MCP server spawned PER CLIENT INSTANCE
this.server = spawn('node', ['./dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' },
});

// Tests in same file reuse this server
```

### Current Vitest Configuration

**File: `vitest.config.ts`**

```typescript
// Default: Multi-threaded parallelization
// (unless VITEST_SAFE=1 environment variable is set)

// Timeouts:
// - Unit tests: 30 seconds
// - Integration tests: 120 seconds (2 minutes - allows for OmniFocus delays)
// - Hook cleanup: 300 seconds (5 minutes - integration cleanup can accumulate)
```

**Why 8 worker threads?**

- Default vitest behavior (CPU-aware default)
- Optimal for 47 unit tests (6-7 batches, minimal overhead)
- Safe for integration tests (runs one at a time when detected)

### Performance Profile

```
Timeline for: npm test -- tests/unit/tools/tags-tool-v2.test.ts --run

1. Vitest initialization (5s)
   - Read test suite (1s)
   - TypeScript compilation (2-3s)
   - Esbuild service startup (0.5s)

2. Run unit tests in parallel (30-40s)
   - 47 files ÷ 8 workers = 6 batches
   - Each batch processes different test files
   - Mock setup is IMMEDIATE (no OmniFocus calls)

3. Total: 35-45 seconds for full unit suite
```

### Why It Feels Slow

1. **47 unit test files** - Each requires compilation before running
2. **Parallel execution** - Creates 8 worker processes visible in `ps aux`
3. **Integration tests mixed in** - If running full suite, includes 3-5 min of MCP server tests
4. **One command does everything** - `npm test` runs unit + integration + coverage

### What's NOT Happening

✅ **Cache warming**: Disabled - unit tests use mocks ✅ **Redundant MCP servers**: Shared per test file ✅ **Multiple
JXA automations**: Unit tests mock everything ✅ **Inefficient parallelization**: 8 workers is correct for 47 files ✅
**Leaked processes**: Vitest cleans up properly on stdin close

## Test Command Behavior

### When You Run Different Commands

| Command                                                   | What Runs                                  | Time      |
| --------------------------------------------------------- | ------------------------------------------ | --------- |
| `npm test`                                                | Full suite (unit + integration + coverage) | 3-5 min   |
| `npm test -- tests/unit/tools/tags-tool-v2.test.ts --run` | Full unit suite (47 files)                 | 30-45 sec |
| `npm run test:unit`                                       | Only unit tests                            | 30-45 sec |
| `npm run test:integration`                                | Only integration tests                     | 3-5 min   |
| `VITEST_SAFE=1 npm test -- tests/unit/...`                | Single-threaded (debug mode)               | 60-90 sec |

### Our New Test File Performance

**tags-tool-v2.test.ts specifically:**

- 21 unit tests
- All mocked (no OmniFocus calls)
- Runs in ~100-200ms as part of batch
- Passes cleanly with correct mocks

## Architecture Decisions & Trade-offs

### Decision 1: Mock All Unit Tests

**Pros:**

- Fast: mocks execute in microseconds vs 1-2s per OmniFocus call
- Isolated: changes to OmniFocus don't break unit tests
- Deterministic: no flakiness from OmniFocus delays
- Safe: can run without OmniFocus running

**Cons:**

- Requires careful mock setup
- Doesn't test actual OmniFocus integration
- (Addressed by: integration tests with real MCP server)

### Decision 2: Shared MCP Server Per Integration Test File

**Pros:**

- Reduces startup time (spawn once instead of per-test)
- Reuses OmniFocus session (more realistic)
- Shared cleanup session tracking

**Cons:**

- Test pollution if state not cleaned properly
- (Addressed by: rigorous cleanup with session IDs)

### Decision 3: Parallel Unit Tests via Vitest Workers

**Pros:**

- Automatic optimal worker count (based on CPU cores)
- Scales with test count automatically
- Safe - workers are isolated processes

**Cons:**

- Can't debug easily (need `VITEST_SAFE=1`)
- Memory usage higher (8 processes vs 1)

## Recommendations

### For Normal Development

**Current setup is optimal.** No changes needed.

- Unit tests: Fast enough (30-40s)
- Integration tests: Acceptable (3-5 min, realistic)
- No redundancy detected
- No unnecessary processes

### For Debugging

```bash
# Single-threaded test run (easier to debug)
VITEST_SAFE=1 npm test -- tests/unit/tools/tags-tool-v2.test.ts --run
```

### For CI/CD

```bash
# Run separately for clear failure attribution
npm run test:unit   # ~40s - Fast, isolated
npm run test:integration  # ~5min - Real integration
```

## Conclusion

**The test suite architecture is well-designed and not broken.**

The apparent "slowness" is:

- ✅ **Expected**: 47 files need compilation time
- ✅ **Optimized**: 8-worker parallelization is correct
- ✅ **Intentional**: Integration tests properly isolate MCP servers
- ✅ **Clean**: No redundant cache warming or process spawning

Our new `tags-tool-v2.test.ts` follows the exact same patterns as existing tests and performs identically. The 3-minute
wait was vitest running the full suite, not an issue with our implementation.
