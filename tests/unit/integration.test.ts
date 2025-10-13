import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

// Auto-enable server tests on macOS with OmniFocus (can be disabled with DISABLE_UNIT_SERVER=true)
const RUN_SERVER_TESTS = process.env.DISABLE_UNIT_SERVER !== 'true' && process.platform === 'darwin';
const d = RUN_SERVER_TESTS ? describe : describe.skip;

d('OmniFocus MCP Server Integration Tests', () => {
  let server: ChildProcess;
  let messageId = 1;

  beforeAll(async () => {
    // Start the server
    server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wait for server to initialize
    await sleep(1000);
  });

  afterAll(async () => {
    if (server) {
      // Graceful shutdown: close stdin to signal server to exit
      try {
        server.stdin?.end();
      } catch (e) {
        // Ignore errors
      }

      // Wait for graceful exit (server waits for pending operations)
      await new Promise<void>((resolve) => {
        const gracefulTimeout = setTimeout(() => {
          console.log('⚠️  Server did not exit gracefully, sending SIGTERM...');
          server.kill('SIGTERM');

          // Force kill after 2s if needed
          setTimeout(() => {
            if (!server.killed) {
              server.kill('SIGKILL');
            }
            resolve();
          }, 2000);
        }, 5000);

        server.once('exit', () => {
          clearTimeout(gracefulTimeout);
          resolve();
        });
      });
    }
  });

  const sendRequest = (method: string, params?: any, requestTimeout = 60000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        method,
        params: params || {},
        id: messageId++,
      };

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${requestTimeout}ms`));
      }, requestTimeout);

      const handleData = (data: Buffer) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                server.stdout?.off('data', handleData);
                
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
              }
            } catch (e) {
              // Not JSON, skip
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };

      server.stdout?.on('data', handleData);
      server.stdin?.write(JSON.stringify(request) + '\n');
    });
  };

  describe('Server Initialization', () => {
    it('should respond to initialize request', async () => {
      const result = await sendRequest('initialize', {
        protocolVersion: '0.1.0',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      });

      expect(result).toBeDefined();
      expect(result.protocolVersion).toBe('2025-06-18');
      expect(result.serverInfo.name).toBe('omnifocus-mcp-cached');
    });
  });

  describe('Tools Discovery', () => {
    it('should list all available tools after initialization', { timeout: 90000 }, async () => {
      // Since we initialize in the "Server Initialization" test above,
      // the server should already be initialized. Just call tools/list directly.
      const result = await sendRequest('tools/list');
      
      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(0);
      
      const toolNames = result.tools.map((t: any) => t.name);
      
      // V2 consolidated tools
      expect(toolNames).toContain('tasks');           // QueryTasksToolV2 - consolidated task queries
      expect(toolNames).toContain('projects');        // ProjectsToolV2 - all project operations
      
      // Task CRUD operations (consolidated into manage_task)
      expect(toolNames).toContain('manage_task');
      
      // Analytics tools
      expect(toolNames).toContain('productivity_stats');
      expect(toolNames).toContain('task_velocity');
      expect(toolNames).toContain('analyze_overdue');
      
      // Other consolidated tools
      expect(toolNames).toContain('tags');            // TagsToolV2
      expect(toolNames).toContain('system');          // SystemToolV2
      expect(toolNames).toContain('perspectives');    // PerspectivesToolV2
      
      // Export tools (consolidated)
      expect(toolNames).toContain('export');
    });
  });

  describe('Task Operations', () => {
    it('should handle tasks tool call', { timeout: 90000 }, async () => {
      // Server should already be initialized from previous tests
      const result = await sendRequest('tools/call', {
        name: 'tasks',
        arguments: {
          mode: 'all',
          limit: 10,
          details: false,
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      const first = result.content[0];
      const response = first.type === 'json' ? first.json : JSON.parse(first.text);
      expect(response).toHaveProperty('success');
      
      // Check for either success or OmniFocus not running error
      if (response.success === false) {
        expect(response.error.message).toContain('OmniFocus');
      } else {
        expect(response.success).toBe(true);
        expect(response).toHaveProperty('data');
        expect(response.data).toHaveProperty('tasks');  // v2 tool returns 'tasks' not 'items'
        expect(response).toHaveProperty('metadata');
        expect(response.metadata).toHaveProperty('from_cache');
      }
    });

    it('should handle task creation with validation', { timeout: 90000 }, async () => {
      // Server should already be initialized from previous tests
      const result = await sendRequest('tools/call', {
        name: 'manage_task',
        arguments: {
          operation: 'create',
          name: 'Test task from integration test',
          note: 'This is a test task',
          flagged: 'true',
          tags: ['test', 'integration', 'mcp-test'],
        },
      });

      expect(result).toBeDefined();
      {
        const first = result.content[0];
        var response = first.type === 'json' ? first.json : JSON.parse(first.text);
      }
      
      // Tags now work via evaluateJavascript bridge (v2.0.0-beta.1+)
      // The test may fail if OmniFocus is not running, which returns INTERNAL_ERROR
      if (response.error && response.error.code === 'INTERNAL_ERROR') {
        // OmniFocus not running or other script error
        expect(response.success).toBe(false);
        expect(response.error.message).toContain('OmniFocus');
      } else {
        // Tags should work successfully now
        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(response.data.task).toBeDefined();
        expect(response.data.task.taskId).toBeDefined();
        // Tags might be in the task object
        if (response.data.task.tags) {
          // Our tagging system automatically adds 'mcp-test' to all test data
          expect(response.data.task.tags).toContain('test');
          expect(response.data.task.tags).toContain('integration');
          expect(response.data.task.tags).toContain('mcp-test');
        }
      }
    });
  });

  describe('Project Operations', () => {
    it('should handle projects tool call', async () => {
      const result = await sendRequest('tools/call', {
        name: 'projects',
        arguments: {
          operation: 'list',
          limit: 10,
          details: false,
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      {
        const first = result.content[0];
        var response = first.type === 'json' ? first.json : JSON.parse(first.text);
      }
      expect(response).toHaveProperty('success');
      
      // Check for either success or OmniFocus not running error
      if (response.success === false) {
        // Check for specific error types
        const errorMessage = response.error.message;
        const isOmniFocusError = errorMessage.includes('OmniFocus') || 
                                 errorMessage.includes('not be available') ||
                                 errorMessage.includes('not running');
        expect(isOmniFocusError).toBe(true);
      } else {
        expect(response.success).toBe(true);
        expect(response).toHaveProperty('data');
        // V2 tools return 'items' for projects, V1 returns 'projects'
        expect(response.data).toHaveProperty('items');  // v2 tool returns 'projects' not 'items'
        expect(response).toHaveProperty('metadata');
        expect(response.metadata).toHaveProperty('from_cache');
      }
    }, 90000); // Reasonable timeout for M2 Ultra with pending operations
  });

  describe('Error Handling', () => {
    it('should handle invalid tool name', async () => {
      try {
        await sendRequest('tools/call', {
          name: 'invalid_tool',
          arguments: {},
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Tool not found');
      }
    });

    it('should handle missing required parameters', async () => {
      const result = await sendRequest('tools/call', {
        name: 'manage_task',
        arguments: {
          operation: 'update',
          // Missing required taskId
          name: 'Updated name',
        },
      });

      // ManageTaskTool should return an error response for missing required parameters
      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      {
        const first = result.content[0];
        var response = first.type === 'json' ? first.json : JSON.parse(first.text);
      }
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('taskId is required');
      expect(response.error.code).toBe('MISSING_PARAMETER');
    });
  });
});
