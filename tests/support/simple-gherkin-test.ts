#!/usr/bin/env node
/**
 * Simple Gherkin-style test for OmniFocus MCP
 * Tests basic scenarios in a readable format
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

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

interface Scenario {
  name: string;
  test: () => Promise<boolean>;
}

interface TestResults {
  passed: number;
  failed: number;
  total: number;
}

interface TaskResult {
  tasks: any[];
  count: number;
}

interface AgendaResult {
  overdue_count: number;
  flagged_count: number;
}

interface CreateTaskResult {
  success: boolean;
  taskId: string;
}

interface ProductivityStats {
  stats: {
    completedTasks: number;
    totalTasks: number;
    completionRate: number;
  };
}

interface TagsResult {
  tags: any[];
}

interface ExportResult {
  data: string;
}

interface TaskCountResult {
  from_cache: boolean;
  count: number;
}

class SimpleGherkinTest {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, (response: MCPResponse) => void> = new Map();

  async start(): Promise<void> {
    console.log('🥒 Simple Gherkin Tests for OmniFocus MCP\n');

    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl: Interface = createInterface({
      input: this.server.stdout!,
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      try {
        const response: MCPResponse = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const resolver = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          resolver(response);
        }
      } catch (e) {
        // Ignore non-JSON
      }
    });

    // Initialize
    const initResponse = await this.sendRequest({
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'gherkin-test', version: '1.0.0' },
      },
    });

    if (!initResponse.result) {
      throw new Error('Failed to initialize');
    }

    // Send initialized notification
    this.server.stdin!.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }) + '\n',
    );

    await this.delay(100);
  }

  async runScenarios(): Promise<TestResults> {
    const scenarios: Scenario[] = [
      {
        name: 'List incomplete tasks',
        test: async () => {
          console.log('GIVEN I have tasks in OmniFocus');
          console.log('WHEN I request incomplete tasks');
          const result = await this.callTool<TaskResult>('list_tasks', { completed: false, limit: 5 });
          console.log('THEN I should receive a list of incomplete tasks');
          console.log(`✅ Received ${result.tasks.length} tasks\n`);
          return result.tasks.length > 0;
        },
      },
      {
        name: "Get today's agenda",
        test: async () => {
          console.log('GIVEN tasks are due today or flagged');
          console.log("WHEN I request today's agenda");
          const result = await this.callTool<AgendaResult>('todays_agenda', {});
          console.log('THEN I should see overdue and flagged tasks');
          console.log(`✅ Found ${result.overdue_count} overdue, ${result.flagged_count} flagged\n`);
          return true;
        },
      },
      {
        name: 'Create a test task',
        test: async () => {
          console.log('GIVEN I want to create a new task');
          console.log('WHEN I create a task named "Gherkin Test Task"');
          const result = await this.callTool<CreateTaskResult>('create_task', {
            name: 'Gherkin Test Task - ' + new Date().toISOString(),
          });
          console.log('THEN the task should be created with an ID');
          console.log(`✅ Created task with ID: ${result.taskId}\n`);
          return result.success && !!result.taskId;
        },
      },
      {
        name: 'Get weekly productivity stats',
        test: async () => {
          console.log('GIVEN I have completed tasks this week');
          console.log('WHEN I request productivity stats for the week');
          const result = await this.callTool<ProductivityStats>('get_productivity_stats', {
            period: 'week',
            groupBy: 'project',
          });
          console.log('THEN I should see completion metrics');
          console.log(
            `✅ Stats: ${result.stats.completedTasks}/${result.stats.totalTasks} completed (${result.stats.completionRate}%)\n`,
          );
          return result.stats !== undefined;
        },
      },
      {
        name: 'List all tags',
        test: async () => {
          console.log('GIVEN I have tagged tasks');
          console.log('WHEN I list all tags');
          const result = await this.callTool<TagsResult>('list_tags', { sortBy: 'name' });
          console.log('THEN I should see tags with usage counts');
          console.log(`✅ Found ${result.tags.length} tags\n`);
          return result.tags.length > 0;
        },
      },
      {
        name: 'Search for specific tasks',
        test: async () => {
          console.log('GIVEN I have tasks with specific keywords');
          console.log('WHEN I search for "email"');
          const result = await this.callTool<TaskResult>('list_tasks', {
            search: 'email',
            limit: 5,
          });
          console.log('THEN I should only see tasks containing "email"');
          console.log(`✅ Found ${result.count} matching tasks\n`);
          return true;
        },
      },
      {
        name: 'Export flagged tasks as JSON',
        test: async () => {
          console.log('GIVEN I have flagged tasks');
          console.log('WHEN I export flagged tasks as JSON');
          const result = await this.callTool<ExportResult>('export_tasks', {
            format: 'json',
            filter: { flagged: true },
          });
          console.log('THEN I should receive JSON data');
          const tasks = JSON.parse(result.data);
          console.log(`✅ Exported ${tasks.length} flagged tasks\n`);
          return Array.isArray(tasks);
        },
      },
      {
        name: 'Test caching performance',
        test: async () => {
          console.log('GIVEN I make the same request twice');
          console.log('WHEN I count tasks (first call)');
          const start1 = Date.now();
          const result1 = await this.callTool<TaskCountResult>('get_task_count', { completed: false });
          const time1 = Date.now() - start1;

          console.log('AND WHEN I count tasks again (second call)');
          const start2 = Date.now();
          const result2 = await this.callTool<TaskCountResult>('get_task_count', { completed: false });
          const time2 = Date.now() - start2;

          console.log('THEN the second call should be cached and faster');
          console.log(`✅ First: ${time1}ms (from_cache: ${result1.from_cache})`);
          console.log(`✅ Second: ${time2}ms (from_cache: ${result2.from_cache})\n`);

          return result2.from_cache === true && time2 < time1;
        },
      },
    ];

    let passed = 0;
    let failed = 0;

    for (const scenario of scenarios) {
      console.log(`📋 Scenario: ${scenario.name}`);
      console.log('─'.repeat(50));

      try {
        const result = await scenario.test();
        if (result) {
          passed++;
        } else {
          failed++;
          console.log('❌ Test assertion failed\n');
        }
      } catch (error) {
        failed++;
        console.log(`❌ Error: ${(error as Error).message}\n`);
      }
    }

    return { passed, failed, total: scenarios.length };
  }

  async callTool<T = any>(name: string, args: any): Promise<T> {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: { name, arguments: args },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return JSON.parse(response.result.content[0].text);
  }

  sendRequest(request: MCPRequest): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const id = request.id!;
      this.pendingRequests.set(id, resolve);
      this.server!.stdin!.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  nextId(): number {
    return ++this.messageId;
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    if (this.server) {
      this.server.kill();
    }
  }
}

// Run tests
async function main(): Promise<void> {
  const tester = new SimpleGherkinTest();

  try {
    await tester.start();
    const results = await tester.runScenarios();

    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total scenarios: ${results.total}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`Success rate: ${Math.round((results.passed / results.total) * 100)}%`);

    await tester.cleanup();
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test runner error:', error);
    await tester.cleanup();
    process.exit(1);
  }
}

main();
