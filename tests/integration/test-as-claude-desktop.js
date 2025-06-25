#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

console.log('Testing OmniFocus MCP Server as Claude Desktop would...\n');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

let requestId = 1;

// Helper to send JSON-RPC request
const sendRequest = (method, params = {}) => {
  const request = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId++
  };
  
  console.log(`→ Sending: ${method}`);
  server.stdin.write(JSON.stringify(request) + '\n');
};

// Handle responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log(`← Response for ${response.id}:`, JSON.stringify(response, null, 2));
    
    // Process based on response
    if (response.id === 1) {
      // After initialize, list tools
      sendRequest('tools/list');
    } else if (response.id === 2) {
      // After listing tools, try to list tasks
      sendRequest('tools/call', {
        name: 'list_tasks',
        arguments: {
          completed: false,
          limit: 5
        }
      });
    } else if (response.id === 3) {
      // After listing tasks, create a test task
      sendRequest('tools/call', {
        name: 'create_task',
        arguments: {
          name: 'Test task from MCP client',
          note: 'Created via MCP integration test',
          flagged: true,
          tags: ['test']
        }
      });
    } else if (response.id === 4) {
      // After creating task, list projects
      sendRequest('tools/call', {
        name: 'list_projects',
        arguments: {
          status: ['active']
        }
      });
    } else if (response.id === 5) {
      // Done with tests
      console.log('\n✅ All tests completed successfully!');
      server.kill();
      process.exit(0);
    }
  } catch (e) {
    // Ignore non-JSON lines
  }
});

// Start with initialize
sendRequest('initialize', {
  protocolVersion: '0.1.0',
  capabilities: {},
  clientInfo: {
    name: 'mcp-test-client',
    version: '1.0.0'
  }
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout!');
  server.kill();
  process.exit(1);
}, 30000);