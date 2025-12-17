/**
 * HTTP Test Client for MCP Streamable HTTP Transport
 *
 * This client communicates with the MCP server via HTTP transport instead of stdio.
 * Used for testing the HTTP transport functionality for remote access scenarios.
 */

import { spawn, ChildProcess } from 'child_process';
import { TEST_INBOX_PREFIX, TEST_TAG_PREFIX } from './sandbox-manager.js';

export const TESTING_TAG = `${TEST_TAG_PREFIX}http-test`;

/**
 * Generate a unique session ID for this test run
 */
function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${TEST_TAG_PREFIX}http-session-${timestamp}-${random}`;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface HTTPTestClientOptions {
  /** Port to run the HTTP server on (default: 3099) */
  port?: number;
  /** Host to bind to (default: 127.0.0.1) */
  host?: string;
  /** Authentication token (optional) */
  authToken?: string;
  /** Enable cache warming (default: false for faster tests) */
  enableCacheWarming?: boolean;
}

export class HTTPTestClient {
  private server: ChildProcess | null = null;
  private messageId: number = 0;
  private mcpSessionId: string | null = null;
  private initialized: boolean = false;
  private createdTaskIds: string[] = [];
  private createdProjectIds: string[] = [];
  private testSessionId: string = generateSessionId();
  private options: Required<Omit<HTTPTestClientOptions, 'authToken'>> & { authToken?: string };
  private baseUrl: string;

  constructor(options: HTTPTestClientOptions = {}) {
    this.options = {
      port: options.port ?? 3099,
      host: options.host ?? '127.0.0.1',
      authToken: options.authToken,
      enableCacheWarming: options.enableCacheWarming ?? false,
    };
    this.baseUrl = `http://${this.options.host}:${this.options.port}`;
  }

  /**
   * Check if the client has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Start the HTTP server
   */
  async startServer(): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test',
    };

    if (this.options.enableCacheWarming) {
      env.ENABLE_CACHE_WARMING = 'true';
    }

    if (this.options.authToken) {
      env.MCP_AUTH_TOKEN = this.options.authToken;
    }

    this.server = spawn(
      'node',
      ['./dist/index.js', '--http', '--port', String(this.options.port), '--host', this.options.host],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        detached: false,
      },
    );

    // Log server output for debugging
    this.server.stdout?.on('data', (data) => {
      const output = data.toString();
      if (process.env.DEBUG_HTTP_TESTS) {
        console.log('[HTTP Server stdout]', output);
      }
    });

    this.server.stderr?.on('data', (data) => {
      const output = data.toString();
      if (process.env.DEBUG_HTTP_TESTS) {
        console.error('[HTTP Server stderr]', output);
      }
    });

    // Wait for server to be ready
    await this.waitForServerReady();
  }

  /**
   * Poll the health endpoint until the server is ready
   */
  private async waitForServerReady(maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const pollIntervalMs = 500;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch(`${this.baseUrl}/health`, {
          headers: this.getAuthHeaders(), // Include auth headers if configured
        });
        if (response.ok) {
          return;
        }
        // If we get 401, server is up but auth failed - that's OK for this check
        if (response.status === 401) {
          return; // Server is ready, just needs auth
        }
      } catch {
        // Server not ready yet, continue polling
      }
      await this.delay(pollIntervalMs);
    }

    throw new Error(`HTTP server did not become ready within ${maxWaitMs}ms`);
  }

  /**
   * Check server health
   */
  async health(): Promise<{ status: string; version: string; sessions: number }> {
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get session statistics
   */
  async sessions(): Promise<{ activeSessions: number; sessionIds: string[] }> {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Sessions check failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send an MCP request via HTTP
   */
  async sendRequest(request: MCPRequest, timeout: number = 120000): Promise<MCPResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...this.getAuthHeaders(),
    };

    // Include session ID if we have one
    if (this.mcpSessionId) {
      headers['MCP-Session-Id'] = this.mcpSessionId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Extract session ID from response headers
      const sessionId = response.headers.get('MCP-Session-Id');
      if (sessionId) {
        this.mcpSessionId = sessionId;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      // Parse SSE response
      const text = await response.text();
      return this.parseSSEResponse(text);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Parse Server-Sent Events response to extract JSON-RPC response
   */
  private parseSSEResponse(text: string): MCPResponse {
    // SSE format: "event: message\ndata: {...}\n\n"
    const lines = text.split('\n');
    let jsonData = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        jsonData = line.substring(6);
        break;
      }
    }

    if (!jsonData) {
      // Maybe it's plain JSON (not SSE)
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Could not parse response: ${text}`);
      }
    }

    return JSON.parse(jsonData);
  }

  /**
   * Get authentication headers if auth token is configured
   */
  private getAuthHeaders(): Record<string, string> {
    if (this.options.authToken) {
      return { Authorization: `Bearer ${this.options.authToken}` };
    }
    return {};
  }

  /**
   * Get next message ID
   */
  nextId(): number {
    return ++this.messageId;
  }

  /**
   * Delay helper
   */
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Initialize MCP connection (idempotent - only initializes once per session)
   */
  async initialize(): Promise<MCPResponse> {
    // If already initialized with this session, return cached response
    if (this.initialized && this.mcpSessionId) {
      return {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'omnifocus-mcp-cached', version: '3.0.0' },
          capabilities: { tools: {}, prompts: {} },
        },
      };
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'http-test-client',
          version: '1.0.0',
        },
      },
    };

    const response = await this.sendRequest(request);

    // Mark as initialized
    this.initialized = true;

    // Send initialized notification (fire-and-forget, don't await response)
    try {
      await this.sendNotification({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
    } catch {
      // Notifications don't always get responses
    }

    return response;
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(request: MCPRequest): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...this.getAuthHeaders(),
    };

    if (this.mcpSessionId) {
      headers['MCP-Session-Id'] = this.mcpSessionId;
    }

    // Fire and forget - notifications don't expect responses
    fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    }).catch(() => {
      // Ignore errors for notifications
    });
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, params: unknown = {}): Promise<unknown> {
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

    if (response.error) {
      const error: Error & { code?: number; data?: unknown; mcpError?: unknown } = new Error(
        `Tool error: ${response.error.message}`,
      );
      error.code = response.error.code;
      error.data = response.error.data;
      error.mcpError = response.error;
      throw error;
    }

    // Parse result from MCP content format
    try {
      const result = response.result as { content?: Array<{ type: string; text?: string; json?: unknown }> };
      const first = result?.content?.[0];
      if (!first || !first.type) return response.result;
      if (first.type === 'json') return first.json;
      if (first.type === 'text' && first.text) return JSON.parse(first.text);
      return response.result;
    } catch {
      return response.result;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/list',
    };

    const response = await this.sendRequest(request);

    if (response.error) {
      throw new Error(`List tools error: ${response.error.message}`);
    }

    const result = response.result as { tools: Array<{ name: string; description: string }> };
    return result.tools;
  }

  /**
   * Create a test task (with automatic cleanup tracking)
   */
  async createTestTask(name: string, properties: Record<string, unknown> = {}): Promise<unknown> {
    const rawTags = (properties.tags as string[]) || [];
    const prefixedTags = rawTags.map((t: string) => (t.startsWith(TEST_TAG_PREFIX) ? t : `${TEST_TAG_PREFIX}${t}`));
    const tags = [...prefixedTags, TESTING_TAG, this.testSessionId];

    const taskName = name.startsWith(TEST_INBOX_PREFIX) ? name : `${TEST_INBOX_PREFIX} ${name}`;

    const taskParams = {
      name: taskName,
      ...properties,
      tags,
    };

    const result = (await this.callTool('omnifocus_write', {
      mutation: {
        operation: 'create',
        target: 'task',
        data: taskParams,
      },
    })) as { success: boolean; data?: { task?: { taskId?: string } } };

    if (result.success && result.data?.task?.taskId) {
      this.createdTaskIds.push(result.data.task.taskId);
    }

    return result;
  }

  /**
   * Clean up created test data
   */
  async cleanup(): Promise<void> {
    console.log(
      `🧹 HTTP client cleanup: ${this.createdTaskIds.length} tasks, ${this.createdProjectIds.length} projects`,
    );

    if (this.createdTaskIds.length > 0) {
      try {
        await this.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'task',
            ids: this.createdTaskIds,
          },
        });
      } catch (error) {
        console.log(`  ⚠️  Could not bulk delete tasks: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (this.createdProjectIds.length > 0) {
      try {
        await this.callTool('omnifocus_write', {
          mutation: {
            operation: 'bulk_delete',
            target: 'project',
            ids: this.createdProjectIds,
          },
        });
      } catch (error) {
        console.log(`  ⚠️  Could not bulk delete projects: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.createdTaskIds = [];
    this.createdProjectIds = [];
  }

  /**
   * Terminate MCP session via DELETE request
   */
  async terminateSession(): Promise<void> {
    if (!this.mcpSessionId) {
      return;
    }

    const headers: Record<string, string> = {
      'MCP-Session-Id': this.mcpSessionId,
      ...this.getAuthHeaders(),
    };

    try {
      await fetch(`${this.baseUrl}/mcp`, {
        method: 'DELETE',
        headers,
      });
    } catch {
      // Ignore errors during session termination
    }

    // Reset session state so next initialize creates a new session
    this.mcpSessionId = null;
    this.initialized = false;
  }

  /**
   * Reset session state (for testing purposes)
   * This allows creating a new session without terminating the old one
   */
  resetSession(): void {
    this.mcpSessionId = null;
    this.initialized = false;
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.server && !this.server.killed) {
      // Try graceful shutdown first
      this.server.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const forceKillTimeout = setTimeout(() => {
          if (this.server && !this.server.killed) {
            this.server.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (this.server) {
          this.server.once('exit', () => {
            clearTimeout(forceKillTimeout);
            resolve();
          });
        } else {
          clearTimeout(forceKillTimeout);
          resolve();
        }
      });

      this.server = null;
    }
  }

  /**
   * Get the base URL for direct HTTP requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the MCP session ID (if established)
   */
  getMcpSessionId(): string | null {
    return this.mcpSessionId;
  }
}
