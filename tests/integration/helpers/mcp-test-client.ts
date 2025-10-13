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
