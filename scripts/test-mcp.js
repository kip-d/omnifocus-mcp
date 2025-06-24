#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const serverPath = process.argv[2] || './test-minimal-server.js';
console.log(`Testing MCP server: ${serverPath}`);

// Start the server
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Create readline interface for server stdout
const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

// Track responses
let initializeId = null;
let toolsListId = null;

// Handle server responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Server response:', JSON.stringify(response, null, 2));
    
    if (response.id === initializeId) {
      console.log('✅ Initialize response received!');
      // Now request tools list
      sendToolsList();
    } else if (response.id === toolsListId) {
      console.log('✅ Tools list received!');
      console.log('Test passed! Server is working correctly.');
      process.exit(0);
    }
  } catch (e) {
    console.log('Non-JSON output:', line);
  }
});

// Handle errors
server.stderr.on('data', (data) => {
  console.error('Server stderr:', data.toString());
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`Server exited with code ${code}`);
  if (code !== 0) {
    process.exit(1);
  }
});

// Send initialize request
function sendInitialize() {
  initializeId = 1;
  const request = {
    jsonrpc: '2.0',
    id: initializeId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  console.log('Sending initialize request...');
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Send tools list request
function sendToolsList() {
  toolsListId = 2;
  const request = {
    jsonrpc: '2.0',
    id: toolsListId,
    method: 'tools/list',
    params: {}
  };
  
  console.log('Sending tools/list request...');
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Start test after a short delay
setTimeout(() => {
  sendInitialize();
}, 100);

// Timeout after 5 seconds
setTimeout(() => {
  console.error('❌ Test timeout - server did not respond');
  server.kill();
  process.exit(1);
}, 5000);