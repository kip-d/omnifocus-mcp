#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const serverPath = process.argv[2] || './dist/index.js';
console.log(`Testing Claude Desktop protocol with: ${serverPath}`);

// Start the server
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' }
});

// Create readline interface for server stdout
const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

// Track test state
let testsPassed = 0;
let testsFailed = 0;
let currentTest = '';
let initializeId = null;
let toolsListId = null;
let callToolId = null;
let initStartTime = null;

// Handle server responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log(`Response received for test "${currentTest}":`, JSON.stringify(response, null, 2));
    
    if (response.id === initializeId) {
      const initTime = Date.now() - initStartTime;
      console.log(`✅ Initialize response received in ${initTime}ms`);
      
      if (initTime > 60000) {
        console.error(`❌ Initialize took too long: ${initTime}ms`);
        testsFailed++;
      } else {
        testsPassed++;
      }
      
      // Send initialized notification
      sendInitializedNotification();
      
      // Now request tools list
      setTimeout(sendToolsList, 100);
    } else if (response.id === toolsListId) {
      console.log(`✅ Tools list received with ${response.result?.tools?.length || 0} tools`);
      
      if (response.result?.tools?.length === 22) {
        testsPassed++;
        // Try calling a tool
        setTimeout(sendCallTool, 100);
      } else {
        console.error(`❌ Expected 22 tools, got ${response.result?.tools?.length || 0}`);
        testsFailed++;
        finishTests();
      }
    } else if (response.id === callToolId) {
      console.log('✅ Tool call response received');
      testsPassed++;
      finishTests();
    }
  } catch (e) {
    // Ignore non-JSON output
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
  if (code !== 0 && testsPassed === 0) {
    console.error(`Server exited with code ${code}`);
    process.exit(1);
  }
});

// Test functions
function sendInitialize() {
  currentTest = 'Initialize';
  initializeId = 1;
  initStartTime = Date.now();
  
  const request = {
    jsonrpc: '2.0',
    id: initializeId,
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
  
  console.log(`\nSending initialize request (simulating Claude Desktop)...`);
  server.stdin.write(JSON.stringify(request) + '\n');
}

function sendInitializedNotification() {
  const notification = {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  };
  
  console.log('Sending initialized notification...');
  server.stdin.write(JSON.stringify(notification) + '\n');
}

function sendToolsList() {
  currentTest = 'Tools List';
  toolsListId = 2;
  
  const request = {
    jsonrpc: '2.0',
    id: toolsListId,
    method: 'tools/list',
    params: {}
  };
  
  console.log('\nSending tools/list request...');
  server.stdin.write(JSON.stringify(request) + '\n');
}

function sendCallTool() {
  currentTest = 'Call Tool';
  callToolId = 3;
  
  const request = {
    jsonrpc: '2.0',
    id: callToolId,
    method: 'tools/call',
    params: {
      name: 'get_task_count',
      arguments: {
        completed: false
      }
    }
  };
  
  console.log('\nSending tools/call request for get_task_count...');
  server.stdin.write(JSON.stringify(request) + '\n');
}

function finishTests() {
  console.log(`\n========================================`);
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log(`========================================`);
  
  if (testsFailed > 0) {
    console.error('\n❌ Claude Desktop protocol test FAILED');
    server.kill();
    process.exit(1);
  } else {
    console.log('\n✅ Claude Desktop protocol test PASSED');
    server.kill();
    process.exit(0);
  }
}

// Start test after a short delay
setTimeout(() => {
  console.log('Starting Claude Desktop protocol simulation...');
  sendInitialize();
}, 500);

// Timeout after 70 seconds (Claude Desktop timeout is 60 seconds)
setTimeout(() => {
  console.error('\n❌ Test timeout - server did not respond within 70 seconds');
  testsFailed++;
  finishTests();
}, 70000);