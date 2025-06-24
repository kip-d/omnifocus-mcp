import { setWorldConstructor, After, Before, setDefaultTimeout, World } from '@cucumber/cucumber';
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

// Set timeout for long-running operations
setDefaultTimeout(30 * 1000); // 30 seconds

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

interface Context {
  lastResponseTime?: number;
  taskId?: string;
  project?: any;
  createdTaskId?: string;
  [key: string]: any;
}

interface DataTable {
  rawTable: Array<[string, string]>;
}

// Extend global to store server reference
declare global {
  var mcpServer: ChildProcess | undefined;
}

class MCPWorld extends World {
  server: ChildProcess | null = null;
  messageId: number = 0;
  pendingRequests: Map<number, (response: MCPResponse) => void> = new Map();
  response: any = null;
  context: Context = {}; // Store data between steps

  async startServer(): Promise<void> {
    if (this.server) return; // Already started

    this.server = spawn('node', ['./dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const rl: Interface = createInterface({
      input: this.server.stdout!,
      crlfDelay: Infinity
    });

    rl.on('line', (line: string) => {
      try {
        const response: MCPResponse = JSON.parse(line);
        this.handleResponse(response);
      } catch (e) {
        // Ignore non-JSON output
      }
    });

    this.server.stderr!.on('data', (data: Buffer) => {
      if (process.env.DEBUG) {
        console.error('Server stderr:', data.toString());
      }
    });

    // Initialize MCP connection
    const initRequest: MCPRequest = {
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
    this.server.stdin!.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');
    
    await this.delay(100);
  }

  async callTool(toolName: string, params: any = {}): Promise<any> {
    const startTime = Date.now();
    
    const request: MCPRequest = {
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

  async sendRequest(request: MCPRequest, timeout: number = 30000): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const requestId = request.id!;
      
      this.pendingRequests.set(requestId, resolve);
      this.server!.stdin!.write(JSON.stringify(request) + '\n');
      
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  handleResponse(response: MCPResponse): void {
    if (response.id && this.pendingRequests.has(response.id)) {
      const resolver = this.pendingRequests.get(response.id)!;
      this.pendingRequests.delete(response.id);
      resolver(response);
    }
  }

  nextId(): number {
    return ++this.messageId;
  }

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    if (this.server && !this.server.killed) {
      this.server.kill();
      await this.delay(100);
    }
  }

  parseDataTable(dataTable: DataTable | undefined): any {
    const result: any = {};
    
    if (dataTable && dataTable.rawTable) {
      dataTable.rawTable.forEach(row => {
        const key = row[0];
        let value: any = row[1];
        
        // Parse JSON values
        if (value && (value.startsWith('[') || value.startsWith('{'))) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string if not valid JSON
          }
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (value && !isNaN(value as any)) {
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
Before(async function(this: MCPWorld) {
  await this.startServer();
});

// After hook - cleanup after all tests
After(async function(this: MCPWorld) {
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