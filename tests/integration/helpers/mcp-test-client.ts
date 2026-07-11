import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from './sandbox-manager.js';
import { RUN_NAME_PREFIX, runScopedName, runScopedTag } from './run-id.js';
import { StdioJsonRpcTransport, DEFAULT_TIMEOUT_MS } from './stdio-jsonrpc-transport.js';

export const TESTING_TAG = `${TEST_TAG_PREFIX}mcp-test`;

/**
 * OMN-84: per-run sentinel tag attached to every fixture created via
 * `MCPTestClient.createTestTask()` / `createTestProject()`. Lets teardown
 * scope cleanup strictly to this process's artifacts.
 */
export const RUN_TAG = runScopedTag('mcp-run');

/**
 * Generate a unique session ID for this test run
 * Used to efficiently find and cleanup only THIS session's test data
 * Format: __test-mcp-session-TIMESTAMP-RANDOM (includes test tag prefix for sandbox compliance)
 */
function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${TEST_TAG_PREFIX}mcp-session-${timestamp}-${random}`;
}

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

export interface MCPTestClientOptions {
  /** Enable cache warming for realistic integration test behavior (default: false) */
  enableCacheWarming?: boolean;
}

export class MCPTestClient {
  private readonly transport: StdioJsonRpcTransport;
  private createdTaskIds: string[] = [];
  private createdProjectIds: string[] = [];
  private sessionId: string = generateSessionId(); // Unique session tag for efficient cleanup
  private options: MCPTestClientOptions;

  /** PID of the spawned server child process, once `startServer()` has run. */
  get pid(): number | undefined {
    return this.transport.child.pid;
  }

  private cleanupMetrics: CleanupMetrics = {
    startTime: 0,
    operations: 0,
    duration: 0,
    lastCleanup: 0,
  };

  constructor(options: MCPTestClientOptions = {}) {
    this.options = options;
    // The transport is constructed EAGERLY (spawn is deferred to startServer →
    // transport.start()) so pre-start calls like nextId() keep the old plain-
    // counter contract instead of throwing on a new precondition.
    //
    // Build environment variables.
    // OMN-77: OMNIFOCUS_MCP_DISABLE_FAILURE_LOG is intentional belt-and-suspenders, NOT
    // redundant with NODE_ENV=test — failure-log-gate.ts treats them as two independent
    // suppression paths. Keep both; do not "clean up" the explicit flag.
    // OMN-46: SANDBOX_GUARD_ENABLED='true' is REQUIRED for the in-server write guards
    // to fire (mutation-script-builder.ts isTestMode). Previously this was only set as
    // a side effect of importing sandbox-manager.ts in the parent process; the spawned
    // server child inherited it by accident if (and only if) the parent had already
    // imported sandbox-manager before the spawn. Tests that didn't import it could
    // silently bypass the guard and write to live DB. Explicit-set closes the bypass.
    const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'test',
      OMNIFOCUS_MCP_DISABLE_FAILURE_LOG: '1',
      SANDBOX_GUARD_ENABLED: 'true',
    };

    // Enable cache warming for integration tests that want realistic behavior
    if (this.options.enableCacheWarming) {
      env.ENABLE_CACHE_WARMING = 'true';
    }

    this.transport = new StdioJsonRpcTransport({
      serverPath: './dist/index.js',
      spawnOptions: { stdio: ['pipe', 'pipe', 'pipe'], env },
    });
  }

  async startServer(): Promise<void> {
    this.transport.start();

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
          version: '1.0.0',
        },
      },
    };

    const initResponse = await this.sendRequest(initRequest);

    if (!initResponse.result) {
      throw new Error('Failed to initialize MCP connection');
    }

    // Send initialized notification
    this.transport.sendNotification('notifications/initialized');

    await this.delay(100);
  }

  async sendRequest(request: MCPRequest, timeout: number = DEFAULT_TIMEOUT_MS): Promise<MCPResponse> {
    // Critical Issue #3: Request ID validation
    if (request.id === undefined) {
      throw new Error('Request must have an id for sendRequest');
    }
    // Pre-start sends still fail informatively: the transport rejects with
    // "server stdin not available" until start() has spawned the child.
    return this.transport.sendRequest(request as unknown as { id: number; [k: string]: unknown }, timeout);
  }

  nextId(): number {
    return this.transport.nextId();
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async callTool(toolName: string, params: any = {}): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
    };

    const response = await this.sendRequest(request);

    // Critical Issue #4: Preserve error details in thrown errors
    if (response.error) {
      const error: any = new Error(`Tool error: ${response.error.message}`);
      error.code = response.error.code;
      error.data = response.error.data;
      error.mcpError = response.error;
      throw error;
    }

    // Support both 'text' and 'json' content types from MCP
    try {
      const first = response.result?.content?.[0];
      if (!first || !first.type) return response.result;
      if (first.type === 'json') return first.json;
      if (first.type === 'text') return JSON.parse(first.text);
      return response.result;
    } catch {
      return response.result;
    }
  }

  async createTestTask(name: string, properties: any = {}): Promise<any> {
    // OMN-84: tags get the per-run sentinel (RUN_TAG) for runId-scoped
    // teardown. TESTING_TAG and sessionId stay for back-compat fast cleanup.
    // Prefix tags with __test- if not already prefixed.
    const rawTags = properties.tags || [];
    const prefixedTags = rawTags.map((t: string) => (t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`));
    const tags = [...prefixedTags, TESTING_TAG, this.sessionId, RUN_TAG];

    // OMN-84: ensure task name carries the per-run prefix __TEST__-<RUN_ID>-…
    // so concurrent or aborted runs don't collide on suffixes. Pre-existing
    // __TEST__ prefixes (without runId) are upgraded; fully-formed
    // RUN_NAME_PREFIX names are left alone.
    const taskName = name.startsWith(RUN_NAME_PREFIX)
      ? name
      : name.startsWith(TEST_INBOX_PREFIX)
        ? `${RUN_NAME_PREFIX}${name.slice(TEST_INBOX_PREFIX.length).replace(/^[\s-]+/, '')}`
        : runScopedName(name);

    const taskParams = {
      name: taskName,
      ...properties,
      tags: tags,
    };

    const result = await this.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: taskParams,
      },
    });
    if (result.success && result.data?.task?.taskId) {
      this.createdTaskIds.push(result.data.task.taskId);
    }
    return result;
  }

  async createTestProject(name: string, properties: any = {}): Promise<any> {
    // OMN-84: tags get the per-run sentinel (RUN_TAG) for runId-scoped
    // teardown. TESTING_TAG and sessionId stay for back-compat fast cleanup.
    // Prefix tags with __test- if not already prefixed.
    const rawTags = properties.tags || [];
    const prefixedTags = rawTags.map((t: string) => (t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`));
    const tags = [...prefixedTags, TESTING_TAG, this.sessionId, RUN_TAG];

    // OMN-84: project names carry __TEST__-<RUN_ID>-… so concurrent runs
    // can't collide on suffix. Pre-existing __TEST__ prefixes are upgraded.
    const projectName = name.startsWith(RUN_NAME_PREFIX)
      ? name
      : name.startsWith(TEST_INBOX_PREFIX)
        ? `${RUN_NAME_PREFIX}${name.slice(TEST_INBOX_PREFIX.length).replace(/^[\s-]+/, '')}`
        : runScopedName(name);

    const projectParams = {
      name: projectName,
      ...properties,
      tags: tags,
    };

    const result = await this.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'project',
        data: projectParams,
      },
    });
    if (result.success && result.data?.project?.project?.id) {
      this.createdProjectIds.push(result.data.project.project.id);
    }
    return result;
  }

  /**
   * Helper method to track task IDs from direct callTool('manage_task', ...) calls
   * Use this when you create tasks without using createTestTask()
   *
   * Example:
   *   const result = await client.callTool('manage_task', { operation: 'create', name: 'Test' });
   *   client.trackCreatedTaskId(result);
   *
   * This ensures the task will be cleaned up in afterEach/afterAll hooks.
   */
  trackCreatedTaskId(result: any): void {
    if (result?.success && result?.data?.task?.taskId) {
      this.createdTaskIds.push(result.data.task.taskId);
    }
  }

  /**
   * Helper method to track project IDs from direct callTool('projects', ...) calls
   * Use this when you create projects without using createTestProject()
   *
   * This ensures the project will be cleaned up in afterEach/afterAll hooks.
   */
  trackCreatedProjectId(result: any): void {
    if (result?.success && result?.data?.project?.project?.id) {
      this.createdProjectIds.push(result.data.project.project.id);
    }
  }

  async quickCleanup(): Promise<void> {
    // Quick cleanup: Delete only tracked IDs (no scan)
    // OPTIMIZATION: Use bulk_delete for all tasks/projects at once
    this.cleanupMetrics.startTime = Date.now();
    this.cleanupMetrics.operations = 0;

    console.log(
      `🧹 Quick cleanup: deleting ${this.createdTaskIds.length} tasks, ${this.createdProjectIds.length} projects`,
    );

    // Clean up created tasks using bulk_delete
    if (this.createdTaskIds.length > 0) {
      try {
        await this.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'task',
            ids: this.createdTaskIds,
          },
        });
        this.cleanupMetrics.operations += this.createdTaskIds.length;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not bulk delete tasks: ${message}`);
      }
    }

    // Clean up created projects using bulk_delete
    if (this.createdProjectIds.length > 0) {
      try {
        await this.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'project',
            ids: this.createdProjectIds,
          },
        });
        this.cleanupMetrics.operations += this.createdProjectIds.length;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not bulk delete projects: ${message}`);
      }
    }

    // Reset tracking arrays
    this.createdTaskIds = [];
    this.createdProjectIds = [];

    this.cleanupMetrics.duration = Date.now() - this.cleanupMetrics.startTime;
    this.cleanupMetrics.lastCleanup = Date.now();
    console.log(
      `  📊 Quick cleanup completed in ${this.cleanupMetrics.duration}ms (${this.cleanupMetrics.operations} operations)`,
    );
  }

  async thoroughCleanup(): Promise<void> {
    // Thorough cleanup: Delete tracked IDs (no session-based scan to avoid timeouts)
    // OPTIMIZATION: Use bulk_delete for all tasks/projects at once
    this.cleanupMetrics.startTime = Date.now();
    this.cleanupMetrics.operations = 0;

    console.log(`🧹 Thorough cleanup for session: ${this.sessionId}`);

    // Clean up created tasks using bulk_delete
    if (this.createdTaskIds.length > 0) {
      try {
        await this.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'task',
            ids: this.createdTaskIds,
          },
        });
        this.cleanupMetrics.operations += this.createdTaskIds.length;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not bulk delete tasks: ${message}`);
      }
    }

    // Clean up created projects using bulk_delete
    if (this.createdProjectIds.length > 0) {
      try {
        await this.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'project',
            ids: this.createdProjectIds,
          },
        });
        this.cleanupMetrics.operations += this.createdProjectIds.length;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not bulk delete projects: ${message}`);
      }
    }

    // Skip tag-based cleanup query entirely (OmniFocus tag queries can timeout with many tasks)
    // Trust the ID-based cleanup above - we track all created IDs and delete them directly
    // This eliminates the 60s+ timeout that happens with any tag-based query

    // Reset tracking arrays
    this.createdTaskIds = [];
    this.createdProjectIds = [];

    this.cleanupMetrics.duration = Date.now() - this.cleanupMetrics.startTime;
    this.cleanupMetrics.lastCleanup = Date.now();
    console.log(
      `  📊 Thorough cleanup completed in ${this.cleanupMetrics.duration}ms (${this.cleanupMetrics.operations} operations)`,
    );
  }

  async cleanup(): Promise<void> {
    // Convenience alias for quickCleanup (most common use case)
    // Called by afterEach() in tests
    await this.quickCleanup();
  }

  /**
   * Clear all cached data in the MCP server.
   * Use this between test files to prevent cache pollution.
   */
  async clearCache(): Promise<void> {
    try {
      await this.callTool('system', { operation: 'cache', cacheAction: 'clear' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠️  Could not clear cache: ${message}`);
    }
  }

  async stop(): Promise<void> {
    await this.transport.close({ graceful: true });
  }
}
