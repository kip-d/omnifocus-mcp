import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedClient } from './helpers/shared-server.js';
import { MCPTestClient } from './helpers/mcp-test-client.js';

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
    await client.thoroughCleanup();  // Clean up any test data created
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
      expect(result.result.protocolVersion).toBe('2025-06-18');
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
      expect(result.result.tools.length).toBeGreaterThan(0);

      const toolNames = result.result.tools.map((t: any) => t.name);

      expect(toolNames).toContain('tasks');
      expect(toolNames).toContain('projects');
      expect(toolNames).toContain('manage_task');
      expect(toolNames).toContain('productivity_stats');
      expect(toolNames).toContain('task_velocity');
      expect(toolNames).toContain('analyze_overdue');
      expect(toolNames).toContain('tags');
      expect(toolNames).toContain('system');
      expect(toolNames).toContain('perspectives');
      expect(toolNames).toContain('export');
    });
  });

  describe('Task Operations', () => {
    it('should handle tasks tool call', { timeout: 90000 }, async () => {
      const result = await client.callTool('tasks', {
        mode: 'all',
        limit: 10,
        details: false,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success === false) {
        expect(result.error.message).toContain('OmniFocus');
      } else {
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('tasks');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('from_cache');
      }
    });

    it('should handle task creation with validation', { timeout: 90000 }, async () => {
      const result = await client.callTool('manage_task', {
        operation: 'create',
        name: 'Test task from protocol test',
        note: 'This is a test task',
        flagged: 'true',
        tags: ['test', 'integration', 'mcp-test'],
      });

      expect(result).toBeDefined();

      if (result.error && result.error.code === 'INTERNAL_ERROR') {
        expect(result.success).toBe(false);
        expect(result.error.message).toContain('OmniFocus');
      } else {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.task).toBeDefined();
        expect(result.data.task.taskId).toBeDefined();
        if (result.data.task.tags) {
          expect(result.data.task.tags).toContain('test');
          expect(result.data.task.tags).toContain('integration');
          expect(result.data.task.tags).toContain('mcp-test');
        }
      }
    });
  });

  describe('Project Operations', () => {
    it('should handle projects tool call', async () => {
      const result = await client.callTool('projects', {
        operation: 'list',
        limit: 10,
        details: false,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');

      if (result.success === false) {
        const errorMessage = result.error.message;
        const isOmniFocusError = errorMessage.includes('OmniFocus') ||
                                 errorMessage.includes('not be available') ||
                                 errorMessage.includes('not running');
        expect(isOmniFocusError).toBe(true);
      } else {
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('items');
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
      const result = await client.callTool('manage_task', {
        operation: 'update',
        // Missing required taskId
        name: 'Updated name',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('taskId is required');
      expect(result.error.code).toBe('MISSING_PARAMETER');
    });
  });
});
