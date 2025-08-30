import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

const TESTING_TAG = 'MCP testing 2357';

interface MCPRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class TestDataManager {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, (response: MCPResponse) => void> = new Map();
  private createdTaskIds: string[] = [];
  private createdProjectIds: string[] = [];

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
          name: 'test-data-manager',
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

    try {
      const content = response.result.content[0].text;
      return JSON.parse(content);
    } catch (e) {
      return response.result;
    }
  }

  async sendRequest(request: MCPRequest, timeout: number = 30000): Promise<MCPResponse> {
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

  async createTestTask(name: string, properties: any = {}): Promise<any> {
    const taskParams = {
      name: `${name} [${TESTING_TAG}]`,
      ...properties,
      tags: [...(properties.tags || []), TESTING_TAG]
    };
    
    const result = await this.callTool('create_task', taskParams);
    if (result.success && result.task?.id) {
      this.createdTaskIds.push(result.task.id);
    }
    return result;
  }

  async createTestProject(name: string, properties: any = {}): Promise<any> {
    // Note: create_project tool doesn't exist, using projects tool instead
    const projectParams = {
      operation: 'create',
      name: `${name} [${TESTING_TAG}]`,
      ...properties
    };
    
    const result = await this.callTool('projects', projectParams);
    if (result.success && result.project?.id) {
      this.createdProjectIds.push(result.project.id);
    }
    return result;
  }

  async cleanupTestData(): Promise<void> {
    console.log(`🧹 Cleaning up test data with tag: ${TESTING_TAG}`);
    
    // Clean up created tasks
    for (const taskId of this.createdTaskIds) {
      try {
        await this.callTool('delete_task', { id: taskId });
      } catch (e) {
        console.log(`  ⚠️  Could not delete task ${taskId}: ${e}`);
      }
    }
    
    // Clean up created projects
    for (const projectId of this.createdProjectIds) {
      try {
        await this.callTool('delete_project', { id: projectId });
      } catch (e) {
        console.log(`  ⚠️  Could not delete project ${projectId}: ${e}`);
      }
    }
    
    // Clean up any remaining test data by tag
    try {
      const tasks = await this.callTool('tasks', { 
        mode: 'list',
        filter: { tags: [TESTING_TAG] }
      });
      
      for (const task of tasks.tasks || []) {
        try {
          await this.callTool('delete_task', { id: task.id });
        } catch (e) {
          console.log(`  ⚠️  Could not delete task ${task.id}: ${e}`);
        }
      }
    } catch (e) {
      console.log(`  ⚠️  Could not clean up tasks by tag: ${e}`);
    }
    
    // Reset tracking arrays
    this.createdTaskIds = [];
    this.createdProjectIds = [];
  }

  async stop(): Promise<void> {
    if (this.server && !this.server.killed) {
      this.server.kill();
      await this.delay(100);
    }
  }
}

describe('Test Data Management', () => {
  let testManager: TestDataManager;

  beforeAll(async () => {
    testManager = new TestDataManager();
    await testManager.startServer();
  });

  afterAll(async () => {
    await testManager.cleanupTestData();
    await testManager.stop();
  });

  beforeEach(async () => {
    // Clean up any leftover test data before each test
    await testManager.cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await testManager.cleanupTestData();
  });

  it('should create and cleanup test tasks', async () => {
    // Create a test task
    const result = await testManager.createTestTask('Sample Test Task');
    
    expect(result.success).toBe(true);
    expect(result.task).toHaveProperty('id');
    expect(result.task.name).toContain(TESTING_TAG);
    
    // Verify the task exists
    const task = await testManager.callTool('tasks', { mode: 'get', id: result.task.id });
    expect(task.success).toBe(true);
    expect(task.task.id).toBe(result.task.id);
    
    // Verify it has the testing tag
    expect(task.task.tags).toContain(TESTING_TAG);
  });

  it('should create and cleanup test projects', async () => {
    // Create a test project
    const result = await testManager.createTestProject('Sample Test Project');
    
    expect(result.success).toBe(true);
    expect(result.project).toHaveProperty('id');
    expect(result.project.name).toContain(TESTING_TAG);
    
    // Verify the project exists
    const project = await testManager.callTool('projects', { mode: 'get', id: result.project.id });
    expect(project.success).toBe(true);
    expect(project.project.id).toBe(result.project.id);
  });

  it('should create tasks with custom properties', async () => {
    const result = await testManager.createTestTask('Custom Test Task', {
      flagged: true,
      note: 'This is a test note'
    });
    
    expect(result.success).toBe(true);
    expect(result.task.flagged).toBe(true);
    expect(result.task.note).toBe('This is a test note');
    expect(result.task.tags).toContain(TESTING_TAG);
  });

  it('should create tasks in test projects', async () => {
    // Create a test project first
    const projectResult = await testManager.createTestProject('Parent Test Project');
    expect(projectResult.success).toBe(true);
    
    // Create a task in the project
    const taskResult = await testManager.createTestTask('Test Task in Project', {
      projectId: projectResult.project.id
    });
    
    expect(taskResult.success).toBe(true);
    expect(taskResult.task.projectId).toBe(projectResult.project.id);
  });

  it('should find test data by tag', async () => {
    // Create multiple test tasks
    await testManager.createTestTask('Task 1');
    await testManager.createTestTask('Task 2');
    await testManager.createTestTask('Task 3');
    
    // Find all tasks with the testing tag
    const tasks = await testManager.callTool('tasks', {
      mode: 'list',
      filter: { tags: [TESTING_TAG] }
    });
    
    expect(tasks.tasks).toBeInstanceOf(Array);
    expect(tasks.tasks.length).toBeGreaterThanOrEqual(3);
    
    // Verify all found tasks have the testing tag
    for (const task of tasks.tasks) {
      expect(task.tags).toContain(TESTING_TAG);
    }
  });

  it('should cleanup all test data after tests', async () => {
    // Create some test data
    const taskResult = await testManager.createTestTask('Cleanup Test Task');
    const projectResult = await testManager.createTestProject('Cleanup Test Project');
    
    // Verify data was created
    expect(taskResult.success).toBe(true);
    expect(projectResult.success).toBe(true);
    
    // Verify data exists
    const tasks = await testManager.callTool('tasks', {
      mode: 'list',
      filter: { tags: [TESTING_TAG] }
    });
    expect(tasks.tasks.length).toBeGreaterThan(0);
    
    // Cleanup should happen automatically in afterEach
  });
});
