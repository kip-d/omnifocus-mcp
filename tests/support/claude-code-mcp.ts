#!/usr/bin/env node
/**
 * Test script to verify that Claude Code can use our MCP server
 * This provides command-line testing without needing Claude Desktop
 *
 * OMN-234: composes `StdioJsonRpcTransport` (the shared spawn/id-correlation
 * core) instead of carrying its own `pendingRequests` copy. What stays HERE
 * (client-specific, not owned by the transport): the `NODE_ENV=test`-only
 * env (no sandbox guard vars), `protocolVersion: '2024-11-05'`, the
 * stderr/child `error` listeners, and non-graceful (`kill()`-style) cleanup.
 */

import type { spawn } from 'child_process';
import { StdioJsonRpcTransport } from '../integration/helpers/stdio-jsonrpc-transport.js';

console.log('Claude Code MCP Integration Test');
console.log('================================');

interface TestTool {
  name: string;
  args: any;
  description: string;
}

interface TestConfig {
  serverPath: string;
  testTools: TestTool[];
}

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

interface TestResult {
  tool: string;
  success: boolean;
  time: number;
  error?: any;
}

interface Tool {
  name: string;
  description?: string;
}

// Configuration for Claude Code MCP testing
const CONFIG: TestConfig = {
  serverPath: './dist/index.js',
  testTools: [
    {
      name: 'get_task_count',
      args: { completed: false },
      description: 'Count incomplete tasks',
    },
    {
      name: 'todays_agenda',
      args: { includeFlagged: true },
      description: "Get today's agenda",
    },
    {
      name: 'list_tags',
      args: { sortBy: 'usage' },
      description: 'List tags by usage',
    },
    {
      name: 'get_productivity_stats',
      args: { period: 'week' },
      description: 'Get weekly productivity stats',
    },
  ],
};

export interface MCPTesterOptions {
  /** Test seam only: substitute for `child_process.spawn`. See `StdioJsonRpcTransport`. */
  spawnFn?: typeof spawn;
}

export class MCPTester {
  private readonly transport: StdioJsonRpcTransport;
  private _testResults: TestResult[] = [];
  get testResults(): TestResult[] {
    return this._testResults;
  }

  constructor(options: MCPTesterOptions = {}) {
    this.transport = new StdioJsonRpcTransport({
      serverPath: CONFIG.serverPath,
      spawnOptions: { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'test' } },
      spawnFn: options.spawnFn,
    });
  }

  async start(): Promise<void> {
    console.log(`Starting MCP server: ${CONFIG.serverPath}`);

    this.transport.start();

    this.transport.child.stderr!.on('data', (data: Buffer) => {
      console.error('Server error:', data.toString());
    });

    this.transport.child.on('error', (error: Error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });

    // Give server time to start
    await this.delay(500);
  }

  async initialize(): Promise<boolean> {
    console.log('\n1. Initializing MCP connection...');

    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-code-test',
          version: '1.0.0',
        },
      },
    };

    const response = await this.sendRequest(initRequest);

    if (response.result) {
      console.log('✅ MCP initialization successful');
      console.log(`   Server: ${response.result.serverInfo.name} v${response.result.serverInfo.version}`);

      // Send initialized notification
      this.transport.sendNotification('notifications/initialized');

      return true;
    } else {
      console.error('❌ MCP initialization failed:', response.error);
      return false;
    }
  }

  async listTools(): Promise<Tool[]> {
    console.log('\n2. Requesting tools list...');

    const toolsRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/list',
      params: {},
    };

    const response = await this.sendRequest(toolsRequest);

    if (response.result) {
      const tools: Tool[] = response.result.tools;
      console.log(`✅ ${tools.length} tools available`);

      // List some key tools
      const keyTools = tools.filter((t) =>
        ['list_tasks', 'get_productivity_stats', 'list_tags', 'export_tasks'].includes(t.name),
      );

      console.log('   Key tools:', keyTools.map((t) => t.name).join(', '));

      return tools;
    } else {
      console.error('❌ Failed to get tools list:', response.error);
      return [];
    }
  }

  async testTools(): Promise<void> {
    console.log('\n3. Testing tool execution...');

    for (const test of CONFIG.testTools) {
      console.log(`\n   Testing: ${test.name} - ${test.description}`);

      const startTime = Date.now();
      const toolRequest: MCPRequest = {
        jsonrpc: '2.0',
        id: this.nextId(),
        method: 'tools/call',
        params: {
          name: test.name,
          arguments: test.args,
        },
      };

      const response = await this.sendRequest(toolRequest, 30000); // 30 second timeout
      const elapsed = Date.now() - startTime;

      if (response.result) {
        console.log(`   ✅ ${test.name} completed in ${elapsed}ms`);

        try {
          const content = response.result.content[0].text;
          const result = JSON.parse(content);

          // Show relevant info from the result
          if (result.count !== undefined) {
            console.log(`      Result: ${result.count} items`);
          } else if (result.tasks) {
            console.log(`      Result: ${result.tasks.length} tasks`);
          } else if (result.tags) {
            console.log(`      Result: ${result.tags.length} tags`);
          } else if (result.stats) {
            console.log(`      Result: productivity stats generated`);
          }

          this._testResults.push({ tool: test.name, success: true, time: elapsed });
        } catch {
          console.log(`      Raw result length: ${response.result.content[0].text.length} chars`);
          this._testResults.push({ tool: test.name, success: true, time: elapsed });
        }
      } else {
        console.error(`   ❌ ${test.name} failed:`, response.error);
        this._testResults.push({ tool: test.name, success: false, time: elapsed, error: response.error });
      }
    }
  }

  async sendRequest(request: MCPRequest, timeout: number = 10000): Promise<MCPResponse> {
    return this.transport.sendRequest(request as unknown as { id: number; [k: string]: unknown }, timeout);
  }

  nextId(): number {
    return this.transport.nextId();
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  printSummary(): void {
    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');

    const successful = this._testResults.filter((r) => r.success).length;
    const total = this._testResults.length;

    console.log(`Tools tested: ${total}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${total - successful}`);

    if (successful === total) {
      console.log('\n✅ All tests passed! The MCP server is working correctly.');
      console.log('   You can use this server with Claude Code by configuring it in your MCP settings.');
    } else {
      console.log('\n❌ Some tests failed. Check the output above for details.');
    }

    console.log('\nPerformance:');
    for (const result of this._testResults) {
      if (result.success) {
        console.log(`   ${result.tool}: ${result.time}ms`);
      } else {
        console.log(`   ${result.tool}: FAILED`);
      }
    }
  }

  async cleanup(): Promise<void> {
    await this.transport.close({ graceful: false });
  }
}

// Run the test
async function runTest(): Promise<void> {
  const tester = new MCPTester();

  try {
    await tester.start();

    const initialized = await tester.initialize();
    if (!initialized) {
      process.exit(1);
    }

    const tools = await tester.listTools();
    if (tools.length === 0) {
      process.exit(1);
    }

    await tester.testTools();
    tester.printSummary();

    await tester.cleanup();

    const successful = tester.testResults.filter((r) => r.success).length;
    process.exit(successful === tester.testResults.length ? 0 : 1);
  } catch (error) {
    console.error('Test failed:', error);
    await tester.cleanup();
    process.exit(1);
  }
}

// Only auto-run when executed directly (e.g. `npx tsx tests/support/claude-code-mcp.ts`),
// not when imported by a unit test.
if (import.meta.url === `file://${process.argv[1]}`) {
  void runTest();
}
