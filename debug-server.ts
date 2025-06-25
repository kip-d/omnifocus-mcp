#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

console.log('🔍 Debugging MCP Server Startup...\n');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, LOG_LEVEL: 'debug' }
});

const rl = createInterface({
  input: server.stdout,
  crlfDelay: Infinity
});

const errRl = createInterface({
  input: server.stderr,
  crlfDelay: Infinity
});

let requestId = 1;
let startTime = Date.now();

// Log server stdout
rl.on('line', (line) => {
  console.log(`[${Date.now() - startTime}ms] STDOUT:`, line);
  
  // Try to parse as JSON-RPC
  try {
    const parsed = JSON.parse(line);
    console.log('  └─ Parsed JSON:', JSON.stringify(parsed, null, 2));
    
    // Handle responses
    if (parsed.id === 1) {
      // Initialize response received, send tools/list
      console.log('\n📤 Sending tools/list request...');
      const listRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: requestId++
      };
      server.stdin.write(JSON.stringify(listRequest) + '\n');
    } else if (parsed.id === 2) {
      // tools/list response received, send tools/call
      console.log('\n📤 Sending tools/call request...');
      const callRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'list_tasks',
          arguments: { limit: 5, completed: false }
        },
        id: requestId++
      };
      server.stdin.write(JSON.stringify(callRequest) + '\n');
    } else if (parsed.id === 3) {
      // tools/call response received - test complete
      console.log('\n✅ All tests completed successfully!');
      server.kill('SIGTERM');
      process.exit(0);
    }
  } catch (e) {
    console.log('  └─ Not JSON-RPC format');
  }
});

// Log server stderr
errRl.on('line', (line) => {
  console.log(`[${Date.now() - startTime}ms] STDERR:`, line);
});

// Server error handling
server.on('error', (error) => {
  console.error('❌ Server process error:', error);
});

server.on('close', (code, signal) => {
  console.log(`🏁 Server closed with code ${code}, signal ${signal}`);
});

// Send initialize request after a brief delay
setTimeout(() => {
  console.log('\n📤 Sending initialize request...');
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: {
        name: 'debug-client',
        version: '1.0.0'
      }
    },
    id: requestId++
  };
  
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

// Kill after 45 seconds if no response (longer for OmniFocus operations)
setTimeout(() => {
  console.error('\n⏰ 45s timeout reached - killing server');
  server.kill('SIGTERM');
  process.exit(1);
}, 45000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT - killing server');
  server.kill('SIGTERM');
  process.exit(0);
});