#!/usr/bin/env node
import { spawn } from 'child_process';
import { createInterface } from 'readline';

console.log('Testing Claude Desktop initialization sequence...\n');

const server = spawn('node', ['/Users/guillaume/Dev/tools/omnifocus-mcp/dist/index.js'], {
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

// Capture all stderr (logs)
errRl.on('line', (line) => {
  console.log(`[LOG] ${line}`);
});

// Capture all stdout
rl.on('line', (line) => {
  console.log(`[STDOUT] ${line}`);
  try {
    const parsed = JSON.parse(line);
    console.log('[PARSED]', JSON.stringify(parsed, null, 2));
  } catch (e) {
    // Not JSON
  }
});

// Send initialize exactly as Claude Desktop does
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '0.1.0',
    capabilities: {},
    clientInfo: {
      name: 'claude-desktop',
      version: '0.7.2'
    }
  }
};

console.log('Sending initialize request:');
console.log(JSON.stringify(initRequest, null, 2));
server.stdin.write(JSON.stringify(initRequest) + '\n');

// Also try the notifications/initialized that Claude might send
setTimeout(() => {
  const notif = {
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  };
  console.log('\nSending initialized notification:');
  console.log(JSON.stringify(notif, null, 2));
  server.stdin.write(JSON.stringify(notif) + '\n');
}, 1000);

// Exit after 5 seconds
setTimeout(() => {
  console.log('\nTest complete. Shutting down...');
  server.kill();
  process.exit(0);
}, 5000);