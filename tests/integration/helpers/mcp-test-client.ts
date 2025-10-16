import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

export const TESTING_TAG = 'mcp-test';

/**
 * Generate a unique session ID for this test run
 * Used to efficiently find and cleanup only THIS session's test data
 * Format: mcp-test-session-TIMESTAMP-RANDOM
 */
function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `mcp-test-session-${timestamp}-${random}`;
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

export class MCPTestClient {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, (response: MCPResponse) => void> = new Map();
  private createdTaskIds: string[] = [];
  private createdProjectIds: string[] = [];
  private sessionId: string = generateSessionId();  // Unique session tag for efficient cleanup

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

    // Critical Issue #2: Defensive checks for stdio pipes
    if (!this.server.stdout || !this.server.stdin) {
      throw new Error('Server process does not have required stdio pipes');
    }

    const rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line: string) => {
      try {
        const response: MCPResponse = JSON.parse(line);
        this.handleResponse(response);
      } catch (error: unknown) {
        // Critical Issue #1: Proper error typing
        // Ignore non-JSON output (logging lines, etc.)
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
    if (!this.server.stdin) {
      throw new Error('Server stdin not available for notifications');
    }
    this.server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    await this.delay(100);
  }

  async sendRequest(request: MCPRequest, timeout: number = 60000): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      // Critical Issue #3: Request ID validation
      if (request.id === undefined) {
        reject(new Error('Request must have an id for sendRequest'));
        return;
      }
      const requestId = request.id;

      // Critical Issue #2: Defensive checks for stdio pipes
      if (!this.server || !this.server.stdin) {
        reject(new Error('Server or server stdin not available'));
        return;
      }

      // Critical Issue #5: Store timeout handle for cleanup
      const cleanup = () => {
        this.pendingRequests.delete(requestId);
      };

      this.pendingRequests.set(requestId, resolve);
      this.server.stdin.write(JSON.stringify(request) + '\n');

      const timeoutHandle = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          cleanup();
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);

      // Ensure timeout is cleared on success
      const originalResolve = resolve;
      this.pendingRequests.set(requestId, (response: MCPResponse) => {
        clearTimeout(timeoutHandle);
        cleanup();
        originalResolve(response);
      });
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
    } catch (error: unknown) {
      // Critical Issue #1: Proper error typing
      return response.result;
    }
  }

  async createTestTask(name: string, properties: any = {}): Promise<any> {
    // Include both TESTING_TAG (for paranoid fallback cleanup) and SESSION_ID (for fast cleanup)
    const tags = [...(properties.tags || []), TESTING_TAG, this.sessionId];

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
    // Include both TESTING_TAG (for paranoid fallback cleanup) and SESSION_ID (for fast cleanup)
    const tags = [...(properties.tags || []), TESTING_TAG, this.sessionId];

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
      } catch (error: unknown) {
        // Critical Issue #1: Proper error typing
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not delete task ${taskId}: ${message}`);
      }
    }

    // Clean up created projects
    for (const projectId of this.createdProjectIds) {
      try {
        await this.callTool('projects', { operation: 'delete', projectId: projectId });
        this.cleanupMetrics.operations++;
      } catch (error: unknown) {
        // Critical Issue #1: Proper error typing
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not delete project ${projectId}: ${message}`);
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
    // Thorough cleanup: Delete tracked IDs + efficient session-based scan
    this.cleanupMetrics.startTime = Date.now();
    this.cleanupMetrics.operations = 0;

    console.log(`🧹 Thorough cleanup for session: ${this.sessionId}`);

    // Clean up created tasks
    for (const taskId of this.createdTaskIds) {
      try {
        await this.callTool('manage_task', { operation: 'delete', taskId: taskId });
        this.cleanupMetrics.operations++;
      } catch (error: unknown) {
        // Critical Issue #1: Proper error typing
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not delete task ${taskId}: ${message}`);
      }
    }

    // Clean up created projects
    for (const projectId of this.createdProjectIds) {
      try {
        await this.callTool('projects', { operation: 'delete', projectId: projectId });
        this.cleanupMetrics.operations++;
      } catch (error: unknown) {
        // Critical Issue #1: Proper error typing
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Could not delete project ${projectId}: ${message}`);
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
    console.log(`  📊 Thorough cleanup completed in ${this.cleanupMetrics.duration}ms (${this.cleanupMetrics.operations} operations)`);
  }

  async stop(): Promise<void> {
    if (this.server && !this.server.killed) {
      try {
        this.server.stdin?.end();
      } catch (error: unknown) {
        // Critical Issue #1: Proper error typing
        // Ignore errors during stdin close
      }

      await new Promise<void>((resolve) => {
        const gracefulTimeout = setTimeout(() => {
          console.log('⚠️  Server did not exit gracefully, sending SIGTERM...');
          if (this.server && !this.server.killed) {
            this.server.kill('SIGTERM');

            setTimeout(() => {
              if (this.server && !this.server.killed) {
                this.server.kill('SIGKILL');
              }
              resolve();
            }, 2000);
          } else {
            resolve();
          }
        }, 5000);

        if (this.server) {
          this.server.once('exit', () => {
            clearTimeout(gracefulTimeout);
            resolve();
          });
        } else {
          clearTimeout(gracefulTimeout);
          resolve();
        }
      });
    }
  }
}
