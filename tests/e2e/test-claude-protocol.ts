#!/usr/bin/env node
import { spawn, ChildProcess } from 'child_process';
import { createInterface, Interface } from 'readline';

const serverPath = process.argv[2] || './dist/index.js';
console.log(`Testing Claude Desktop protocol with: ${serverPath}`);

// Start the server
const server: ChildProcess = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' }
});

// Create readline interface for server stdout
const rl: Interface = createInterface({
  input: server.stdout!,
  crlfDelay: Infinity
});

// Track test state
let testsPassed = 0;
let testsFailed = 0;
let currentTest = '';
let initializeId: number | null = null;
let toolsListId: number | null = null;
let callToolId: number | null = null;
let initStartTime: number | null = null;

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

// Handle server responses
rl.on('line', (line: string) => {
  try {
    const response: MCPResponse = JSON.parse(line);
    console.log(`Response received for test "${currentTest}":`, JSON.stringify(response, null, 2));
    
    if (response.id === initializeId) {
      const initTime = Date.now() - initStartTime!;
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
server.stderr!.on('data', (data: Buffer) => {
  console.error('Server stderr:', data.toString());
});

server.on('error', (error: Error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('close', (code: number | null) => {
  if (code !== 0 && testsPassed === 0) {
    console.error(`Server exited with code ${code}`);
    process.exit(1);
  }
});

// Test functions
function sendInitialize(): void {
  currentTest = 'Initialize';
  initializeId = 1;
  initStartTime = Date.now();
  
  const request = {
    jsonrpc: '2.0' as const,
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
  server.stdin!.write(JSON.stringify(request) + '\n');
}

function sendInitializedNotification(): void {
  const notification = {
    jsonrpc: '2.0' as const,
    method: 'notifications/initialized'
  };
  
  console.log('Sending initialized notification...');
  server.stdin!.write(JSON.stringify(notification) + '\n');
}

function sendToolsList(): void {
  currentTest = 'Tools List';
  toolsListId = 2;
  
  const request = {
    jsonrpc: '2.0' as const,
    id: toolsListId,
    method: 'tools/list',
    params: {}
  };
  
  console.log('\nSending tools/list request...');
  server.stdin!.write(JSON.stringify(request) + '\n');
}

function sendCallTool(): void {
  currentTest = 'Call Tool';
  callToolId = 3;
  
  const request = {
    jsonrpc: '2.0' as const,
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
  server.stdin!.write(JSON.stringify(request) + '\n');
}

function finishTests(): void {
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