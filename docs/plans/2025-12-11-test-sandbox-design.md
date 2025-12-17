# Test Sandbox Design

> **Status:** APPROVED - Ready for implementation **Date:** 2025-12-11 **Problem:** Integration tests create real
> OmniFocus data that's hard to clean up, polluting the production database with orphaned tasks, projects, and tags.

---

## Overview

A sandbox-based approach to integration testing that:

1. Isolates all test data in a dedicated folder
2. Enforces isolation with runtime guards
3. Provides reliable cleanup that runs at start and end of test suites

---

## Structure & Naming Conventions

### Sandbox Container

- **Folder:** `__MCP_TEST_SANDBOX__` at root level
- **Lifecycle:** Created lazily on first write operation, deleted after cleanup

### Naming Requirements

| Entity                  | Convention                              | Example                        |
| ----------------------- | --------------------------------------- | ------------------------------ |
| Sandbox folder          | Exactly `__MCP_TEST_SANDBOX__`          | —                              |
| Test projects           | Any name, must be inside sandbox folder | `Batch Operations Test`        |
| Test tasks (in project) | Any name, project must be in sandbox    | `verify due date update`       |
| Test tasks (inbox)      | Must start with `__TEST__`              | `__TEST__ inbox creation test` |
| Test tags               | Must start with `__test-`               | `__test-urgent`, `__test-work` |

---

## Runtime Guard

### Location

`src/contracts/ast/mutation-script-builder.ts`

### Activation

Only when `process.env.NODE_ENV === 'test'`

### Validation Rules

| Operation                | Validation                                                 | Error Message                                                     |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Create task with project | Query OmniFocus to verify project is inside sandbox folder | `TEST GUARD: Project "X" is not inside sandbox folder`            |
| Create task in inbox     | Name must start with `__TEST__`                            | `TEST GUARD: Inbox tasks must have name starting with "__TEST__"` |
| Create project           | Must specify `__MCP_TEST_SANDBOX__` as parent folder       | `TEST GUARD: Projects must be created inside sandbox folder`      |
| Create/use tags          | All tags must start with `__test-`                         | `TEST GUARD: Tags must start with "__test-". Invalid: X, Y`       |
| Update task              | Task must be inside sandbox OR have `__TEST__` name prefix | `TEST GUARD: Cannot update task outside sandbox`                  |
| Delete task              | Task must be inside sandbox OR have `__TEST__` name prefix | `TEST GUARD: Cannot delete task outside sandbox`                  |

### Performance

- Sandbox folder ID is cached on first lookup
- One verification query per write operation (negligible vs. 60s+ test durations)

---

## TestWriteClient Helper

### Location

`tests/integration/helpers/test-write-client.ts`

### Purpose

Makes it easy to write correct tests by wrapping MCP calls with conveniences.

### API

```typescript
class TestWriteClient {
  // Ensures sandbox folder exists, caches ID
  async ensureSandbox(): Promise<string>;

  // Creates project inside sandbox, tracks ID for cleanup
  async createTestProject(name: string, options?: ProjectOptions): Promise<Project>;

  // Creates task in specified project (must be in sandbox), tracks ID
  async createTestTask(name: string, projectId: string, options?: TaskOptions): Promise<Task>;

  // Creates inbox task (validates __TEST__ prefix), tracks ID
  async createInboxTask(name: string, options?: TaskOptions): Promise<Task>;

  // Creates tag with __test- prefix (adds prefix if missing), tracks name
  async createTestTag(name: string): Promise<Tag>;

  // Cleanup: deletes all tracked items + full sandbox sweep
  async cleanup(): Promise<CleanupReport>;
}
```

### Usage Example

```typescript
let client: TestWriteClient;

beforeAll(async () => {
  client = new TestWriteClient();
  await client.ensureSandbox();
});

afterAll(async () => {
  await client.cleanup();
});

it('should update task due date', async () => {
  const project = await client.createTestProject('Date Tests');
  const task = await client.createTestTask('__TEST__ due date task', project.id);
  // ... test logic
});
```

---

## Cleanup Strategy

### When Cleanup Runs

1. **Start of test suite** - Sweeps for orphans from crashed previous runs
2. **End of test suite** - Normal teardown of current run's data

### Cleanup Order

Order matters due to OmniFocus constraints (folders must be empty to delete):

| Step | Action                                                       | Rationale                             |
| ---- | ------------------------------------------------------------ | ------------------------------------- |
| 1    | Delete all tasks with `__TEST__` name prefix                 | Catches inbox tasks first             |
| 2    | Delete all projects inside `__MCP_TEST_SANDBOX__`            | Cascades to their tasks automatically |
| 3    | Delete sub-folders inside sandbox (bottom-up, deepest first) | Folders must be empty to delete       |
| 4    | Delete `__MCP_TEST_SANDBOX__` folder                         | Now empty                             |
| 5    | Delete all tags starting with `__test-`                      | Safe now that no tasks reference them |

### Cleanup Report

```typescript
interface CleanupReport {
  inboxTasksDeleted: number;
  projectsDeleted: number;
  foldersDeleted: number;
  tagsDeleted: number;
  errors: string[];
  durationMs: number;
}
```

### Manual Cleanup Command

```bash
npm run test:cleanup
```

Runs cleanup without running tests. Useful for recovering from crashes or clearing orphaned test data.

---

## Migration Path

### Phase 1: Build Infrastructure (No Risk)

- [ ] Implement `TestWriteClient` helper class
- [ ] Implement sandbox folder create/delete functions
- [ ] Implement runtime guard in `mutation-script-builder.ts`
- [ ] Add `npm run test:cleanup` command

### Phase 2: Migrate Tests (Low Risk, Incremental)

- [ ] Migrate `batch-operations.test.ts` (already has best cleanup patterns)
- [ ] Migrate `OmniFocusWriteTool.test.ts`
- [ ] Migrate `update-operations.test.ts`
- [ ] Audit and migrate any other write tests

### Phase 3: Enable Guard (Medium Risk)

- [ ] Enable guard in CI environment
- [ ] Guard will fail any test that bypasses sandbox (catches missed migrations)

### Phase 4: Legacy Cleanup (Optional, Interactive)

Existing test debris in the production database should be cleaned interactively, not automatically. A future session
can:

1. Query for suspected test artifacts (tasks with "test" in name, orphaned tags, etc.)
2. Present each item with reasoning for why it appears to be test data
3. User confirms deletion or skips

This is NOT part of the automated infrastructure - it's a one-time manual cleanup.

---

## Files to Create/Modify

### New Files

- `tests/integration/helpers/test-write-client.ts` - TestWriteClient class
- `tests/integration/helpers/sandbox-manager.ts` - Folder/cleanup operations
- `scripts/test-cleanup.ts` - Manual cleanup command

### Modified Files

- `src/contracts/ast/mutation-script-builder.ts` - Add runtime guard
- `package.json` - Add `test:cleanup` script
- `tests/support/setup-integration.ts` - Add startup cleanup sweep
- `tests/integration/batch-operations.test.ts` - Migrate to TestWriteClient
- `tests/integration/tools/unified/OmniFocusWriteTool.test.ts` - Migrate
- `tests/integration/validation/update-operations.test.ts` - Migrate

---

## Success Criteria

1. Running `npm test` leaves zero test artifacts in OmniFocus
2. A crashed test run's orphans are cleaned up on next run
3. Any test attempting to write outside sandbox fails with clear error
4. `npm run test:cleanup` can recover from any state
5. New developers can write tests without reading this doc (guard errors guide them)

---

## Design Decisions Log

| Decision            | Choice                     | Rationale                                           |
| ------------------- | -------------------------- | --------------------------------------------------- |
| Container type      | Folder (not project)       | Projects inside folder = realistic testing          |
| Naming enforcement  | Runtime guard              | Documentation-driven conventions get ignored        |
| Guard location      | mutation-script-builder.ts | Structured data available, before string generation |
| Inbox task handling | Require `__TEST__` prefix  | Inbox testing is a real need                        |
| Prefix style        | `__TEST__` / `__test-`     | Visually obvious if it leaks, easy to query         |
| Cleanup timing      | Start AND end of suite     | Catches orphans from crashes                        |
| Legacy cleanup      | Interactive, not automated | Organic data needs human judgment                   |
