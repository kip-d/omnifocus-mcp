# Optimize Integration Tests Implementation Plan

## ✅ STATUS: COMPLETED - October 13, 2025

**Completion Details:**
- **Result**: Test execution reduced from 93s to ~35-40s (58% faster)
- **Implementation**: MCPTestClient helper created, tests split into protocol + data lifecycle
- **Files Created**:
  - `tests/integration/helpers/mcp-test-client.ts`
  - `tests/integration/data-lifecycle.test.ts`
  - `tests/integration/mcp-protocol.test.ts`
- **Documentation**: See `docs/TEST_OPTIMIZATION_RESULTS.md` for details

---

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Reduce test execution time from 93s to ~35-40s by extracting shared test infrastructure, optimizing cleanup strategies, and properly organizing integration tests.

**Architecture:** Extract `TestDataManager` into reusable `MCPTestClient` helper class. Split integration tests into protocol compliance (fast) and data lifecycle (thorough with optimized cleanup). Remove redundant beforeEach cleanup cycles, use quick ID-based cleanup in afterEach, and paranoid full scans only in beforeAll/afterAll.

**Tech Stack:** TypeScript, Vitest, Node.js child_process, MCP protocol

---

## Task 1: Create Integration Test Directory Structure

**Files:**
- Create: `tests/integration/helpers/` (directory)
- Create: `tests/integration/helpers/.gitkeep` (placeholder)

**Step 1: Create directory structure**

```bash
mkdir -p tests/integration/helpers
touch tests/integration/helpers/.gitkeep
```

**Step 2: Verify directory exists**

```bash
ls -la tests/integration/helpers/
```

Expected: Directory exists with .gitkeep file

**Step 3: Commit**

```bash
git add tests/integration/helpers/.gitkeep
git commit -m "test: create integration test directory structure"
```

---

## Task 2: Extract MCPTestClient Helper Class

**Files:**
- Create: `tests/integration/helpers/mcp-test-client.ts`
- Reference: `tests/unit/test-data-management.test.ts:1-296` (source material)

**Step 1: Create MCPTestClient class with interfaces**

Create `tests/integration/helpers/mcp-test-client.ts`:

```typescript
import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

export const TESTING_TAG = 'mcp-test';

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface CleanupMetrics {
  startTime: number;
  operations: number;
  duration: number;
  lastCleanup: number;
}

export class MCPTestClient {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, (response: MCPResponse) => void> = new Map();
  private createdTaskIds: string[] = [];
  private createdProjectIds: string[] = [];

  private cleanupMetrics: CleanupMetrics = {
    startTime: 0,
    operations: 0,
    duration: 0,
    lastCleanup: 0
  };

  async startServer(): Promise<void> {
    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const rl = createInterface({
      input: this.server.stdout!,
      crlfDelay: Infinity
    });

    rl.on('line', (line: string) => {
      try {
        const response: MCPResponse = JSON.parse(line);
        this.handleResponse(response);
      } catch (e) {
        // Ignore non-JSON output
      }
    });

    // Initialize MCP connection
    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'mcp-test-client',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await this.sendRequest(initRequest);

    if (!initResponse.result) {
      throw new Error('Failed to initialize MCP connection');
    }

    // Send initialized notification
    this.server.stdin!.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    await this.delay(100);
  }

  async sendRequest(request: MCPRequest, timeout: number = 60000): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const requestId = request.id!;

      this.pendingRequests.set(requestId, resolve);
      this.server!.stdin!.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  handleResponse(response: MCPResponse): void {
    if (response.id && this.pendingRequests.has(response.id)) {
      const resolver = this.pendingRequests.get(response.id)!;
      this.pendingRequests.delete(response.id);
      resolver(response);
    }
  }

  nextId(): number {
    return ++this.messageId;
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async callTool(toolName: string, params: any = {}): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`Tool error: ${response.error.message}`);
    }

    // Support both 'text' and 'json' content types from MCP
    try {
      const first = response.result?.content?.[0];
      if (!first || !first.type) return response.result;
      if (first.type === 'json') return first.json;
      if (first.type === 'text') return JSON.parse(first.text);
      return response.result;
    } catch (e) {
      return response.result;
    }
  }

  async createTestTask(name: string, properties: any = {}): Promise<any> {
    const tags = [...(properties.tags || []), TESTING_TAG];

    const taskParams = {
      name: name,
      ...properties,
      tags: tags
    };

    const result = await this.callTool('manage_task', { operation: 'create', ...taskParams });
    if (result.success && result.data?.task?.taskId) {
      this.createdTaskIds.push(result.data.task.taskId);
    }
    return result;
  }

  async createTestProject(name: string, properties: any = {}): Promise<any> {
    const tags = [...(properties.tags || []), TESTING_TAG];

    const projectParams = {
      operation: 'create',
      name: name,
      ...properties,
      tags: tags
    };

    const result = await this.callTool('projects', projectParams);
    if (result.success && result.data?.project?.project?.id) {
      this.createdProjectIds.push(result.data.project.project.id);
    }
    return result;
  }

  async quickCleanup(): Promise<void> {
    // Quick cleanup: Delete only tracked IDs (no scan)
    this.cleanupMetrics.startTime = Date.now();
    this.cleanupMetrics.operations = 0;

    console.log(`🧹 Quick cleanup: deleting ${this.createdTaskIds.length} tasks, ${this.createdProjectIds.length} projects`);

    // Clean up created tasks
    for (const taskId of this.createdTaskIds) {
      try {
        await this.callTool('manage_task', { operation: 'delete', taskId: taskId });
        this.cleanupMetrics.operations++;
      } catch (e) {
        console.log(`  ⚠️  Could not delete task ${taskId}: ${e}`);
      }
    }

    // Clean up created projects
    for (const projectId of this.createdProjectIds) {
      try {
        await this.callTool('projects', { operation: 'delete', projectId: projectId });
        this.cleanupMetrics.operations++;
      } catch (e) {
        console.log(`  ⚠️  Could not delete project ${projectId}: ${e}`);
      }
    }

    // Reset tracking arrays
    this.createdTaskIds = [];
    this.createdProjectIds = [];

    this.cleanupMetrics.duration = Date.now() - this.cleanupMetrics.startTime;
    this.cleanupMetrics.lastCleanup = Date.now();
    console.log(`  📊 Quick cleanup completed in ${this.cleanupMetrics.duration}ms (${this.cleanupMetrics.operations} operations)`);
  }

  async thoroughCleanup(): Promise<void> {
    // Thorough cleanup: Delete tracked IDs + full tag-based scan (paranoid mode)
    this.cleanupMetrics.startTime = Date.now();
    this.cleanupMetrics.operations = 0;

    console.log(`🧹 Thorough cleanup with tag: ${TESTING_TAG}`);

    // Clean up created tasks
    for (const taskId of this.createdTaskIds) {
      try {
        await this.callTool('manage_task', { operation: 'delete', taskId: taskId });
        this.cleanupMetrics.operations++;
      } catch (e) {
        console.log(`  ⚠️  Could not delete task ${taskId}: ${e}`);
      }
    }

    // Clean up created projects
    for (const projectId of this.createdProjectIds) {
      try {
        await this.callTool('projects', { operation: 'delete', projectId: projectId });
        this.cleanupMetrics.operations++;
      } catch (e) {
        console.log(`  ⚠️  Could not delete project ${projectId}: ${e}`);
      }
    }

    // Paranoid mode: Full tag-based fallback scan
    try {
      const tasks = await this.callTool('tasks', {
        mode: 'all',
        tags: [TESTING_TAG],
        limit: 100
      });

      for (const task of tasks.data.tasks || []) {
        try {
          await this.callTool('manage_task', { operation: 'delete', taskId: task.id });
          this.cleanupMetrics.operations++;
        } catch (e) {
          console.log(`  ⚠️  Could not delete task ${task.id}: ${e}`);
        }
      }
    } catch (e) {
      console.log(`  ⚠️  Could not clean up tasks by tag: ${e}`);
    }

    // Clean up any remaining test projects by tag
    try {
      const projects = await this.callTool('projects', {
        operation: 'list',
        limit: 100
      });

      for (const project of projects.data.projects || []) {
        if (project.tags && project.tags.includes(TESTING_TAG)) {
          try {
            await this.callTool('projects', { operation: 'delete', projectId: project.id });
            this.cleanupMetrics.operations++;
          } catch (e) {
            console.log(`  ⚠️  Could not delete project ${project.id}: ${e}`);
          }
        }
      }
    } catch (e) {
      console.log(`  ⚠️  Could not clean up projects by tag: ${e}`);
    }

    // Reset tracking arrays
    this.createdTaskIds = [];
    this.createdProjectIds = [];

    this.cleanupMetrics.duration = Date.now() - this.cleanupMetrics.startTime;
    this.cleanupMetrics.lastCleanup = Date.now();
    console.log(`  📊 Thorough cleanup completed in ${this.cleanupMetrics.duration}ms (${this.cleanupMetrics.operations} operations)`);
  }

  async stop(): Promise<void> {
    if (this.server && !this.server.killed) {
      try {
        this.server.stdin?.end();
      } catch (e) {
        // Ignore errors
      }

      await new Promise<void>((resolve) => {
        const gracefulTimeout = setTimeout(() => {
          console.log('⚠️  Server did not exit gracefully, sending SIGTERM...');
          this.server!.kill('SIGTERM');

          setTimeout(() => {
            if (!this.server!.killed) {
              this.server!.kill('SIGKILL');
            }
            resolve();
          }, 2000);
        }, 5000);

        this.server!.once('exit', () => {
          clearTimeout(gracefulTimeout);
          resolve();
        });
      });
    }
  }
}
```

**Step 2: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: Successful compilation with new helper file

**Step 3: Commit**

```bash
git add tests/integration/helpers/mcp-test-client.ts
git commit -m "test: extract MCPTestClient helper with quick/thorough cleanup"
```

---

## Task 3: Create Optimized Data Lifecycle Test

**Files:**
- Create: `tests/integration/data-lifecycle.test.ts`
- Reference: `tests/unit/test-data-management.test.ts:302-466` (test cases)

**Step 1: Create optimized data lifecycle test file**

Create `tests/integration/data-lifecycle.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { MCPTestClient, TESTING_TAG } from './helpers/mcp-test-client.js';

// Auto-enable on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('OmniFocus Data Lifecycle Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.startServer();
    await client.thoroughCleanup();  // ONE initial cleanup for clean slate
  });

  afterAll(async () => {
    await client.thoroughCleanup();  // Final paranoid scan
    await client.stop();
  });

  afterEach(async () => {
    await client.quickCleanup();  // Fast ID-based cleanup only
  });

  it('should create and cleanup test tasks', async () => {
    const result = await client.createTestTask('Sample Test Task');

    expect(result.success).toBe(true);
    expect(result.data.task).toHaveProperty('taskId');
    expect(result.data.task.tags).toContain(TESTING_TAG);
  }, 90000);

  it('should create and cleanup test projects', async () => {
    const uniqueName = `Sample Test Project ${Date.now()}`;
    const result = await client.createTestProject(uniqueName);

    expect(result.success).toBe(true);
    expect(result.data.project.project).toHaveProperty('id');
    expect(result.data.project.project.name).toBeTruthy();
  }, 90000);

  it('should create tasks with custom properties', async () => {
    const result = await client.createTestTask('Custom Test Task', {
      flagged: true,
      note: 'This is a test note'
    });

    expect(result.success).toBe(true);
    expect(result.data.task.flagged).toBe(true);
    expect(result.data.task.note).toBe('This is a test note');
    expect(result.data.task.tags).toContain(TESTING_TAG);
  });

  it('should create tasks in test projects', async () => {
    const projectResult = await client.createTestProject(`Parent Test Project ${Date.now()}`);
    expect(projectResult.success).toBe(true);

    const taskResult = await client.createTestTask('Test Task in Project', {
      projectId: projectResult.data.project.project.id
    });

    expect(taskResult.success).toBe(true);
    expect(taskResult.data.task.project).toBe(projectResult.data.project.project.name);
  }, 90000);

  it('should find test data by tag', async () => {
    console.log(`\n🔍 Creating 3 test tasks with tag: ${TESTING_TAG}`);
    const task1 = await client.createTestTask('Tag Test Task 1');
    const task2 = await client.createTestTask('Tag Test Task 2');
    const task3 = await client.createTestTask('Tag Test Task 3');

    const createdIds = [
      task1.data?.task?.taskId,
      task2.data?.task?.taskId,
      task3.data?.task?.taskId,
    ];

    console.log('✅ Tasks created:', createdIds);

    const tasks = await client.callTool('tasks', {
      mode: 'search',
      search: 'Tag Test Task',
      limit: 100,
      details: true
    });

    console.log(`📊 Search returned ${tasks.data.tasks?.length || 0} tasks`);

    expect(tasks.data.tasks).toBeInstanceOf(Array);
    expect(tasks.data.tasks.length).toBeGreaterThanOrEqual(3);

    const foundTasks = tasks.data.tasks.filter((t: any) =>
      createdIds.includes(t.id)
    );
    expect(foundTasks.length).toBe(3);

    for (const task of foundTasks) {
      expect(task.tags).toContain(TESTING_TAG);
    }
  });

  it('should cleanup all test data after tests', async () => {
    console.log(`\n🔍 Creating test data for cleanup verification`);

    const uniqueTaskName = `Cleanup Verify Task ${Date.now()}`;
    const taskResult = await client.createTestTask(uniqueTaskName);
    const projectResult = await client.createTestProject(`Cleanup Test Project ${Date.now()}`);

    const taskId = taskResult.data?.task?.taskId;

    console.log('✅ Test data created:', {
      taskId,
      taskName: uniqueTaskName,
      projectId: projectResult.data?.project?.project?.id,
    });

    expect(taskResult.success).toBe(true);
    expect(projectResult.success).toBe(true);

    console.log(`🔍 Searching for task by name: ${uniqueTaskName}`);
    const tasks = await client.callTool('tasks', {
      mode: 'search',
      search: uniqueTaskName,
      limit: 10,
      details: true
    });

    console.log(`📊 Search returned ${tasks.data.tasks?.length || 0} tasks`);

    expect(tasks.data.tasks.length).toBeGreaterThanOrEqual(1);
    const foundTask = tasks.data.tasks.find((t: any) => t.id === taskId);
    expect(foundTask).toBeDefined();
    expect(foundTask.tags).toContain(TESTING_TAG);
  }, 90000);
});
```

**Step 2: Build to verify no errors**

```bash
npm run build
```

Expected: Successful compilation

**Step 3: Run the new test to verify it works**

```bash
npx vitest tests/integration/data-lifecycle.test.ts --run
```

Expected: All 6 tests pass, significantly faster than before (~20-25s instead of 75s)

**Step 4: Commit**

```bash
git add tests/integration/data-lifecycle.test.ts
git commit -m "test: add optimized data lifecycle integration tests"
```

---

## Task 4: Create MCP Protocol Compliance Test

**Files:**
- Create: `tests/integration/mcp-protocol.test.ts`
- Reference: `tests/unit/integration.test.ts:11-297` (source test cases)

**Step 1: Create protocol test file**

Create `tests/integration/mcp-protocol.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPTestClient } from './helpers/mcp-test-client.js';

// Auto-enable on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('MCP Protocol Compliance Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.startServer();
  });

  afterAll(async () => {
    await client.thoroughCleanup();  // Clean up any test data created
    await client.stop();
  });

  describe('Server Initialization', () => {
    it('should respond to initialize request', async () => {
      const result = await client.sendRequest({
        jsonrpc: '2.0',
        id: client.nextId(),
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      });

      expect(result.result).toBeDefined();
      expect(result.result.protocolVersion).toBe('2025-06-18');
      expect(result.result.serverInfo.name).toBe('omnifocus-mcp-cached');
    });
  });

  describe('Tools Discovery', () => {
    it('should list all available tools', { timeout: 90000 }, async () => {
      const result = await client.sendRequest({
        jsonrpc: '2.0',
        id: client.nextId(),
        method: 'tools/list',
      });

      expect(result.result).toBeDefined();
      expect(result.result.tools).toBeInstanceOf(Array);
      expect(result.result.tools.length).toBeGreaterThan(0);

      const toolNames = result.result.tools.map((t: any) => t.name);

      expect(toolNames).toContain('tasks');
      expect(toolNames).toContain('projects');
      expect(toolNames).toContain('manage_task');
      expect(toolNames).toContain('productivity_stats');
      expect(toolNames).toContain('task_velocity');
      expect(toolNames).toContain('analyze_overdue');
      expect(toolNames).toContain('tags');
      expect(toolNames).toContain('system');
      expect(toolNames).toContain('perspectives');
      expect(toolNames).toContain('export');
    });
  });

  describe('Task Operations', () => {
    it('should handle tasks tool call', { timeout: 90000 }, async () => {
      const result = await client.callTool('tasks', {
        mode: 'all',
        limit: 10,
        details: false,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success === false) {
        expect(result.error.message).toContain('OmniFocus');
      } else {
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('tasks');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('from_cache');
      }
    });

    it('should handle task creation with validation', { timeout: 90000 }, async () => {
      const result = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Test task from protocol test',
        note: 'This is a test task',
        flagged: 'true',
        tags: ['test', 'integration', 'mcp-test'],
      });

      expect(result).toBeDefined();

      if (result.error && result.error.code === 'INTERNAL_ERROR') {
        expect(result.success).toBe(false);
        expect(result.error.message).toContain('OmniFocus');
      } else {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.task).toBeDefined();
        expect(result.data.task.taskId).toBeDefined();
        if (result.data.task.tags) {
          expect(result.data.task.tags).toContain('test');
          expect(result.data.task.tags).toContain('integration');
          expect(result.data.task.tags).toContain('mcp-test');
        }
      }
    });
  });

  describe('Project Operations', () => {
    it('should handle projects tool call', async () => {
      const result = await client.callTool('projects', {
        operation: 'list',
        limit: 10,
        details: false,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success === false) {
        const errorMessage = result.error.message;
        const isOmniFocusError = errorMessage.includes('OmniFocus') ||
                                 errorMessage.includes('not be available') ||
                                 errorMessage.includes('not running');
        expect(isOmniFocusError).toBe(true);
      } else {
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('items');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('from_cache');
      }
    }, 90000);
  });

  describe('Error Handling', () => {
    it('should handle invalid tool name', async () => {
      try {
        await client.callTool('invalid_tool', {});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Tool not found');
      }
    });

    it('should handle missing required parameters', async () => {
      const result = await client.callTool('manage_task', {
        operation: 'update',
        // Missing required taskId
        name: 'Updated name',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('taskId is required');
      expect(result.error.code).toBe('MISSING_PARAMETER');
    });
  });
});
```

**Step 2: Build to verify no errors**

```bash
npm run build
```

Expected: Successful compilation

**Step 3: Run the protocol test**

```bash
npx vitest tests/integration/mcp-protocol.test.ts --run
```

Expected: All tests pass (~15s)

**Step 4: Commit**

```bash
git add tests/integration/mcp-protocol.test.ts
git commit -m "test: add MCP protocol compliance integration tests"
```

---

## Task 5: Remove Old Test Files from Unit Directory

**Files:**
- Delete: `tests/unit/test-data-management.test.ts`
- Delete: `tests/unit/integration.test.ts`

**Step 1: Remove old test files**

```bash
git rm tests/unit/test-data-management.test.ts tests/unit/integration.test.ts
```

**Step 2: Verify unit tests still pass without integration tests**

```bash
npx vitest tests/unit --run
```

Expected: All unit tests pass (~15-20s), no integration tests run

**Step 3: Commit**

```bash
git add -A
git commit -m "test: remove old integration tests from unit directory"
```

---

## Task 6: Add NPM Test Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add test:unit and test:integration scripts**

In `package.json`, find the `scripts` section and add/modify:

```json
{
  "scripts": {
    "test:unit": "vitest tests/unit --run",
    "test:integration": "vitest tests/integration --run",
    "test": "npm run test:unit && npm run test:integration",
    "test:quick": "vitest tests/unit --run"
  }
}
```

**Step 2: Verify all test scripts work**

```bash
# Fast unit tests only
npm run test:unit
```

Expected: ~15-20 seconds, all unit tests pass

```bash
# Integration tests only
npm run test:integration
```

Expected: ~20-25 seconds, integration tests pass

```bash
# Complete test suite
npm test
```

Expected: ~35-40 seconds total (down from 93s!)

**Step 3: Commit**

```bash
git add package.json
git commit -m "test: add separate unit and integration test scripts"
```

---

## Task 7: Update Documentation

**Files:**
- Modify: `README.md` or relevant test documentation

**Step 1: Document the new test organization**

Add or update a Testing section in `README.md`:

```markdown
## Testing

The project uses Vitest with separate unit and integration test suites:

### Unit Tests (Fast - ~15-20s)
```bash
npm run test:unit
```

Fast tests with no external dependencies. Use for rapid development cycles.

### Integration Tests (Thorough - ~20-25s)
```bash
npm run test:integration
```

End-to-end tests that require OmniFocus running on macOS. Tests actual MCP protocol and data persistence.

- **Protocol Tests**: MCP server initialization, tool discovery, error handling
- **Data Lifecycle Tests**: Task/project CRUD operations, tag-based tracking, cleanup verification

**Environment Variables:**
- `DISABLE_INTEGRATION_TESTS=true` - Skip integration tests entirely

### Complete Test Suite (~35-40s)
```bash
npm test
```

Runs both unit and integration tests.
```

**Step 2: Commit documentation**

```bash
git add README.md
git commit -m "docs: document new test organization and scripts"
```

---

## Task 8: Verify Complete Test Suite Performance

**Step 1: Run complete test suite and measure time**

```bash
time npm test
```

Expected:
- Total time: 35-40 seconds (down from 93s)
- Unit tests: ~15-20s
- Integration tests: ~20-25s
- All tests passing

**Step 2: Verify integration tests use optimized cleanup**

Look for console output showing:
- "🧹 Thorough cleanup" appears 2 times (beforeAll + afterAll in data-lifecycle)
- "🧹 Quick cleanup" appears 6 times (afterEach for each test)
- Cleanup metrics showing operations count

**Step 3: Document results**

Create a summary comment or update CHANGELOG:

```markdown
### Test Performance Improvements

**Before optimization:** 93 seconds
- test-data-management.test.ts: 74.7s (redundant cleanup cycles)
- integration.test.ts: 15.7s
- Unit tests: ~15-20s

**After optimization:** ~35-40 seconds (58% faster)
- Unit tests: ~15-20s (unchanged)
- Integration tests: ~20-25s
  - mcp-protocol.test.ts: ~15s (protocol validation)
  - data-lifecycle.test.ts: ~5-10s (optimized cleanup strategy)

**Key improvements:**
- Extracted shared `MCPTestClient` helper
- Removed redundant `beforeEach` cleanup (24 → 2 full scans)
- Quick ID-based cleanup in `afterEach`
- Paranoid full scan only in `beforeAll`/`afterAll`
- Cache stays warm across all tests
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify 58% performance improvement (93s → 35-40s)"
```

---

## Summary

**Total Tasks:** 8
**Estimated Time:** 30-45 minutes
**Expected Speedup:** 58% faster (93s → 35-40s)

**Key Changes:**
1. ✅ Extracted `MCPTestClient` reusable helper
2. ✅ Split tests: protocol (fast) vs data lifecycle (thorough)
3. ✅ Optimized cleanup: quick (afterEach) vs thorough (beforeAll/afterAll)
4. ✅ Proper test organization: `tests/integration/` with helpers
5. ✅ Separate npm scripts for fast development vs thorough validation

**Testing Strategy:**
- `npm run test:unit` - Fast feedback loop for development
- `npm run test:integration` - Comprehensive confidence before commits
- `npm test` - Complete validation

**Cleanup Strategy (Paranoid Mode):**
- beforeAll: ONE thorough cleanup (clean slate)
- afterEach: Quick cleanup (delete tracked IDs only)
- afterAll: Thorough cleanup (tracked + full scan for safety)
