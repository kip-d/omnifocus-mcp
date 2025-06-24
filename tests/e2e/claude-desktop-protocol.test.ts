import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

describe('Claude Desktop MCP Protocol E2E', () => {
  let server: ChildProcess;
  let responsePromise: Promise<any>;
  let responseResolver: (value: any) => void;

  beforeEach(() => {
    // Reset response promise for each test
    responsePromise = new Promise((resolve) => {
      responseResolver = resolve;
    });
  });

  afterEach(() => {
    if (server && !server.killed) {
      server.kill();
    }
  });

  const startServer = (serverPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      const rl = createInterface({
        input: server.stdout!,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          responseResolver(response);
        } catch (e) {
          // Ignore non-JSON output
        }
      });

      server.stderr!.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      server.on('error', (error) => {
        reject(error);
      });

      // Give server 100ms to start
      setTimeout(resolve, 100);
    });
  };

  const sendRequest = (request: any): void => {
    server.stdin!.write(JSON.stringify(request) + '\n');
  };

  it('should respond to initialize request within 60 seconds', async () => {
    await startServer('./dist/index.js');

    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-desktop',
          version: '0.7.6'
        }
      }
    };

    // Send initialize request
    sendRequest(initRequest);

    // Wait for response with timeout
    const response = await Promise.race([
      responsePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Initialize timeout after 60 seconds')), 60000)
      )
    ]);

    // Verify response structure
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 1);
    expect(response).toHaveProperty('result');
    expect(response.result).toHaveProperty('protocolVersion', '2024-11-05');
    expect(response.result).toHaveProperty('capabilities');
    expect(response.result).toHaveProperty('serverInfo');
    expect(response.result.serverInfo).toHaveProperty('name', 'omnifocus-mcp-cached');
  }, 65000); // 65 second test timeout

  it('should handle notifications after initialization', async () => {
    await startServer('./dist/index.js');

    // First initialize
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-desktop',
          version: '0.7.6'
        }
      }
    };

    sendRequest(initRequest);
    await responsePromise;

    // Send initialized notification (no response expected)
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    sendRequest(initializedNotification);

    // Then request tools list
    responsePromise = new Promise((resolve) => {
      responseResolver = resolve;
    });

    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    sendRequest(toolsRequest);
    const toolsResponse = await responsePromise;

    expect(toolsResponse).toHaveProperty('result');
    expect(toolsResponse.result).toHaveProperty('tools');
    expect(Array.isArray(toolsResponse.result.tools)).toBe(true);
    expect(toolsResponse.result.tools.length).toBe(22); // We have 22 tools
  });

  it('should complete full initialization sequence quickly', async () => {
    const startTime = Date.now();
    await startServer('./dist/index.js');

    // Initialize
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-desktop',
          version: '0.7.6'
        }
      }
    };

    sendRequest(initRequest);
    const initResponse = await responsePromise;
    const initTime = Date.now() - startTime;

    expect(initTime).toBeLessThan(5000); // Should initialize in less than 5 seconds
    expect(initResponse.result).toBeDefined();

    // Send initialized notification
    sendRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    // Request tools
    responsePromise = new Promise((resolve) => {
      responseResolver = resolve;
    });

    sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });

    const toolsResponse = await responsePromise;
    const totalTime = Date.now() - startTime;

    expect(totalTime).toBeLessThan(10000); // Full sequence in less than 10 seconds
    expect(toolsResponse.result.tools).toHaveLength(22);
  });

  it('should handle tool execution after initialization', async () => {
    await startServer('./dist/index.js');

    // Initialize first
    sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-desktop',
          version: '0.7.6'
        }
      }
    });

    await responsePromise;

    // Send initialized notification
    sendRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    // Now try to execute a tool
    responsePromise = new Promise((resolve) => {
      responseResolver = resolve;
    });

    const toolRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_task_count',
        arguments: {
          completed: false
        }
      }
    };

    sendRequest(toolRequest);
    const toolResponse = await responsePromise;

    expect(toolResponse).toHaveProperty('result');
    expect(toolResponse.result).toHaveProperty('content');
    expect(Array.isArray(toolResponse.result.content)).toBe(true);
  });
});