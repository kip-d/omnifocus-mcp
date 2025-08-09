import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

describe('OmniFocus MCP Server Integration Tests', () => {
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

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  const sendRequest = (method: string, params?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        method,
        params: params || {},
        id: messageId++,
      };

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 15000);

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
    it.skip('should list all available tools after initialization', { timeout: 20000 }, async () => {
      // Since we initialize in the "Server Initialization" test above,
      // the server should already be initialized. Just call tools/list directly.
      const result = await sendRequest('tools/list');
      
      expect(result).toBeDefined();
      expect(result.tools).toBeInstanceOf(Array);
      expect(result.tools.length).toBeGreaterThan(0);
      
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('list_tasks');
      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('update_task');
      expect(toolNames).toContain('complete_task');
      expect(toolNames).toContain('delete_task');
      expect(toolNames).toContain('list_projects');
      expect(toolNames).toContain('create_project');
    });
  });

  describe('Task Operations', () => {
    it('should handle list_tasks tool call', { timeout: 20000 }, async () => {
      // Server should already be initialized from previous tests
      const result = await sendRequest('tools/call', {
        name: 'list_tasks',
        arguments: {
          completed: false,
          limit: 10,
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      
      // Check for either success or OmniFocus not running error
      if (response.success === false) {
        expect(response.error.message).toContain('OmniFocus');
      } else {
        expect(response.success).toBe(true);
        expect(response).toHaveProperty('data');
        expect(response.data).toHaveProperty('items');
        expect(response).toHaveProperty('metadata');
        expect(response.metadata).toHaveProperty('from_cache');
      }
    });

    it('should handle task creation with validation', { timeout: 20000 }, async () => {
      // Server should already be initialized from previous tests
      const result = await sendRequest('tools/call', {
        name: 'create_task',
        arguments: {
          name: 'Test task from integration test',
          note: 'This is a test task',
          flagged: true,
          tags: ['test', 'integration'],
        },
      });

      expect(result).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      
      // Check for either success or OmniFocus not running error
      if (response.success === false) {
        expect(response.error.message).toContain('OmniFocus');
      } else {
        expect(response.success).toBe(true);
        expect(response.data).toHaveProperty('task');
        expect(response.data.task).toHaveProperty('taskId');
        expect(response.data.task).toHaveProperty('name');
      }
    });
  });

  describe('Project Operations', () => {
    it('should handle list_projects tool call', async () => {
      const result = await sendRequest('tools/call', {
        name: 'list_projects',
        arguments: {
          status: ['active'],
          limit: 10, // Limit to 10 projects for faster test execution
          includeStats: false, // Disable stats for faster execution
          // performanceMode defaults to 'lite' now, no need to specify
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeInstanceOf(Array);
      
      const response = JSON.parse(result.content[0].text);
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
        expect(response.data).toHaveProperty('items');
        expect(response).toHaveProperty('metadata');
        expect(response.metadata).toHaveProperty('from_cache');
      }
    }, 20000); // Increase timeout to 20 seconds for safety
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
      try {
        await sendRequest('tools/call', {
          name: 'update_task',
          arguments: {
            // Missing required taskId
            name: 'Updated name',
          },
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Invalid parameters');
        expect(error.message).toContain('taskId');
      }
    });
  });
});