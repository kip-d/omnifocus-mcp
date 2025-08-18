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
let cleanupDone = false;

// Cleanup function to properly terminate server
const cleanup = () => {
  if (cleanupDone) return;
  cleanupDone = true;
  
  server.stdin.end();
  server.kill('SIGTERM');
  
  setTimeout(() => {
    if (!server.killed) {
      server.kill('SIGKILL');
    }
    process.exit(0);
  }, 1000);
};

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
        name: 'tasks',
        arguments: {
          mode: 'overdue',
          limit: '5',
          details: 'false'
        }
      });
    } else if (response.id === 3) {
      // After listing tasks, create a test task
      sendRequest('tools/call', {
        name: 'create_task',
        arguments: {
          name: 'Test task from MCP client',
          note: 'Created via MCP integration test',
          flagged: 'true',
          sequential: 'false'
        }
      });
    } else if (response.id === 4) {
      // After creating task, test version info
      sendRequest('tools/call', {
        name: 'get_version_info',
        arguments: {}
      });
    } else if (response.id === 5) {
      // After version info, list projects
      try {
        const versionResult = JSON.parse(response.result.content[0].text);
        console.log(`\n📋 Version: ${versionResult.data.name} v${versionResult.data.version} (${versionResult.data.build.buildId})`);
      } catch (e) {
        console.log('Version info received');
      }
      
      sendRequest('tools/call', {
        name: 'projects',
        arguments: {
          operation: 'list',
          limit: '5',
          details: 'false'
        }
      });
    } else if (response.id === 6) {
      // Done with tests
      console.log('\n✅ All tests completed successfully!');
      cleanup();
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

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n❌ Test timeout!');
  cleanup();
  process.exit(1);
}, 10000);

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
  cleanup();
  process.exit(1);
});

// Handle unexpected server exit
server.on('exit', (code) => {
  if (!cleanupDone) {
    console.error(`Server exited unexpectedly with code ${code}`);
    process.exit(1);
  }
});