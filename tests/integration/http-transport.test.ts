/**
 * HTTP Transport Integration Tests
 *
 * Tests the MCP Streamable HTTP transport for remote access scenarios.
 * This is the foundation for Windows -> Mac remote OmniFocus access.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { HTTPTestClient } from './helpers/http-test-client.js';
import { TEST_INBOX_PREFIX } from './helpers/sandbox-manager.js';

// Auto-enable on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('HTTP Transport Integration Tests', () => {
  let client: HTTPTestClient;

  beforeAll(async () => {
    console.log('🚀 Starting HTTP transport test server...');
    client = new HTTPTestClient({
      port: 3099,
      host: '127.0.0.1',
      enableCacheWarming: false, // Faster test startup
    });
    await client.startServer();
    // Initialize once for all tests in this suite
    await client.initialize();
    console.log('✅ HTTP server ready and initialized');
  }, 60000); // 60s timeout for server startup

  afterAll(async () => {
    console.log('🧹 Shutting down HTTP test server...');
    await client.cleanup();
    await client.stop();
    console.log('✅ HTTP server shutdown complete');
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      const health = await client.health();

      expect(health).toHaveProperty('status', 'ok');
      expect(health).toHaveProperty('version');
      expect(health).toHaveProperty('sessions');
      expect(typeof health.sessions).toBe('number');
    });
  });

  describe('Sessions Endpoint', () => {
    it('should return session statistics', async () => {
      const sessions = await client.sessions();

      expect(sessions).toHaveProperty('activeSessions');
      expect(sessions).toHaveProperty('sessionIds');
      expect(Array.isArray(sessions.sessionIds)).toBe(true);
    });
  });

  describe('MCP Protocol over HTTP', () => {
    it('should have initialized MCP connection', async () => {
      // Session was initialized in beforeAll
      expect(client.isInitialized()).toBe(true);
      expect(client.getMcpSessionId()).toBeTruthy();
    });

    it('should maintain session across requests', async () => {
      const firstSessionId = client.getMcpSessionId();
      expect(firstSessionId).toBeTruthy();

      // Subsequent request should use same session
      const tools = await client.listTools();
      const secondSessionId = client.getMcpSessionId();

      expect(secondSessionId).toBe(firstSessionId);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Tools Discovery over HTTP', () => {
    it('should list all available tools', async () => {
      const tools = await client.listTools();

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBe(4); // Unified API: 4 tools

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('omnifocus_read');
      expect(toolNames).toContain('omnifocus_write');
      expect(toolNames).toContain('omnifocus_analyze');
      expect(toolNames).toContain('system');
    });
  });

  describe('Tool Execution over HTTP', () => {
    afterEach(async () => {
      await client.cleanup();
    });

    it('should execute system tool', async () => {
      const result = (await client.callTool('system', {
        operation: 'version',
      })) as { success: boolean; data: { version: string } };

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('version');
    });

    it('should query tasks via omnifocus_read', { timeout: 90000 }, async () => {
      const result = (await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          limit: 5,
        },
      })) as { success: boolean; data: { tasks: unknown[] } };

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('tasks');
      expect(Array.isArray(result.data.tasks)).toBe(true);
    });

    it('should create a task successfully', { timeout: 90000 }, async () => {
      // Create a test task
      const createResult = (await client.createTestTask('HTTP Transport Test Task')) as {
        success: boolean;
        data: { task: { taskId: string; name: string } };
      };

      expect(createResult.success).toBe(true);
      expect(createResult.data.task.taskId).toBeTruthy();
      expect(createResult.data.task.name).toContain('HTTP Transport Test Task');
    });

    it('should run analytics via omnifocus_analyze', { timeout: 90000 }, async () => {
      const result = (await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'productivity_stats',
        },
      })) as { success: boolean; data: unknown };

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
    });
  });

  describe('Error Handling over HTTP', () => {
    it('should handle invalid tool name gracefully', async () => {
      await expect(client.callTool('nonexistent_tool', {})).rejects.toThrow();
    });

    it('should handle invalid tool arguments gracefully', async () => {
      await expect(
        client.callTool('omnifocus_read', {
          query: {
            type: 'invalid_type',
          },
        }),
      ).rejects.toThrow();
    });
  });
});

d('HTTP Transport Authentication Tests', () => {
  const AUTH_TOKEN = 'test-secret-token-12345';
  const AUTH_PORT = 3088; // Use different port to avoid conflicts
  let authClient: HTTPTestClient;

  beforeAll(async () => {
    // Wait a moment to ensure previous server is fully released
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('🚀 Starting authenticated HTTP test server...');
    authClient = new HTTPTestClient({
      port: AUTH_PORT,
      host: '127.0.0.1',
      authToken: AUTH_TOKEN,
      enableCacheWarming: false,
    });
    await authClient.startServer();
    console.log('✅ Authenticated HTTP server ready');
  }, 90000); // Longer timeout

  afterAll(async () => {
    console.log('🧹 Shutting down authenticated HTTP test server...');
    await authClient.cleanup();
    await authClient.stop();
    console.log('✅ Authenticated HTTP server shutdown complete');
  });

  it('should accept requests with valid auth token', async () => {
    const health = await authClient.health();
    expect(health.status).toBe('ok');
  });

  it('should reject requests without auth token', async () => {
    // Make request without auth token to the authenticated server
    const response = await fetch(`http://127.0.0.1:${AUTH_PORT}/health`);
    expect(response.status).toBe(401);
  });

  it('should reject requests with invalid auth token', async () => {
    const response = await fetch(`http://127.0.0.1:${AUTH_PORT}/health`, {
      headers: {
        Authorization: 'Bearer wrong-token',
      },
    });
    expect(response.status).toBe(401);
  });

  it('should work with valid token for MCP operations', async () => {
    await authClient.initialize();
    const tools = await authClient.listTools();
    expect(tools.length).toBe(4);
  });
});

d('HTTP Transport Concurrent Sessions', () => {
  const CONCURRENT_PORT = 3087; // Use different port to avoid conflicts
  let serverClient: HTTPTestClient;
  let client1: HTTPTestClient;
  let client2: HTTPTestClient;

  beforeAll(async () => {
    // Wait a moment to ensure previous server is fully released
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('🚀 Starting HTTP server for concurrent session tests...');
    // Start a server using the first client
    serverClient = new HTTPTestClient({
      port: CONCURRENT_PORT,
      host: '127.0.0.1',
      enableCacheWarming: false,
    });
    await serverClient.startServer();

    // Create two additional clients that connect to the same server
    client1 = new HTTPTestClient({
      port: CONCURRENT_PORT,
      host: '127.0.0.1',
      enableCacheWarming: false,
    });
    client2 = new HTTPTestClient({
      port: CONCURRENT_PORT,
      host: '127.0.0.1',
      enableCacheWarming: false,
    });

    console.log('✅ Concurrent sessions test server ready');
  }, 60000);

  afterAll(async () => {
    console.log('🧹 Shutting down concurrent sessions test server...');
    await client1.cleanup();
    await client2.cleanup();
    await serverClient.stop();
    console.log('✅ Concurrent sessions server shutdown complete');
  });

  it('should handle two concurrent sessions', async () => {
    // Initialize both clients (they'll get different sessions)
    await client1.initialize();
    await client2.initialize();

    const session1 = client1.getMcpSessionId();
    const session2 = client2.getMcpSessionId();

    // Sessions should be different
    expect(session1).toBeTruthy();
    expect(session2).toBeTruthy();
    expect(session1).not.toBe(session2);

    // Both should be able to list tools
    const [tools1, tools2] = await Promise.all([client1.listTools(), client2.listTools()]);

    expect(tools1.length).toBe(4);
    expect(tools2.length).toBe(4);
  });

  it('should track sessions correctly', async () => {
    // Sessions should already be initialized from previous test
    // Server should show at least 2 active sessions
    const sessions = await client1.sessions();
    expect(sessions.activeSessions).toBeGreaterThanOrEqual(2);
  });
});
