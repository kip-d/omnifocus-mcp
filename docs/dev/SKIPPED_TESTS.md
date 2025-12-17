# Skipped Tests Reference

Quick guide to understanding which tests are skipped and why.

## Summary

- **Unit tests**: 47 files, 646 tests - ✅ All run
- **Integration tests**: 8 files total
  - 5 files run automatically on macOS
  - 3 files require explicit environment variables (opt-in)
  - **Total skipped**: 30 tests across 3 files

## Running Integration Tests (Opt-in)

### Skipped Test Files

#### 1. llm-assistant-simulation.test.ts (14 skipped tests)

**Purpose**: Simulates how Claude (LLM assistant) would interact with the MCP server to test realistic workflows.

**Why skipped**: `ENABLE_LLM_SIMULATION_TESTS` environment variable not set to `'true'`

**To enable**:

```bash
ENABLE_LLM_SIMULATION_TESTS=true npm test
```

**Status**: Developer feature, opt-in by choice

---

#### 2. real-llm-integration.test.ts (8 skipped tests)

**Purpose**: Uses actual AI models via Ollama for real LLM reasoning tests to validate that the MCP server works with
real LLM decision-making.

**Why skipped**: `ENABLE_REAL_LLM_TESTS` environment variable not set to `'true'`

**Requirements**:

- Ollama installed and running locally
- Small language models available (phi3.5:3.8b, qwen2.5:0.5b, etc.)

**To enable**:

```bash
ENABLE_REAL_LLM_TESTS=true npm test
```

**Status**: Expensive/slow tests, not suitable for regular CI runs (can take 30+ seconds per test)

---

#### 3. batch-operations.test.ts (8 skipped tests)

**Purpose**: Tests batch creation operations with direct JXA (JavaScript for Automation) access to OmniFocus.

**Why skipped**: `VITEST_ALLOW_JXA` environment variable not set to `'1'`

**Requirements**: macOS with OmniFocus installed

**To enable**:

```bash
VITEST_ALLOW_JXA=1 npm test
```

**Status**: Can run on macOS, but requires explicit opt-in for security (direct JXA execution)

---

## Running Integration Tests (Auto-enabled on macOS)

These tests run automatically when on macOS with OmniFocus installed.

### 1. data-lifecycle.test.ts (6 tests)

- Tests CRUD operations on tasks and projects
- Verifies data integrity across operations
- **Cleanup**: Yes - uses `thoroughCleanup()` in `afterAll`

### 2. omnifocus-4.7-features.test.ts (15 tests)

- Tests OmniFocus 4.7+ specific features:
  - Planned dates support
  - Mutually exclusive tags
  - Enhanced repeats with translation layer
  - Version detection with feature flags
- **Cleanup**: Has cleanup hooks but **⚠️ See Cleanup Issues below**

### 3. mcp-protocol.test.ts (7 tests)

- Tests MCP protocol compliance
- Read-only tests, no data creation
- **Cleanup**: Not needed

### 4. edge-case-escaping.test.ts (11 tests)

- Tests string escaping in scripts
- Read-only tests, no data creation
- **Cleanup**: Not needed

### 5. pattern-analysis-tool.test.ts (6 tests)

- Tests pattern analysis algorithms
- Read-only tests, no data creation
- **Cleanup**: Not needed

---

## ⚠️ Known Cleanup Issues

### Problem: Untracked Task Creation in omnifocus-4.7-features.test.ts

**Issue**: 12 calls to `client.callTool('manage_task', { operation: 'create', ... })` are creating tasks directly
instead of using the `client.createTestTask()` helper.

**Result**: These tasks are NOT tracked for cleanup because:

1. Session ID tag is not added
2. Task ID is not recorded in `createdTaskIds[]`
3. Cleanup code only deletes tracked IDs

**Evidence**: Tasks with tags like `['test', 'planned-dates']` and `['test', 'planned-query']` are left in OmniFocus
after test runs.

**Impact**: Database pollution accumulates with each test run.

### Solution (Needed)

Convert all direct `client.callTool('manage_task', ...)` calls to use `client.createTestTask()`:

```typescript
// ❌ WRONG - Creates untracked tasks
await client.callTool('manage_task', {
  operation: 'create',
  name: 'Task with Planned Date',
  plannedDate: '2025-11-15 09:00',
  tags: ['test', 'planned-dates'],
});

// ✅ CORRECT - Task is tracked and cleaned up
await client.createTestTask('Task with Planned Date', {
  plannedDate: '2025-11-15 09:00',
  tags: ['test', 'planned-dates'],
});
```

---

## How Cleanup Works

### Automatic Cleanup for Tracked Tasks

Tests that use `client.createTestTask()` and `client.callTool('projects', { operation: 'create', ... })`:

1. **Tracking**: Each created item is recorded with its ID
2. **Session ID**: Items are tagged with unique session ID for efficient filtering
3. **Per-test cleanup**: `afterEach()` calls `quickCleanup()` - deletes only tracked IDs (fast)
4. **Final cleanup**: `afterAll()` calls `thoroughCleanup()` - bulk deletion of all tracked items

### Bulk Delete Performance

- Bulk delete of 12 tasks: ~5 seconds
- Individual deletes: ~20 seconds each = 4+ minutes for 12 tasks
- Bulk operations are 50x faster and much more reliable

---

## Running Tests with Different Configurations

### Run all unit tests only (fast, ~2 seconds)

```bash
npm run test:quick
```

### Run all tests (unit + integration)

```bash
npm test
```

### Run specific integration test file

```bash
npm test -- tests/integration/omnifocus-4.7-features.test.ts
```

### Run only skipped tests (one example)

```bash
ENABLE_LLM_SIMULATION_TESTS=true npm test -- tests/integration/llm-assistant-simulation.test.ts
```

### Run all tests including expensive ones

```bash
ENABLE_LLM_SIMULATION_TESTS=true ENABLE_REAL_LLM_TESTS=true VITEST_ALLOW_JXA=1 npm test
```

---

## Test Execution Times

For planning CI/CD and local development:

- Unit tests: ~2 seconds
- Integration tests (running on macOS):
  - data-lifecycle: ~20 seconds
  - omnifocus-4.7-features: ~19 seconds
  - mcp-protocol: ~5 seconds
  - edge-case-escaping: ~3 milliseconds
  - pattern-analysis: ~3 milliseconds
- **Total integration**: ~47 seconds (on macOS with OmniFocus)

---

## Summary Table

| Test File                        | Tests | Status  | Cleanup    | Notes                                                  |
| -------------------------------- | ----- | ------- | ---------- | ------------------------------------------------------ |
| llm-assistant-simulation.test.ts | 14    | Skipped | N/A        | Opt-in: `ENABLE_LLM_SIMULATION_TESTS=true`             |
| real-llm-integration.test.ts     | 8     | Skipped | N/A        | Opt-in: `ENABLE_REAL_LLM_TESTS=true` (requires Ollama) |
| batch-operations.test.ts         | 8     | Skipped | Yes        | Opt-in: `VITEST_ALLOW_JXA=1`                           |
| data-lifecycle.test.ts           | 6     | Running | Yes ✅     | Auto-enabled on macOS                                  |
| omnifocus-4.7-features.test.ts   | 15    | Running | Partial ⚠️ | Auto-enabled on macOS; 12 untracked creates            |
| mcp-protocol.test.ts             | 7     | Running | N/A        | Read-only, no cleanup needed                           |
| edge-case-escaping.test.ts       | 11    | Running | N/A        | Read-only, no cleanup needed                           |
| pattern-analysis-tool.test.ts    | 6     | Running | N/A        | Read-only, no cleanup needed                           |
