import { setWorldConstructor, After, Before, setDefaultTimeout } from '@cucumber/cucumber';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Set timeout for long-running operations
setDefaultTimeout(30 * 1000); // 30 seconds

class MCPWorld {
  constructor() {
    this.server = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.response = null;
    this.context = {}; // Store data between steps
  }

  async startServer() {
    if (this.server) return; // Already started

    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const rl = createInterface({
      input: this.server.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        this.handleResponse(response);
      } catch (e) {
        // Ignore non-JSON output
      }
    });

    this.server.stderr.on('data', (data) => {
      if (process.env.DEBUG) {
        console.error('Server stderr:', data.toString());
      }
    });

    // Initialize MCP connection
    const initRequest = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'cucumber-test',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await this.sendRequest(initRequest);
    
    if (!initResponse.result) {
      throw new Error('Failed to initialize MCP connection');
    }

    // Send initialized notification
    this.server.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');
    
    await this.delay(100);
  }

  async callTool(toolName, params = {}) {
    const startTime = Date.now();
    
    const request = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    const response = await this.sendRequest(request);
    
    // Record response time
    this.context.lastResponseTime = Date.now() - startTime;
    
    if (response.error) {
      throw new Error(`Tool error: ${response.error.message}`);
    }

    // Parse the tool response
    try {
      const content = response.result.content[0].text;
      return JSON.parse(content);
    } catch (e) {
      // Return raw response if not JSON
      return response.result;
    }
  }

  async sendRequest(request, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const requestId = request.id;
      
      this.pendingRequests.set(requestId, resolve);
      this.server.stdin.write(JSON.stringify(request) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  handleResponse(response) {
    if (response.id && this.pendingRequests.has(response.id)) {
      const resolver = this.pendingRequests.get(response.id);
      this.pendingRequests.delete(response.id);
      resolver(response);
    }
  }

  nextId() {
    return ++this.messageId;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    if (this.server && !this.server.killed) {
      this.server.kill();
      await this.delay(100);
    }
  }

  parseDataTable(dataTable) {
    const result = {};
    
    if (dataTable && dataTable.rawTable) {
      dataTable.rawTable.forEach(row => {
        const key = row[0];
        let value = row[1];
        
        // Parse JSON values
        if (value && value.startsWith('[') || value && value.startsWith('{')) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string if not valid JSON
          }
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (value && !isNaN(value)) {
          value = Number(value);
        }
        
        result[key] = value;
      });
    }
    
    return result;
  }
}

setWorldConstructor(MCPWorld);

// Before hook - start server once for all scenarios
Before(async function() {
  await this.startServer();
});

// After hook - cleanup after all tests
After(async function() {
  // Note: We keep the server running between scenarios for performance
  // Only cleanup at the very end (handled by process exit)
});

// Global cleanup on process exit
process.on('exit', () => {
  if (global.mcpServer) {
    global.mcpServer.kill();
  }
});

export { MCPWorld };