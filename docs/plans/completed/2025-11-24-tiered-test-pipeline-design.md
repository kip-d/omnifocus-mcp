# Tiered Test Pipeline Design

**Date:** 2025-11-24 **Status:** Approved Design **Author:** Brainstorming session

## Problem Statement

Current testing workflow has multiple friction points:

- **Startup time:** MCP server spawns for each test run (~3-5s overhead)
- **Execution time:** OmniFocus operations are slow (5-10s per operation)
- **Mental overhead:** Unclear which tests to run, often run everything or rely on human testers

Human testers running TESTING_PROMPT.md via Claude Desktop provides comprehensive validation but has 30+ minute
turnaround time.

## Goals

1. **Sub-30s feedback during active development** for most code changes
2. **Real OmniFocus validation** (not mocked) when needed
3. **Automated test selection** - no mental overhead deciding what to run
4. **Pre-commit safety net** - catch integration bugs before they're pushed

## Solution: Tiered Test Pipeline

### Tier Definitions

| Tier | Name        | Time   | Trigger           | What It Tests                   |
| ---- | ----------- | ------ | ----------------- | ------------------------------- |
| 1    | Unit        | 2-5s   | File save (watch) | Pure TypeScript logic           |
| 2    | Smoke       | 8-12s  | On-demand         | Minimal OmniFocus round-trip    |
| 3    | Integration | 60-90s | Pre-commit, CI    | Complete TESTING_PROMPT.md flow |

### Tier 1: Unit Tests (Instant)

**Purpose:** Validate pure logic without OmniFocus dependency

**Location:** `tests/unit/**/*.test.ts` (existing ~50 tests)

**What's covered:**

- Compilers (QueryCompiler, MutationCompiler, AnalysisCompiler)
- Validators (schema validation, AST validation)
- Transformers (AST builders, response formatters)
- Pure utilities (date handling, error messages)

**Trigger:** Vitest watch mode - runs automatically on file save

**Time:** 2-5 seconds for full unit suite

### Tier 2: Smoke Tests (Quick Sanity)

**Purpose:** Prove OmniFocus connection works with minimal round-trip

**Location:** `tests/smoke/**/*.test.ts` (new directory)

**What's covered:**

1. System health check (diagnostics)
2. Create one task with test tag
3. Query to verify task exists
4. Delete task
5. Verify deletion succeeded

**Trigger:** Manual (`npm run test:smoke`) or timer during dev sessions

**Time:** 8-12 seconds

### Tier 3: Integration Tests (Full Validation)

**Purpose:** Complete validation equivalent to TESTING_PROMPT.md

**Location:** `tests/integration/**/*.test.ts` (existing)

**What's covered:**

- All read operations (inbox, today, overdue, projects, tags)
- All write operations (create, update, complete, delete for tasks and projects)
- Tag filtering and verification
- Analytics operations
- OmniFocus 4.7+ features (planned dates, repeats)
- Cleanup verification

**Trigger:** Pre-commit hook, CI pipeline, manual (`npm run test:integration`)

**Time:** 60-90 seconds

## Developer Workflow

### During Active Development

```bash
# Terminal 1: Keep watch mode running
npm run test:watch

# On every file save, see instant feedback:
# ✓ tests/unit/tools/unified/compilers/QueryCompiler.test.ts (2.1s)
# Watching for changes...
```

### When You Want OmniFocus Sanity Check

```bash
npm run test:smoke
# Runs Tier 2 only - 8-12 seconds
# Proves OmniFocus connection works
```

### Before Committing

```bash
git commit -m "feat: add new filter"
# Pre-commit hook automatically runs:
# 1. Tier 1 (unit) - 2-5s
# 2. Tier 2 (smoke) - 8-12s
# Total: ~15-20s
# Blocks commit if tests fail
```

### Full Validation (CI or Manual)

```bash
npm run test:ci
# Runs all tiers with coverage
# Total: 60-90s
```

## Implementation Components

### 1. Vitest Configuration

Update `vitest.config.ts` to use project-based configuration:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        include: ['tests/unit/**/*.test.ts'],
        exclude: ['tests/unit/**/*.skip.ts'],
        environment: 'node',
        // No setup - pure TypeScript tests
      },
      {
        name: 'smoke',
        include: ['tests/smoke/**/*.test.ts'],
        setupFiles: ['tests/smoke/setup.ts'],
        testTimeout: 30000,
        environment: 'node',
      },
      {
        name: 'integration',
        include: ['tests/integration/**/*.test.ts'],
        exclude: [
          'tests/integration/helpers/**',
          'tests/integration/test-*.ts', // Legacy standalone scripts
        ],
        setupFiles: ['tests/integration/setup.ts'],
        testTimeout: 120000,
        environment: 'node',
      },
    ],
  },
});
```

### 2. NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:watch": "vitest --project unit",
    "test:smoke": "vitest run --project smoke",
    "test:integration": "vitest run --project integration",
    "test:pre-commit": "vitest run --project unit && vitest run --project smoke",
    "test:ci": "vitest run --coverage"
  }
}
```

### 3. Smoke Test Suite

Create `tests/smoke/omnifocus-sanity.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient } from '../integration/helpers/mcp-test-client';

describe('OmniFocus Smoke Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.startServer();
  }, 15000);

  afterAll(async () => {
    await client.cleanup();
    await client.stop();
  });

  it('system diagnostics reports healthy', async () => {
    const result = await client.callTool('system', { operation: 'diagnostics' });
    expect(result.success).toBe(true);
    expect(result.health).toBe('healthy');
  }, 10000);

  it('can create, verify, and delete a task', async () => {
    // Create
    const createResult = await client.createTestTask('Smoke Test Task');
    expect(createResult.success).toBe(true);
    const taskId = createResult.data?.task?.taskId;
    expect(taskId).toBeDefined();

    // Verify exists via query
    const queryResult = await client.callTool('omnifocus_read', {
      query: {
        type: 'tasks',
        filters: { id: taskId },
        limit: 1,
      },
    });
    expect(queryResult.success).toBe(true);
    expect(queryResult.data?.items?.length).toBe(1);

    // Cleanup handled by afterAll
  }, 20000);
});
```

### 4. Smoke Test Setup

Create `tests/smoke/setup.ts`:

```typescript
import { beforeAll } from 'vitest';

beforeAll(() => {
  // Ensure we're in test environment
  process.env.NODE_ENV = 'test';

  // Set shorter timeouts for smoke tests
  process.env.MCP_TEST_TIMEOUT = '30000';
});
```

### 5. Pre-commit Hook

Install husky if not present:

```bash
npm install --save-dev husky
npx husky init
```

Create `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "Running pre-commit tests..."
npm run test:pre-commit
```

### 6. Integration Test Setup (if not exists)

Create `tests/integration/setup.ts`:

```typescript
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  console.log('Starting integration test suite...');
});

afterAll(() => {
  console.log('Integration test suite complete.');
});
```

## File Structure After Implementation

```
tests/
├── unit/                          # Tier 1 - existing
│   ├── tools/
│   ├── contracts/
│   └── ...
├── smoke/                         # Tier 2 - new
│   ├── setup.ts
│   └── omnifocus-sanity.test.ts
├── integration/                   # Tier 3 - existing
│   ├── setup.ts                   # new
│   ├── helpers/
│   │   ├── mcp-test-client.ts
│   │   └── shared-server.ts
│   └── tools/
│       └── unified/
│           └── end-to-end.test.ts
└── performance/                   # Separate - not in tiers
    └── performance-benchmarks.test.ts

.husky/
└── pre-commit                     # new

vitest.config.ts                   # updated
package.json                       # updated scripts
```

## Success Criteria

- [ ] `npm run test:watch` provides 2-5s feedback on unit test changes
- [ ] `npm run test:smoke` completes in under 15 seconds
- [ ] `npm run test:integration` runs full TESTING_PROMPT.md equivalent
- [ ] Pre-commit hook blocks commits when tests fail
- [ ] CI runs all tiers with coverage reporting
- [ ] No mental overhead - developers know exactly which command to run

## Migration Notes

### Existing Tests Classification

Most existing tests are already properly located:

- `tests/unit/**` → Tier 1 (no changes needed)
- `tests/integration/**/*.test.ts` → Tier 3 (no changes needed)

Legacy standalone scripts in `tests/integration/test-*.ts` should be excluded from Vitest projects (they're manual
investigation tools, not automated tests).

### Gradual Adoption

1. **Week 1:** Add npm scripts and vitest config - immediate value from `test:watch`
2. **Week 2:** Add smoke test suite - quick sanity checking
3. **Week 3:** Add pre-commit hook - safety net before push

## References

- Existing test client: `tests/integration/helpers/mcp-test-client.ts`
- Existing E2E tests: `tests/integration/tools/unified/end-to-end.test.ts`
- Manual test prompt: `TESTING_PROMPT.md`
