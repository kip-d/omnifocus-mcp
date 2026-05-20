import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';
import { runScopedName, runScopedTag } from './helpers/run-id.js';
import { expectOk } from './helpers/expect-ok.js';

// Auto-enable on macOS with OmniFocus
const RUN_INTEGRATION_TESTS = process.env.DISABLE_INTEGRATION_TESTS !== 'true' && process.platform === 'darwin';
const d = RUN_INTEGRATION_TESTS ? describe : describe.skip;

d('MCP Protocol Compliance Tests', () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    // Get or create the shared server instance
    client = await getSharedClient();
  });

  afterAll(async () => {
    await client.thoroughCleanup(); // Clean up any test data created
    // Don't stop server - globalTeardown handles that
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
      // SDK version varies - just verify it's a valid MCP protocol version format
      expect(result.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
      expect(result.result.tools.length).toBe(4); // Unified API: 4 tools

      const toolNames = result.result.tools.map((t: any) => t.name);

      // Unified Builder API - 4 tools (3 unified + system)
      expect(toolNames).toContain('omnifocus_read');
      expect(toolNames).toContain('omnifocus_write');
      expect(toolNames).toContain('omnifocus_analyze');
      expect(toolNames).toContain('system');

      // Ensure ONLY these 4 tools exist
      expect(toolNames).toEqual(['omnifocus_read', 'omnifocus_write', 'omnifocus_analyze', 'system']);
    });
  });

  describe('Task Operations', () => {
    it('should handle tasks tool call', { timeout: 90000 }, async () => {
      const result = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          limit: 10,
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success === false) {
        expect(result.error.message).toContain('OmniFocus');
      } else {
        expectOk(result, 'list tasks');
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('tasks');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('from_cache');
      }
    });

    it('should handle task creation with validation', { timeout: 90000 }, async () => {
      const testTag = runScopedTag('test');
      const integrationTag = runScopedTag('integration');
      const mcpTestTag = runScopedTag('mcp-test');
      const result = await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'create',
          target: 'task',
          data: {
            name: runScopedName('Protocol_test_task'),
            note: 'This is a test task',
            flagged: true,
            tags: [testTag, integrationTag, mcpTestTag],
          },
        },
      });

      expect(result).toBeDefined();

      if (result.error && result.error.code === 'INTERNAL_ERROR') {
        expect(result.success).toBe(false);
        expect(result.error.message).toContain('OmniFocus');
      } else {
        expectOk(result, 'create task with tags');
        expect(result.data).toBeDefined();
        expect(result.data.task).toBeDefined();
        expect(result.data.task.taskId).toBeDefined();
        if (result.data.task.tags) {
          expect(result.data.task.tags).toContain(testTag);
          expect(result.data.task.tags).toContain(integrationTag);
          expect(result.data.task.tags).toContain(mcpTestTag);
        }
      }
    });
  });

  describe('Project Operations', () => {
    it('should handle projects tool call', async () => {
      const result = await client.callTool('omnifocus_read', {
        query: {
          type: 'projects',
          limit: 10,
        },
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success === false) {
        const errorMessage = result.error.message;
        const isOmniFocusError =
          errorMessage.includes('OmniFocus') ||
          errorMessage.includes('not be available') ||
          errorMessage.includes('not running');
        expect(isOmniFocusError).toBe(true);
      } else {
        expectOk(result, 'list projects');
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('projects'); // Entity-specific key
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
      const result = await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'update',
          target: 'task',
          // Missing required id
          id: '', // Invalid empty string
          changes: {
            name: 'Updated name',
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('taskId is required');
      expect(result.error.code).toBe('MISSING_PARAMETER');
    });
  });
});
