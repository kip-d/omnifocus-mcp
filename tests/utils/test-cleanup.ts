#!/usr/bin/env npx tsx

import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

/**
 * Utility for running MCP server tests with proper cleanup
 * Prevents hanging processes and ensures clean test exits
 */

export interface McpRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

export interface McpTestOptions {
  timeoutMs?: number;
  serverPath?: string;
  onResponse?: (response: any, requestId: number) => void;
  onComplete?: () => void;
}

export class McpTestRunner {
  private server: ChildProcess | null = null;
  private cleanupDone = false;
  private requestId = 1;
  private rl: any = null;

  constructor(private options: McpTestOptions = {}) {
    this.options.timeoutMs = options.timeoutMs || 10000;
    this.options.serverPath = options.serverPath || 'dist/index.js';
  }

  async start(): Promise<void> {
    console.log('Starting MCP server for testing...\n');

    this.server = spawn('node', [this.options.serverPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity,
    });

    // Handle responses
    this.rl.on('line', (line: string) => {
      try {
        const response = JSON.parse(line);
        console.log(`← Response for ${response.id}:`, JSON.stringify(response, null, 2));

        if (this.options.onResponse) {
          this.options.onResponse(response, response.id);
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    });

    // Setup cleanup handlers
    this.setupCleanup();
  }

  sendRequest(method: string, params: any = {}): void {
    if (!this.server) {
      throw new Error('Server not started');
    }

    const request: McpRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    console.log(`→ Sending: ${method}`);
    this.server.stdin?.write(JSON.stringify(request) + '\n');
  }

  async sendToolCall(toolName: string, args: any): Promise<void> {
    this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
  }

  private setupCleanup(): void {
    // Timeout cleanup
    setTimeout(() => {
      console.error('\n❌ Test timeout!');
      this.cleanup();
    }, this.options.timeoutMs);

    // Server error cleanup
    this.server?.on('error', (err) => {
      console.error('Server error:', err);
      this.cleanup();
    });

    // Unexpected server exit cleanup
    this.server?.on('exit', (code) => {
      if (!this.cleanupDone) {
        console.error(`Server exited unexpectedly with code ${code}`);
        process.exit(1);
      }
    });

    // Process signal cleanup
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  cleanup(): void {
    if (this.cleanupDone) return;
    this.cleanupDone = true;

    console.log('\n🧹 Cleaning up test server...');

    if (this.rl) {
      this.rl.close();
    }

    if (this.server) {
      this.server.stdin?.end();
      this.server.kill('SIGTERM');

      setTimeout(() => {
        if (this.server && !this.server.killed) {
          this.server.kill('SIGKILL');
        }
        if (this.options.onComplete) {
          this.options.onComplete();
        }
        process.exit(0);
      }, 1000);
    } else {
      if (this.options.onComplete) {
        this.options.onComplete();
      }
      process.exit(0);
    }
  }

  complete(): void {
    console.log('\n✅ All tests completed successfully!');
    this.cleanup();
  }
}

/**
 * Helper function for simple tool calls with automatic cleanup
 */
export async function testToolCall(toolName: string, args: any, options: McpTestOptions = {}): Promise<void> {
  const runner = new McpTestRunner({
    ...options,
    onResponse: (response, requestId) => {
      if (requestId === 2) {
        // After initialize
        runner.sendRequest('tools/list');
      } else if (requestId === 3) {
        // After tools list
        runner.sendToolCall(toolName, args);
      } else if (requestId === 4) {
        // After tool call
        runner.complete();
      }
    },
  });

  await runner.start();

  // Initialize the MCP protocol
  runner.sendRequest('initialize', {
    protocolVersion: '0.1.0',
    capabilities: {},
    clientInfo: {
      name: 'mcp-test-client',
      version: '1.0.0',
    },
  });
}
